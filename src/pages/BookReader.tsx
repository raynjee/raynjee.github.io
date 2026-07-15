// BookReader page — the reading desk.
// Left column lists chapters; right column shows the current chapter with
// paragraphs in original / translated pair. Translation controls translate
// the active chapter or batch-translate the rest.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Download,
  Languages,
  List,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pencil,
  Play,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { StudioShell } from "@/components/StudioShell";
import { useLibrary, notifyLibraryChanged, saveTranslation } from "@/hooks/use-library";
import { listChapters, getChapter, getTranslation, listGlossaryEntries } from "@/lib/db";
import type { Book, Chapter, ChapterTranslation, GlossaryEntry } from "@/lib/types";
import { useSettings } from "@/hooks/use-settings";
import { TranslationManager } from "@/lib/translators/types";
import { ApiStatusPill } from "@/components/studio/ApiStatusPill";
import { buildTranslatedEpub } from "@/lib/epub";
import { SCENE_BREAK } from "@/lib/text-import";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRelativeTime, saveBookmark } from "@/lib/util";
import {
  prefsToCssVars,
  ReaderSettingsControls,
  ReaderSettingsMenu,
} from "@/components/studio/ReaderSettingsMenu";
import { ReadAloud, type ReadAloudController } from "@/components/studio/ReadAloud";
import { Kbd } from "@/components/ui/kbd";

export default function BookReader() {
  const { bookId, chapterId } = useParams();
  const { books } = useLibrary();
  const navigate = useNavigate();

  const book = books.find((b) => b.id === bookId);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [translations, setTranslations] = useState<Record<string, ChapterTranslation>>({});
  const [glossaryEntries, setGlossaryEntries] = useState<GlossaryEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(chapterId ?? null);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stoppedBanner, setStoppedBanner] = useState(false);
  const stoppedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; provider: any } | null>(null);
  const managerRef = useRef<TranslationManager | null>(null);
  const stopRef = useRef(false);
  // Auto-advance: when on, completing a chapter automatically starts
  // translating the next untranslated chapter. Persisted to localStorage.
  const [autoAdvance, setAutoAdvance] = useState(() => {
    try { return localStorage.getItem("atelier.reader.autoAdvance") === "true"; } catch { return false; }
  });
  const autoAdvanceRef = useRef(autoAdvance);
  autoAdvanceRef.current = autoAdvance;
  const onToggleAutoAdvance = useCallback(() => {
    setAutoAdvance((v) => {
      const next = !v;
      try { localStorage.setItem("atelier.reader.autoAdvance", String(next)); } catch {}
      if (next) toast("Auto-advance on — next chapter will start automatically.");
      return next;
    });
  }, []);

  // ── Edit translation mode ────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const onSaveEdits = useCallback(async (chapterId: string, editedParagraphs: (string | null)[]) => {
    if (!book) return;
    const tr = translations[chapterId];
    if (!tr) return;
    const updated: ChapterTranslation = {
      ...tr,
      paragraphs: editedParagraphs,
      status: "completed",
      completedAt: Date.now(),
    };
    await saveTranslation(updated);
    setTranslations((m) => ({ ...m, [chapterId]: updated }));
    setEditMode(false);
    notifyLibraryChanged();
    toast.success("Translation saved.");
  }, [book, translations]);
  // Track whether the component is still mounted so long-running translates
  // (especially batch mode) don't setState after the user navigates away.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    // Reconnect to a running translation that survived page navigation.
    const win = window as unknown as { __translationManager?: TranslationManager | null };
    const existing = win.__translationManager;
    if (existing) {
      managerRef.current = existing;
      setBusy(true);
      setPaused(existing.isPaused());
    }
    return () => {
      mountedRef.current = false;
      // Keep the manager alive on window if translation is still running,
      // so it survives page navigation.
      if (managerRef.current && busy) {
        win.__translationManager = managerRef.current;
      } else {
        win.__translationManager = null;
      }
    };
  }, []); // intentionally only on mount/unmount
  const { settings, prefsFor, updateBookPrefs } = useSettings();
  // Reader preferences (per-book, falling back to global defaults). Used to
  // drive typography, layout mode, and toggles for the TOC/original column.
  const prefs = prefsFor(book?.id);

  // Keyboard shortcuts hint bar — shown by default, dismissed for power users.
  // Persisted in localStorage so it stays hidden across sessions.
  const [showShortcuts, setShowShortcuts] = useState(() => {
    try {
      return localStorage.getItem("atelier.reader.showShortcuts") !== "false";
    } catch {
      return true;
    }
  });
  const toggleShortcuts = useCallback(() => {
    setShowShortcuts((v) => {
      const next = !v;
      try { localStorage.setItem("atelier.reader.showShortcuts", String(next)); } catch {}
      return next;
    });
  }, []);

  // ── Mobile TOC drawer ────────────────────────────────────────────
  const [tocDrawerOpen, setTocDrawerOpen] = useState(false);
  const toggleTocDrawer = useCallback(() => setTocDrawerOpen((v) => !v), []);
  const closeTocDrawer = useCallback(() => setTocDrawerOpen(false), []);
  // Also close when the user picks a chapter on mobile.
  const onSelectChapter = useCallback((id: string) => {
    setActiveId(id);
    setTocDrawerOpen(false);
  }, []);

  // Mobile tools drawer (slides in from the right). Mirrors the
  // left-side TOC drawer pattern but surfaces the chapter-header
  // actions we hide from mobile (Reader settings, Auto-advance,
  // Delete, Glossary) plus the in-flight Stop / Pause controls.
  const [toolsDrawerOpen, setToolsDrawerOpen] = useState(false);
  const toggleToolsDrawer = useCallback(
    () => setToolsDrawerOpen((v) => !v),
    [],
  );
  const closeToolsDrawer = useCallback(() => setToolsDrawerOpen(false), []);

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
      // Load glossary entries for AI reference during translation.
      void listGlossaryEntries(book.id).then(setGlossaryEntries);
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

  // Persist reading position so the Library can show "Continue Reading".
  useEffect(() => {
    if (!book || !activeId) return;
    saveBookmark(book.id, activeId);
  }, [activeId, book?.id]);

  // ── Keyboard shortcuts ────────────────────────────────────────────
  // Use capture phase so we beat the browser's built-in "quick find"
  // (type-ahead search) which intercepts single-letter keys.  We match
  // on e.code for stability and lower-case e.key for letter chords.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
      if (isInput) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const idx = chapters.findIndex((c) => c.id === activeId);
      const total = chapters.length;
      const key = e.key.toLowerCase();
      const code = e.code;

      // ── Space: page scroll ────────────────────────────────────
      if (code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        const amount = window.innerHeight * 0.85;
        window.scrollBy({ top: e.shiftKey ? -amount : amount, behavior: "smooth" });
        return;
      }

      // ── Arrow keys: line scroll ───────────────────────────────
      if (code === "ArrowUp") {
        e.preventDefault();
        window.scrollBy({ top: -120, behavior: "smooth" });
        return;
      }
      if (code === "ArrowDown") {
        e.preventDefault();
        window.scrollBy({ top: 120, behavior: "smooth" });
        return;
      }

      // ── Chapter navigation ────────────────────────────────────
      const prev = code === "ArrowLeft" || key === "j" || key === "[";
      const next = code === "ArrowRight" || key === "k" || key === "]";
      if (prev && idx > 0) {
        e.preventDefault();
        setActiveId(chapters[idx - 1].id);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (next && idx < total - 1) {
        e.preventDefault();
        setActiveId(chapters[idx + 1].id);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      // ── Toggles ───────────────────────────────────────────────
      if (key === "t") {
        e.preventDefault();
        if (book) {
          // On desktop, toggle the inline TOC. On mobile, toggle the drawer.
          if (window.innerWidth >= 1024) {
            updateBookPrefs(book.id, { showToc: !prefs.showToc });
          } else {
            setTocDrawerOpen((v) => !v);
          }
        }
        return;
      }
      if (key === "o") {
        e.preventDefault();
        if (book) updateBookPrefs(book.id, { showOriginal: !prefs.showOriginal });
        return;
      }
      if (key === "l") {
        e.preventDefault();
        if (book) updateBookPrefs(book.id, { layout: prefs.layout === "split" ? "stack" : "split" });
        return;
      }
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [activeId, chapters, prefs.showToc, prefs.showOriginal, prefs.layout, book, updateBookPrefs]);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeId) ?? null,
    [chapters, activeId],
  );
  const activeTranslation = activeId ? translations[activeId] : undefined;
  const activeIdx = chapters.findIndex((c) => c.id === activeId);

  // Paragraphs the ReadAloud component should speak. We prefer the
  // translated English so the natural voice reads the polished text;
  // fallback to the original when translation is missing or in progress.
  // Scene-break markers (the SCENE_BREAK constant) are filtered out.
  const readableParagraphs = useMemo(() => {
    if (!activeChapter) return [];
    const translated = activeTranslation?.paragraphs ?? [];
    return activeChapter.paragraphs
      .map((p, i) => {
        if (p === SCENE_BREAK) return null;
        const t = translated[i];
        return t && t.trim() ? t : p;
      })
      .filter((p): p is string => !!p && p.trim().length > 0);
  }, [activeChapter, activeTranslation]);

  // Maps chapter-level paragraph index → readable-paragraph index
  // (skipping scene breaks & empty lines). Used so clicking a
  // paragraph in the reader can jump ReadAloud to the right spot.
  const chapterIdxToReadableIdx = useMemo(() => {
    if (!activeChapter) return [];
    const result: number[] = [];
    let r = 0;
    for (let i = 0; i < activeChapter.paragraphs.length; i++) {
      const p = activeChapter.paragraphs[i];
      if (p === SCENE_BREAK || !p || !p.trim()) {
        result.push(-1);
      } else {
        result.push(r++);
      }
    }
    return result;
  }, [activeChapter]);

  const readAloudControllerRef = useRef<ReadAloudController | null>(null);
  const onParagraphJump = useCallback((readableIdx: number) => {
    readAloudControllerRef.current?.jumpTo(readableIdx);
  }, []);

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

  const onTranslateActive = async (chapterOverride?: Chapter) => {
    const ch = chapterOverride ?? activeChapter;
    if (!book || !ch) return;
    if (busy) return;
    stopRef.current = false;
    // Switch to this chapter if we were called with an override.
    if (chapterOverride) setActiveId(ch.id);
    // Clear any previous "stopped" banner when a new translation begins.
    setStoppedBanner(false);
    if (stoppedTimerRef.current) { clearTimeout(stoppedTimerRef.current); stoppedTimerRef.current = null; }
    try {
      setBusy(true);
      setPaused(false);
      setProgress({ done: 0, total: ch.paragraphs.length, provider: null });
      const mgr = makeManager();
      managerRef.current = mgr;
      (window as unknown as { __translationManager?: TranslationManager | null }).__translationManager = mgr;
      const result = await mgr.translateChapter({
        paragraphs: ch.paragraphs,
        contextHint: `Chapter: ${ch.title}. From ${book.title}.`,
        glossary: glossaryEntries.length ? glossaryEntries : undefined,
        onProgress: (p) => setProgress({ done: p.done, total: p.total, provider: p.provider }),
        onPartialRows: (partialRows) => {
          const partialTr: ChapterTranslation = {
            id: `${book.id}:${ch.id}`,
            bookId: book.id,
            chapterId: ch.id,
            paragraphs: partialRows.map((r, i) =>
              r && r.trim() && r.trim() !== ch.paragraphs[i].trim() ? r : null,
            ),
            status: "in_progress",
            provider: null,
            progress: partialRows.filter((r) => r !== null).length / Math.max(1, partialRows.length),
          };
          void saveTranslation(partialTr).catch(() => {});
          if (mountedRef.current) {
            setTranslations((m) => ({ ...m, [ch.id]: partialTr }));
          }
        },
      });
      const tr: ChapterTranslation = {
        id: `${book.id}:${ch.id}`,
        bookId: book.id,
        chapterId: ch.id,
        paragraphs: result.rows.map((r, i) =>
          r && r.trim() && r.trim() !== ch.paragraphs[i].trim() ? r : null,
        ),
        status: result.failed ? "error" : "completed",
        startedAt: Date.now(),
        completedAt: Date.now(),
        provider: result.provider,
        progress: result.failed
          ? result.rows.filter((r, i) => r.trim() && r.trim() !== ch.paragraphs[i].trim()).length / Math.max(1, ch.paragraphs.length)
          : 1,
        error: result.failed ? "One or more providers failed. Verify API keys in Settings." : undefined,
      };
      await saveTranslation(tr);
      setTranslations((m) => ({ ...m, [ch.id]: tr }));
      notifyLibraryChanged();
      if (!result.failed) {
        updateBookPrefs(book.id, { showOriginal: false });
        toast.success("Chapter translated.");
        // ── Auto-advance: find next untranslated chapter ──────────
        if (autoAdvanceRef.current && !stopRef.current && mountedRef.current) {
          const currentIdx = chapters.findIndex((c) => c.id === ch.id);
          const next = chapters.slice(currentIdx + 1).find((c) => {
            const t = translations[c.id];
            return !t || t.status !== "completed";
          });
          if (next) {
            // Small delay to let React finish the current render,
            // then kick off the next translation with the explicit chapter.
            setTimeout(() => {
              if (autoAdvanceRef.current && !stopRef.current && mountedRef.current) {
                void onTranslateActive(next);
              }
            }, 300);
          } else {
            setAutoAdvance(false);
            toast.success("All chapters translated! 🎉");
          }
        }
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
        setPaused(false);
        setProgress(null);
      }
    }
  };

  const onPause = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    mgr.pause();
    setPaused(true);
  }, []);

  const onResume = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    stopRef.current = false;
    mgr.resume();
    setPaused(false);
  }, []);

  const onStop = useCallback(() => {
    stopRef.current = true;
    setAutoAdvance(false);
    // If paused, resume to unblock the waitForResume loop so the
    // chapter can finish. Otherwise let the current chapter complete
    // naturally — auto-advance won't fire because stopRef is checked.
    const mgr = managerRef.current;
    if (mgr && mgr.isPaused()) {
      mgr.resume();
      setPaused(false);
    }
    setStoppedBanner(true);
    if (stoppedTimerRef.current) clearTimeout(stoppedTimerRef.current);
    stoppedTimerRef.current = setTimeout(() => setStoppedBanner(false), 8000);
  }, []);

  const onDeleteTranslation = useCallback(async () => {
    if (!book || !activeChapter) return;
    if (busy) return;
    const emptyTr: ChapterTranslation = {
      id: `${book.id}:${activeChapter.id}`,
      bookId: book.id,
      chapterId: activeChapter.id,
      paragraphs: Array(activeChapter.paragraphs.length).fill(null),
      status: "idle",
      provider: null,
      progress: 0,
    };
    await saveTranslation(emptyTr);
    setTranslations((m) => ({ ...m, [activeChapter.id]: emptyTr }));
    notifyLibraryChanged();
    toast.success("Translation deleted.");
  }, [book, activeChapter, busy]);

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
        try {              const result = await mgr.translateChapter({
                paragraphs: c.paragraphs,
                contextHint: `Chapter: ${c.title}. From ${book.title}.`,
                glossary: glossaryEntries.length ? glossaryEntries : undefined,
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
                onPartialRows: (partialRows) => {
                  if (!mountedRef.current) return;
                  const partialTr: ChapterTranslation = {
                    id: `${book.id}:${c.id}`,
                    bookId: book.id,
                    chapterId: c.id,
                    paragraphs: partialRows.map((r, i) =>
                      r && r.trim() && r.trim() !== c.paragraphs[i].trim() ? r : null,
                    ),
                    status: "in_progress",
                    provider: null,
                    progress: partialRows.filter((r) => r !== null).length / Math.max(1, partialRows.length),
                  };
                  void saveTranslation(partialTr).catch(() => {});
                  setTranslations((m) => ({ ...m, [c.id]: partialTr }));
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
            <ArrowLeft className="w-4 h-4" strokeWidth={1.4} /> Back to library
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
        {/* ── Title bar — desktop only ──────────────────────── */}
        <header className="hidden lg:flex flex-col lg:flex-row lg:items-end justify-between gap-4 sm:gap-6">
          <div>
            <button
              className="text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
              onClick={() => navigate("/library")}
            >
              ← Back to library
            </button>
            <div className="mt-3 studio-caps text-muted-foreground">The Deskside</div>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl mt-2 tracking-tight leading-tight">{book.title}</h1>
            <p className="text-muted-foreground mt-1">{book.author}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <ApiLender settings={settings} />
            {busy && (
              <button
                type="button"
                onClick={paused ? onResume : onPause}
                className="h-11 sm:h-10 px-3 inline-flex items-center gap-1.5 border border-border hover:border-foreground/40 active:scale-[0.97] transition-transform"
                title={paused ? "Resume translation" : "Pause translation"}
              >
                {paused ? (
                  <Play className="w-4 h-4" strokeWidth={1.4} />
                ) : (
                  <Pause className="w-4 h-4" strokeWidth={1.4} />
                )}
                <span className="text-xs uppercase tracking-[0.18em] hidden sm:inline">
                  {paused ? "Resume" : "Pause"}
                </span>
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={onBatchTranslate}
              className="h-11 sm:h-10 px-4 inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 active:scale-[0.97] transition-transform"
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
              className="h-11 sm:h-10 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40 active:scale-[0.97] transition-transform"
            >
              <Download className="w-4 h-4" strokeWidth={1.4} />
              <span className="text-xs uppercase tracking-[0.18em]">Export EPUB</span>
            </button>
          </div>
        </header>

        {/* ── Mobile top bar — compact, just book title ──────── */}
        <div className="md:hidden flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/library")}
            className="shrink-0 w-9 h-9 grid place-items-center border border-border hover:border-foreground/40 rounded"
            aria-label="Back to library"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.4} />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-lg leading-tight truncate">{book.title}</h1>
            <p className="text-xs text-muted-foreground truncate">{book.author}</p>
          </div>
          {busy && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.4} />
              Translating…
            </span>
          )}
        </div>

        {/* Progress strip — desktop only */}
        <div className="hidden lg:grid mt-8 grid-cols-12 gap-4">
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

        {/* Translation stopped banner */}
        {stoppedBanner && !busy && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-5 flex items-center justify-between gap-4 border border-orange-500/30 bg-orange-500/5 rounded px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Square className="w-4 h-4 text-orange-400" strokeWidth={1.6} />
              <span className="text-sm text-orange-300/90">
                Translation stopped — chapters may be partially translated.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setStoppedBanner(false);
                if (stoppedTimerRef.current) { clearTimeout(stoppedTimerRef.current); stoppedTimerRef.current = null; }
              }}
              className="shrink-0 text-orange-400/60 hover:text-orange-300 transition-colors cursor-pointer"
              aria-label="Dismiss"
            >
              <span className="text-xs uppercase tracking-[0.2em]">Dismiss</span>
            </button>
          </motion.div>
        )}

        {/* Keyboard shortcuts hint bar — desktop only */}
        {showShortcuts && (
          <div className="hidden lg:block mt-6">
          <div className="flex items-center gap-5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 border-b border-border/50 pb-4 overflow-x-auto">
            <span className="text-muted-foreground/70">Shortcuts</span>
            <span className="inline-flex items-center gap-1"><Kbd>←</Kbd><Kbd>→</Kbd> or <Kbd>J</Kbd><Kbd>K</Kbd> prev/next chapter</span>
            <span className="w-px h-3 bg-border/50" />
            <span className="inline-flex items-center gap-1"><Kbd>Space</Kbd> scroll page · <Kbd>↑</Kbd><Kbd>↓</Kbd> scroll line</span>
            <span className="w-px h-3 bg-border/50" />
            <span className="inline-flex items-center gap-1"><Kbd>T</Kbd> toggle contents · <Kbd>O</Kbd> original · <Kbd>L</Kbd> layout</span>
            {activeIdx >= 0 && (
              <>
                <span className="w-px h-3 bg-border/50" />
                <span className="studio-num text-muted-foreground/50">
                  Ch {activeIdx + 1}/{chapters.length}
                </span>
              </>
            )}
            {/* Dismiss button */}
            <button
              type="button"
              onClick={toggleShortcuts}
              aria-label="Hide keyboard shortcuts"
              title="Hide shortcuts bar"
              className="ml-auto shrink-0 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
            >
              Hide
            </button>
          </div>
          </div>
        )}
        {/* Show-shortcuts re-entry when bar is hidden */}
        {!showShortcuts && (
          <div className="hidden lg:block mt-6">
          <button
            type="button"
            onClick={toggleShortcuts}
            className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/20 hover:text-muted-foreground/60 transition-colors border-b border-transparent hover:border-border/30 pb-1"
          >
            Show shortcuts
          </button>
          </div>
        )}

        {/* Main split: TOC + reader */}
        <div className="mt-8">
          {/* ── Desktop TOC — sidebar ──────────────────────────── */}
          <div className="hidden lg:grid grid-cols-12 gap-8">
            {prefs.showToc && (
              <aside className="col-span-3 sticky top-24 self-start">
                <div className="border border-border">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="studio-caps text-muted-foreground text-xs">Contents</span>
                    <button
                      onClick={() => updateBookPrefs(book.id, { showToc: false })}
                      className="w-7 h-7 grid place-items-center border border-border hover:border-foreground/40 rounded"
                      aria-label="Hide contents"
                    >
                      <PanelLeftClose className="w-3.5 h-3.5" strokeWidth={1.4} />
                    </button>
                  </div>
                  <ol className="divide-y divide-border max-h-[60vh] overflow-y-auto thin-scrollbar">
                    {chapters.map((c, idx) => {
                      const tr = translations[c.id];
                      const isDone = tr?.status === "completed" && tr.paragraphs.every((p: string | null) => p && p.trim());
                      const isActive = c.id === activeId;
                      return (
                        <li key={c.id}>
                          <button
                            onClick={() => setActiveId(c.id)}
                            className={cn(
                              "w-full text-left px-4 py-3 grid grid-cols-12 gap-3 items-center transition-colors hover:bg-muted",
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
                              {isDone || (tr && tr.progress >= 1) ? (
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
                    {chapters.length === 0 && (
                      <li className="p-8 text-center text-muted-foreground text-sm">
                        No chapters loaded.
                      </li>
                    )}
                  </ol>
                </div>
              </aside>
            )}
            <section
              className={cn("pb-20", prefs.showToc ? "col-span-9" : "col-span-12")}
            >
              {activeChapter ? (
                <ChapterReader
                  chapter={activeChapter}
                  translation={activeTranslation ?? null}
                  prefs={prefs}
                  bookId={book.id}
                  onTranslate={onTranslateActive}
                  onPause={onPause}
                  onResume={onResume}
                  onStop={onStop}
                  onDeleteTranslation={onDeleteTranslation}
                  autoAdvance={autoAdvance}
                  onToggleAutoAdvance={onToggleAutoAdvance}
                  isPaused={paused}
                  editMode={editMode}
                  onToggleEditMode={() => setEditMode((v) => !v)}
                  onSaveEdits={onSaveEdits}
                  onTranslateParagraph={async (paragraphIdx) => {
                    if (!book || !activeChapter) return;
                    const tr = activeTranslation ?? makeEmptyTranslation(book.id, activeChapter.id, activeChapter.paragraphs.length);
                    const mgr = makeManager();
                    const res = await mgr.translateChapter({
                      paragraphs: [activeChapter.paragraphs[paragraphIdx]],
                      contextHint: `Single paragraph from "${activeChapter.title}".`,
                      glossary: glossaryEntries.length ? glossaryEntries : undefined,
                    });
                    const txt = res.rows[0];
                    const updated = { ...tr, paragraphs: [...tr.paragraphs], provider: res.provider };
                    updated.paragraphs[paragraphIdx] = txt && txt.trim() ? txt : activeChapter.paragraphs[paragraphIdx];
                    updated.status = res.failed ? "error" : "in_progress";
                    updated.progress = updated.paragraphs.length
                      ? updated.paragraphs.filter((p) => p && p.trim()).length / updated.paragraphs.length
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
                  readAloudProps={{
                    paragraphs: readableParagraphs,
                    documentId: `${book.id}:${activeChapter.id}`,
                    hasNext: activeIdx >= 0 && activeIdx < chapters.length - 1,
                    onAdvanceNext: () => {
                      if (activeIdx < 0 || activeIdx >= chapters.length - 1) return;
                      setActiveId(chapters[activeIdx + 1].id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    },
                    isTranslation:
                      !!activeTranslation &&
                      activeTranslation.status === "completed",
                  controllerRef: readAloudControllerRef,
                }}
                chapterIdxToReadableIdx={chapterIdxToReadableIdx}
                onParagraphJump={onParagraphJump}
              />
              ) : (
                <div className="p-12 text-center">
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

          {/* ── Mobile reader ────────────────────────────── */}
          <div className="lg:hidden pb-24">
            {activeChapter ? (
              <ChapterReader
                chapter={activeChapter}
                translation={activeTranslation ?? null}
                prefs={prefs}
                bookId={book.id}
                onTranslate={onTranslateActive}
                onPause={onPause}
                onResume={onResume}                  onStop={onStop}
                  onDeleteTranslation={onDeleteTranslation}
                  autoAdvance={autoAdvance}
                  onToggleAutoAdvance={onToggleAutoAdvance}
                  isPaused={paused}
                  editMode={editMode}
                  onToggleEditMode={() => setEditMode((v) => !v)}
                  onSaveEdits={onSaveEdits}
                  mobile
                  onTranslateParagraph={async () => {}}
                onResetParagraph={() => {}}
                busy={busy}
                readAloudProps={{
                  paragraphs: readableParagraphs,
                  documentId: `${book.id}:${activeChapter.id}`,
                  hasNext: activeIdx >= 0 && activeIdx < chapters.length - 1,
                  onAdvanceNext: () => {
                    if (activeIdx < 0 || activeIdx >= chapters.length - 1) return;
                    setActiveId(chapters[activeIdx + 1].id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  },
                  isTranslation:
                    !!activeTranslation &&
                    activeTranslation.status === "completed",
                  controllerRef: readAloudControllerRef,
                }}
                chapterIdxToReadableIdx={chapterIdxToReadableIdx}
                onParagraphJump={onParagraphJump}
              />
            ) : (
              <div className="p-12 text-center">
                <BookOpen className="w-10 h-10 mx-auto text-muted-foreground" strokeWidth={1.2} />
                <div className="mt-4 font-display text-2xl">Pick a chapter</div>
                <p className="text-muted-foreground mt-2 max-w-[40ch] mx-auto">
                  Tap the chapters button below to open the table of contents.
                </p>
              </div>
            )}
          </div>

          {/* ── Mobile TOC slide-over drawer ───────────────────── */}
          <AnimatePresence>
            {tocDrawerOpen && (
              <>
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                  onClick={closeTocDrawer}
                />
                {/* Drawer panel */}
                <motion.aside
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 300 }}
                  className="md:hidden fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-background border-r border-border shadow-xl flex flex-col"
                >
                  {/* Drawer header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div>
                      <span className="studio-caps text-muted-foreground text-xs">
                        Table of contents
                      </span>
                      <span className="studio-num text-[10px] text-muted-foreground ml-2">
                        {chapters.length.toString().padStart(2, "0")}
                      </span>
                    </div>
                    <button
                      onClick={closeTocDrawer}
                      className="w-8 h-8 grid place-items-center border border-border hover:border-foreground/40 rounded"
                      aria-label="Close chapters"
                    >
                      <X className="w-4 h-4" strokeWidth={1.4} />
                    </button>
                  </div>
                  {/* Chapter list */}
                  <ol className="flex-1 divide-y divide-border overflow-y-auto thin-scrollbar">
                    {chapters.map((c, idx) => {
                      const tr = translations[c.id];
                      const isDone = tr?.status === "completed" && tr.paragraphs.every((p) => p && p.trim());
                      const isActive = c.id === activeId;
                      return (
                        <li key={c.id}>
                          <button
                            onClick={() => onSelectChapter(c.id)}
                            className={cn(
                              "w-full text-left px-4 py-3.5 grid grid-cols-12 gap-3 items-center transition-colors hover:bg-muted active:bg-muted",
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
                              {isDone || (tr && tr.progress >= 1) ? (
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
                    {chapters.length === 0 && (
                      <li className="p-8 text-center text-muted-foreground text-sm">
                        No chapters loaded.
                      </li>
                    )}
                  </ol>
                </motion.aside>
              </>
            )}
          </AnimatePresence>

          {/* Mobile tools slide-in drawer (right side) */}
          <AnimatePresence>
            {toolsDrawerOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                  onClick={closeToolsDrawer}
                />
                <motion.aside
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 300 }}
                  className="md:hidden fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] bg-background border-l border-border shadow-xl flex flex-col"
                >
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <span className="studio-caps text-muted-foreground text-xs">
                      Tools
                    </span>
                    <button
                      onClick={closeToolsDrawer}
                      className="w-8 h-8 grid place-items-center border border-border hover:border-foreground/40 rounded"
                      aria-label="Close tools"
                    >
                      <X className="w-4 h-4" strokeWidth={1.4} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto thin-scrollbar px-5 py-5 space-y-7">
                    <section className="space-y-3">
                      <h3 className="studio-caps text-muted-foreground text-xs">
                        Translate
                      </h3>
                      {busy ? (
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onStop();
                              closeToolsDrawer();
                            }}
                            className="h-10 px-3 inline-flex items-center justify-center gap-2 border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Square className="w-3.5 h-3.5" strokeWidth={1.6} />
                            <span className="text-xs uppercase tracking-[0.18em]">
                              Stop translation
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={paused ? onResume : onPause}
                            className="h-10 px-3 inline-flex items-center justify-center gap-2 border border-border hover:border-foreground/40 transition-colors"
                          >
                            {paused ? (
                              <Play className="w-4 h-4" strokeWidth={1.4} />
                            ) : (
                              <Pause className="w-4 h-4" strokeWidth={1.4} />
                            )}
                            <span className="text-xs uppercase tracking-[0.18em]">
                              {paused ? "Resume" : "Pause"}
                            </span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={onToggleAutoAdvance}
                            className={cn(
                              "h-10 px-3 inline-flex items-center justify-center gap-2 border transition-colors",
                              autoAdvance
                                ? "bg-foreground text-background border-foreground"
                                : "border-border hover:border-foreground/40 text-foreground",
                            )}
                            title={
                              autoAdvance
                                ? "Auto-advance is on - disable"
                                : "Auto-advance: translate next chapter after this one"
                            }
                          >
                            <Sparkles
                              className={cn("w-3.5 h-3.5", autoAdvance ? "" : "opacity-50")}
                              strokeWidth={1.4}
                            />
                            <span className="text-xs uppercase tracking-[0.18em]">
                              Auto-advance: {autoAdvance ? "on" : "off"}
                            </span>
                          </button>
                          {activeTranslation &&
                            activeTranslation.paragraphs.some((p) => p && p.trim()) && (
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteTranslation();
                                  closeToolsDrawer();
                                }}
                                className="h-10 px-3 inline-flex items-center justify-center gap-2 border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={1.4} />
                                <span className="text-xs uppercase tracking-[0.18em]">
                                  Delete translation
                                </span>
                              </button>
                            )}
                        </div>
                      )}
                    </section>

                    <section className="space-y-3">
                      <h3 className="studio-caps text-muted-foreground text-xs">
                        Navigation
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          if (!book) return;
                          closeToolsDrawer();
                          navigate(`/library/${book.id}/glossary`);
                        }}
                        className="h-10 px-3 w-full inline-flex items-center justify-center gap-2 border border-border hover:border-foreground/40 transition-colors"
                      >
                        <BookOpen className="w-4 h-4" strokeWidth={1.4} />
                        <span className="text-xs uppercase tracking-[0.18em]">
                          Glossary
                        </span>
                      </button>
                    </section>

                    <section className="space-y-3">
                      <h3 className="studio-caps text-muted-foreground text-xs">
                        Reader
                      </h3>
                      <ReaderSettingsControls bookId={book.id} />
                    </section>
                  </div>
                </motion.aside>
              </>
            )}
          </AnimatePresence>

          {/* ── Mobile bottom nav bar ────────────────────────── */}
          <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-sm border-t border-border pb-[env(safe-area-inset-bottom,0)]">
            <div className="flex items-center px-3 py-2.5 max-w-lg mx-auto gap-2">
              {/* Prev */}
              <button
                type="button"
                onClick={() => {
                  const idx = chapters.findIndex((c) => c.id === activeId);
                  if (idx > 0) { setActiveId(chapters[idx - 1].id); window.scrollTo({ top: 0, behavior: "smooth" }); }
                }}
                disabled={activeIdx <= 0}
                aria-label="Previous chapter"
                className="h-11 px-4 inline-flex items-center gap-1.5 rounded-lg border border-border hover:border-foreground/40 disabled:opacity-25 disabled:cursor-default active:scale-95 transition-all text-sm font-medium"
              >
                Prev
              </button>

              {/* Center: Listen + TOC + Tools + Translate */}
              <div className="flex-1 flex items-center justify-center gap-1.5">
                {activeChapter && (
                  <ReadAloud
                    paragraphs={readableParagraphs}
                    documentId={`${book.id}:${activeChapter.id}`}
                    hasNext={activeIdx >= 0 && activeIdx < chapters.length - 1}
                    onAdvanceNext={() => {
                      if (activeIdx < 0 || activeIdx >= chapters.length - 1) return;
                      setActiveId(chapters[activeIdx + 1].id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    isTranslation={
                      !!activeTranslation &&
                      activeTranslation.status === "completed"
                    }
                    controllerRef={readAloudControllerRef}
                  />
                )}
                <button
                  type="button"
                  onClick={toggleTocDrawer}
                  aria-label="Table of contents"
                  className="h-11 px-3 sm:px-4 inline-flex items-center gap-1.5 rounded-lg border border-border hover:border-foreground/40 active:scale-95 transition-all text-sm font-medium"
                >
                  <List className="w-4 h-4" strokeWidth={1.4} />
                  <span className="hidden sm:inline">Chapters</span>
                </button>
                <button
                  type="button"
                  onClick={toggleToolsDrawer}
                  aria-label="Reader tools"
                  className="h-11 px-3 sm:px-4 inline-flex items-center gap-1.5 rounded-lg border border-border hover:border-foreground/40 active:scale-95 transition-all text-sm font-medium"
                >
                  <Settings2 className="w-4 h-4" strokeWidth={1.4} />
                  <span className="hidden sm:inline">Tools</span>
                </button>

                {activeChapter && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onTranslateActive()}
                    className={cn(
                      "h-11 px-3 sm:px-4 inline-flex items-center gap-1.5 rounded-lg font-medium text-sm active:scale-95 transition-all",
                      activeTranslation?.status === "completed"
                        ? "border border-border hover:border-foreground/40"
                        : "bg-foreground text-background hover:bg-foreground/90"
                    )}
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.4} />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" strokeWidth={1.4} />
                    )}
                    <span className="hidden sm:inline">
                      {busy ? "…" : activeTranslation?.status === "completed" ? "Re-do" : "Translate"}
                    </span>
                  </button>
                )}
              </div>

              {/* Next */}
              <button
                type="button"
                onClick={() => {
                  const idx = chapters.findIndex((c) => c.id === activeId);
                  if (idx < chapters.length - 1) { setActiveId(chapters[idx + 1].id); window.scrollTo({ top: 0, behavior: "smooth" }); }
                }}
                disabled={activeIdx >= chapters.length - 1}
                aria-label="Next chapter"
                className="h-11 px-4 inline-flex items-center gap-1.5 rounded-lg border border-border hover:border-foreground/40 disabled:opacity-25 disabled:cursor-default active:scale-95 transition-all text-sm font-medium"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </StudioShell>
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

type ReadAloudHandlerProps = {
  paragraphs: string[];
  documentId: string;
  hasNext: boolean;
  onAdvanceNext: () => void;
  isTranslation: boolean;
  controllerRef?: React.MutableRefObject<ReadAloudController | null>;
};

function ChapterReader({
  chapter,
  translation,
  prefs,
  bookId,
  onTranslate,
  onPause,
  onResume,
  onStop,
  onDeleteTranslation,
  autoAdvance,
  onToggleAutoAdvance,
  isPaused,
  editMode,
  onToggleEditMode,
  onSaveEdits,
  onTranslateParagraph,
  onResetParagraph,
  busy,
  mobile,
  readAloudProps,
  chapterIdxToReadableIdx,
  onParagraphJump,
}: {
  chapter: Chapter;
  translation: ChapterTranslation | null;
  prefs: ReturnType<typeof useSettings>["prefsFor"] extends (id?: any) => infer R
    ? R
    : never;
  bookId: string;
  onTranslate: (chapterOverride?: Chapter) => void | Promise<void>;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDeleteTranslation: () => void;
  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
  isPaused: boolean;
  editMode: boolean;
  onToggleEditMode: () => void;
  onSaveEdits: (chapterId: string, editedParagraphs: (string | null)[]) => void | Promise<void>;
  onTranslateParagraph: (idx: number) => void | Promise<void>;
  onResetParagraph: (idx: number) => void;
  busy: boolean;
  mobile?: boolean;
  readAloudProps: ReadAloudHandlerProps;
  chapterIdxToReadableIdx: number[];
  onParagraphJump: (readableIdx: number) => void;
}) {
  const showOriginal = prefs.showOriginal;
  const showToc = prefs.showToc;
  const layout = prefs.layout;
  const { updateBookPrefs } = useSettings();
  const navigate = useNavigate();
  const paragraphs = chapter.paragraphs;
  const translated = translation?.paragraphs ?? Array(paragraphs.length).fill(null);

  // ── Edit mode local state ─────────────────────────────────────
  const [editedTexts, setEditedTexts] = useState<(string | null)[]>([]) as [
    (string | null)[],
    React.Dispatch<React.SetStateAction<(string | null)[]>>,
  ];
  // Initialize editedTexts from translation when entering edit mode
  useEffect(() => {
    if (editMode) setEditedTexts([...translated]);
  }, [editMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track freshly-translated paragraphs for a brief highlight animation.
  // Only triggers when busy (streaming), not on initial load of an already-completed chapter.
  const [freshIndices, setFreshIndices] = useState<Set<number>>(new Set());
  const prevTranslatedRef = useRef<(string | null)[]>(translated);

  useEffect(() => {
    if (!busy) return;
    const newFresh = new Set<number>();
    translated.forEach((text, i) => {
      if (text && !prevTranslatedRef.current[i]) {
        newFresh.add(i);
      }
    });
    prevTranslatedRef.current = translated;
    if (newFresh.size === 0) return;
    setFreshIndices((prev) => new Set([...prev, ...newFresh]));
    const timer = setTimeout(() => {
      setFreshIndices((prev) => {
        const next = new Set(prev);
        newFresh.forEach((i) => next.delete(i));
        return next;
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [translated, busy]);

  // Stack layout: original on top, English directly below in a single
  // column. The inner divider heading remains so the user can still tell
  // where the translation begins.
  const cols = !showOriginal ? 1 : layout === "stack" ? 1 : 2;

  return (
    <article>
      <header className={cn("flex flex-col sm:flex-row items-start sm:justify-between gap-3 sm:gap-6 flex-wrap", mobile && "gap-3")}>
        <div>
          {!mobile && <div className="studio-caps text-muted-foreground">Chapter</div>}
          <h2 className={cn("font-display mt-1 tracking-tight", mobile ? "text-xl" : "text-2xl sm:text-3xl")}>{chapter.title}</h2>
          <div className="text-muted-foreground mt-1 text-sm">
            {chapter.wordCount.toLocaleString()} words ·{" "}
              {translation?.status === "completed" ? (
                <span className="inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" strokeWidth={1.8} />
                  Translated
                </span>
              ) : translation ? (
                `${Math.round((translation.progress ?? 0) * 100)}%`
              ) : (
                "untranslated"
              )}
            {translation?.completedAt ? (
              <span className="ml-2 text-muted-foreground/70">
                · last updated {formatRelativeTime(translation.completedAt)}
              </span>
            ) : null}
          </div>
        </div>
        {!mobile && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Re-entry affordance when the TOC is collapsed: a single icon
              button that brings the chapter list back. Always rendered so
              the user can toggle without hunting through menus. */}
          {!showToc && (
            <button
              type="button"
              onClick={() => updateBookPrefs(bookId, { showToc: true })}
              aria-label="Show table of contents"
              title="Show table of contents"
              className="h-10 sm:h-10 px-2.5 sm:px-3 inline-flex items-center gap-1.5 sm:gap-2 border border-border hover:border-foreground/40 active:scale-[0.97] transition-all"
            >
              <PanelLeftOpen className="w-4 h-4" strokeWidth={1.4} />
              <span className="hidden xs:inline text-xs uppercase tracking-[0.18em]">Contents</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(`/library/${bookId}/glossary`)}
            className="h-10 sm:h-10 px-2.5 sm:px-3 inline-flex items-center gap-1.5 sm:gap-2 border border-border hover:border-foreground/40 active:scale-[0.97] transition-all"
          >
            <BookOpen className="w-4 h-4" strokeWidth={1.4} />
            <span className="hidden xs:inline text-xs uppercase tracking-[0.18em]">Glossary</span>
          </button>
          <ReaderSettingsMenu bookId={bookId} />
          <ReadAloud {...readAloudProps} />
          {busy ? (
            <>
              <button
                type="button"
                onClick={onStop}
                className="h-10 px-3 inline-flex items-center gap-2 border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" strokeWidth={1.6} />
                <span className="text-xs uppercase tracking-[0.18em]">Stop</span>
              </button>
              {isPaused ? (
                <button
                  type="button"
                  onClick={onResume}
                  className="h-10 px-3 inline-flex items-center gap-2 border border-border hover:border-foreground/40 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4" strokeWidth={1.4} />
                  <span className="text-xs uppercase tracking-[0.18em]">Resume</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onPause}
                  className="h-10 px-3 inline-flex items-center gap-2 border border-border hover:border-foreground/40 transition-colors cursor-pointer"
                >
                  <Pause className="w-4 h-4" strokeWidth={1.4} />
                  <span className="text-xs uppercase tracking-[0.18em]">Pause</span>
                </button>
              )}
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground px-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.4} />
                Translating…
              </span>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onTranslate()}
                className="h-11 sm:h-10 px-4 inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 cursor-pointer active:scale-[0.97] transition-transform"
              >
                <Sparkles className="w-4 h-4" strokeWidth={1.4} />
                <span className="text-xs uppercase tracking-[0.18em]">
                  {translation?.status === "completed" ? "Re-translate" : "Translate chapter"}
                </span>
              </button>
              <button
                type="button"
                onClick={onToggleAutoAdvance}
                className={cn(
                  "h-10 px-3 inline-flex items-center gap-1.5 border transition-colors cursor-pointer",
                  autoAdvance
                    ? "bg-foreground text-background border-foreground"
                    : "border-border hover:border-foreground/40"
                )}
                title={autoAdvance ? "Auto-advance is on — disable" : "Auto-advance: translate next chapter after this one"}
              >
                <Sparkles className={cn("w-3.5 h-3.5", autoAdvance ? "" : "opacity-50")} strokeWidth={1.4} />
                <span className="text-xs uppercase tracking-[0.18em]">Auto</span>
              </button>
              {translation && translation.paragraphs.some((p) => p && p.trim()) && (
                <button
                  type="button"
                  onClick={onDeleteTranslation}
                  className="h-10 px-3 inline-flex items-center gap-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="Delete this chapter's translation"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.4} />
                  <span className="text-xs uppercase tracking-[0.18em]">Delete</span>
                </button>
              )}
            </>
          )}
        </div>
        )}
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

      {/* Paragraphs flow as continuous prose, separated only by typographic
          spacing (`.reader-gap > * + *`) — no internal borders or card
          chrome. The left rule on each paragraph block keeps Original and
          English visually distinct when shown side-by-side. */}
      <div className="reader-gap">
        {paragraphs.map((p, idx) => {
          const t = translated[idx];

          // Scene break separator — render an ornamental divider
          // instead of a regular paragraph pair.
          if (p === SCENE_BREAK) {
            return (
              <div key={idx} className="scene-break" aria-hidden="true">
                <span className="scene-break__ornament">* * *</span>
              </div>
            );
          }

          if (showOriginal && layout === "stack") {
            // Stacked layout: original line, then English line below it.
            return (
              <motion.div
                key={idx}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: Math.min(idx, 6) * 0.02 }}
              >
                <div className="group flex items-start gap-1">
                  <p
                    className="reader-prose-text text-foreground/80 py-3 px-1 -mx-1 rounded transition-colors duration-1000 cursor-pointer hover:bg-foreground/5 flex-1"
                    onClick={() => {
                      const ri = chapterIdxToReadableIdx[idx];
                      if (ri >= 0) onParagraphJump(ri);
                    }}
                    title="Click to read aloud from here"
                  >
                    {p}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onTranslateParagraph(idx); }}
                    className="shrink-0 mt-3 p-1.5 opacity-60 md:opacity-0 md:group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-foreground transition-all rounded active:bg-foreground/10"
                    title="Re-translate this paragraph"
                  >
                    <Undo2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                  </button>
                </div>
                <div className="mt-3">
                  <p className={cn(
                    "reader-prose-text text-foreground/85 py-3 px-1 -mx-1 rounded transition-colors duration-1000 cursor-pointer hover:bg-foreground/5",
                    freshIndices.has(idx) ? "bg-foreground/10" : "bg-transparent",
                  )}
                    onClick={() => {
                      const ri = chapterIdxToReadableIdx[idx];
                      if (ri >= 0) onParagraphJump(ri);
                    }}
                    title="Click to jump read aloud here"
                  >
                    {t && t.trim() ? t : (
                      <span className="text-muted-foreground/70 italic">{busy ? "Translating…" : "Not yet translated."}</span>
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
              )}
            >
              {showOriginal && (
                <div className="group flex items-start gap-1">
                  <p
                    className="reader-prose-text text-foreground/80 py-3 cursor-pointer hover:bg-foreground/5 px-1 -mx-1 rounded transition-colors duration-1000 flex-1"
                    onClick={() => {
                      const ri = chapterIdxToReadableIdx[idx];
                      if (ri >= 0) onParagraphJump(ri);
                    }}
                    title="Click to read aloud from here"
                  >
                    {p}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onTranslateParagraph(idx); }}
                    className="shrink-0 mt-3 p-1.5 opacity-60 md:opacity-0 md:group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-foreground transition-all rounded active:bg-foreground/10"
                    title="Re-translate this paragraph"
                  >
                    <Undo2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                  </button>
                </div>
              )}
              <p className={cn(
                "reader-prose-text text-foreground/85 py-3 px-1 -mx-1 rounded transition-colors duration-1000 cursor-pointer hover:bg-foreground/5",
                freshIndices.has(idx) ? "bg-foreground/10" : "bg-transparent",
              )}
                onClick={() => {
                  const ri = chapterIdxToReadableIdx[idx];
                  if (ri >= 0) onParagraphJump(ri);
                }}
                title="Click to jump read aloud here"
              >
                {t && t.trim() ? t : (
                  <span className="text-muted-foreground/70 italic">{busy ? "Translating…" : "Not yet translated."}</span>
                )}
              </p>
            </motion.div>
          );
        })}
      </div>

    </article>
  );
}
