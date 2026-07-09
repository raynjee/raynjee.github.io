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

export interface StudioSettings {
  providers: ProviderConfig[];
  activeProvider: ProviderId;
  sourceLanguage: SourceLanguage;
  targetLanguage: "en";
  quality: Quality;
  parallelRequests: number;
  pauseOnError: boolean;
  themePref: "light" | "dark" | "system";
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
