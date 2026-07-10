// Live library hooks: subscribe to changes in the books, chapters, and
// translations stores of IndexedDB.

import { useCallback, useEffect, useState } from "react";
import {
  deleteBookCascade,
  getBook,
  listBooks,
  listChapters,
  listTranslationsByBook,
  putBook,
  putChapters,
  putEpubBlob,
  putTranslation,
} from "@/lib/db";
import type { Book, Chapter, ChapterTranslation } from "@/lib/types";
import { countWords, uid } from "@/lib/util";
import { parseEpubFile } from "@/lib/epub";

type LibraryTick = { t: number };

const ticks: LibraryTick = { t: 0 };
const versionListeners = new Set<() => void>();

let cachedBooks: Book[] = [];
let cachedLoaded = false;

export function notifyLibraryChanged() {
  // Don't set cachedBooks = [] here — that would cause every mounted
  // BookReader to briefly find no book and flash "That volume is not in
  // the library." Just mark the cache stale so the next refresh picks up
  // changes; the old data stays valid for the ~5 ms gap.
  cachedLoaded = false;
  ticks.t++;
  for (const l of versionListeners) l();
}

export function useLibrary(): {
  books: Book[];
  refresh: () => Promise<void>;
  loading: boolean;
} {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((x) => x + 1);
    versionListeners.add(cb);
    return () => {
      versionListeners.delete(cb);
    };
  }, []);

  const [loading, setLoading] = useState(!cachedLoaded);

  const refresh = useCallback(async () => {
    setLoading(true);
    cachedBooks = await listBooks();
    cachedLoaded = true;
    ticks.t++;
    for (const l of versionListeners) l();
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!cachedLoaded) {
      void refresh();
    }
  }, [refresh]);

  return { books: cachedBooks, refresh, loading };
}

export async function importEpubFile(file: File): Promise<Book> {
  const parsed = await parseEpubFile(file);
  const id = uid("book");
  const now = Date.now();

  const chapters: Chapter[] = parsed.chapters.map((c, i) => ({
    ...c,
    id: uid("chap"),
    bookId: id,
    index: i,
  }));

  const book: Book = {
    id,
    title: parsed.book.title || file.name.replace(/\.epub$/i, ""),
    author: parsed.book.author || "Unknown",
    description: parsed.book.description || "",
    language: parsed.book.language || "auto",
    coverDataUrl: parsed.book.coverDataUrl,
    originalEpub: null,
    createdAt: now,
    updatedAt: now,
    chapterOrder: chapters.map((c) => c.id),
  };

  await putBook(book);
  await putChapters(chapters);
  await putEpubBlob(book.id, parsed.blob);
  notifyLibraryChanged();
  return book;
}

export async function updateBook(id: string, patch: Partial<Book>) {
  const existing = await getBook(id);
  if (!existing) return;
  const next: Book = { ...existing, ...patch, updatedAt: Date.now() };
  await putBook(next);
  notifyLibraryChanged();
  return next;
}

export async function reorderChapters(
  bookId: string,
  newOrder: string[],
): Promise<void> {
  const book = await getBook(bookId);
  if (!book) return;
  // Load chapters and update their indices to match newOrder
  const chapters = await listChapters(bookId);
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const updatedChapters: Chapter[] = [];
  newOrder.forEach((id, i) => {
    const c = byId.get(id);
    if (c) updatedChapters.push({ ...c, index: i });
  });
  await putChapters(updatedChapters);
  const next: Book = {
    ...book,
    chapterOrder: newOrder,
    updatedAt: Date.now(),
  };
  await putBook(next);
  notifyLibraryChanged();
}

export async function renameChapter(
  chapterId: string,
  title: string,
): Promise<void> {
  const { getChapter } = await import("@/lib/db");
  const chap = await getChapter(chapterId);
  if (!chap) return;
  await putChapters([{ ...chap, title }]);
  notifyLibraryChanged();
}

export async function deleteChapter(bookId: string, chapterId: string) {
  const book = await getBook(bookId);
  if (!book) return;
  const newOrder = book.chapterOrder.filter((x) => x !== chapterId);
  await reorderChapters(bookId, newOrder);
  // Remove translation entry if present.
  const { getTranslation, db } = await import("@/lib/db");
  const tr = await getTranslation(bookId, chapterId);
  if (tr) {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction("translations", "readwrite");
      const s = t.objectStore("translations");
      const req = s.delete(`${bookId}:${chapterId}`);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      t.oncomplete = () => resolve();
    });
  }
  notifyLibraryChanged();
}

export async function deleteBook(id: string) {
  await deleteBookCascade(id);
  notifyLibraryChanged();
}

export async function saveTranslation(
  translation: ChapterTranslation,
): Promise<void> {
  await putTranslation(translation);
  notifyLibraryChanged();
}

export async function isAdmin(): Promise<true> {
  return true;
}

// ── Aggregate per-book stats ─────────────────────────────────────────────

export interface BookStats {
  totalChapters: number;
  totalWords: number;
  translatedWords: number;
  progress: number; // 0..1
  translatedChapters: number;
}

// Snapshot the chapter list + all translations for one book and compute
// word-level progress. Used by the library's index strip and tiles so each
// card shows a real aggregate, not just chapter 1's progress.
export async function getBookStats(bookId: string): Promise<BookStats> {
  const chapters = await listChapters(bookId);
  const translations = await listTranslationsByBook(bookId);
  const trMap = new Map(translations.map((t) => [t.chapterId, t]));
  let totalWords = 0;
  let translatedWords = 0;
  let translatedChapters = 0;
  for (const ch of chapters) {
    totalWords += ch.wordCount;
    const tr = trMap.get(ch.id);
    if (!tr) continue;
    if (tr.paragraphs.length !== ch.paragraphs.length) continue;
    let any = false;
    for (let i = 0; i < tr.paragraphs.length; i++) {
      const t = tr.paragraphs[i];
      if (t && t.trim()) {
        translatedWords += countWords(t);
        any = true;
      }
    }
    if (any && tr.status === "completed") translatedChapters += 1;
  }
  return {
    totalChapters: chapters.length,
    totalWords,
    translatedWords,
    translatedChapters,
    progress: totalWords > 0 ? translatedWords / totalWords : 0,
  };
}

// Cache the stats map across mounts. Refreshes every time notifyLibraryChanged
// fires (book added/removed, translation saved, chapter reorder).
const cachedStats = new Map<string, BookStats>();

export function useAllBookStats(): {
  statsById: Map<string, BookStats>;
  loading: boolean;
} {
  const [, force] = useState(0);
  const [loading, setLoading] = useState(false);

  const recompute = useCallback(async () => {
    if (cachedBooks.length === 0) {
      cachedStats.clear();
      force((x) => x + 1);
      return;
    }
    setLoading(true);
    try {
      const fresh = new Map<string, BookStats>();
      await Promise.all(
        cachedBooks.map(async (b) => {
          try {
            fresh.set(b.id, await getBookStats(b.id));
          } catch {
            /* skip */
          }
        }),
      );
      cachedStats.clear();
      for (const [k, v] of fresh) cachedStats.set(k, v);
    } finally {
      setLoading(false);
      force((x) => x + 1);
    }
  }, []);

  // Recompute whenever the library version changes (book edited, deleted,
  // or translation persisted elsewhere in the app).
  useEffect(() => {
    const cb = () => {
      void recompute();
    };
    versionListeners.add(cb);
    return () => {
      versionListeners.delete(cb);
    };
  }, [recompute]);

  // First time books arrive from IndexedDB.
  useEffect(() => {
    if (cachedLoaded && cachedStats.size !== cachedBooks.length) {
      void recompute();
    }
  }, [cachedLoaded, recompute]);

  return { statsById: cachedStats, loading };
}
