import type { Chapter, GlossaryEntry, ProviderConfig } from "./types";
import { listGlossaryEntries, putGlossaryEntry } from "./db";
import { uid } from "./util";

export const FULL_BOOK_GLOSSARY_PROMPT = [
  "You are a meticulous literary localization editor.",
  "Extract an exhaustive terminology glossary from the supplied novel excerpt.",
  "Prioritize every character name, title, alias, location, organization, cultivation or magic term, difficult word, idiom, and slang expression.",
  "Return only a raw JSON array. Do not use markdown fences or commentary.",
  "Each object must contain: term, translation, category, gender, notes.",
  'category must be exactly one of: character, location, word, slang.',
  'gender must be F, M, N, or null. Use null for non-character entries.',
  "Keep translations consistent and natural for a published English edition.",
].join("\n");

type ExtractedItem = {
  term?: string;
  translation?: string;
  category?: string;
  gender?: string | null;
  notes?: string;
};

export interface FullBookGlossaryProgress {
  done: number;
  total: number;
  saved: number;
  chunkErrors: number;
}

interface GlossaryCheckpoint {
  bookId: string;
  totalChunks: number;
  completedChunks: number[];
  saved: number;
  chunkErrors: number;
}

export async function extractFullBookGlossary(options: {
  bookId: string;
  chapters: Chapter[];
  config: ProviderConfig;
  chunkChars: number;
  delayMs: number;
  onProgress?: (progress: FullBookGlossaryProgress) => void;
  shouldPause?: () => boolean;
}): Promise<{ saved: number; errors: number }> {
  const { bookId, chapters, config, chunkChars, delayMs, onProgress, shouldPause } = options;
  const keys = [config.apiKey, ...(config.apiKeys ?? [])].filter(
    (key): key is string => !!key?.trim(),
  );
  if (keys.length === 0) throw new Error("Gemini requires an API key in Settings.");

  const paragraphs = chapters.flatMap((chapter) =>
    chapter.paragraphs
      .filter((paragraph) => paragraph.trim())
      .map((paragraph) => `Chapter: ${chapter.title}\n${paragraph}`),
  );
  if (paragraphs.length === 0) throw new Error("This book has no readable text to analyze.");

  const chunks: string[] = [];
  let buffer = "";
  for (const paragraph of paragraphs) {
    if (buffer && buffer.length + paragraph.length + 2 > chunkChars) {
      chunks.push(buffer);
      buffer = "";
    }
    buffer += `${buffer ? "\n\n" : ""}${paragraph}`;
  }
  if (buffer) chunks.push(buffer);

  const checkpointKey = `raynets.full-book-glossary.${bookId}`;
  const checkpoint = loadCheckpoint(checkpointKey, bookId, chunks.length);
  const completed = new Set(checkpoint?.completedChunks ?? []);
  const existing = await listGlossaryEntries(bookId);
  const seen = new Set(existing.map((entry) => entry.term.trim()));
  let saved = checkpoint?.saved ?? 0;
  let errors = checkpoint?.chunkErrors ?? 0;
  let delay = Math.max(0, delayMs);

  const report = () => onProgress?.({
    done: completed.size,
    total: chunks.length,
    saved,
    chunkErrors: errors,
  });
  report();

  for (let index = 0; index < chunks.length; index++) {
    if (completed.has(index)) continue;
    while (shouldPause?.()) await sleep(500);

    let completedThisChunk = false;
    let rateLimitAttempts = 0;
    while (!completedThisChunk) {
      while (shouldPause?.()) await sleep(500);
      try {
        const response = await requestGlossary(keys, config.model || "gemini-2.5-flash", [
          FULL_BOOK_GLOSSARY_PROMPT,
          "",
          `This is excerpt ${index + 1} of ${chunks.length}. Do not repeat terms already obvious from the excerpt unless you are correcting or clarifying one.`,
          "",
          chunks[index],
        ].join("\n"));
        const extracted = parseGlossaryResponse(response);
        const timestamp = Date.now();
        for (const item of extracted) {
          const term = item.term?.trim() ?? "";
          const translation = item.translation?.trim() ?? "";
          if (!term || !translation || seen.has(term)) continue;
          seen.add(term);
          const category = ["character", "location", "word", "slang"].includes(item.category ?? "")
            ? (item.category as GlossaryEntry["category"])
            : "word";
          const gender = item.gender === "F" || item.gender === "M" || item.gender === "N"
            ? item.gender
            : null;
          await putGlossaryEntry({
            id: `${bookId}:${uid("term")}`,
            bookId,
            term,
            translation,
            category,
            gender,
            notes: item.notes?.trim() ?? "",
            createdAt: timestamp,
            updatedAt: timestamp,
          });
          saved++;
        }
        delay = Math.max(0, delayMs);
        completedThisChunk = true;
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        if ((message.includes("429") || message.includes("quota") || message.includes("rate")) && rateLimitAttempts < 3) {
          rateLimitAttempts++;
          delay = Math.min(Math.max(delay * 2, 2000), 60000);
          await sleep(delay);
          continue;
        }
        errors++;
        completedThisChunk = true;
      }
    }

    completed.add(index);
    saveCheckpoint(checkpointKey, {
      bookId,
      totalChunks: chunks.length,
      completedChunks: [...completed],
      saved,
      chunkErrors: errors,
    });
    report();
    if (index < chunks.length - 1 && delay > 0) await sleep(delay);
  }

  clearCheckpoint(checkpointKey);
  return { saved, errors };
}

function loadCheckpoint(key: string, bookId: string, totalChunks: number): GlossaryCheckpoint | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as GlossaryCheckpoint | null;
    if (!parsed || parsed.bookId !== bookId || parsed.totalChunks !== totalChunks) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCheckpoint(key: string, checkpoint: GlossaryCheckpoint): void {
  try {
    localStorage.setItem(key, JSON.stringify(checkpoint));
  } catch {
    // Checkpoints are helpful but never block extraction when storage is full.
  }
}

function clearCheckpoint(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

async function requestGlossary(keys: string[], model: string, userText: string): Promise<string> {
  let lastError: unknown;
  for (const key of keys) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: FULL_BOOK_GLOSSARY_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: userText }] }],
            generationConfig: { temperature: 0.25 },
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const body = await response.text().catch(() => response.statusText);
        const error = new Error(`Gemini glossary error ${response.status}: ${body.slice(0, 180)}`) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) throw new Error("Gemini returned an empty glossary.");
      return text;
    } catch (error) {
      lastError = error;
      const status = (error as Error & { status?: number }).status;
      if (status !== 429) throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini glossary request failed.");
}

function parseGlossaryResponse(raw: string): ExtractedItem[] {
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("Glossary response was not a JSON array.");
  return parsed as ExtractedItem[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
