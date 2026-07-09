// IndexedDB-backed local storage for the translation studio.
// Specifically designed for blob-heavy data: original EPUBs, chapter HTML,
// translation memory cache, and provider call logs.

import type {
  ApiCallLog,
  Book,
  Chapter,
  ChapterTranslation,
  ProviderStatus,
  StudioSettings,
  TranslationCacheEntry,
} from "./types";

const DB_NAME = "atelier-studio";
const DB_VERSION = 1;

export type StoreName =
  | "books"
  | "chapters"
  | "translations"
  | "epubs"
  | "logs"
  | "cache"
  | "providerStatus";

const STORES: StoreName[] = [
  "books",
  "chapters",
  "translations",
  "epubs",
  "logs",
  "cache",
  "providerStatus",
];

const SETTINGS_KEY = "atelier.settings.v1";

const DEFAULT_SETTINGS: StudioSettings = {
  providers: [
    {
      id: "deepseek",
      enabled: true,
      baseUrl: "http://127.0.0.1:8001/v1",
      model: "deepseek-chat",
    },
    {
      id: "gemini",
      enabled: true,
      apiKey: "",
      model: "gemini-1.5-flash",
    },
  ],
  activeProvider: "deepseek",
  sourceLanguage: "auto",
  targetLanguage: "en",
  quality: "balanced",
  parallelRequests: 2,
  pauseOnError: false,
  themePref: "light",
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          if (store === "cache") {
            db.createObjectStore(store, { keyPath: "key" });
          } else if (store === "logs") {
            db.createObjectStore(store, { keyPath: "id" });
          } else {
            db.createObjectStore(store, { keyPath: "id" });
          }
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const objectStore = transaction.objectStore(store);
    const result = fn(objectStore);
    if (result instanceof IDBRequest) {
      result.onsuccess = () => resolve(result.result as T);
      result.onerror = () => reject(result.error);
    } else {
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
    }
  });
}

export function db(): Promise<IDBDatabase> {
  // Cache connection per page
  const globalW = window as unknown as { __atelierDb?: IDBDatabase };
  if (globalW.__atelierDb) return Promise.resolve(globalW.__atelierDb);
  return openDb().then((d) => {
    globalW.__atelierDb = d;
    d.onclose = () => {
      globalW.__atelierDb = undefined;
    };
    return d;
  });
}

// ── Settings (localStorage) ──────────────────────────────────────────────

export function loadSettings(): StudioSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<StudioSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      providers: DEFAULT_SETTINGS.providers.map((p) => {
        const override = parsed.providers?.find((x) => x.id === p.id);
        return override ? { ...p, ...override } : p;
      }),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: StudioSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ── Books ─────────────────────────────────────────────────────────────────

export async function putBook(book: Book): Promise<void> {
  const d = await db();
  await tx(d, "books", "readwrite", (s) => s.put(book));
}

export async function getBook(id: string): Promise<Book | undefined> {
  const d = await db();
  return tx<Book | undefined>(d, "books", "readonly", (s) => s.get(id));
}

export async function listBooks(): Promise<Book[]> {
  const d = await db();
  const all = await tx<Book[]>(d, "books", "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteBookCascade(id: string): Promise<void> {
  const d = await db();
  await Promise.all([
    tx(d, "books", "readwrite", (s) => s.delete(id)),
    clearByCursor(d, "chapters", (v) => (v as Chapter).bookId === id),
    clearByCursor(d, "translations", (v) => (v as ChapterTranslation).bookId === id),
    tx(d, "epubs", "readwrite", (s) => s.delete(id)),
  ]);
}

// Iterate a store with a cursor applying a predicate to every record,
// resolving only when the transaction fully completes. The store-level
// `tx()` helper resolves on the first cursor `onsuccess` (one record per
// cursor step), so we can't reuse it for multi-record deletes — callers
// would think the delete is done while cursor iterations are still live.
function clearByCursor(
  d: IDBDatabase,
  store: StoreName,
  predicate: (value: unknown) => boolean,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = d.transaction(store, "readwrite");
    const s = t.objectStore(store);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error("IndexedDB transaction failed"));
    t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"));
    const req = s.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (predicate(cursor.value)) cursor.delete();
        cursor.continue();
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Chapters ─────────────────────────────────────────────────────────────

export async function putChapter(chapter: Chapter): Promise<void> {
  const d = await db();
  await tx(d, "chapters", "readwrite", (s) => s.put(chapter));
}

export async function putChapters(chapters: Chapter[]): Promise<void> {
  if (chapters.length === 0) return;
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction("chapters", "readwrite");
    const s = t.objectStore("chapters");
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    for (const c of chapters) s.put(c);
  });
}

export async function getChapter(id: string): Promise<Chapter | undefined> {
  const d = await db();
  return tx<Chapter | undefined>(d, "chapters", "readonly", (s) => s.get(id));
}

export async function listChapters(bookId: string): Promise<Chapter[]> {
  const d = await db();
  const all = await tx<Chapter[]>(d, "chapters", "readonly", (s) => s.getAll());
  return all
    .filter((c) => c.bookId === bookId)
    .sort((a, b) => a.index - b.index);
}

// ── Translations ─────────────────────────────────────────────────────────

export async function putTranslation(t: ChapterTranslation): Promise<void> {
  const d = await db();
  await tx(d, "translations", "readwrite", (s) => s.put(t));
}

export async function getTranslation(
  bookId: string,
  chapterId: string,
): Promise<ChapterTranslation | undefined> {
  const d = await db();
  return tx<ChapterTranslation | undefined>(d, "translations", "readonly", (s) =>
    s.get(`${bookId}:${chapterId}`),
  );
}

// Fetch every translation entry belonging to a single book by id-key prefix
// (keys are stored as `${bookId}:${chapterId}`). Uses IDBKeyRange so we don't
// pull the entire store.
export async function listTranslationsByBook(
  bookId: string,
): Promise<ChapterTranslation[]> {
  const d = await db();
  return new Promise<ChapterTranslation[]>((resolve, reject) => {
    const t = d.transaction("translations", "readonly");
    const s = t.objectStore("translations");
    const range = IDBKeyRange.bound(
      `${bookId}:`,
      `${bookId}:\uffff`,
      false,
      true,
    );
    const req = s.getAll(range);
    req.onsuccess = () => resolve((req.result ?? []) as ChapterTranslation[]);
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}

// ── Translation cache ────────────────────────────────────────────────────

export async function getCachedTranslation(
  key: string,
): Promise<TranslationCacheEntry | undefined> {
  const d = await db();
  return tx<TranslationCacheEntry | undefined>(d, "cache", "readonly", (s) =>
    s.get(key),
  );
}

export async function putCachedTranslation(
  entry: TranslationCacheEntry,
): Promise<void> {
  const d = await db();
  await tx(d, "cache", "readwrite", (s) => s.put(entry));
}

// Maintain a soft cap on cache entries to avoid IDB bloat.
const CACHE_CAP = 5000;

export async function trimCache(): Promise<void> {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction("cache", "readwrite");
    const s = t.objectStore("cache");
    const all: TranslationCacheEntry[] = [];
    const req = s.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        all.push(cursor.value as TranslationCacheEntry);
        cursor.continue();
      } else {
        if (all.length <= CACHE_CAP) {
          resolve();
          return;
        }
        all.sort((a, b) => a.cachedAt - b.cachedAt);
        const toRemove = all.slice(0, all.length - CACHE_CAP);
        for (const e of toRemove) s.delete(e.key);
      }
    };
    req.onerror = () => reject(req.error);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ── Original EPUB blobs (for re-export) ──────────────────────────────────

export async function putEpubBlob(
  id: string,
  blob: Blob,
): Promise<void> {
  const d = await db();
  await tx(d, "epubs", "readwrite", (s) => s.put({ id, blob }));
}

export async function getEpubBlob(id: string): Promise<Blob | undefined> {
  const d = await db();
  const result = await tx<{ id: string; blob: Blob } | undefined>(
    d,
    "epubs",
    "readonly",
    (s) => s.get(id),
  );
  return result?.blob;
}

// ── Logs ─────────────────────────────────────────────────────────────────

export async function appendLog(log: ApiCallLog): Promise<void> {
  const d = await db();
  await tx(d, "logs", "readwrite", (s) => s.put(log));
  await trimLogs(d);
}

const LOG_CAP = 500;

async function trimLogs(d: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction("logs", "readwrite");
    const s = t.objectStore("logs");
    const all: ApiCallLog[] = [];
    const req = s.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        all.push(cursor.value as ApiCallLog);
        cursor.continue();
      } else {
        if (all.length <= LOG_CAP) return;
        all.sort((a, b) => b.at - a.at);
        const toRemove = all.slice(LOG_CAP);
        for (const e of toRemove) s.delete(e.id);
      }
    };
    req.onerror = () => reject(req.error);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function listLogs(): Promise<ApiCallLog[]> {
  const d = await db();
  const all = await tx<ApiCallLog[]>(d, "logs", "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.at - a.at);
}

// ── Provider status snapshot ─────────────────────────────────────────────

export async function saveProviderStatus(
  status: ProviderStatus[],
): Promise<void> {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    "atelier.provider-status.v1",
    JSON.stringify(status),
  );
}

export function loadProviderStatus(): ProviderStatus[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("atelier.provider-status.v1");
    return raw ? (JSON.parse(raw) as ProviderStatus[]) : [];
  } catch {
    return [];
  }
}

// ── Backup / Restore ─────────────────────────────────────────────────────

export interface StudioBackup {
  version: 1;
  exportedAt: number;
  books: Book[];
  chapters: Chapter[];
  translations: ChapterTranslation[];
  settings: StudioSettings;
  providerStatus: ProviderStatus[];
}

export async function buildBackup(): Promise<StudioBackup> {
  const d = await db();
  const [books, chapters, translations] = await Promise.all([
    tx<Book[]>(d, "books", "readonly", (s) => s.getAll()),
    tx<Chapter[]>(d, "chapters", "readonly", (s) => s.getAll()),
    tx<ChapterTranslation[]>(d, "translations", "readonly", (s) => s.getAll()),
  ]);
  return {
    version: 1,
    exportedAt: Date.now(),
    books,
    chapters,
    translations,
    settings: loadSettings(),
    providerStatus: loadProviderStatus(),
  };
}

export async function restoreBackup(backup: StudioBackup): Promise<void> {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction(["books", "chapters", "translations"], "readwrite");
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    const bs = t.objectStore("books");
    const cs = t.objectStore("chapters");
    const ts = t.objectStore("translations");
    bs.clear();
    cs.clear();
    ts.clear();
    for (const b of backup.books) bs.put(b);
    for (const c of backup.chapters) cs.put(c);
    for (const tr of backup.translations) ts.put(tr);
  });
  saveSettings(backup.settings);
  saveProviderStatus(backup.providerStatus);
}

// ── Tiny types used only here ───────────────────────────────────────────
type IDBCursorWithValue = IDBCursor & { value: any };
