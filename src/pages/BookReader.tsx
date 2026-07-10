// BookReader page — the reading desk.
// Left column lists chapters; right column shows the current chapter with
// paragraphs in original / translated pair. Translation controls translate
// the active chapter or batch-translate the rest.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Download,
  Focus as FocusIcon,
  Languages,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Undo2,
  BookOpen,
} from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { StudioShell } from "@/components/StudioShell";
import { useLibrary, notifyLibraryChanged, saveTranslation } from "@/hooks/use-library";
import { listChapters, getChapter, getTranslation } from "@/lib/db";
import type { Book, Chapter, ChapterTranslation } from "@/lib/types";
import { useSettings } from "@/hooks/use-settings";
import { TranslationManager } from "@/lib/translators/types";
import { ApiStatusPill } from "@/components/studio/ApiStatusPill";
import { buildTranslatedEpub } from "@/lib/epub";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/util";
import {
  prefsToCssVars,
  ReaderSettingsMenu,
} from "@/components/studio/ReaderSettingsMenu";

export default function BookReader() {
  const { bookId, chapterId } = useParams();
  const { books } = useLibrary();
  const navigate = useNavigate();

  const book = books.find((b) => b.id === bookId);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [translations, setTranslations] = useState<Record<string, ChapterTranslation>>({});
  const [activeId, setActiveId] = useState<string | null>(chapterId ?? null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; provider: any } | null>(null);
  const managerRef = useRef<TranslationManager | null>(null);
  const stopRef = useRef(false);
  // Track whether the component is still mounted so long-running translates
  // (especially batch mode) don't setState after the user navigates away.
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  const { settings, prefsFor, updateBookPrefs } = useSettings();
  // Reader preferences (per-book, falling back to global defaults). Used to
  // drive typography, layout mode, and toggles for the TOC/original column.
  const prefs = prefsFor(book?.id);
  // Focus mode is intentionally session-only — it does NOT persist. Reset to
  // `false` on every fresh mount of the reader.
  const [focusMode, setFocusMode] = useState(false);

  // Escape exits focus mode (session-only). Esc inside <input>/<textarea>
  // fields should still bubble normally, so bail if the focused element is
  // editable.
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || el?.isContentEditable) {
        return;
      }
      setFocusMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);

  // Load all chapters + translations when the book opens
  useEffect(() => {
    if (!book) return;
    let cancelled = false;
    void (async () => {
      const list = await listChapters(book.id);
      const inOrder = book.chapterOrder
        .map((id) => list.find((c) => c.id === id))
        .filter((x): x is Chapter => !!x);
      // Load translations for all chapters
      const trs: Record<string, ChapterTranslation> = {};
      await Promise.all(
        list.map(async (c) => {
          const tr = await getTranslation(book.id, c.id);
          if (tr) trs[c.id] = tr;
        }),
      );
      if (cancelled) return;
      setChapters(inOrder);
      setTranslations(trs);
      if (!activeId && inOrder.length) {
        setActiveId(inOrder[0].id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [book?.id, book?.updatedAt]);

  // Update URL when active chapter changes
  useEffect(() => {
    if (!book || !activeId) return;
    const wanted = `/library/${book.id}/${activeId}`;
    if (window.location.pathname !== wanted) {
      navigate(wanted, { replace: true });
    }
  }, [activeId, book?.id]);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeId) ?? null,
    [chapters, activeId],
  );
  const activeTranslation = activeId ? translations[activeId] : undefined;

  const totalWordCount = useMemo(
    () => chapters.reduce((s, c) => s + c.wordCount, 0),
    [chapters],
  );
  const translatedWordCount = useMemo(() => {
    let sum = 0;
    for (const ch of chapters) {
      const tr = translations[ch.id];
      if (!tr || tr.paragraphs.length !== ch.paragraphs.length) continue;
      for (let i = 0; i < tr.paragraphs.length; i++) {
        const translated = tr.paragraphs[i];
        if (translated && translated.trim()) sum += countWords(translated);
      }
    }
    return sum;
  }, [chapters, translations]);

  const makeManager = useCallback(() => {
    return new TranslationManager({
      providers: settings.providers,
      preferred: settings.activeProvider,
      parallelRequests: settings.parallelRequests,
      pauseOnError: settings.pauseOnError,
      quality: settings.quality,
      source: book?.language ?? settings.sourceLanguage,
      target: "en",
    });
  }, [settings, book?.language]);

  const onTranslateActive = async () => {
    if (!book || !activeChapter) return;
    if (busy) return;
    setBusy(true);
    setProgress({ done: 0, total: activeChapter.paragraphs.length, provider: null });
    stopRef.current = false;
    const mgr = makeManager();
    managerRef.current = mgr;
    try {
      const result = await mgr.translateChapter({
        paragraphs: activeChapter.paragraphs,
        contextHint: `Chapter: ${activeChapter.title}. From ${book.title}.`,
        onProgress: (p) => setProgress({ done: p.done, total: p.total, provider: p.provider }),
      });
      const tr: ChapterTranslation = {
        id: `${book.id}:${activeChapter.id}`,
        bookId: book.id,
        chapterId: activeChapter.id,
        paragraphs: result.rows.map((r, i) =>
          r && r.trim() && r.trim() !== activeChapter.paragraphs[i].trim() ? r : null,
        ),
        status: result.failed ? "error" : "completed",
        startedAt: Date.now(),
        completedAt: Date.now(),
        provider: result.provider,
        progress: result.failed
          ? Math.min(1, (activeChapter.paragraphs.filter((p) => p).length))
          : 1,
        error: result.failed ? "One or more providers failed. Verify API keys in Settings." : undefined,
      };
      await saveTranslation(tr);
      setTranslations((m) => ({ ...m, [activeChapter.id]: tr }));
      notifyLibraryChanged();
      if (!result.failed) {
        // Chapter is fully translated — collapse the side-by-side layout to
        // a single English column. The Reader menu's "Original column"
        // switch brings the source back instantly.
        updateBookPrefs(book.id, { showOriginal: false });
        toast.success("Chapter translated.");
      } else {
        toast.warning(
          "Some paragraphs could not be translated — check provider status.",
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Translation failed: ${msg.slice(0, 200)}`);
    } finally {
      if (mountedRef.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };

  const batchProgress = useRef({ done: 0, total: 0 });

  const onBatchTranslate = async () => {
    if (!book) return;
    if (busy) return;
    const remaining = chapters.filter((c) => {
      const tr = translations[c.id];
      if (!tr) return true;
      const hasMissing = tr.paragraphs.some((p) => !p || !p.trim());
      return hasMissing || tr.status === "idle" || tr.status === "error";
    });
    if (remaining.length === 0) {
      toast("Every chapter already has a translation.", { icon: "ℹ️" });
      return;
    }
    setBusy(true);
    stopRef.current = false;
    batchProgress.current = { done: 0, total: remaining.length };
    const mgr = makeManager();
    managerRef.current = mgr;
    try {
      for (const c of remaining) {
        // Bail if the user paused OR the component has unmounted (we don't
        // want to keep burning LLM credits or setState on a dead component).
        if (stopRef.current || !mountedRef.current) break;
        setActiveId(c.id);
        const loadingTr: ChapterTranslation = {
          id: `${book.id}:${c.id}`,
          bookId: book.id,
          chapterId: c.id,
          paragraphs: Array(c.paragraphs.length).fill(null),
          status: "in_progress",
          provider: null,
          progress: 0,
        };
        setTranslations((m) => ({ ...m, [c.id]: loadingTr }));
        try {
          await saveTranslation(loadingTr);
        } catch (err) {
          // In-memory state is already set; if persistence failed we still
          // proceed. Log so the issue is at least visible.
          console.error("Failed to persist in-progress marker", err);
        }
        try {
          const result = await mgr.translateChapter({
            paragraphs: c.paragraphs,
            contextHint: `Chapter: ${c.title}. From ${book.title}.`,
            onProgress: (p) => {
              if (!mountedRef.current) return;
              setProgress({ done: p.done, total: p.total, provider: p.provider });
              setTranslations((m) => ({
                ...m,
                [c.id]: {
                  ...(m[c.id] ?? loadingTr),
                  progress: p.total ? p.done / p.total : 0,
                  provider: p.provider,
                  status: "in_progress",
                },
              }));
            },
          });
          if (!mountedRef.current) break;
          const finalTr: ChapterTranslation = {
            id: `${book.id}:${c.id}`,
            bookId: book.id,
            chapterId: c.id,
            paragraphs: result.rows.map((r, i) =>
              r && r.trim() && r.trim() !== c.paragraphs[i].trim() ? r : null,
            ),
            status: result.failed ? "error" : "completed",
            completedAt: Date.now(),
            provider: result.provider,
            progress: result.failed ? 0.6 : 1,
            error: result.failed ? "Provider failures during batch translation." : undefined,
          };
          await saveTranslation(finalTr);
          if (!mountedRef.current) break;
          setTranslations((m) => ({ ...m, [c.id]: finalTr }));
          batchProgress.current.done += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!mountedRef.current) break;
          // Persist the failure so the chapter index doesn't lie about state.
          const failedTr: ChapterTranslation = {
            id: `${book.id}:${c.id}`,
            bookId: book.id,
            chapterId: c.id,
            paragraphs: Array(c.paragraphs.length).fill(null),
            status: "error",
            provider: null,
            progress: 0,
            error: msg.slice(0, 200),
          };
          try { await saveTranslation(failedTr); } catch { /* swallow */ }
          if (!mountedRef.current) break;
          setTranslations((m) => ({ ...m, [c.id]: failedTr }));
          toast.error(`Failed translating "${c.title}": ${msg.slice(0, 200)}`);
          if (settings.pauseOnError) break;
        }
      }
      notifyLibraryChanged();
      if (mountedRef.current) toast.success("Batch translation complete.");
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Batch interrupted: ${msg.slice(0, 200)}`);
      }
    } finally {
      if (mountedRef.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };

  const onPauseToggle = () => {
    const mgr = managerRef.current;
    if (!mgr) return;
    if (mgr.isPaused()) {
      mgr.resume();
      stopRef.current = false;
      toast("Resumed.", { icon: "▶" });
    } else {
      mgr.pause();
      stopRef.current = true;
      toast("Translation paused.", { icon: "⏸" });
    }
  };

  const onExport = async () => {
    if (!book) return;
    if (chapters.length === 0) return;
    const allTranslated = chapters.every((c) => {
      const tr = translations[c.id];
      return tr && tr.paragraphs.length === c.paragraphs.length && tr.paragraphs.every((x) => x && x.trim());
    });
    if (!allTranslated) {
      const ok = confirm(
        "Not every chapter has a complete translation. Export anyway? Untranslated paragraphs will keep their original text.",
      );
      if (!ok) return;
    }
    const map = new Map<string, (string | null)[]>();
    for (const c of chapters) {
      const tr = translations[c.id];
      map.set(c.id, tr ? tr.paragraphs : []);
    }
    try {
      const blob = await buildTranslatedEpub({ book, chapters, translations: map });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${book.title} (English).epub`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Exported translated EPUB.");
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  if (!book) {
    return (
      <StudioShell>
        <div className="mx-auto max-w-[900px] px-6 lg:px-10 pt-24 text-center">
          <div className="font-display text-2xl">That volume is not in the library.</div>
          <button
            className="mt-6 h-11 px-5 inline-flex items-center gap-2 border border-border"
            onClick={() => navigate("/library")}
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.4} />
            Back to library
          </button>
        </div>
      </StudioShell>
    );
  }

  // Compose reader CSS custom properties on the wrapper so the prose inside
  // can pick up typography, leading, and gap without inline styles.
  const readerVarStyle = prefsToCssVars(prefs);

  return (
    <StudioShell>
      <div
        className="mx-auto max-w-[1400px] px-6 lg:px-10 pt-10 pb-20 reader-root"
        style={readerVarStyle}
      >
        {/* ── Title bar (hidden in focus mode) ─────────────────────── */}
        <header
          className={cn(
            "flex flex-col lg:flex-row lg:items-end justify-between gap-6",
            focusMode && "focus-mode-hidden",
          )}
        >
          <div>
            <button
              className="text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
              onClick={() => navigate("/library")}
            >
              ← Back to library
            </button>
            <div className="mt-3 studio-caps text-muted-foreground">The Deskside</div>
            <h1 className="font-display text-5xl mt-2 tracking-tight leading-tight">{book.title}</h1>
            <p className="text-muted-foreground mt-1">{book.author}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ApiLender settings={settings} />
            <button
              type="button"
              disabled={busy}
              onClick={onPauseToggle}
              className="h-10 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40 disabled:opacity-50"
            >
              {managerRef.current?.isPaused() ? (
                <Play className="w-4 h-4" strokeWidth={1.4} />
              ) : (
                <Pause className="w-4 h-4" strokeWidth={1.4} />
              )}
              <span className="text-xs uppercase tracking-[0.18em]">
                {managerRef.current?.isPaused() ? "Resume" : "Pause"}
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onBatchTranslate}
              className="h-10 px-4 inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.4} />
              ) : (
                <Sparkles className="w-4 h-4" strokeWidth={1.4} />
              )}
              <span className="text-xs uppercase tracking-[0.18em]">
                {busy ? "Translating…" : "Translate all"}
              </span>
            </button>
            <button
              type="button"
              onClick={onExport}
              className="h-10 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40"
            >
              <Download className="w-4 h-4" strokeWidth={1.4} />
              <span className="text-xs uppercase tracking-[0.18em]">Export EPUB</span>
            </button>
          </div>
        </header>

        {/* Progress strip (hidden in focus mode) */}
        <div
          className={cn(
            "mt-8 border border-border bg-card p-4 grid grid-cols-12 gap-4",
            focusMode && "focus-mode-hidden",
          )}
        >
          <ProgressCell label="Chapter" value={`${chapters.findIndex((c) => c.id === activeId) + 1} / ${chapters.length}`} />
          <ProgressCell label="Words translated" value={`${translatedWordCount.toLocaleString()} / ${totalWordCount.toLocaleString()}`} />
          <ProgressCell
            label="Active provider"
            value={progress?.provider ?? activeTranslation?.provider ?? settings.activeProvider}
          />
          <ProgressCell
            label="Status"
            value={busy ? "Translating" : managerRef.current?.isPaused() ? "Paused" : "Ready"}
          />
        </div>

        {/* Translate-in-progress bar */}
        {progress && (
          <div className="mt-4">
            <div className="studio-caps text-muted-foreground">
              Translating — {progress.done} / {progress.total} paragraphs
            </div>
            <div className="mt-2 h-1 w-full bg-border overflow-hidden">
              <div
                className="h-full bg-foreground transition-all"
                style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Main split: TOC + reader (TOC hidden when pref off or in focus) */}
        <div className="mt-10 grid grid-cols-12 gap-8">
          {/* TOC */}
          {!focusMode && prefs.showToc && (
            <aside className="col-span-12 lg:col-span-3 lg:sticky lg:top-24 lg:self-start">
              <div className="studio-caps text-muted-foreground">Table of contents</div>
              <ol className="mt-4 border border-border bg-card divide-y divide-border max-h-[calc(100vh-7rem)] overflow-y-auto thin-scrollbar">
                {chapters.map((c, idx) => {
                  const tr = translations[c.id];
                  const isDone = tr?.status === "completed" && tr.paragraphs.every((p) => p && p.trim());
                  const isActive = c.id === activeId;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setActiveId(c.id)}
                        className={cn(
                          "w-full text-left px-4 py-3 grid grid-cols-12 gap-3 items-center hover:bg-muted transition-colors",
                          isActive && "bg-foreground text-background hover:bg-foreground",
                        )}
                      >
                        <span className="col-span-1 studio-num text-xs opacity-70">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className="col-span-9 text-sm font-display line-clamp-2">
                          {c.title}
                        </span>
                        <span className="col-span-2 flex justify-end">
                          {isDone ? (
                            <Check className="w-4 h-4" strokeWidth={1.5} />
                          ) : tr ? (
                            <span
                              className={cn(
                                "studio-num text-[10px]",
                                isActive ? "opacity-80" : "text-muted-foreground",
                              )}
                            >
                              {Math.round((tr.progress ?? 0) * 100)}%
                            </span>
                          ) : (
                            <span className="studio-num text-[10px] opacity-50">·</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </aside>
          )}

          {/* Reader — full width when TOC is hidden / focus mode */}
          <section
            className={cn(
              "col-span-12",
              !focusMode && prefs.showToc && "lg:col-span-9",
            )}
          >
            {activeChapter ? (
              <ChapterReader
                chapter={activeChapter}
                translation={activeTranslation ?? null}
                prefs={prefs}
                bookId={book.id}
                hideFocusChrome={focusMode}
                onEnterFocus={() => setFocusMode(true)}
                onTranslate={onTranslateActive}
                onTranslateParagraph={async (paragraphIdx) => {
                  if (!book || !activeChapter) return;
                  const tr = activeTranslation ?? makeEmptyTranslation(book.id, activeChapter.id, activeChapter.paragraphs.length);
                  if (tr.paragraphs[paragraphIdx] && tr.paragraphs[paragraphIdx]?.trim()) return;
                  const mgr = makeManager();
                  const res = await mgr.translateChapter({
                    paragraphs: [activeChapter.paragraphs[paragraphIdx]],
                    contextHint: `Single paragraph from "${activeChapter.title}".`,
                  });
                  const txt = res.rows[0];
                  const updated = { ...tr, paragraphs: [...tr.paragraphs], provider: res.provider };
                  updated.paragraphs[paragraphIdx] = txt && txt.trim() ? txt : activeChapter.paragraphs[paragraphIdx];
                  updated.status = res.failed ? "error" : "in_progress";
                  // Guard against 0/0 → NaN when a chapter has zero paragraphs
                  // (rare, but possible on bad publisher EPUBs).
                  updated.progress = updated.paragraphs.length
                    ? updated.paragraphs.filter((p) => p && p.trim()).length /
                      updated.paragraphs.length
                    : 1;
                  await saveTranslation(updated);
                  setTranslations((m) => ({ ...m, [activeChapter.id]: updated }));
                  notifyLibraryChanged();
                }}
                onResetParagraph={(idx) => {
                  if (!book || !activeChapter || !activeTranslation) return;
                  const updated = {
                    ...activeTranslation,
                    paragraphs: activeTranslation.paragraphs.map((p, i) => (i === idx ? null : p)),
                  };
                  void saveTranslation(updated);
                  setTranslations((m) => ({ ...m, [activeChapter.id]: updated }));
                }}
                busy={busy}
              />
            ) : (
              <div className="border border-border bg-card p-12 text-center">
                <BookOpen className="w-10 h-10 mx-auto text-muted-foreground" strokeWidth={1.2} />
                <div className="mt-4 font-display text-2xl">Pick a chapter</div>
                <p className="text-muted-foreground mt-2 max-w-[40ch] mx-auto">
                  The reading desk opens whatever you choose from the table of
                  contents on the left.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Floating exit-focus pill — only visible in focus mode. Fades out
            after 1.6s of pointer stillness. */}
        <AnimatePresence>
          {focusMode && (
            <FocusExitPill onExit={() => setFocusMode(false)} />
          )}
        </AnimatePresence>
      </div>
    </StudioShell>
  );
}

function FocusExitPill({ onExit }: { onExit: () => void }) {
  const [visible, setVisible] = useState(true);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onMove = () => {
      setVisible(true);
      if (idleRef.current) clearTimeout(idleRef.current);
      idleRef.current = setTimeout(() => setVisible(false), 1600);
    };
    window.addEventListener("mousemove", onMove);
    onMove(); // show on mount for ~1.6s
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (idleRef.current) clearTimeout(idleRef.current);
    };
  }, []);

  return (
    <motion.button
      type="button"
      onClick={onExit}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: visible ? 1 : 0, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      aria-label="Exit focus mode"
      className="fixed top-4 right-4 z-40 h-9 px-3 inline-flex items-center gap-2 bg-background/90 border border-border text-foreground/80 hover:text-foreground text-[10px] uppercase tracking-[0.2em] backdrop-blur-sm"
    >
      <FocusIcon className="w-3.5 h-3.5" strokeWidth={1.4} />
      Exit focus · esc
    </motion.button>
  );
}

function ProgressCell({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="col-span-6 lg:col-span-3">
      <div className="studio-caps text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-lg truncate">{value || "—"}</div>
    </div>
  );
}

function ApiLender({ settings }: { settings: ReturnType<typeof useSettings>["settings"] }) {
  return (
    <div className="flex items-center gap-2 h-10">
      <ApiStatusPill
        provider={settings.activeProvider}
        ok={null}
        rateLimited={false}
      />
    </div>
  );
}

function makeEmptyTranslation(
  bookId: string,
  chapterId: string,
  count: number,
): ChapterTranslation {
  return {
    id: `${bookId}:${chapterId}`,
    bookId,
    chapterId,
    paragraphs: Array(count).fill(null),
    status: "idle",
    provider: null,
    progress: 0,
  };
}

function countWords(s: string): number {
  if (!s) return 0;
  return s.replace(/\s+/g, " ").trim().split(/\s+/).length;
}

// ── ChapterReader (sub) ──────────────────────────────────────────────────

function ChapterReader({
  chapter,
  translation,
  prefs,
  bookId,
  hideFocusChrome,
  onEnterFocus,
  onTranslate,
  onTranslateParagraph,
  onResetParagraph,
  busy,
}: {
  chapter: Chapter;
  translation: ChapterTranslation | null;
  prefs: ReturnType<typeof useSettings>["prefsFor"] extends (id?: any) => infer R
    ? R
    : never;
  bookId: string;
  hideFocusChrome?: boolean;
  onEnterFocus?: () => void;
  onTranslate: () => void | Promise<void>;
  onTranslateParagraph: (idx: number) => void | Promise<void>;
  onResetParagraph: (idx: number) => void;
  busy: boolean;
}) {
  // showOriginal/layout are now driven by per-book ReaderPrefs instead of
  // local component state — so changes persist across sessions and stay in
  // sync across tabs when paired with the useSettings() snapshot.
  const showOriginal = prefs.showOriginal;
  const layout = prefs.layout;
  const paragraphs = chapter.paragraphs;
  const translated = translation?.paragraphs ?? Array(paragraphs.length).fill(null);

  // Stack layout: original on top, English directly below in a single
  // column. The inner divider heading remains so the user can still tell
  // where the translation begins.
  const cols = !showOriginal ? 1 : layout === "stack" ? 1 : 2;

  return (
    <article className="border border-border bg-card p-6 lg:p-10">
      <header className="flex items-start justify-between gap-6">
        <div>
          <div className="studio-caps text-muted-foreground">Chapter</div>
          <h2 className="font-display text-3xl mt-1 tracking-tight">{chapter.title}</h2>
          <div className="text-muted-foreground mt-1 text-sm">
            {chapter.wordCount.toLocaleString()} words ·{" "}
            {translation ? `${Math.round((translation.progress ?? 0) * 100)}% translated` : "untranslated"}
            {translation?.completedAt ? (
              <span className="ml-2 text-muted-foreground/70">
                · last updated {formatRelativeTime(translation.completedAt)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Show the Reader menu and Focus entry point right where the
              reading layout actually lives. They're hidden if the user is
              already in focus mode (the floating exit pill handles that). */}
          <ReaderSettingsMenu bookId={bookId} />
          {onEnterFocus && (
            <button
              type="button"
              onClick={onEnterFocus}
              aria-label="Enter focus mode"
              className="h-10 px-3 inline-flex items-center gap-2 border border-border hover:border-foreground/40 transition-colors"
            >
              <FocusIcon className="w-4 h-4" strokeWidth={1.4} />
              <span className="text-xs uppercase tracking-[0.18em]">Focus</span>
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onTranslate}
            className="h-10 px-4 inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.4} />
            ) : (
              <Sparkles className="w-4 h-4" strokeWidth={1.4} />
            )}
            <span className="text-xs uppercase tracking-[0.18em]">
              {translation?.status === "completed" ? "Re-translate" : "Translate chapter"}
            </span>
          </button>
        </div>
      </header>

      {/* Column headings — once per chapter, not per paragraph. */}
      <div
        className={cn(
          "mt-10 mb-6 grid gap-4 lg:gap-6 border-b border-border pb-3",
          cols === 1 ? "grid-cols-1" : "lg:grid-cols-2",
        )}
      >
        {showOriginal && layout === "split" && (
          <div className="studio-caps text-muted-foreground">Original</div>
        )}
        {showOriginal && layout === "stack" && (
          <>
            <div className="studio-caps text-muted-foreground">Original</div>
            <div className="studio-caps text-muted-foreground">English</div>
          </>
        )}
        {!showOriginal && (
          <div className="studio-caps text-muted-foreground">English</div>
        )}
      </div>

      {/* Paragraphs flow as continuous prose — breathing space instead of divider plates. */}
      <div className={cn("reader-gap", layout === "stack" && showOriginal ? "space-y-0" : "space-y-0")}>
        {paragraphs.map((p, idx) => {
          const t = translated[idx];
          if (showOriginal && layout === "stack") {
            // Stacked layout: original line, then English line below it,
            // with a subtle border-bottom to mark the end of the paragraph.
            return (
              <motion.div
                key={idx}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: Math.min(idx, 6) * 0.02 }}
                className="border-b border-border pb-[var(--reader-paragraph-gap)]"
              >
                <p className="reader-prose-text text-foreground/80 border-l border-border pl-4">
                  {p}
                </p>
                <div className="group relative mt-3 border-l border-border pl-4 bg-muted/30">
                  <div className="absolute -top-2 right-0 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {t && t.trim() ? (
                      <>
                        <button
                          onClick={() => onTranslateParagraph(idx)}
                          className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
                          title="Re-translate this paragraph"
                        >
                          Re-translate
                        </button>
                        <button
                          onClick={() => onResetParagraph(idx)}
                          className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
                          title="Reset to source"
                        >
                          <Undo2 className="w-3 h-3 inline" /> Reset
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onTranslateParagraph(idx)}
                        className="text-[10px] uppercase tracking-[0.2em] text-foreground hover:text-foreground/70"
                        title="Translate this paragraph"
                      >
                        Translate →
                      </button>
                    )}
                  </div>
                  <p className="reader-prose-text text-foreground/85">
                    {t && t.trim() ? t : (
                      <span className="text-muted-foreground/70 italic">Not yet translated.</span>
                    )}
                  </p>
                </div>
              </motion.div>
            );
          }
          // Default: side-by-side split (or translation-only when !showOriginal).
          return (
            <motion.div
              key={idx}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(idx, 6) * 0.02 }}
              className={cn(
                "grid gap-5 lg:gap-8 items-start",
                showOriginal ? "lg:grid-cols-2" : "lg:grid-cols-1",
                "border-b border-border pb-[var(--reader-paragraph-gap)]",
              )}
            >
              {showOriginal && (
                <p className="reader-prose-text text-foreground/80 border-l border-border pl-4">
                  {p}
                </p>
              )}
              <div className="group relative border-l border-border pl-4 bg-muted/30">
                <div className="absolute -top-2 right-0 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  {t && t.trim() ? (
                    <>
                      <button
                        onClick={() => onTranslateParagraph(idx)}
                        className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
                        title="Re-translate this paragraph"
                      >
                        Re-translate
                      </button>
                      <button
                        onClick={() => onResetParagraph(idx)}
                        className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
                        title="Reset to source"
                      >
                        <Undo2 className="w-3 h-3 inline" /> Reset
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => onTranslateParagraph(idx)}
                      className="text-[10px] uppercase tracking-[0.2em] text-foreground hover:text-foreground/70"
                      title="Translate this paragraph"
                    >
                      Translate →
                    </button>
                  )}
                </div>
                <p className="reader-prose-text text-foreground/85">
                  {t && t.trim() ? t : (
                    <span className="text-muted-foreground/70 italic">Not yet translated.</span>
                  )}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </article>
  );
}
