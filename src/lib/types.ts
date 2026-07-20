// Core domain types for the translation studio.
// Everything that lives in IndexedDB or localStorage is expressed here.

export type SourceLanguage =
  | "zh"
  | "ja"
  | "ko"
  | "en"
  | "es"
  | "fr"
  | "de"
  | "ru"
  | "auto";

export type Quality = "fast" | "balanced" | "high";

export type ProviderId = "deepseek" | "gemini" | "manual";

export interface ProviderConfig {
  id: ProviderId;
  enabled: boolean;
  apiKey?: string; // primary API key (still used by Gemini)
  apiKeys?: string[]; // additional rotation keys for Gemini — tried in order on 429
  model?: string;
  baseUrl?: string; // DeepSeek proxy endpoint (default http://127.0.0.1:8001/v1)
}

// ── Reader preferences ────────────────────────────────────────────────────
// Per-book overrides stored on the user's StudioSettings shape (see below).
// A new book starts with `defaultReaderPrefs`; users can tune any book
// individually via `bookReaderPrefs[bookId]` which is a Partial<ReaderPrefs>
// (only the keys they changed are persisted, so resetting a single dimen-
// sion falls back to the global default automatically).

export type Leading = "tight" | "regular" | "airy";
export type ParagraphGap = "tight" | "regular" | "roomy";
export type ReaderLayout = "split" | "stack";
export type ReaderFont = "serif" | "sans";

// Continuous font-size range — the user picks an exact pixel value via the
// slider, no more 5-step enum. Bounds chosen so they're legible at every
// end (8px is still readable for tooltips; 36px covers generous reading
// without breaking the chapter grid).
export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 36;
export const FONT_SIZE_DEFAULT = 18;
export const FONT_SIZE_STEP = 1;

export interface ReaderPrefs {
  showToc: boolean;
  showOriginal: boolean;
  layout: ReaderLayout;
  font: ReaderFont;
  fontSize: number; // pixel value, clamped to [FONT_SIZE_MIN, FONT_SIZE_MAX]
  leading: Leading;
  gap: ParagraphGap;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  showToc: true,
  showOriginal: true,
  layout: "split",
  font: "serif",
  fontSize: FONT_SIZE_DEFAULT,
  leading: "regular",
  gap: "regular",
};

// Discrete values for stepped sliders — keep these in lockstep with the
// CSS-var math used in index.css so the reader has no flicker when the
// user adjusts a control.
export const LEADINGS: Record<Leading, number> = {
  tight: 1.5,
  regular: 1.75,
  airy: 2,
};
export const PARAGRAPH_GAPS: Record<ParagraphGap, string> = {
  tight: "1.25rem",
  regular: "1.75rem",
  roomy: "2.5rem",
};

// Hardcoded font stacks (not var() references). Using literal strings here
// avoids any chained var() substitution concerns — the previous version
// used var(--font-display)/var(--font-sans) which depended on multiple
// layers of CSS variable resolution and broke silently if any link in the
// chain (Tailwind's @theme inline map, :root, browser default) was missing.
export const FONT_FAMILY: Record<ReaderFont, string> = {
  serif:
    '"Fraunces", "Cormorant Garamond", ui-serif, Georgia, "Times New Roman", serif',
  sans:
    '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

// Legacy migration table — when loading older localStorage payloads that
// stored the 5-step enum, map each enum value to a sensible px so the user
// doesn't snap to a single default.
const LEGACY_SCALE_TO_SIZE: Record<string, number> = {
  xs: 14,
  s: 16,
  m: 18,
  l: 22,
  xl: 26,
};

// Defensive migration: accept any ReaderPrefs-shaped object (or a legacy
// override with `scale` instead of `fontSize`) and yield a clean, validated
// ReaderPrefs. Bound-checks size, trims unknowns, defaults missing keys.
// Always strips the legacy `scale` field so subsequent equivalence checks
// in updateBookPrefs don't trip over a stale enum entry.
export function migrateReaderPrefs(raw: unknown): ReaderPrefs {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // Resolve fontSize from either the new field or the legacy enum.
  let fontSize: number;
  if (typeof obj.fontSize === "number" && Number.isFinite(obj.fontSize)) {
    fontSize = Math.min(
      FONT_SIZE_MAX,
      Math.max(FONT_SIZE_MIN, Math.round(obj.fontSize)),
    );
  } else if (
    typeof obj.scale === "string" &&
    obj.scale in LEGACY_SCALE_TO_SIZE
  ) {
    fontSize = LEGACY_SCALE_TO_SIZE[obj.scale];
  } else {
    fontSize = FONT_SIZE_DEFAULT;
  }
  const layout =
    obj.layout === "stack" || obj.layout === "split" ? obj.layout : "split";
  const font: ReaderFont = obj.font === "sans" ? "sans" : "serif";
  const leading: Leading =
    obj.leading === "tight" || obj.leading === "airy" ? obj.leading : "regular";
  const gap: ParagraphGap =
    obj.gap === "tight" || obj.gap === "roomy" ? obj.gap : "regular";
  return {
    showToc: obj.showToc === false ? false : true,
    showOriginal: obj.showOriginal === false ? false : true,
    layout,
    font,
    fontSize,
    leading,
    gap,
  };
}

export interface GlossaryEntry {
  id: string; // `${bookId}:${uuidFragment}`
  bookId: string;
  term: string;
  translation: string;
  gender: "F" | "M" | "N" | null;
  category: "character" | "location" | "word" | "slang";
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface StudioSettings {
  providers: ProviderConfig[];
  activeProvider: ProviderId;
  sourceLanguage: SourceLanguage;
  targetLanguage: "en";
  quality: Quality;
  parallelRequests: number;
  geminiRpmLimit: number; // max Gemini requests per minute (default 8, stay under free tier 10)
  glossaryChunkSize: number; // chars per chunk for glossary extraction (default 4000, range 1000-16000)
  glossaryChunkDelayMs: number; // ms delay between glossary chunks (default 3000, range 500-30000)
  pauseOnError: boolean;
  themePref: "light" | "dark" | "system";
  defaultReaderPrefs: ReaderPrefs;
  bookReaderPrefs: Record<string, Partial<ReaderPrefs>>;
  driveClientId: string;   // Google Cloud OAuth 2.0 Client ID for Drive sync
  driveEmail: string;      // email of the connected Google account (for display)
  lastSyncAt: number;      // timestamp of last successful push/pull
}

export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  language: SourceLanguage;
  coverDataUrl: string | null;
  originalEpub: ArrayBuffer | null; // Raw blob, used for export. Stored as ArrayBuffer for IDB-text.
  createdAt: number;
  updatedAt: number;
  chapterOrder: string[]; // Chapter ids in display order
  // Book-level metadata used by translators as style/tone reference.
  // All optional — leave blank and the AI uses its own judgment.
  genre: string;           // e.g. "fantasy", "romance", "xianxia", "sci-fi"
  tone: string;            // e.g. "dark", "comedic", "serious", "lighthearted"
  style: string;           // e.g. "web novel", "light novel", "literary", "poetic"
  targetAudience: string;  // e.g. "young adult", "adult", "all ages"
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  index: number;
  html: string; // Source HTML (rendered via prose)
  // A flat array of paragraph strings — easier to translate progressively.
  paragraphs: string[];
  wordCount: number;
  detectedLanguage?: SourceLanguage;
}

export interface TranslationCacheEntry {
  // Key is sha-like hash of source + target + quality + provider
  key: string;
  translated: string;
  provider: ProviderId;
  cachedAt: number;
}

export interface ChapterTranslation {
  id: string; // `${bookId}:${chapterId}`
  bookId: string;
  chapterId: string;
  // Parallel array translated[i] corresponds to chapter.paragraphs[i]
  // null = not yet translated
  paragraphs: (string | null)[];
  status: "idle" | "in_progress" | "completed" | "error";
  startedAt?: number;
  completedAt?: number;
  error?: string;
  provider: ProviderId | null;
  progress: number; // 0..1
}

export interface ApiCallLog {
  id: string;
  provider: ProviderId;
  ok: boolean;
  status: number;
  message: string;
  at: number;
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  ok: boolean | null; // null = untested
  message: string | null;
  rateLimitedUntil: number | null;
  lastUsed: number | null;
  callCount: number;
  errorCount: number;
}
