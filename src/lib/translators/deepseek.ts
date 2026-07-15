// DeepSeek adapter — connects to the local proxy (sums001/Deepseek-API).
// Default: http://127.0.0.1:8081/v1
// The proxy presents an OpenAI-compatible /v1/chat/completions endpoint.

import type { GlossaryEntry, ProviderConfig } from "../types";
import type { TranslateRequest, TranslateResult } from "./types";

const DEFAULT_ENDPOINT = "http://127.0.0.1:8001/v1";

export async function callDeepSeek(
  cfg: ProviderConfig,
  req: TranslateRequest,
): Promise<Omit<TranslateResult, "provider">> {
  const base = cfg.baseUrl?.replace(/\/$/, "") || DEFAULT_ENDPOINT;
  const url = `${base}/chat/completions`;

  const systemPrompt = buildSystemPrompt(req);
  const userPrompt = buildUserPrompt(req);

  const prompt = `${systemPrompt}\n\n${userPrompt}`;
  const body = {
    model: cfg.model || "deepseek-chat",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    stream: false,
    temperature: req.quality === "high" ? 0.35 : req.quality === "balanced" ? 0.5 : 0.7,
  };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
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
    const completion = text || await fetchStreamedCompletion(cfg, req, prompt);
    if (!completion) {
      if (req.paragraphs.length > 1) {
        return {
          paragraphs: await retryMissingParagraphs(
            cfg,
            req,
            Array(req.paragraphs.length).fill(""),
          ),
          cachedCount: 0,
        };
      }
      return {
        paragraphs: [await translateSingleParagraph(cfg, req, req.paragraphs[0])],
        cachedCount: 0,
      };
    }
    const paragraphs = parseNumberedResponse(completion, req.paragraphs);
    if (paragraphs.some((p) => !p.trim()) && req.paragraphs.length > 1) {
      return {
        paragraphs: await retryMissingParagraphs(cfg, req, paragraphs),
        cachedCount: 0,
      };
    }
    return { paragraphs, cachedCount: 0 };
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

async function retryMissingParagraphs(
  cfg: ProviderConfig,
  req: TranslateRequest,
  parsed: string[],
): Promise<string[]> {
  const out = [...parsed];
  for (let i = 0; i < out.length; i++) {
    if (out[i]?.trim()) continue;
    out[i] = await translateSingleParagraph(cfg, req, req.paragraphs[i]);
  }
  return out;
}

async function translateSingleParagraph(
  cfg: ProviderConfig,
  req: TranslateRequest,
  paragraph: string,
  modelOverride?: string,
): Promise<string> {
  const base = cfg.baseUrl?.replace(/\/$/, "") || DEFAULT_ENDPOINT;
  const url = `${base}/chat/completions`;
  const model = modelOverride || cfg.model || "deepseek-chat";
  const prompt = [
    buildSystemPrompt({ ...req, paragraphs: [paragraph] }),
    "",
    "Translate this paragraph into natural English.",
    "Return only the English translation. Do not include numbering, labels, notes, markdown, or commentary.",
    "",
    paragraph,
  ].join("\n");
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        temperature: req.quality === "high" ? 0.35 : req.quality === "balanced" ? 0.5 : 0.7,
      }),
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
    const completion = text || await fetchStreamedCompletion(cfg, req, prompt, model);
    if (!completion) {
      if (model !== "deepseek-expert") {
        return translateSingleParagraph(cfg, req, paragraph, "deepseek-expert");
      }
      throw new Error("DeepSeek returned an empty single-paragraph completion.");
    }
    return stripNumberPrefix(stripCodeFence(completion));
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      const e = new Error("DeepSeek single-paragraph retry timed out after 90s.");
      (e as Error & { status?: number }).status = 408;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchStreamedCompletion(
  cfg: ProviderConfig,
  req: TranslateRequest,
  prompt: string,
  modelOverride?: string,
): Promise<string | null> {
  const base = cfg.baseUrl?.replace(/\/$/, "") || DEFAULT_ENDPOINT;
  const url = `${base}/chat/completions`;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
      },
      body: JSON.stringify({
        model: modelOverride || cfg.model || "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        stream: true,
        temperature: req.quality === "high" ? 0.35 : req.quality === "balanced" ? 0.5 : 0.7,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const raw = await safeText(res);
    return parseSseCompletion(raw);
  } catch {
    return null;
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
  choices?: Array<{
    delta?: { content?: string };
    message?: { content?: string; reasoning_content?: string };
    text?: string;
  }>;
  message?: { content?: string };
  content?: string;
  output?: string;
  response?: string;
  text?: string;
}

function pickMessage(data: DeepSeekCompletion): string | null {
  return firstNonBlank(
    data?.choices?.[0]?.message?.content ??
      null,
    data?.choices?.[0]?.message?.reasoning_content ?? null,
    data?.choices?.[0]?.delta?.content ?? null,
    data?.choices?.[0]?.text ?? null,
    data?.message?.content ?? null,
    data?.content ?? null,
    data?.output ?? null,
    data?.response ?? null,
    data?.text ?? null,
  );
}

function firstNonBlank(...values: Array<string | null>): string | null {
  for (const value of values) {
    if (value?.trim()) return value;
  }
  return null;
}

function parseSseCompletion(raw: string): string | null {
  const parts: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const chunk = JSON.parse(payload) as DeepSeekCompletion;
      const text = pickMessage(chunk);
      if (text) parts.push(text);
    } catch {
      continue;
    }
  }
  const joined = parts.join("");
  return joined.trim() ? joined : null;
}

function buildSystemPrompt(req: TranslateRequest): string {
  const source =
    req.source === "auto"
      ? `the source language`
      : sourceLabel(req.source);
  const base = [
    `You are a literary translator working from ${source} into English.`,
    `Preserve narration, tone, character voice, idioms (adapted), and onomatopoeia.`,
    `Treat honorifics and archaic terms by keeping them and adding a brief English gloss in parentheses when natural.`,
    `Do NOT add explanations, chapter commentary, or translator's notes.`,
    `Quality preference: ${req.quality}.`,
    `Output each translated paragraph prefixed with its index in square brackets, e.g. \"[1] Translated text\".`,
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
  return [
    header,
    "Translate each paragraph below into English.",
    `IMPORTANT: Start EVERY translated paragraph with "[N]" where N is the paragraph number.`,
    `Example: "[1] This is the first translated paragraph."`,
    `Do NOT wrap output in markdown code fences. Do NOT add commentary.`,
    "",
    lines,
  ].join("\n");
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
  const cleaned = stripCodeFence(text);
  const lines = cleaned.split(/\r?\n/);
  const re = /^\s*(?:\[(\d+)\]|(\d+)[.)：:])\s*(.*)$/;
  for (const ln of lines) {
    const m = re.exec(ln);
    if (!m) continue;
    const idx = Number(m[1] ?? m[2]) - 1;
    if (Number.isFinite(idx) && idx >= 0 && idx < sourceParagraphs.length) {
      out[idx] = m[3].trim();
    }
  }

  // If NO numbered lines were matched at all, the LLM probably ignored the
  // [n] format instruction. Try a 1:1 line pairing as a fallback — filter
  // out blank/whitespace-only lines and pair them with source paragraphs in
  // order. This prevents the silent source-copy backfill from kicking in.
  const anyNumbered = out.some((o) => o !== "");
  if (!anyNumbered) {
    const nonBlank = lines
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !/^(translation|translated|english)\b/i.test(l));
    for (let i = 0; i < Math.min(nonBlank.length, sourceParagraphs.length); i++) {
      out[i] = nonBlank[i];
    }
  }

  return out;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:\w+)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function stripNumberPrefix(text: string): string {
  return text.replace(/^\s*(?:\[\d+\]|\d+[.)：:])\s*/, "").trim();
}
