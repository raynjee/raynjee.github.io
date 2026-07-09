// Library page — the gallery of all imported books.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Upload,
  Plus,
  Save,
  X,
  Pencil,
  Library as LibraryIcon,
} from "lucide-react";
import { useNavigate } from "react-router";
import { StudioShell } from "@/components/StudioShell";
import { BookGalleryTile } from "@/components/studio/BookGallery";
import {
  useLibrary,
  importEpubFile,
  updateBook,
  deleteBook,
  renameChapter,
  deleteChapter,
  reorderChapters,
  saveTranslation,
} from "@/hooks/use-library";
import { getTranslation, listChapters } from "@/lib/db";
import type { Book, Chapter, ChapterTranslation } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Library() {
  const { books, refresh, loading } = useLibrary();
  const navigate = useNavigate();
  const asAdmin = true; // No auth — everyone is the curator.

  return (
    <StudioShell>
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10 pt-10 pb-20">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="studio-caps text-muted-foreground">The Gallery</div>
            <h1 className="font-display text-5xl mt-2 tracking-tight">
              Library
            </h1>
            <p className="mt-2 text-muted-foreground max-w-[58ch]">
              Every volume brought into the studio. Click a tile to open it at
              the reading desk.
            </p>
          </div>
          {asAdmin && <UploadZone onUploaded={refresh} />}
        </header>

        <div className="mt-10">
          {loading ? (
            <LoadingGrid />
          ) : books.length === 0 ? (
            <EmptyShelf asAdmin={asAdmin} />
          ) : (
            <div className="gallery-grid">
              <AnimatePresence>
                {books.map((b) => (
                  <BookTileContainer
                    key={b.id}
                    book={b}
                    onOpen={() => navigate(`/library/${b.id}`)}
                    onEdit={() => navigate(`/library/${b.id}/edit`)}
                    onDelete={async () => {
                      if (!confirm(`Delete "${b.title}"? This will remove all translations too.`)) return;
                      await deleteBook(b.id);
                      toast.success("Book removed from library.");
                    }}
                    asAdmin={asAdmin}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}

function BookTileContainer({
  book,
  onOpen,
  onEdit,
  onDelete,
  asAdmin,
}: {
  book: Book;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  asAdmin: boolean;
}) {
  const [translation, setTranslation] = useState<ChapterTranslation | null>(null);
  useEffect(() => {
    let cancelled = false;
    void listChapters(book.id).then(async (chapters) => {
      const first = chapters[0];
      if (!first) return;
      const tr = await getTranslation(book.id, first.id);
      if (!cancelled) setTranslation(tr ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [book.id, book.updatedAt]);
  return (
    <BookGalleryTile
      book={book}
      translation={translation}
      onOpen={onOpen}
      onEdit={onEdit}
      onDelete={onDelete}
      asAdmin={asAdmin}
    />
  );
}

function UploadZone({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  // Counter-based drag tracking so children don't flicker the highlight when
  // the pointer crosses nested elements (icon, label, hint).
  const [dragDepth, setDragDepth] = useState(0);
  const dragActive = dragDepth > 0;

  const onPick = () => inputRef.current?.click();

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const all = Array.from(files);
    const epubs = all.filter(
      (f) => /\.epub$/i.test(f.name) || f.type === "application/epub+zip"
    );
    const skipped = all.length - epubs.length;
    if (epubs.length === 0) {
      toast.error("No .epub files in that drop.");
      return;
    }
    setBusy(true);
    for (const file of epubs) {
      try {
        await importEpubFile(file);
        toast.success(`"${file.name}" imported.`);
      } catch (e) {
        toast.error(
          `Failed to import "${file.name}": ${
            e instanceof Error ? e.message : "unknown error"
          }`
        );
      }
    }
    setBusy(false);
    if (skipped > 0) {
      toast.message(
        `Skipped ${skipped} non-${skipped === 1 ? ".epub file" : ".epub files"}.`
      );
    }
    await onUploaded();
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types?.includes("Files")) {
      setDragDepth((d) => d + 1);
    }
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragDepth((d) => Math.max(0, d - 1));
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragDepth(0);
    void onFiles(e.dataTransfer.files);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick();
    }
  };

  return (
    <div className="flex flex-col items-stretch sm:items-end gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      <button
        onClick={onPick}
        disabled={busy}
        className="h-11 px-5 inline-flex items-center justify-center gap-2 bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
      >
        <Upload className="w-4 h-4" strokeWidth={1.5} />
        <span className="text-sm uppercase tracking-[0.18em]">
          {busy ? "Reading…" : "Import EPUB"}
        </span>
      </button>

      <div
        role="button"
        tabIndex={0}
        onClick={onPick}
        onKeyDown={onKeyDown}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        aria-label="Drag EPUB files here to import, or click to browse"
        className={cn(
          "w-full sm:w-[340px] px-5 py-6 border border-dashed text-center transition-colors select-none cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-foreground/40",
          dragActive
            ? "border-foreground bg-accent/60"
            : "border-border hover:border-foreground/40 hover:bg-accent/30"
        )}
      >
        <div className="grid place-items-center gap-2.5">
          <Upload
            className={cn(
              "w-4 h-4 transition-colors",
              dragActive ? "text-foreground" : "text-muted-foreground"
            )}
            strokeWidth={1.4}
          />
          <div
            className={cn(
              "studio-caps transition-colors",
              dragActive ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {dragActive
              ? "Release to add to the gallery"
              : "Or drop .epub file(s) here"}
          </div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
            {busy ? "Parsing…" : "Multiple allowed · .epub"}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="gallery-grid">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="studio-card p-3 animate-pulse">
          <div className="gallery-frame aspect-[3/4] bg-muted" />
          <div className="mt-4 h-4 bg-muted rounded-sm w-3/4" />
          <div className="mt-2 h-3 bg-muted rounded-sm w-1/2" />
        </div>
      ))}
    </div>
  );
}

function EmptyShelf({ asAdmin }: { asAdmin: boolean }) {
  return (
    <div className="grid grid-cols-12 gap-6 lg:gap-10 border border-border p-10 bg-card">
      <div className="col-span-12 lg:col-span-7">
        <div className="studio-caps text-muted-foreground">Plate 0 — Empty wall</div>
        <h2 className="font-display text-3xl mt-2 tracking-tight leading-tight">
          No volumes have been brought in yet.
        </h2>
        <p className="text-muted-foreground mt-3 leading-relaxed max-w-[52ch]">
          {asAdmin
            ? "Use Import EPUB above to drop an .epub file into the gallery. We'll read its spine, capture the metadata, and hold each chapter open for translation."
            : "The library is curated by the studio's administrator. Once they have imported volumes, they will appear here."}
        </p>
      </div>
      <div className="col-span-12 lg:col-span-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[3/4] border border-border bg-gradient-to-br from-muted to-accent"
          />
        ))}
      </div>
    </div>
  );
}

// ─── BookEditor (admin only) ─────────────────────────────────────────────

export function BookEditor({ bookId }: { bookId: string }) {
  const { books } = useLibrary();
  const book = books.find((b) => b.id === bookId);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [description, setDescription] = useState(book?.description ?? "");
  const navigate = useNavigate();
  const [cover, setCover] = useState<string | null>(book?.coverDataUrl ?? null);

  useEffect(() => {
    if (!book) return;
    void listChapters(book.id).then(setChapters);
  }, [book?.id, book?.updatedAt]);

  useEffect(() => {
    setTitle(book?.title ?? "");
    setAuthor(book?.author ?? "");
    setDescription(book?.description ?? "");
    setCover(book?.coverDataUrl ?? null);
  }, [book?.id]);

  if (!book) {
    return (
      <StudioShell>
        <div className="mx-auto max-w-[900px] px-6 lg:px-10 pt-24 text-center">
          <div className="font-display text-2xl">No such book.</div>
          <button
            className="mt-6 h-11 px-5 inline-flex items-center gap-2 border border-border"
            onClick={() => navigate("/library")}
          >
            <LibraryIcon className="w-4 h-4" strokeWidth={1.4} />
            Back to library
          </button>
        </div>
      </StudioShell>
    );
  }

  const onMove = async (idx: number, direction: -1 | 1) => {
    const next = [...chapters];
    const target = idx + direction;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setChapters(next);
    await reorderChapters(book.id, next.map((c) => c.id));
  };

  const onRename = async (id: string, t: string) => {
    setChapters((cs) => cs.map((c) => (c.id === id ? { ...c, title: t } : c)));
    await renameChapter(id, t);
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this chapter and its translation?")) return;
    await deleteChapter(book.id, id);
  };

  const onAddBlank = async () => {
    const id = `chap_${Date.now()}`;
    const newChap: Chapter = {
      id,
      bookId: book.id,
      index: chapters.length,
      title: `Chapter ${chapters.length + 1}`,
      html: "",
      paragraphs: [],
      wordCount: 0,
    };
    const next = [...chapters, newChap];
    setChapters(next);
    await reorderChapters(book.id, next.map((c) => c.id));
    await saveTranslation({
      id: `${book.id}:${id}`,
      bookId: book.id,
      chapterId: id,
      paragraphs: [],
      status: "idle",
      provider: null,
      progress: 0,
    });
  };

  const onSaveMeta = async () => {
    await updateBook(book.id, { title, author, description, coverDataUrl: cover });
    toast.success("Book details saved.");
  };

  return (
    <StudioShell>
      <div className="mx-auto max-w-[1100px] px-6 lg:px-10 pt-10 pb-20">
        <button
          className="text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
          onClick={() => navigate(`/library/${book.id}`)}
        >
          ← Back to book
        </button>
        <div className="mt-4">
          <div className="studio-caps text-muted-foreground">Curator · Editing</div>
          <h1 className="font-display text-4xl mt-2 tracking-tight">{title || "Untitled"}</h1>
        </div>

        <div className="grid grid-cols-12 gap-8 mt-10">
          <section className="col-span-12 lg:col-span-5">
            <div className="studio-card p-5">
              <div className="studio-caps text-muted-foreground">Cover</div>
              <div className="mt-3 gallery-frame aspect-[3/4] grid place-items-center bg-muted">
                {cover ? (
                  <img src={cover} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-muted-foreground text-sm">No cover</div>
                )}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <label className="studio-caps text-muted-foreground">Replace cover</label>
                <input
                  type="file"
                  accept="image/*"
                  className="text-sm"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => setCover(reader.result as string);
                    reader.readAsDataURL(f);
                  }}
                />
              </div>
            </div>
          </section>

          <section className="col-span-12 lg:col-span-7">
            <div className="studio-card p-5">
              <div className="studio-caps text-muted-foreground">Editorial details</div>
              <div className="grid gap-4 mt-3">
                <Field label="Title">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-2 text-lg font-display"
                  />
                </Field>
                <Field label="Author">
                  <input
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full bg-transparent border-b border-border focus:border-foreground outline-none py-2"
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={5}
                    className="w-full bg-transparent border border-border focus:border-foreground outline-none p-3 text-sm leading-relaxed resize-none"
                    placeholder="A short note for readers."
                  />
                </Field>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    className="h-10 px-4 inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 transition-colors"
                    onClick={onSaveMeta}
                  >
                    <Save className="w-4 h-4" strokeWidth={1.4} />
                    <span className="text-sm uppercase tracking-[0.18em]">Save</span>
                  </button>
                  <button
                    className="h-10 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40 transition-colors"
                    onClick={() => navigate(`/library/${book.id}`)}
                  >
                    <X className="w-4 h-4" strokeWidth={1.4} />
                    <span className="text-sm uppercase tracking-[0.18em]">Cancel</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="col-span-12">
            <div className="flex items-end justify-between">
              <div>
                <div className="studio-caps text-muted-foreground">Table of contents</div>
                <h2 className="font-display text-23xl mt-2 tracking-tight text-2xl">Chapters</h2>
              </div>
              <button
                className="h-10 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40"
                onClick={onAddBlank}
              >
                <Plus className="w-4 h-4" strokeWidth={1.4} />
                <span className="text-sm uppercase tracking-[0.18em]">Add chapter</span>
              </button>
            </div>
            <ol className="mt-6 border border-border divide-y divide-border bg-card">
              {chapters.map((c, idx) => (
                <li key={c.id} className="grid grid-cols-12 items-center gap-4 p-4">
                  <span className="col-span-1 studio-num text-muted-foreground">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <input
                    value={c.title}
                    onChange={(e) => onRename(c.id, e.target.value)}
                    className="col-span-6 bg-transparent border-b border-border focus:border-foreground outline-none py-1 font-display text-lg"
                  />
                  <span className="col-span-2 text-xs text-muted-foreground">
                    {c.wordCount.toLocaleString()} words
                  </span>
                  <div className="col-span-3 flex items-center justify-end gap-2">
                    <button
                      className="w-8 h-8 grid place-items-center border border-border hover:border-foreground/40"
                      onClick={() => onMove(idx, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="w-4 h-4" strokeWidth={1.4} />
                    </button>
                    <button
                      className="w-8 h-8 grid place-items-center border border-border hover:border-foreground/40"
                      onClick={() => onMove(idx, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="w-4 h-4" strokeWidth={1.4} />
                    </button>
                    <button
                      className="w-8 h-8 grid place-items-center border border-border hover:border-destructive hover:text-destructive"
                      onClick={() => onDelete(c.id)}
                      aria-label="Delete"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.4} />
                    </button>
                  </div>
                </li>
              ))}
              {chapters.length === 0 && (
                <li className="p-8 text-center text-muted-foreground text-sm">
                  No chapters. Use Add chapter to start one.
                </li>
              )}
            </ol>
          </section>
        </div>
      </div>
    </StudioShell>
  );
  void saveTranslation;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="studio-caps text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// Re-export motion to satisfy unused warning.
void motion;
void Pencil;
