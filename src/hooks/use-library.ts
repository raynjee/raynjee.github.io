// Live library hooks: subscribe to changes in the books, chapters, and
// translations stores of IndexedDB.

import { useCallback, useEffect, useState } from "react";
import {
  deleteBookCascade,
  getBook,
  listBooks,
  listChapters,
  putBook,
  putChapters,
  putEpubBlob,
  putTranslation,
} from "@/lib/db";
import type { Book, Chapter, ChapterTranslation } from "@/lib/types";
import { uid } from "@/lib/util";
import { parseEpubFile } from "@/lib/epub";
import { getCurrentUser } from "@/lib/auth";

type LibraryTick = { t: number };

const ticks: LibraryTick = { t: 0 };
const versionListeners = new Set<() => void>();

let cachedBooks: Book[] = [];
let cachedLoaded = false;

export function notifyLibraryChanged() {
  cachedBooks = [];
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

// Reserved for admin gating in pages.
export async function isAdmin(): Promise<boolean> {
  const u = await getCurrentUser();
  return !!u && !!u.email && u.email.toLowerCase() === "saberyyang09@gmail.com";
}
