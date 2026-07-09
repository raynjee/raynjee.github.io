// DeepSeek adapter — reverse-engineered from the chat.deepseek.com web client.
// Uses the unauthenticated browser endpoint. No API key required.
// Ref: https://github.com/sums001/Deepseek-API

import type { ProviderConfig } from "../types";
import type { TranslateRequest, TranslateResult } from "./types";

// The reverse-engineered chat endpoint that the web client hits directly.
const ENDPOINT = "https://chat.deepseek.com/api/v0/chat/completions";

export async function callDeepSeek(
  cfg: ProviderConfig,
  req: TranslateRequest,
): Promise<Omit<TranslateResult, "provider">> {
  const systemPrompt = buildSystemPrompt(req);
  const userPrompt = buildUserPrompt(req);

  // DeepSeek's web endpoint expects a slightly different payload shape
  // than the official API. We omit `model` when not needed and supply
  // the `chat_id` / `parent_message_id` for threading.
  const body: Record<string, unknown> = {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
    temperature: req.quality === "high" ? 0.35 : req.quality === "balanced" ? 0.5 : 0.7,
  };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // The web client sends these — include them so we look like a real session.
        "X-DeepSeek-Device": "web",
        "X-DeepSeek-Platform": "web",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await safeText(res);
      const err = new Error(
        `DeepSeek error ${res.status}: ${text.slice(0, 200)}`,
      );
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    const data = (await res.json()) as DeepSeekCompletion;
    const text = pickMessage(data);
    if (!text) throw new Error("DeepSeek returned an empty completion.");
    return { paragraphs: parseNumberedResponse(text, req.paragraphs), cachedCount: 0 };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      const e = new Error("DeepSeek request timed out after 90s.");
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

interface DeepSeekCompletion {
  choices?: Array<{ message?: { content?: string } }>;
}

function pickMessage(data: DeepSeekCompletion): string | null {
  return data?.choices?.[0]?.message?.content ?? null;
}

function buildSystemPrompt(req: TranslateRequest): string {
  const source =
    req.source === "auto"
      ? `the source language`
      : sourceLabel(req.source);
  return [
    `You are a literary translator working from ${source} into English.`,
    `Preserve narration, tone, character voice, idioms (adapted), and onomatopoeia.`,
    `Treat honorifics and archaic terms by keeping them and adding a brief English gloss in parentheses when natural.`,
    `Do NOT add explanations, chapter commentary, or translator's notes.`,
    `Quality preference: ${req.quality}.`,
    `Output each translated paragraph prefixed with its index in square brackets, e.g. \"[1] Translated text\".`,
    `One paragraph per line. Keep paragraph order intact.`,
  ].join(" ");
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

export function parseNumberedResponse(
  text: string,
  sourceParagraphs: string[],
): string[] {
  const out: string[] = Array(sourceParagraphs.length).fill("");
  const lines = text.split(/\r?\n/);
  const re = /^\s*\[(\d+)\]\s*(.*)$/;
  for (const ln of lines) {
    const m = re.exec(ln);
    if (!m) continue;
    const idx = Number(m[1]) - 1;
    if (Number.isFinite(idx) && idx >= 0 && idx < sourceParagraphs.length) {
      out[idx] = m[2].trim();
    }
  }
  // Backfill: any missing entries fall back to the source.
  for (let i = 0; i < out.length; i++) {
    if (!out[i]) out[i] = sourceParagraphs[i];
  }
  return out;
}
