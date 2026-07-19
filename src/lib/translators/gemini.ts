// Gemini adapter using the official Generative Language API.
// Supports multiple API keys with automatic rotation on 429 rate limits.
// Includes a preemptive sliding-window RPM rate limiter.

import type { GlossaryEntry, ProviderConfig } from "../types";
import type { TranslateRequest, TranslateResult } from "./types";
import { parseNumberedResponse } from "./deepseek";

// ── Sliding-window RPM rate limiter ─────────────────────────────────────
// Tracks recent call timestamps and delays if the RPM limit would be exceeded.
// Defaults to 8 RPM (safely under Gemini free tier limit of 10).

const WINDOW_MS = 60_000; // 1-minute sliding window
let _rpmLimit = 8;
const _callTimes: number[] = [];

/** Set the RPM limit (e.g. from user settings). Must be >= 1. */
export function setGeminiRpmLimit(rpm: number) {
  _rpmLimit = Math.max(1, Math.round(rpm));
}

/** Get current RPM limit. */
export function getGeminiRpmLimit(): number {
  return _rpmLimit;
}

/** Number of calls made in the current 60-second sliding window. */
export function geminiRpmUsage(): { used: number; limit: number; nextSlotMs: number } {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  while (_callTimes.length > 0 && _callTimes[0] < cutoff) {
    _callTimes.shift();
  }
  const nextSlotMs = _callTimes.length >= _rpmLimit
    ? Math.max(0, _callTimes[0] + WINDOW_MS - now)
    : 0;
  return { used: _callTimes.length, limit: _rpmLimit, nextSlotMs };
}

async function waitForRpmSlot(): Promise<void> {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  // Prune stale entries
  while (_callTimes.length > 0 && _callTimes[0] < cutoff) {
    _callTimes.shift();
  }
  if (_callTimes.length < _rpmLimit) {
    _callTimes.push(now);
    return;
  }
  // Need to wait until the oldest call falls out of the window.
  const oldest = _callTimes[0];
  const waitMs = oldest + WINDOW_MS - now + 50; // 50ms buffer
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }
  // Prune again after waiting
  const newCutoff = Date.now() - WINDOW_MS;
  while (_callTimes.length > 0 && _callTimes[0] < newCutoff) {
    _callTimes.shift();
  }
  _callTimes.push(Date.now());
}

// ── Main translation call ───────────────────────────────────────────────

export async function callGemini(
  cfg: ProviderConfig,
  req: TranslateRequest,
): Promise<Omit<TranslateResult, "provider">> {
  // Collect all keys: primary + rotation keys, deduped, non-empty.
  const keys = [
    cfg.apiKey,
    ...(cfg.apiKeys ?? []),
  ].filter((k): k is string => !!k && k.trim().length > 0);

  if (keys.length === 0) {
    throw new Error("Gemini requires an API key (set one in Settings).");
  }

  // Wait for RPM slot before making any API call.
  await waitForRpmSlot();

  const model = cfg.model || "gemini-2.0-flash";
  const body = buildRequestBody(req);

  let lastError: Error | null = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i].trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent`;

    try {
      const res = await fetchWithTimeout(url, body, key);
      const data = (await res.json()) as GeminiResponse;
      const text = pickText(data);
      if (!text) throw new Error("Gemini returned an empty completion.");

      // Promote the working key to the front: swap with position 0
      // so the next call tries it first (live rotation).
      if (i > 0 && cfg.apiKey !== key) {
        // Move this key to primary position for future calls.
        const remaining = keys.filter((_, j) => j !== i);
        cfg.apiKey = key;
        cfg.apiKeys = remaining.filter((k) => k !== cfg.apiKey);
      }

      return { paragraphs: parseNumberedResponse(text, req.paragraphs), cachedCount: 0 };
    } catch (err) {
      const status = (err as Error & { status?: number }).status ?? 0;
      // Only rotate on rate-limit (429) or quota (429). Auth errors (401/403)
      // and not-found (404) should fail fast — don't burn other keys.
      if (status === 429) {
        lastError = err as Error;
        // Brief pause before trying the next key so we don't hammer the API.
        if (i + 1 < keys.length) {
          await new Promise((r) => setTimeout(r, 600));
        }
        continue;
      }
      throw err;
    }
  }

  // All keys exhausted.
  throw lastError ?? new Error("All Gemini API keys exhausted or rate-limited.");
}

function buildRequestBody(req: TranslateRequest) {
  const systemPrompt = buildSystemPrompt(req);
  const userText = buildUserPrompt(req);
  return {
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
}

async function fetchWithTimeout(url: string, body: unknown, apiKey: string): Promise<Response> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
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
    return res;
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
    `CRITICAL: Output ONLY English text. NEVER leave any ${source === "Chinese" ? "Chinese" : source === "Japanese" ? "Japanese" : source === "Korean" ? "Korean" : "CJK"} characters in your translation. Every word, name, and phrase must be in English. If you encounter a proper name, romanize it — do NOT keep the original script.`,
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
    "=== GLOSSARY (RECENTLY UPDATED — RECHECK ALL ENTRIES) ===",
    "These are the canonical translations for this book. They OVERRIDE any other translations you may know. Use them EXACTLY as specified for characters, locations, and defined terms. Only adapt for obvious nickname variants (e.g., adding -chan/-san suffixes). If a term appears in the source and has a glossary entry, you MUST use the glossary translation — do NOT invent your own.",
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
