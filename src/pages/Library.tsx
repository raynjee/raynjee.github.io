// Library page — the gallery of all imported books.
// Editorial layout with header (eyebrow + headline + index strip + import
// panel), a thin toolbar (search / language / sort), and the book wall. Per-
// book stats come from a cached useAllBookStats hook so each tile shows the
// real word-level progress of the whole book rather than chapter 1 only.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpenCheck,
  Globe,
  Library as LibraryIcon,
  Link,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { StudioShell } from "@/components/StudioShell";
import { BookGalleryTile } from "@/components/studio/BookGallery";
import {
  deleteBook,
  deleteChapter,
  importEpubFile,
  importWebNovel,
  renameChapter,
  reorderChapters,
  updateBook,
  useAllBookStats,
  useLibrary,
} from "@/hooks/use-library";
import { listChapters } from "@/lib/db";
import { buildSampleEpub } from "@/lib/seed";
import type { Chapter } from "@/lib/types";
import type { ImportProgress } from "@/lib/web-importer";
import { cn } from "@/lib/utils";

type LangFilter = "all" | "zh" | "ja" | "ko" | "other";
type SortBy = "recent" | "title" | "progress";

const LANG_LABELS: Record<LangFilter, string> = {
  all: "All",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  other: "Other",
};

export default function Library() {
  const { books, refresh, loading } = useLibrary();
  const { statsById, loading: statsLoading } = useAllBookStats();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [langFilter, setLangFilter] = useState<LangFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("recent");

  // Filter + sort the catalogue.
  const filteredBooks = useMemo(() => {
    let list = books;
    if (langFilter !== "all") {
      list = list.filter((b) =>
        langFilter === "other"
          ? !["zh", "ja", "ko"].includes(b.language)
          : b.language === langFilter,
      );
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q),
      );
    }
    list = [...list];
    if (sortBy === "title") {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "recent") {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    } else if (sortBy === "progress") {
      list.sort((a, b) => {
        const pa = statsById.get(a.id)?.progress ?? 0;
        const pb = statsById.get(b.id)?.progress ?? 0;
        return pb - pa;
      });
    }
    return list;
  }, [books, query, langFilter, sortBy, statsById]);

  const totals = useMemo(() => {
    let chapters = 0;
    let words = 0;
    let tWords = 0;
    for (const b of books) {
      chapters += b.chapterOrder.length;
      const s = statsById.get(b.id);
      if (s) {
        words += s.totalWords;
        tWords += s.translatedWords;
      }
    }
    return {
      volumes: books.length,
      chapters,
      words,
      translatedWords: tWords,
      progress: words > 0 ? tWords / words : 0,
    };
  }, [books, statsById]);

  const resetFilters = () => {
    setQuery("");
    setLangFilter("all");
  };

  return (
    <StudioShell>
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10 pt-12 pb-24">
        {/* ── § I · Header ───────────────────────────────────────── */}
        <header className="grid grid-cols-12 gap-8 lg:gap-12 items-end">
          <div className="col-span-12 lg:col-span-7">
            <div className="studio-caps text-muted-foreground">
              Edition 01 · The Gallery
            </div>
            <h1 className="font-display text-[60px] lg:text-[80px] mt-2 tracking-tight leading-[0.95]">
              Library.
            </h1>
            <p className="text-muted-foreground mt-4 max-w-[56ch] leading-relaxed">
              Every volume brought into the studio. Click a tile to open it at
              the reading desk; drop a fresh EPUB on the right to add another.
            </p>

            {/* Index strip — counts across the whole gallery */}
            <div className="mt-10 plate pt-5 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
              <Stat
                label="Volumes"
                value={String(totals.volumes).padStart(2, "0")}
                sub="in the gallery"
              />
              <Stat
                label="Chapters"
                value={totals.chapters.toLocaleString()}
                sub="opened to read"
              />
              <Stat
                label="Words"
                value={totals.words.toLocaleString()}
                sub={statsLoading ? "counting…" : "in the originals"}
              />
              <Stat
                label="Translated"
                value={`${Math.round((totals.progress ?? 0) * 100)}%`}
                sub="of every line"
              />
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5">
            <ImportPanel onUploaded={refresh} />
          </div>
        </header>

        {/* ── § II · Toolbar ────────────────────────────────────── */}
        <div className="mt-14 flex flex-col md:flex-row md:items-center gap-4 md:gap-8 py-3 border-y border-border">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="studio-caps text-muted-foreground whitespace-nowrap">
              Search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title or author"
              className="flex-1 min-w-0 max-w-[280px] bg-transparent border-b border-border focus:border-foreground outline-none py-1 text-sm caret-ink placeholder:text-muted-foreground/60"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="studio-caps text-muted-foreground mr-1 whitespace-nowrap">
              Language
            </span>
            {(Object.keys(LANG_LABELS) as LangFilter[]).map((opt) => (
              <LangChip
                key={opt}
                value={opt}
                label={LANG_LABELS[opt]}
                current={langFilter}
                onChange={setLangFilter}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="studio-caps text-muted-foreground">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="bg-transparent outline-none cursor-pointer text-[11px] uppercase tracking-[0.18em] py-1 caret-ink"
            >
              <option value="recent">Recent</option>
              <option value="title">Title</option>
              <option value="progress">Progress</option>
            </select>
          </div>
        </div>

        {/* ── § III · Wall ──────────────────────────────────────── */}
        <div className="mt-12">
          {loading ? (
            <LoadingGrid />
          ) : books.length === 0 ? (
            <EmptyWall onUploaded={refresh} />
          ) : filteredBooks.length === 0 ? (
            <NoMatch
              currentQuery={query}
              hasFilter={langFilter !== "all"}
              onReset={resetFilters}
            />
          ) : (
            <div className="gallery-grid">
              {filteredBooks.map((b) => (
                <BookGalleryTile
                  key={b.id}
                  book={b}
                  stats={statsById.get(b.id)}
                  onOpen={() => navigate(`/library/${b.id}`)}
                  onEdit={() => navigate(`/library/${b.id}/edit`)}
                  onDelete={async () => {
                    if (
                      !confirm(
                        `Delete "${b.title}"? This will remove all translations too.`,
                      )
                    )
                      return;
                    await deleteBook(b.id);
                    toast.success("Book removed from library.");
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="studio-caps text-muted-foreground">{label}</div>
      <div className="font-display text-3xl mt-1 studio-num">{value}</div>
      {sub && (
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 mt-1">
          {sub}
        </div>
      )}
    </div>
  );
}

function LangChip({
  value,
  label,
  current,
  onChange,
}: {
  value: LangFilter;
  label: string;
  current: LangFilter;
  onChange: (v: LangFilter) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        "h-7 px-2.5 border text-[10px] uppercase tracking-[0.18em] transition-colors",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function ImportPanel({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const dragActive = dragDepth > 0;

  // ── URL import state ──────────────────────────────────────────────
  const [urlMode, setUrlMode] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlImporting, setUrlImporting] = useState(false);
  const [urlProgress, setUrlProgress] = useState<ImportProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const all = Array.from(files);
    const epubs = all.filter(
      (f) => /\.epub$/i.test(f.name) || f.type === "application/epub+zip",
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
          }`,
        );
      }
    }
    setBusy(false);
    if (skipped > 0) {
      toast.message(
        `Skipped ${skipped} non-${skipped === 1 ? ".epub file" : ".epub files"}.`,
      );
    }
    await onUploaded();
  };

  const onUrlImport = async () => {
    const url = urlInput.trim();
    if (!url) {
      toast.error("Paste a novel page URL first.");
      return;
    }
    try {
      new URL(url);
    } catch {
      toast.error("That doesn't look like a valid URL.");
      return;
    }
    setUrlImporting(true);
    setUrlProgress(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const book = await importWebNovel(
        url,
        (p) => setUrlProgress(p),
        ctrl.signal,
      );
      toast.success(
        `"${book.title}" imported with ${book.chapterOrder.length} chapters.`,
      );
      await onUploaded();
      setUrlInput("");
      setUrlMode(false);
    } catch (e) {
      if (ctrl.signal.aborted) {
        toast("Import cancelled.", { icon: "⏹" });
      } else {
        toast.error(
          `Import failed: ${e instanceof Error ? e.message : "unknown error"}`,
        );
      }
    } finally {
      setUrlImporting(false);
      setUrlProgress(null);
      abortRef.current = null;
    }
  };

  return (
    <div className="studio-card">
      <input
        ref={inputRef}
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />

      {/* EPUB drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (e.dataTransfer.types?.includes("Files"))
            setDragDepth((d) => d + 1);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragDepth((d) => Math.max(0, d - 1));
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragDepth(0);
          void onFiles(e.dataTransfer.files);
        }}
        aria-label="Drag EPUB files here to import, or click to browse"
        className={cn(
          "block px-6 py-9 border border-dashed text-center cursor-pointer outline-none select-none transition-colors focus-visible:ring-1 focus-visible:ring-foreground/40",
          dragActive
            ? "border-foreground bg-accent/60"
            : "border-border hover:border-foreground/40 hover:bg-accent/30",
        )}
      >
        <div className="grid place-items-center gap-2.5">
          <Upload
            className={cn(
              "w-5 h-5",
              dragActive ? "text-foreground" : "text-muted-foreground",
            )}
            strokeWidth={1.4}
          />
          <div
            className={cn(
              "font-display text-lg tracking-tight",
              dragActive ? "text-foreground" : "text-foreground/90",
            )}
          >
            {busy
              ? "Reading…"
              : dragActive
                ? "Release to add to the gallery"
                : "Drop or click to add"}
          </div>
          <div className="studio-caps text-muted-foreground">
            .epub · multiple allowed
          </div>
        </div>
      </div>

      {/* Footer with source toggle + URL import */}
      <div className="px-5 py-3 border-t border-border flex items-center justify-between">
        <button
          type="button"
          onClick={() => setUrlMode((m) => !m)}
          className={cn(
            "studio-caps inline-flex items-center gap-1.5 transition-colors",
            urlMode ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Globe className="w-3 h-3" strokeWidth={1.4} />
          Import from URL
        </button>
        <span className="studio-num text-[11px] text-muted-foreground">
          {urlMode ? "Web novel URL" : "Local files only"}
        </span>
      </div>

      {/* URL import panel — slides in below the drop zone */}
      {urlMode && (
        <div className="px-5 py-4 border-t border-border bg-accent/20">
          <div className="studio-caps text-muted-foreground mb-2">
            Paste a novel page URL
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 relative">
              <Link
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                strokeWidth={1.4}
              />
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onUrlImport();
                }}
                placeholder="https://ncode.syosetu.com/n1234/"
                disabled={urlImporting}
                className="w-full h-9 pl-8 pr-3 bg-background border border-border focus:border-foreground outline-none text-xs disabled:opacity-50 caret-ink"
              />
            </div>
            {urlImporting ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="h-9 px-3 inline-flex items-center gap-1.5 border border-border hover:border-destructive hover:text-destructive text-xs uppercase tracking-[0.18em] whitespace-nowrap"
              >
                <X className="w-3 h-3" strokeWidth={1.5} />
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onUrlImport()}
                disabled={!urlInput.trim()}
                className="h-9 px-4 inline-flex items-center gap-1.5 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 text-xs uppercase tracking-[0.18em] whitespace-nowrap"
              >
                {urlImporting ? (
                  <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.4} />
                ) : (
                  <Globe className="w-3 h-3" strokeWidth={1.4} />
                )}
                Import
              </button>
            )}
          </div>

          {/* Progress bar */}
          {urlProgress && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
                  {urlProgress.phase === "toc"
                    ? urlProgress.currentChapter
                    : urlProgress.currentChapter.slice(0, 48)}
                </span>
                <span className="studio-num text-[10px] text-muted-foreground whitespace-nowrap">
                  {urlProgress.done} / {urlProgress.total}
                </span>
              </div>
              <div className="mt-1.5 h-0.5 w-full bg-border overflow-hidden">
                <div
                  className="h-full bg-foreground transition-all duration-300"
                  style={{
                    width: `${(urlProgress.done / Math.max(1, urlProgress.total)) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Supported sites hint */}
          <div className="mt-3 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60 leading-relaxed">
            Supports: syosetu.com · kakuyomu.jp · 69shuba.com · novel543.com
            · shuhaige.net · xbiqige.cc · yxshufang.com & more
          </div>
        </div>
      )}
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

function EmptyWall({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const [seeding, setSeeding] = useState(false);
  const onSeed = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      const file = await buildSampleEpub();
      await importEpubFile(file);
      toast.success("Sample volume added to the library.");
    } catch (e) {
      toast.error(
        `Could not seed sample: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      );
    } finally {
      setSeeding(false);
    }
  };
  return (
    <div className="max-w-2xl mx-auto studio-card p-10 lg:p-14 text-center">
      <div className="studio-caps text-muted-foreground">Plate 0 — Empty Wall</div>
      <h2 className="font-display text-4xl lg:text-5xl mt-3 tracking-tight leading-tight">
        The wall is bare.
      </h2>
      <p className="text-muted-foreground mt-4 leading-relaxed max-w-[48ch] mx-auto">
        Drop an .epub file below and the studio will unfold its spine, capture
        the title, author, and cover, and set each chapter on its own shelf.
      </p>
      <div className="mt-8 mx-auto max-w-md">
        <EmptyDrop onUploaded={onUploaded} />
      </div>

      <div className="mt-8 flex items-center justify-center gap-3">
        <span className="h-px w-12 bg-border" />
        <span className="studio-caps text-muted-foreground">or</span>
        <span className="h-px w-12 bg-border" />
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => void onSeed()}
          disabled={seeding}
          className="h-11 px-5 inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
        >
          {seeding ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.4} />
          ) : (
            <BookOpenCheck className="w-4 h-4" strokeWidth={1.4} />
          )}
          <span className="text-xs uppercase tracking-[0.22em]">
            {seeding ? "Seeding sample…" : "Try with the sample volume"}
          </span>
        </button>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 mt-3 max-w-[40ch] mx-auto leading-relaxed">
          A multilingual travel essay — Japanese, Korean, Chinese & others — so
          you can test the workflow before uploading your own.
        </p>
      </div>

      <div className="mt-8 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
        Multiple files · .epub
      </div>
    </div>
  );
}

function EmptyDrop({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const dragActive = dragDepth > 0;

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const all = Array.from(files);
    const epubs = all.filter(
      (f) => /\.epub$/i.test(f.name) || f.type === "application/epub+zip",
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
          }`,
        );
      }
    }
    setBusy(false);
    if (skipped > 0) {
      toast.message(
        `Skipped ${skipped} non-${skipped === 1 ? ".epub file" : ".epub files"}.`,
      );
    }
    await onUploaded();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (e.dataTransfer.types?.includes("Files"))
            setDragDepth((d) => d + 1);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragDepth((d) => Math.max(0, d - 1));
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragDepth(0);
          void onFiles(e.dataTransfer.files);
        }}
        aria-label="Drag EPUB files here to import, or click to browse"
        className={cn(
          "block px-6 py-12 border border-dashed text-center cursor-pointer outline-none select-none transition-colors focus-visible:ring-1 focus-visible:ring-foreground/40",
          dragActive
            ? "border-foreground bg-accent/60"
            : "border-foreground/20 hover:border-foreground/40 hover:bg-accent/30",
        )}
      >
        <div className="grid place-items-center gap-3">
          <Upload
            className={cn(
              "w-7 h-7",
              dragActive ? "text-foreground" : "text-muted-foreground",
            )}
            strokeWidth={1.3}
          />
          <div className="font-display text-2xl tracking-tight">
            {busy ? "Reading…" : dragActive ? "Release to begin" : "Drop to begin"}
          </div>
          <div className="studio-caps text-muted-foreground">
            or click to browse
          </div>
        </div>
      </div>
    </>
  );
}

function NoMatch({
  currentQuery,
  hasFilter,
  onReset,
}: {
  currentQuery: string;
  hasFilter: boolean;
  onReset: () => void;
}) {
  return (
    <div className="py-16 text-center border-y border-border">
      <div className="studio-caps text-muted-foreground">No volumes match</div>
      <div className="font-display text-3xl mt-2 tracking-tight">
        {currentQuery ? (
          <>
            Nothing matches{" "}
            <em className="not-italic text-muted-foreground">
              &ldquo;{currentQuery}&rdquo;
            </em>
            {hasFilter ? " with the current filters" : ""}.
          </>
        ) : (
          <>No volumes in this language.</>
        )}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 h-10 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40 text-xs uppercase tracking-[0.18em]"
      >
        Clear filters
      </button>
    </div>
  );
}

// ─── BookEditor (admin only) ───────────────────────────────────────────

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
    void listChapters(book.id).then(setChapters);
  };

  const onAddBlank = async () => {
    const newChap: Chapter = {
      id: `chap_${Date.now()}`,
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
          <div className="studio-caps text-muted-foreground">Editing</div>
          <h1 className="font-display text-4xl mt-2 tracking-tight">
            {title || "Untitled"}
          </h1>
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
                <label className="studio-caps text-muted-foreground">
                  Replace cover
                </label>
                <input
                  type="file"
                  accept="image/*"
                  className="text-sm"
                  onChange={(e) => {
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
              <div className="studio-caps text-muted-foreground">
                Editorial details
              </div>
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
                    <span className="text-sm uppercase tracking-[0.18em]">
                      Save
                    </span>
                  </button>
                  <button
                    className="h-10 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40 transition-colors"
                    onClick={() => navigate(`/library/${book.id}`)}
                  >
                    <X className="w-4 h-4" strokeWidth={1.4} />
                    <span className="text-sm uppercase tracking-[0.18em]">
                      Cancel
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="col-span-12">
            <div className="flex items-end justify-between">
              <div>
                <div className="studio-caps text-muted-foreground">
                  Table of contents
                </div>
                <h2 className="font-display text-2xl mt-2 tracking-tight">
                  Chapters
                </h2>
              </div>
              <button
                className="h-10 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40"
                onClick={onAddBlank}
              >
                <Plus className="w-4 h-4" strokeWidth={1.4} />
                <span className="text-sm uppercase tracking-[0.18em]">
                  Add chapter
                </span>
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
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="studio-caps text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
