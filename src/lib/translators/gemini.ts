// Gemini adapter using the official Generative Language API.

import type { GlossaryEntry, ProviderConfig } from "../types";
import type { TranslateRequest, TranslateResult } from "./types";
import { parseNumberedResponse } from "./deepseek";

export async function callGemini(
  cfg: ProviderConfig,
  req: TranslateRequest,
): Promise<Omit<TranslateResult, "provider">> {
  if (!cfg.apiKey) {
    throw new Error("Gemini requires an API key (set one in Settings).");
  }
  const model = cfg.model || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

  const systemPrompt = buildSystemPrompt(req);
  const userText = buildUserPrompt(req);

  const body = {
    systemInstruction: {
      role: "system",
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userText }],
      },
    ],
    generationConfig: {
      temperature: req.quality === "high" ? 0.35 : req.quality === "balanced" ? 0.5 : 0.7,
    },
  };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await safeText(res);
      const err = new Error(
        `Gemini error ${res.status}: ${text.slice(0, 200)}`,
      );
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    const data = (await res.json()) as GeminiResponse;
    const text = pickText(data);
    if (!text) throw new Error("Gemini returned an empty completion.");
    return { paragraphs: parseNumberedResponse(text, req.paragraphs), cachedCount: 0 };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      const e = new Error("Gemini request timed out after 90s.");
      (e as Error & { status?: number }).status = 408;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return res.statusText;
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

function pickText(data: GeminiResponse): string | null {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

function buildSystemPrompt(req: TranslateRequest): string {
  const source =
    req.source === "auto"
      ? `the source language`
      : sourceLabel(req.source);
  const base = [
    `You are a literary translator working from ${source} into English.`,
    `Preserve narration, tone, character voice, idioms (adapted), and onomatopoeia.`,
    `Honorifics and archaic terms stay — add a brief English gloss in parentheses if natural.`,
    `Do NOT add commentary or translator's notes.`,
    `Quality preference: ${req.quality}.`,
    `Output each translated paragraph prefixed with its index in square brackets, e.g. "[1] Translated text".`,
    `One paragraph per line. Keep paragraph order intact.`,
  ];
  const glossaryBlock = buildGlossaryBlock(req.glossary);
  return glossaryBlock
    ? `${glossaryBlock}\n\n${base.join(" ")}`
    : base.join(" ");
}

function buildGlossaryBlock(entries?: GlossaryEntry[]): string | null {
  if (!entries || entries.length === 0) return null;
  const lines = entries.map((e) =>
    `${e.term} → ${e.translation}${e.gender === "F" || e.gender === "M" ? ` (${e.gender})` : ""}`,
  );
  return [
    "=== GLOSSARY ===",
    "Use these canonical translations EXACTLY for specific characters, locations, and defined terms. You may adapt them slightly only if the immediate context requires it (e.g., nickname variants).",
    "",
    ...lines,
  ].join("\n");
}

function buildUserPrompt(req: TranslateRequest): string {
  const header = req.contextHint
    ? `Context: ${req.contextHint}\n\n`
    : "";
  const lines = req.paragraphs
    .map((p, i) => `[${i + 1}] ${p}`)
    .join("\n");
  return `${header}Translate each paragraph below. Output each as "[n] translated text" on its own line.\n\n${lines}`;
}

function sourceLabel(s: string): string {
  switch (s) {
    case "zh":
      return "Chinese";
    case "ja":
      return "Japanese";
    case "ko":
      return "Korean";
    default:
      return s;
  }
}
