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
  Languages,
  Library as LibraryIcon,
  Loader2,
  Merge,
  Plus,
  Save,
  Scissors,
  Sparkles,
  Trash2,
  Undo2,
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
  importTextFile,
  renameChapter,
  reorderChapters,
  updateBook,
  useAllBookStats,
  useLibrary,
} from "@/hooks/use-library";
import { listChapters, putBook, putChapters } from "@/lib/db";
import { buildSampleEpub } from "@/lib/seed";
import { TranslationManager } from "@/lib/translators/types";
import { useSettings } from "@/hooks/use-settings";
import type { Chapter } from "@/lib/types";
import { cn } from "@/lib/utils";
import { countWords, uid } from "@/lib/util";
import { splitIntoChapters } from "@/lib/text-import";

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
        <header className="flex flex-col lg:flex-row gap-8 lg:gap-16 items-start lg:items-end">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-[0.95]">
              Library
            </h1>
            <p className="text-muted-foreground mt-3 max-w-[48ch] text-sm leading-relaxed">
              Click a volume to open it at the reading desk, or drop a new file to add one.
            </p>

            {/* Index strip — subtle inline stats */}
            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
              <span className="text-muted-foreground">
                <span className="studio-num font-display text-foreground text-lg">{totals.volumes}</span>{" "}
                volume{totals.volumes !== 1 ? "s" : ""}
              </span>
              <span className="text-muted-foreground">
                <span className="studio-num font-display text-foreground text-lg">{totals.chapters.toLocaleString()}</span>{" "}
                chapters
              </span>
              <span className="text-muted-foreground">
                <span className="studio-num font-display text-foreground text-lg">{totals.words.toLocaleString()}</span>{" "}
                words
              </span>
              <span className="text-muted-foreground">
                <span className="studio-num font-display text-foreground text-lg">
                  {statsLoading ? "…" : `${Math.round((totals.progress ?? 0) * 100)}%`}
                </span>{" "}
                translated
              </span>
            </div>
          </div>

          <div className="w-full lg:w-80 shrink-0">
            <ImportPanel onUploaded={refresh} />
          </div>
        </header>

        {/* ── § II · Toolbar ────────────────────────────────────── */}
        <div className="mt-12 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-5 pb-6 border-b border-border">
          <div className="flex-1 min-w-0">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or author…"
              className="w-full max-w-[320px] bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-sm caret-ink placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-1.5">
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

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="bg-transparent outline-none cursor-pointer text-xs tracking-[0.12em] py-1.5 caret-ink text-muted-foreground"
          >
            <option value="recent">Recent</option>
            <option value="title">Title</option>
            <option value="progress">Progress</option>
          </select>
        </div>

        {/* ── § III · Wall ──────────────────────────────────────── */}
        <div className="mt-10">
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
        "h-7 px-2.5 text-[10px] uppercase tracking-[0.15em] transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground",
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

  const isSupported = (f: File) =>
    /\.epub$/i.test(f.name) ||
    f.type === "application/epub+zip" ||
    /\.(txt|docx?)$/i.test(f.name) ||
    f.type === "text/plain" ||
    f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    f.type === "application/msword";

  const importFile = async (file: File) => {
    if (/\.epub$/i.test(file.name) || file.type === "application/epub+zip") {
      await importEpubFile(file);
    } else {
      await importTextFile(file);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const all = Array.from(files);
    const supported = all.filter(isSupported);
    const skipped = all.length - supported.length;
    if (supported.length === 0) {
      toast.error("No supported files (.epub, .txt, .docx) in that drop.");
      return;
    }
    setBusy(true);
    for (const file of supported) {
      try {
        await importFile(file);
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
        `Skipped ${skipped} unsupported ${skipped === 1 ? "file" : "files"}.`,
      );
    }
    await onUploaded();
  };

  return (
    <div className="border border-border">
      <input
        ref={inputRef}
        type="file"
        accept=".epub,.txt,.docx,.doc,application/epub+zip,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
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
        aria-label="Drag files here to import, or click to browse"
        className={cn(
          "block px-5 py-8 text-center cursor-pointer outline-none select-none transition-colors focus-visible:ring-1 focus-visible:ring-foreground/40",
          dragActive
            ? "bg-accent/40"
            : "hover:bg-accent/20",
        )}
      >
        <div className="grid place-items-center gap-2">
          <Upload
            className={cn(
              "w-4 h-4",
              dragActive ? "text-foreground" : "text-muted-foreground",
            )}
            strokeWidth={1.4}
          />
          <div className="text-sm text-muted-foreground">
            {busy ? "Importing…" : dragActive ? "Release to import" : "Drop or click to add"}
          </div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            .epub · .txt · .docx
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
    <div className="max-w-lg mx-auto py-16 text-center">
      <div className="w-12 h-12 mx-auto mb-6 grid place-items-center border border-border">
        <BookOpenCheck className="w-5 h-5 text-muted-foreground" strokeWidth={1.2} />
      </div>
      <h2 className="font-display text-2xl tracking-tight">
        Your library is empty
      </h2>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed max-w-[40ch] mx-auto">
        Drop an .epub, .txt, or .docx file to add your first volume.
      </p>
      <div className="mt-8 mx-auto max-w-sm">
        <EmptyDrop onUploaded={onUploaded} />
      </div>

      <div className="mt-8 flex items-center justify-center gap-3">
        <span className="h-px w-8 bg-border" />
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">or</span>
        <span className="h-px w-8 bg-border" />
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={() => void onSeed()}
          disabled={seeding}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          {seeding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.4} />
          ) : (
            <BookOpenCheck className="w-3.5 h-3.5" strokeWidth={1.4} />
          )}
          {seeding ? "Seeding sample…" : "Try the sample volume"}
        </button>
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-3 max-w-[36ch] mx-auto leading-relaxed">
          A multilingual travel essay so you can test the workflow.
        </p>
      </div>
    </div>
  );
}

function EmptyDrop({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const dragActive = dragDepth > 0;

  const isSupported = (f: File) =>
    /\.epub$/i.test(f.name) ||
    f.type === "application/epub+zip" ||
    /\.(txt|docx?)$/i.test(f.name) ||
    f.type === "text/plain" ||
    f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    f.type === "application/msword";

  const importFile = async (file: File) => {
    if (/\.epub$/i.test(file.name) || file.type === "application/epub+zip") {
      await importEpubFile(file);
    } else {
      await importTextFile(file);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const all = Array.from(files);
    const supported = all.filter(isSupported);
    const skipped = all.length - supported.length;
    if (supported.length === 0) {
      toast.error("No supported files (.epub, .txt, .docx) in that drop.");
      return;
    }
    setBusy(true);
    for (const file of supported) {
      try {
        await importFile(file);
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
        `Skipped ${skipped} unsupported ${skipped === 1 ? "file" : "files"}.`,
      );
    }
    await onUploaded();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".epub,.txt,.docx,.doc,application/epub+zip,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
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
        aria-label="Drag files here to import, or click to browse"
        className={cn(
          "block px-5 py-10 border border-border text-center cursor-pointer outline-none select-none transition-colors focus-visible:ring-1 focus-visible:ring-foreground/40",
          dragActive
            ? "bg-accent/40"
            : "hover:bg-accent/20",
        )}
      >
        <div className="grid place-items-center gap-2">
          <Upload
            className={cn(
              "w-5 h-5",
              dragActive ? "text-foreground" : "text-muted-foreground",
            )}
            strokeWidth={1.4}
          />
          <div className="text-sm text-muted-foreground">
            {busy ? "Importing…" : dragActive ? "Release to import" : "Drop or click to add"}
          </div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            .epub · .txt · .docx
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
    <div className="py-16 text-center">
      <div className="font-display text-xl tracking-tight text-muted-foreground">
        {currentQuery ? (
          <>
            Nothing matches{" "}
            <span className="text-foreground">
              &ldquo;{currentQuery}&rdquo;
            </span>
            {hasFilter ? " with the current filters" : ""}
          </>
        ) : (
          <>No volumes in this language.</>
        )}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
  const { settings } = useSettings();
  const [translatingMeta, setTranslatingMeta] = useState(false);
  const [translatingTitle, setTranslatingTitle] = useState(false);
  const [translatingAuthor, setTranslatingAuthor] = useState(false);
  const [translatingDesc, setTranslatingDesc] = useState(false);

  // Keep original values to enable per-field revert
  const origTitleRef = useRef(book?.title ?? "");
  const origAuthorRef = useRef(book?.author ?? "");
  const origDescRef = useRef(book?.description ?? "");

  // Chapter split UI state
  const [splittingChapterId, setSplittingChapterId] = useState<string | null>(null);
  const [splitPoints, setSplitPoints] = useState<Set<number>>(new Set());

  // Track unsaved changes
  const hasChanges =
    title !== (book?.title ?? "") ||
    author !== (book?.author ?? "") ||
    description !== (book?.description ?? "") ||
    cover !== (book?.coverDataUrl ?? null);

  const translateField = async (
    text: string,
    kind: string,
    setter: (v: string) => void,
    busySetter: (v: boolean) => void,
  ) => {
    if (!text.trim() || !book) return;
    busySetter(true);
    try {
      const mgr = new TranslationManager({
        providers: settings.providers,
        preferred: settings.activeProvider,
        parallelRequests: 1,
        pauseOnError: false,
        quality: settings.quality,
        source: book.language,
        target: "en",
      });
      const result = await mgr.translateChapter({
        paragraphs: [text.trim()],
        contextHint: `Translate this ${kind} from "${book.title}" to natural English. Return ONLY the translated text, nothing else.`,
      });
      const translated = result.rows[0]?.trim();
      if (translated && translated !== text.trim()) {
        setter(translated);
        toast.success(`${kind} translated.`);
      } else {
        toast.message(`${kind} is already in English or unchanged.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Translation failed: ${msg.slice(0, 200)}`);
    } finally {
      busySetter(false);
    }
  };

  useEffect(() => {
    if (!book) return;
    void listChapters(book.id).then(setChapters);
  }, [book?.id, book?.updatedAt]);

  useEffect(() => {
    setTitle(book?.title ?? "");
    setAuthor(book?.author ?? "");
    setDescription(book?.description ?? "");
    setCover(book?.coverDataUrl ?? null);
    origTitleRef.current = book?.title ?? "";
    origAuthorRef.current = book?.author ?? "";
    origDescRef.current = book?.description ?? "";
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

  // ── Chapter split / merge ─────────────────────────────────────────────

  const onToggleSplit = (chapterId: string) => {
    if (splittingChapterId === chapterId) {
      setSplittingChapterId(null);
      setSplitPoints(new Set());
    } else {
      setSplittingChapterId(chapterId);
      setSplitPoints(new Set());
    }
  };

  const onToggleSplitPoint = (paraIdx: number) => {
    const next = new Set(splitPoints);
    if (next.has(paraIdx)) {
      next.delete(paraIdx);
    } else {
      next.add(paraIdx);
    }
    setSplitPoints(next);
  };

  const onApplySplit = async (chapter: Chapter) => {
    if (splitPoints.size === 0) return;

    const sortedPoints = [...splitPoints].sort((a, b) => a - b);
    const groups: string[][] = [];
    let start = 0;
    for (const pt of sortedPoints) {
      groups.push(chapter.paragraphs.slice(start, pt));
      start = pt;
    }
    groups.push(chapter.paragraphs.slice(start));

    const nonEmpty = groups.filter((g) => g.length > 0);
    if (nonEmpty.length <= 1) {
      toast.message("Split would produce only one non-empty chapter.");
      return;
    }

    const newChapters: Chapter[] = nonEmpty.map((paras, i) => ({
      id: uid("chap"),
      bookId: book.id,
      index: 0,
      title: i === 0 ? chapter.title : `${chapter.title} (part ${i + 1})`,
      html: "",
      paragraphs: paras,
      wordCount: paras.reduce((s, p) => s + countWords(p), 0),
    }));

    const idx = chapters.findIndex((c) => c.id === chapter.id);
    const nextChapters = [
      ...chapters.slice(0, idx),
      ...newChapters,
      ...chapters.slice(idx + 1),
    ];

    setChapters(nextChapters);
    setSplittingChapterId(null);
    setSplitPoints(new Set());

    await putChapters(newChapters);
    await reorderChapters(book.id, nextChapters.map((c) => c.id));
    toast.success(`Chapter split into ${newChapters.length} parts.`);
  };

  const onMergeNext = async (idx: number) => {
    if (idx >= chapters.length - 1) return;
    const current = chapters[idx];
    const nextChap = chapters[idx + 1];

    if (!confirm(`Merge "${current.title}" with "${nextChap.title}"?`)) return;

    const mergedTitle = current.title;
    const mergedParas = [...current.paragraphs, ...nextChap.paragraphs];
    const merged: Chapter = {
      id: uid("chap"),
      bookId: book.id,
      index: idx,
      title: mergedTitle,
      html: "",
      paragraphs: mergedParas,
      wordCount: mergedParas.reduce((s, p) => s + countWords(p), 0),
    };

    const nextChapters = [
      ...chapters.slice(0, idx),
      merged,
      ...chapters.slice(idx + 2),
    ];

    setChapters(nextChapters);
    await putChapters([merged]);
    await reorderChapters(book.id, nextChapters.map((c) => c.id));
    toast.success("Chapters merged.");
  };

  const activeSplitChapter = splittingChapterId
    ? chapters.find((c) => c.id === splittingChapterId)
    : null;

  const onReSplit = async () => {
    if (chapters.length === 0) return;
    if (
      !confirm(
        "Re-detect chapter boundaries? This will flatten all chapters into paragraphs and re-split them using chapter markers (e.g. 'Chapter 1', '第1章', etc.). Any custom chapter titles will be replaced.",
      )
    )
      return;

    const allParagraphs = chapters.flatMap((c) => c.paragraphs);
    const reSplitChapters = splitIntoChapters(allParagraphs, book.title || "Untitled");

    if (reSplitChapters.length === 0) {
      toast.error("Could not detect any chapter boundaries.");
      return;
    }

    const newChapters: Chapter[] = reSplitChapters.map((c, i) => ({
      ...c,
      id: uid("chap"),
      bookId: book.id,
      index: i,
    }));

    setChapters(newChapters);
    await putChapters(newChapters);
    await reorderChapters(book.id, newChapters.map((c) => c.id));
    toast.success(`Re-split into ${newChapters.length} chapters.`);
  };

  const totalWords = chapters.reduce((s, c) => s + c.wordCount, 0);

  return (
    <StudioShell>
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-10 pt-6 sm:pt-10 pb-32">
        {/* ── Header ─────────────────────────────────────────────── */}
        <button
          className="text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-4"
          onClick={() => navigate(`/library/${book.id}`)}
        >
          ← Back to book
        </button>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="studio-caps text-muted-foreground">Editorial details</div>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl mt-1 tracking-tight">
              {title || "Untitled"}
            </h1>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="uppercase tracking-[0.15em] px-2 py-0.5 border border-border">
                {book.language === "zh" ? "中文" : book.language === "ja" ? "日本語" : book.language === "ko" ? "한국어" : book.language}
              </span>
              <span>{chapters.length} chapter{chapters.length !== 1 ? "s" : ""}</span>
              <span>{totalWords.toLocaleString()} words</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={translatingMeta}
              onClick={async () => {
                if (!book) return;
                setTranslatingMeta(true);
                try {
                  const mgr = new TranslationManager({
                    providers: settings.providers,
                    preferred: settings.activeProvider,
                    parallelRequests: 1,
                    pauseOnError: false,
                    quality: settings.quality,
                    source: book.language,
                    target: "en",
                  });
                  const items: { kind: string; text: string }[] = [];
                  if (title.trim()) items.push({ kind: "Book title", text: title.trim() });
                  if (author.trim()) items.push({ kind: "Author name", text: author.trim() });
                  if (description.trim()) items.push({ kind: "Book description", text: description.trim() });
                  const chapterItems = chapters.map((c) => ({ kind: "Chapter title", text: c.title }));
                  items.push(...chapterItems);
                  if (items.length === 0) { setTranslatingMeta(false); return; }
                  const result = await mgr.translateChapter({
                    paragraphs: items.map((i) => i.text),
                    contextHint: `Translate these book metadata entries from "${book.title}" to natural English. Preserve the item kind context: book title, author name, description, and chapter titles. Return ONLY the translated entries, one per line, in the same order.`,
                  });
                  let idx = 0;
                  if (title.trim() && result.rows[idx] && result.rows[idx].trim() !== title.trim()) setTitle(result.rows[idx].trim());
                  idx++;
                  if (author.trim() && result.rows[idx] && result.rows[idx].trim() !== author.trim()) setAuthor(result.rows[idx].trim());
                  idx++;
                  if (description.trim() && result.rows[idx] && result.rows[idx].trim() !== description.trim()) setDescription(result.rows[idx].trim());
                  idx++;
                  for (const ch of chapters) {
                    const translated = result.rows[idx];
                    if (translated && translated.trim() && translated.trim() !== ch.title) {
                      await renameChapter(ch.id, translated.trim());
                      setChapters((cs) => cs.map((c) => (c.id === ch.id ? { ...c, title: translated.trim() } : c)));
                    }
                    idx++;
                  }
                  toast.success("Metadata and chapter titles translated. Save to persist.");
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  toast.error(`Translation failed: ${msg.slice(0, 200)}`);
                } finally {
                  setTranslatingMeta(false);
                }
              }}
              className="h-9 sm:h-10 px-3 sm:px-4 inline-flex items-center gap-1.5 border border-border hover:border-foreground/40 transition-colors disabled:opacity-50 cursor-pointer text-xs uppercase tracking-[0.18em]"
            >
              {translatingMeta ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.4} />
              ) : (
                <Languages className="w-3.5 h-3.5" strokeWidth={1.4} />
              )}
              <span className="hidden sm:inline">{translatingMeta ? "Translating…" : "Translate all"}</span>
              <span className="sm:hidden">{translatingMeta ? "…" : "Translate"}</span>
            </button>
            {(title !== origTitleRef.current || author !== origAuthorRef.current || description !== origDescRef.current) && (
              <button
                type="button"
                onClick={() => {
                  setTitle(origTitleRef.current);
                  setAuthor(origAuthorRef.current);
                  setDescription(origDescRef.current);
                  toast.message("All metadata reverted to original.");
                }}
                className="h-9 sm:h-10 px-3 sm:px-4 inline-flex items-center gap-1.5 border border-border hover:border-foreground/40 transition-colors cursor-pointer text-xs uppercase tracking-[0.18em]"
              >
                <Undo2 className="w-3.5 h-3.5" strokeWidth={1.4} />
                <span className="hidden sm:inline">Revert all</span>
                <span className="sm:hidden">Revert</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Cover + Metadata ───────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 mt-8">
          {/* Cover card */}
          <section className="col-span-1 lg:col-span-4">
            <div className="studio-card p-4 sm:p-5">
              <div className="studio-caps text-muted-foreground mb-3">Cover image</div>
              <label className="block cursor-pointer group">
                <div className="gallery-frame aspect-[3/4] grid place-items-center bg-muted max-w-[240px] mx-auto transition-shadow group-hover:shadow-lg">
                  {cover ? (
                    <img src={cover} alt="Cover" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center px-4">
                      <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" strokeWidth={1.2} />
                      <span className="text-xs text-muted-foreground uppercase tracking-[0.15em]">
                        Click to upload
                      </span>
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => setCover(reader.result as string);
                    reader.readAsDataURL(f);
                  }}
                />
              </label>
              {cover && (
                <button
                  type="button"
                  onClick={() => setCover(null)}
                  className="mt-3 w-full text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-destructive transition-colors"
                >
                  Remove cover
                </button>
              )}
            </div>
          </section>

          {/* Metadata cards */}
          <section className="col-span-1 lg:col-span-8">
            <div className="space-y-4">
              {/* Title */}
              <div className="studio-card p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="studio-caps text-muted-foreground">Title</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={translatingTitle || !title.trim()}
                      onClick={() => translateField(title, "book title", setTitle, setTranslatingTitle)}
                      className="h-7 px-2 inline-flex items-center gap-1 border border-border hover:border-foreground/40 transition-colors disabled:opacity-30 cursor-pointer text-[10px] uppercase tracking-[0.15em]"
                    >
                      {translatingTitle ? (
                        <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.4} />
                      ) : (
                        <Sparkles className="w-3 h-3" strokeWidth={1.4} />
                      )}
                      <span>Translate</span>
                    </button>
                    {title !== origTitleRef.current && (
                      <button
                        type="button"
                        onClick={() => setTitle(origTitleRef.current)}
                        className="h-7 w-7 grid place-items-center border border-border hover:border-foreground/40 transition-colors cursor-pointer"
                        title="Revert"
                      >
                        <Undo2 className="w-3 h-3" strokeWidth={1.4} />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Book title"
                  className="w-full bg-muted/50 border border-border focus:border-foreground focus:bg-background outline-none px-3 py-2.5 sm:py-3 text-lg font-display rounded transition-colors"
                />
              </div>

              {/* Author */}
              <div className="studio-card p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="studio-caps text-muted-foreground">Author</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={translatingAuthor || !author.trim()}
                      onClick={() => translateField(author, "author name", setAuthor, setTranslatingAuthor)}
                      className="h-7 px-2 inline-flex items-center gap-1 border border-border hover:border-foreground/40 transition-colors disabled:opacity-30 cursor-pointer text-[10px] uppercase tracking-[0.15em]"
                    >
                      {translatingAuthor ? (
                        <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.4} />
                      ) : (
                        <Sparkles className="w-3 h-3" strokeWidth={1.4} />
                      )}
                      <span>Translate</span>
                    </button>
                    {author !== origAuthorRef.current && (
                      <button
                        type="button"
                        onClick={() => setAuthor(origAuthorRef.current)}
                        className="h-7 w-7 grid place-items-center border border-border hover:border-foreground/40 transition-colors cursor-pointer"
                        title="Revert"
                      >
                        <Undo2 className="w-3 h-3" strokeWidth={1.4} />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Author name"
                  className="w-full bg-muted/50 border border-border focus:border-foreground focus:bg-background outline-none px-3 py-2.5 sm:py-3 rounded transition-colors"
                />
              </div>

              {/* Description */}
              <div className="studio-card p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="studio-caps text-muted-foreground">Description</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={translatingDesc || !description.trim()}
                      onClick={() => translateField(description, "book description", setDescription, setTranslatingDesc)}
                      className="h-7 px-2 inline-flex items-center gap-1 border border-border hover:border-foreground/40 transition-colors disabled:opacity-30 cursor-pointer text-[10px] uppercase tracking-[0.15em]"
                    >
                      {translatingDesc ? (
                        <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.4} />
                      ) : (
                        <Sparkles className="w-3 h-3" strokeWidth={1.4} />
                      )}
                      <span>Translate</span>
                    </button>
                    {description !== origDescRef.current && (
                      <button
                        type="button"
                        onClick={() => setDescription(origDescRef.current)}
                        className="h-7 w-7 grid place-items-center border border-border hover:border-foreground/40 transition-colors cursor-pointer"
                        title="Revert"
                      >
                        <Undo2 className="w-3 h-3" strokeWidth={1.4} />
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full bg-muted/50 border border-border focus:border-foreground focus:bg-background outline-none p-3 text-sm leading-relaxed resize-none rounded transition-colors"
                  placeholder="A short note for readers."
                />
              </div>
            </div>
          </section>
        </div>

        {/* ── Chapters TOC ────────────────────────────────────────── */}
        <section className="mt-10 sm:mt-14">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 mb-4 sm:mb-6">
            <div>
              <div className="studio-caps text-muted-foreground">Table of contents</div>
              <h2 className="font-display text-xl sm:text-2xl mt-1 tracking-tight">
                Chapters
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="h-9 sm:h-10 px-3 sm:px-4 inline-flex items-center gap-1.5 sm:gap-2 border border-border hover:border-foreground/40 cursor-pointer text-xs sm:text-sm uppercase tracking-[0.18em] disabled:opacity-40"
                onClick={() => onReSplit()}
                disabled={chapters.length === 0}
              >
                <Scissors className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.4} />
                <span className="hidden sm:inline">Re-detect chapters</span>
                <span className="sm:hidden">Re-split</span>
              </button>
              <button
                className="h-9 sm:h-10 px-3 sm:px-4 inline-flex items-center gap-1.5 sm:gap-2 border border-border hover:border-foreground/40 cursor-pointer text-xs sm:text-sm uppercase tracking-[0.18em]"
                onClick={onAddBlank}
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.4} />
                <span className="hidden sm:inline">Add chapter</span>
                <span className="sm:hidden">Add</span>
              </button>
            </div>
          </div>

          {chapters.length === 0 ? (
            <div className="border border-border bg-card p-10 sm:p-14 text-center">
              <BookOpenCheck className="w-8 h-8 mx-auto text-muted-foreground" strokeWidth={1.2} />
              <p className="mt-3 text-muted-foreground text-sm">
                No chapters yet. Click &ldquo;Add chapter&rdquo; to create one.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {chapters.map((c, idx) => (
                <div key={c.id} className="studio-card overflow-hidden">
                  {/* Chapter row */}
                  <div className="flex items-center gap-2 sm:gap-4 p-2.5 sm:p-3">
                    {/* Number */}
                    <span className="studio-num text-muted-foreground text-lg sm:text-xl shrink-0 w-7 sm:w-8 text-center">
                      {String(idx + 1).padStart(2, "0")}
                    </span>

                    {/* Title input + word count */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <input
                        value={c.title}
                        onChange={(e) => onRename(c.id, e.target.value)}
                        className="flex-1 min-w-0 bg-muted/40 border border-border focus:border-foreground focus:bg-background outline-none px-2.5 py-2 sm:py-2 font-display text-sm rounded transition-colors"
                      />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden sm:inline">
                        {c.wordCount.toLocaleString()}w
                      </span>
                    </div>

                    {/* Action toolbar */}
                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                      <button
                        className={cn(
                          "h-8 w-8 sm:w-7 sm:h-7 grid place-items-center border transition-colors cursor-pointer active:scale-[0.95]",
                          splittingChapterId === c.id
                            ? "border-foreground bg-foreground/10"
                            : "border-border hover:border-foreground/40",
                        )}
                        onClick={() => onToggleSplit(c.id)}
                        title="Split chapter"
                      >
                        <Scissors className="w-3 h-3" strokeWidth={1.4} />
                      </button>
                      {idx < chapters.length - 1 && (
                        <button
                          className="hidden sm:grid h-8 w-8 sm:w-7 sm:h-7 place-items-center border border-border hover:border-foreground/40 active:scale-[0.95] transition-all cursor-pointer"
                          onClick={() => onMergeNext(idx)}
                          title="Merge with next"
                        >
                          <Merge className="w-3 h-3" strokeWidth={1.4} />
                        </button>
                      )}
                      <button
                        className="h-8 w-8 sm:w-7 sm:h-7 grid place-items-center border border-border hover:border-foreground/40 active:scale-[0.95] transition-all cursor-pointer"
                        onClick={() => onMove(idx, -1)}
                        disabled={idx === 0}
                        title="Move up"
                      >
                        <ArrowUp className="w-3 h-3" strokeWidth={1.4} />
                      </button>
                      <button
                        className="h-8 w-8 sm:w-7 sm:h-7 grid place-items-center border border-border hover:border-foreground/40 active:scale-[0.95] transition-all cursor-pointer"
                        onClick={() => onMove(idx, 1)}
                        disabled={idx === chapters.length - 1}
                        title="Move down"
                      >
                        <ArrowDown className="w-3 h-3" strokeWidth={1.4} />
                      </button>
                      <button
                        className="h-8 w-8 sm:w-7 sm:h-7 grid place-items-center border border-border hover:border-destructive hover:text-destructive active:scale-[0.95] transition-all cursor-pointer ml-0.5 sm:ml-1"
                        onClick={() => onDelete(c.id)}
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" strokeWidth={1.4} />
                      </button>
                    </div>
                  </div>

                  {/* Expandable split UI */}
                  {splittingChapterId === c.id && activeSplitChapter && (
                    <div className="border-t border-border bg-accent/30 px-3 sm:px-4 py-3">
                      <div className="text-xs text-muted-foreground mb-2">
                        Click between paragraphs to mark split points.
                      </div>
                      <div className="max-h-56 sm:max-h-64 overflow-y-auto space-y-0.5 text-sm leading-relaxed thin-scrollbar">
                        {activeSplitChapter.paragraphs.map((p, pi) => (
                          <div key={pi}>
                            {pi > 0 && (
                              <button
                                type="button"
                                onClick={() => onToggleSplitPoint(pi)}
                                className={cn(
                                  "w-full h-6 flex items-center justify-center gap-2 border border-dashed transition-colors cursor-pointer group",
                                  splitPoints.has(pi)
                                    ? "border-orange-400 bg-orange-50 dark:bg-orange-900/20"
                                    : "border-border hover:border-foreground/30",
                                )}
                              >
                                <span
                                  className={cn(
                                    "text-[10px] uppercase tracking-wider",
                                    splitPoints.has(pi)
                                      ? "text-orange-600 font-semibold"
                                      : "text-muted-foreground group-hover:text-muted-foreground",
                                  )}
                                >
                                  {splitPoints.has(pi) ? "— Split here —" : "+ split"}
                                </span>
                              </button>
                            )}
                            <p
                              className={cn(
                                "px-2 py-1 rounded transition-colors",
                                splitPoints.has(pi) ? "bg-orange-50 dark:bg-orange-900/10" : "",
                              )}
                            >
                              <span className="text-muted-foreground text-[10px] mr-1.5 font-mono">
                                [{pi + 1}]
                              </span>
                              {p.length > 120 ? `${p.slice(0, 120)}…` : p}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={splitPoints.size === 0}
                          onClick={() => onApplySplit(c)}
                          className="h-8 px-3 inline-flex items-center gap-1.5 bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-30 cursor-pointer text-[11px] uppercase tracking-[0.15em]"
                        >
                          <Scissors className="w-3 h-3" strokeWidth={1.4} />
                          Apply split
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSplittingChapterId(null); setSplitPoints(new Set()); }}
                          className="h-8 px-3 border border-border hover:border-foreground/40 text-xs uppercase tracking-[0.15em] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Sticky save bar ─────────────────────────────────────── */}
        {hasChanges && (
          <div className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-sm border-t border-border pb-[env(safe-area-inset-bottom,0)]">
            <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-10 py-3 flex items-center justify-between sm:justify-end gap-3">
              <span className="text-xs text-muted-foreground sm:hidden">Unsaved changes</span>
              <div className="flex items-center gap-2">
                <button
                  className="h-9 sm:h-10 px-3 sm:px-4 inline-flex items-center gap-1.5 sm:gap-2 border border-border hover:border-foreground/40 transition-colors text-xs uppercase tracking-[0.18em]"
                  onClick={() => navigate(`/library/${book.id}`)}
                >
                  <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.4} />
                  <span className="hidden sm:inline">Cancel</span>
                </button>
                <button
                  className="h-9 sm:h-10 px-4 sm:px-5 inline-flex items-center gap-1.5 sm:gap-2 bg-foreground text-background hover:bg-foreground/90 transition-colors text-xs uppercase tracking-[0.18em]"
                  onClick={onSaveMeta}
                >
                  <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.4} />
                  Save changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </StudioShell>
  );
}
