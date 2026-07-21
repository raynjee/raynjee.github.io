// Utility helpers used across the studio.

export function classes(...arr: Array<string | false | null | undefined>): string {
  return arr.filter(Boolean).join(" ");
}

// Stable id generator — uses crypto.randomUUID when available.
export function uid(prefix = "id"): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${rnd}`;
}

// SHA-256 of a string, returned as hex.
export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback non-cryptographic but deterministic hash
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h2 >>> 0).toString(16).padStart(8, "0") +
    (h1 >>> 0).toString(16).padStart(8, "0")
  );
}

// Token / word counter for rough progress.
export function countWords(s: string): number {
  if (!s) return 0;
  // Treat every CJK character as a "word" to keep counts consistent across
  // mixed scripts. Otherwise we use the space-separated word list.
  const cjk = (s.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g) ?? []).length;
  const rest = s.replace(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g, " ");
  const words = rest.trim().split(/\s+/).filter(Boolean).length;
  return cjk + words;
}

// Heuristic language detection. Catches the common cases; users can override.
export type LangGuess = "zh" | "ja" | "ko" | "en" | "other";
export function detectLanguage(text: string): LangGuess {
  if (!text) return "other";
  const sample = text.replace(/\s/g, "").slice(0, 4000);
  if (!sample) return "other";
  let zh = 0;
  let ja = 0;
  let ko = 0;
  let latin = 0;
  for (const ch of sample) {
    const code = ch.charCodeAt(0);
    if (code >= 0x4e00 && code <= 0x9fff) {
      zh++;
      // Hiragana + Katakana overrides
    } else if (
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff)
    ) {
      ja++;
    } else if (code >= 0xac00 && code <= 0xd7af) {
      ko++;
    } else if (code >= 0x41 && code <= 0x7a) {
      latin++;
    }
  }
  const total = zh + ja + ko + latin;
  if (total === 0) return "other";
  if (ja > 0) return "ja";
  if (ko > 0 && ko / total > 0.1) return "ko";
  if (zh > 0 && zh / total > 0.3) return "zh";
  if (latin / total > 0.6) return "en";
  return "other";
}

export function formatLanguage(l: LangGuess | string): string {
  switch (l) {
    case "zh":
      return "Chinese";
    case "ja":
      return "Japanese";
    case "ko":
      return "Korean";
    case "en":
      return "English";
    default:
      return "Unknown";
  }
}

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  wait: number,
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  }) as T & { cancel: () => void };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : plural ?? `${singular}s`;
}

// ── Reading bookmark ────────────────────────────────────────────────────
// Persisted to localStorage so the Library can show a "Continue Reading"
// card and the reader can resume exactly where the user left off.

const BOOKMARK_KEY = "anekdota.reader.bookmark";

export interface ReadingBookmark {
  bookId: string;
  chapterId: string;
  savedAt: number;
}

export function saveBookmark(bookId: string, chapterId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BOOKMARK_KEY,
      JSON.stringify({ bookId, chapterId, savedAt: Date.now() }),
    );
  } catch {}
}

export function getBookmark(): ReadingBookmark | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BOOKMARK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReadingBookmark;
    if (parsed.bookId && parsed.chapterId) return parsed;
    return null;
  } catch {
    return null;
  }
}
