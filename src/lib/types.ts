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

export type ProviderId = "deepseek" | "gemini";

export interface ProviderConfig {
  id: ProviderId;
  enabled: boolean;
  apiKey?: string; // still used by Gemini
  model?: string;
  baseUrl?: string; // DeepSeek proxy endpoint (default http://127.0.0.1:8001/v1)
}

// ── Reader preferences ────────────────────────────────────────────────────
// Per-book overrides stored on the user's StudioSettings shape (see below).
// A new book starts with `defaultReaderPrefs`; users can tune any book
// individually via `bookReaderPrefs[bookId]` which is a Partial<ReaderPrefs>
// (only the keys they changed are persisted, so resetting a single dimen-
// sion falls back to the global default automatically).

export type FontScale = "xs" | "s" | "m" | "l" | "xl";
export type Leading = "tight" | "regular" | "airy";
export type ParagraphGap = "tight" | "regular" | "roomy";
export type ReaderLayout = "split" | "stack";
export type ReaderFont = "serif" | "sans";

export interface ReaderPrefs {
  showToc: boolean;
  showOriginal: boolean;
  layout: ReaderLayout;
  font: ReaderFont;
  scale: FontScale;
  leading: Leading;
  gap: ParagraphGap;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  showToc: true,
  showOriginal: true,
  layout: "split",
  font: "serif",
  scale: "m",
  leading: "regular",
  gap: "regular",
};

// Discrete values for sliders / range controls — keep these in lockstep
// with the CSS-var math used in index.css so the reader has no flicker
// when the user adjusts a control.
export const FONT_SCALES: Record<FontScale, number> = {
  xs: 0.85,
  s: 0.92,
  m: 1,
  l: 1.12,
  xl: 1.25,
};
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
export const FONT_FAMILY: Record<ReaderFont, string> = {
  serif: "var(--font-display)",
  sans: "var(--font-sans)",
};

export interface StudioSettings {
  providers: ProviderConfig[];
  activeProvider: ProviderId;
  sourceLanguage: SourceLanguage;
  targetLanguage: "en";
  quality: Quality;
  parallelRequests: number;
  pauseOnError: boolean;
  themePref: "light" | "dark" | "system";
  defaultReaderPrefs: ReaderPrefs;
  bookReaderPrefs: Record<string, Partial<ReaderPrefs>>;
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
