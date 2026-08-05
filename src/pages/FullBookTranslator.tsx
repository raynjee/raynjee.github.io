// Full-book translator — a focused production desk for translating an entire
// EPUB in one run. Unlike BookReader, this page never asks the user to work
// chapter-by-chapter or translate as they go.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Download,
  FileText,
  FolderOpen,
  Info,
  Languages,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Upload,
  WandSparkles,
} from "lucide-react";
import { useNavigate } from "react-router";
import { StudioShell } from "@/components/StudioShell";
import { useLibrary, importEpubFile, notifyLibraryChanged, saveTranslation, updateBook } from "@/hooks/use-library";
import { useSettings } from "@/hooks/use-settings";
import {
  listChapters,
  listGlossaryEntries,
  listTranslationsByBook,
} from "@/lib/db";
import { PROVIDERS, TranslationManager } from "@/lib/translators/types";
import { buildTranslatedEpub } from "@/lib/epub";
import { extractFullBookGlossary } from "@/lib/full-book-glossary";
import type { Book, Chapter, ChapterTranslation, ContentRating, GlossaryEntry, ProviderId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TranslationProgress {
  chapterIndex: number;
  chapterTotal: number;
  paragraphDone: number;
  paragraphTotal: number;
  provider: string | null;
}

type FullBookProvider = Extract<ProviderId, "deepseek" | "gemini">;

const RATING_OPTIONS: Array<{ value: ContentRating; label: string; description: string }> = [
  { value: "general", label: "General", description: "Clean language for all ages." },
  { value: "teen", label: "Teen", description: "Mild profanity and themes." },
  { value: "mature", label: "Mature", description: "Heavy themes and profanity." },
  { value: "explicit", label: "Explicit", description: "Translate adult content faithfully." },
];

export default function FullBookTranslator() {
  const navigate = useNavigate();
  const { books } = useLibrary();
  const { settings } = useSettings();
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [fullBookProvider, setFullBookProvider] = useState<FullBookProvider>(() =>
    settings.activeProvider === "gemini" ? "gemini" : "deepseek",
  );
  const [deepSeekConnection, setDeepSeekConnection] = useState<"checking" | "connected" | "not-connected">("checking");
  const [importedBook, setImportedBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [translations, setTranslations] = useState<Record<string, ChapterTranslation>>({});
  const [glossaryEntries, setGlossaryEntries] = useState<GlossaryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [glossaryBusy, setGlossaryBusy] = useState(false);
  const [glossaryPaused, setGlossaryPaused] = useState(false);
  const [glossaryProgress, setGlossaryProgress] = useState({ done: 0, total: 0, saved: 0, errors: 0 });
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [tone, setTone] = useState("");
  const [style, setStyle] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [rating, setRating] = useState<ContentRating>("");
  const [translationHint, setTranslationHint] = useState("");
  const glossaryStopRef = useRef(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const managerRef = useRef<TranslationManager | null>(null);
  const stopRef = useRef(false);
  const pausedRef = useRef(false);
  const mountedRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const book = importedBook ?? books.find((candidate) => candidate.id === selectedBookId) ?? null;

  useEffect(() => {
    const config = settings.providers.find((provider) => provider.id === "deepseek");
    if (!config?.enabled) {
      setDeepSeekConnection("not-connected");
      return;
    }
    let cancelled = false;
    setDeepSeekConnection("checking");
    void PROVIDERS.deepseek.testConnection(config).then((result) => {
      if (!cancelled) setDeepSeekConnection(result.ok ? "connected" : "not-connected");
    }).catch(() => {
      if (!cancelled) setDeepSeekConnection("not-connected");
    });
    return () => {
      cancelled = true;
    };
  }, [settings.providers]);

  const providerReady = (id: FullBookProvider): boolean => {
    const config = settings.providers.find((provider) => provider.id === id);
    if (!config?.enabled) return false;
    if (id === "gemini") {
      return Boolean(config.apiKey?.trim() || config.apiKeys?.some((key) => key.trim()));
    }
    return deepSeekConnection === "connected";
  };
  const selectedProviderReady = providerReady(fullBookProvider);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!book) return;
    setTitle(book.title);
    setAuthor(book.author);
    setDescription(book.description);
    setGenre(book.genre);
    setTone(book.tone);
    setStyle(book.style);
    setTargetAudience(book.targetAudience);
    setRating(book.rating ?? "");
    try {
      setTranslationHint(localStorage.getItem(`raynets.full-book-hint.${book.id}`) ?? "");
    } catch {
      setTranslationHint("");
    }
    setGlossaryPaused(false);
    glossaryStopRef.current = false;
    let cancelled = false;
    void (async () => {
      const [loadedChapters, loadedTranslations, loadedGlossary] = await Promise.all([
        listChapters(book.id),
        listTranslationsByBook(book.id),
        listGlossaryEntries(book.id),
      ]);
      if (cancelled) return;
      const ordered = book.chapterOrder
        .map((id) => loadedChapters.find((chapter) => chapter.id === id))
        .filter((chapter): chapter is Chapter => !!chapter);
      setChapters(ordered);
      setTranslations(Object.fromEntries(loadedTranslations.map((entry) => [entry.chapterId, entry])));
      setGlossaryEntries(loadedGlossary);
    })();
    return () => {
      cancelled = true;
    };
  }, [book?.id, book?.updatedAt]);

  const totalWords = useMemo(
    () => chapters.reduce((total, chapter) => total + chapter.wordCount, 0),
    [chapters],
  );
  const translatedChapters = useMemo(
    () => chapters.filter((chapter) => isCompleteTranslation(translations[chapter.id], chapter)).length,
    [chapters, translations],
  );
  // listGlossaryEntries intentionally includes the site's built-in reference
  // terms so every translation can use them. They are not book-specific work,
  // though, so keep them out of the Full-book progress/count UI.
  const bookGlossaryEntries = useMemo(
    () => glossaryEntries.filter((entry) => entry.bookId === book?.id),
    [glossaryEntries, book?.id],
  );
  const translatedParagraphs = useMemo(
    () => chapters.reduce((total, chapter) => {
      const translation = translations[chapter.id];
      return total + (translation?.paragraphs.filter((paragraph) => paragraph?.trim()).length ?? 0);
    }, 0),
    [chapters, translations],
  );
  const totalParagraphs = useMemo(
    () => chapters.reduce((total, chapter) => total + chapter.paragraphs.length, 0),
    [chapters],
  );
  const completionPercent = totalParagraphs > 0 ? Math.round((translatedParagraphs / totalParagraphs) * 100) : 0;

  const syncBookDetails = async () => {
    if (!book) return;
    setSavingDetails(true);
    try {
      try {
        localStorage.setItem(`raynets.full-book-hint.${book.id}`, translationHint);
      } catch {
        // Non-critical: the hint still applies to this run.
      }
      const updated = await updateBook(book.id, {
        title: title.trim() || book.title,
        author: author.trim() || "Unknown",
        description,
        genre,
        tone,
        style,
        targetAudience,
        rating,
      });
      if (updated) setImportedBook(updated);
      toast.success("Editorial details saved.");
    } catch (error) {
      toast.error(`Could not save details: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setSavingDetails(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!/\.epub$/i.test(file.name) && file.type !== "application/epub+zip") {
      toast.error("Full-book mode accepts EPUB files only.");
      return;
    }
    setMessage(null);
    try {
      const nextBook = await importEpubFile(file);
      setImportedBook(nextBook);
      setSelectedBookId(nextBook.id);
      toast.success(`Loaded “${nextBook.title}”.`);
    } catch (error) {
      toast.error(`Could not open EPUB: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  };

  const makeManager = () => new TranslationManager({
    providers: settings.providers,
    preferred: fullBookProvider,
    parallelRequests: settings.parallelRequests,
    pauseOnError: settings.pauseOnError,
    quality: settings.quality,
    source: book?.language ?? settings.sourceLanguage,
    target: "en",
  });

  const runGlossaryExtraction = async () => {
    if (!book || chapters.length === 0 || glossaryBusy || busy) return;
    const config = settings.providers.find((provider) => provider.id === "gemini" && provider.enabled);
    if (!config) {
      toast.error("Enable Gemini and add an API key in Settings to extract a glossary.");
      return;
    }
    setGlossaryBusy(true);
    setGlossaryPaused(false);
    glossaryStopRef.current = false;
    setGlossaryProgress({ done: 0, total: 0, saved: 0, errors: 0 });
    try {
      const result = await extractFullBookGlossary({
        bookId: book.id,
        chapters,
        config,
        chunkChars: settings.glossaryChunkSize ?? 4000,
        delayMs: settings.glossaryChunkDelayMs ?? 3000,
        shouldPause: () => pausedRef.current || glossaryStopRef.current,
        onProgress: (next) => {
          if (mountedRef.current) {
            setGlossaryProgress({ ...next, errors: next.chunkErrors });
          }
        },
      });
      const fresh = await listGlossaryEntries(book.id);
      setGlossaryEntries(fresh);
      toast.success(`Glossary ready — ${result.saved} new entr${result.saved === 1 ? "y" : "ies"} extracted.`);
      if (result.errors > 0) setMessage(`${result.errors} glossary chunk${result.errors === 1 ? "" : "s"} could not be analyzed. You can run extraction again.`);
    } catch (error) {
      toast.error(`Glossary extraction failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      if (mountedRef.current) {
        setGlossaryBusy(false);
        setGlossaryPaused(false);
        glossaryStopRef.current = false;
      }
    }
  };

  const toggleGlossaryPause = () => {
    if (!glossaryBusy) return;
    const next = !glossaryPaused;
    glossaryStopRef.current = next;
    setGlossaryPaused(next);
  };

  const runFullTranslation = async () => {
    if (!book || chapters.length === 0 || busy || glossaryBusy) return;
    setBusy(true);
    setPaused(false);
    pausedRef.current = false;
    stopRef.current = false;
    setMessage(null);
    const manager = makeManager();
    managerRef.current = manager;
    try {
      for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
        if (stopRef.current) break;
        const chapter = chapters[chapterIndex];
        if (isCompleteTranslation(translations[chapter.id], chapter)) continue;

        setProgress({ chapterIndex, chapterTotal: chapters.length, paragraphDone: 0, paragraphTotal: chapter.paragraphs.length, provider: null });
        const result = await manager.translateChapter({
          paragraphs: chapter.paragraphs,
          contextHint: buildTranslationContext({
            book,
            genre,
            tone,
            style,
            targetAudience,
            rating,
            translationHint,
          }),
          glossary: glossaryEntries.length ? glossaryEntries : undefined,
          onProgress: (next) => {
            if (mountedRef.current) {
              setProgress({
                chapterIndex,
                chapterTotal: chapters.length,
                paragraphDone: next.done,
                paragraphTotal: next.total,
                provider: next.provider,
              });
            }
          },
          onPartialRows: (rows) => {
            if (!mountedRef.current) return;
            const partial = makeTranslation(book.id, chapter, rows, "in_progress", null);
            void saveTranslation(partial).catch(() => undefined);
            setTranslations((current) => ({ ...current, [chapter.id]: partial }));
          },
        });
        const finalTranslation = makeTranslation(
          book.id,
          chapter,
          result.rows,
          result.failed ? "error" : "completed",
          result.provider,
          result.failed ? result.error : undefined,
        );
        await saveTranslation(finalTranslation);
        if (!mountedRef.current) return;
        setTranslations((current) => ({ ...current, [chapter.id]: finalTranslation }));
        if (result.failed) {
          setMessage(`“${chapter.title}” needs attention: ${result.error ?? "the provider returned an incomplete result"}`);
          if (settings.pauseOnError) break;
        }
      }
      notifyLibraryChanged();
      if (!stopRef.current && mountedRef.current) {
        toast.success("Full-book translation complete. Your EPUB is ready to export.");
      } else if (mountedRef.current) {
        setMessage("Translation stopped after the current chapter. You can resume safely.");
      }
    } catch (error) {
      if (mountedRef.current) setMessage(`Translation stopped: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      if (mountedRef.current) {
        setBusy(false);
        setPaused(false);
        pausedRef.current = false;
        setProgress(null);
      }
    }
  };

  const togglePause = () => {
    const manager = managerRef.current;
    if (!manager) return;
    if (pausedRef.current) {
      manager.resume();
      pausedRef.current = false;
      setPaused(false);
    } else {
      manager.pause();
      pausedRef.current = true;
      setPaused(true);
    }
  };

  const stopAfterChapter = () => {
    stopRef.current = true;
    const manager = managerRef.current;
    if (manager?.isPaused()) manager.resume();
    pausedRef.current = false;
    setPaused(false);
  };

  const exportBook = async () => {
    if (!book || chapters.length === 0 || busy) return;
    if (translatedChapters !== chapters.length) {
      const remaining = chapters.length - translatedChapters;
      toast.error(`${remaining} chapter${remaining === 1 ? "" : "s"} still need a complete translation.`);
      return;
    }
    const exportBookDetails: Book = {
      ...book,
      title: title.trim() || book.title,
      author: author.trim() || book.author,
      description,
      genre,
      tone,
      style,
      targetAudience,
      rating,
    };
    try {
      const map = new Map<string, (string | null)[]>();
      for (const chapter of chapters) map.set(chapter.id, translations[chapter.id]?.paragraphs ?? []);
      const blob = await buildTranslatedEpub({ book: exportBookDetails, chapters, translations: map });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${exportBookDetails.title} (English).epub`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Translated EPUB downloaded.");
    } catch (error) {
      toast.error(`Export failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  };

  return (
    <StudioShell>
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10 pt-8 pb-20">
        <div role="alert" className="mb-8 flex items-start gap-3 border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3.5 text-amber-100">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-300" strokeWidth={1.5} />
          <div className="text-sm leading-relaxed">
            <strong className="font-medium text-amber-200">In development — use at your own risk.</strong>{" "}
            Full-book translation has not been tested on enough books yet. Review the output carefully, keep a backup of your source EPUB, and expect occasional incomplete or inconsistent translations.
          </div>
        </div>
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <button
              type="button"
              onClick={() => navigate("/library")}
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.3} /> Back to library
            </button>
            <div className="flex items-center gap-2 mt-5 text-xs text-accent uppercase tracking-[0.18em]">
              <WandSparkles className="w-3.5 h-3.5" strokeWidth={1.5} /> Production desk
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl mt-2 tracking-tight">Book Translation Lab</h1>
            <p className="text-muted-foreground mt-3 max-w-[62ch] leading-relaxed">
              Prepare the whole novel first, then translate it as a single editorial project. No chapter-by-chapter reading required.
            </p>
          </div>
          {book && (
            <div className="flex flex-wrap items-center gap-2">
              {glossaryBusy && (
                <button type="button" onClick={toggleGlossaryPause} className="h-10 px-3 inline-flex items-center gap-2 border border-border hover:border-foreground/40 text-sm">
                  {glossaryPaused ? <Play className="w-4 h-4" strokeWidth={1.4} /> : <Pause className="w-4 h-4" strokeWidth={1.4} />}
                  {glossaryPaused ? "Resume glossary" : "Pause glossary"}
                </button>
              )}
              {busy && (
                <button type="button" onClick={togglePause} className="h-10 px-3 inline-flex items-center gap-2 border border-border hover:border-foreground/40 text-sm">
                  {paused ? <Play className="w-4 h-4" strokeWidth={1.4} /> : <Pause className="w-4 h-4" strokeWidth={1.4} />}
                  {paused ? "Resume" : "Pause"}
                </button>
              )}
              {busy && (
                <button type="button" onClick={stopAfterChapter} className="h-10 px-3 inline-flex items-center gap-2 border border-destructive/30 text-destructive hover:border-destructive/60 text-sm">
                  <Square className="w-3.5 h-3.5" strokeWidth={1.4} /> Stop after chapter
                </button>
              )}                <button type="button" disabled={translatedChapters !== chapters.length || busy} onClick={() => void exportBook()} className="h-10 px-4 inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 text-sm">
                <Download className="w-4 h-4" strokeWidth={1.4} /> Export EPUB
              </button>
            </div>
          )}
        </header>

        {!book ? (
          <EmptyBookState
            inputRef={fileInputRef}
            dragActive={dragActive}
            setDragActive={setDragActive}
            onFile={handleFile}
            onUseExisting={(id) => setSelectedBookId(id)}
            books={books}
          />
        ) : (
          <div className="mt-10 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
            <main className="space-y-6">
              <section className="border border-border/60 bg-card/40 p-5 sm:p-7">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-14 h-18 shrink-0 border border-border bg-muted/40 overflow-hidden grid place-items-center">
                      {book.coverDataUrl ? <img src={book.coverDataUrl} alt="" className="w-full h-full object-cover" /> : <BookOpen className="w-6 h-6 text-muted-foreground" strokeWidth={1.2} />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Source volume</div>
                      <h2 className="font-display text-2xl mt-1 truncate">{book.title}</h2>
                      <p className="text-sm text-muted-foreground mt-1">{book.author} · {chapters.length} chapters · {totalWords.toLocaleString()} words</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setSelectedBookId(null); setImportedBook(null); }} className="shrink-0 text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.4} /> Choose another
                  </button>
                </div>
                <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/60 border border-border/60">
                  <Metric label="Chapters" value={`${chapters.length}`} />
                  <Metric label="Book glossary terms" value={`${bookGlossaryEntries.length}`} />
                  <Metric label="Translated" value={`${completionPercent}%`} />
                  <Metric label="Status" value={busy ? (paused ? "Paused" : "Working") : translatedChapters === chapters.length ? "Complete" : "Ready"} />
                </div>
                {(busy || translatedChapters > 0) && (
                  <div className="mt-5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{progress ? `Chapter ${(progress.chapterIndex + 1).toLocaleString()} of ${progress.chapterTotal}` : "Book progress"}</span>
                      <span>{completionPercent}%</span>
                    </div>
                    <div className="mt-2 h-2 bg-muted overflow-hidden"><div className="h-full bg-foreground transition-all duration-500" style={{ width: `${completionPercent}%` }} /></div>
                    {progress && <div className="mt-2 text-xs text-muted-foreground">{progress.paragraphDone} / {progress.paragraphTotal} paragraphs · {progress.provider ?? "starting"}</div>}
                  </div>
                )}
              </section>

              <section className="border border-border/60 p-5 sm:p-7">
                <SectionTitle eyebrow="Editorial brief" title="Give the translator a north star" icon={<FileText className="w-4 h-4" strokeWidth={1.4} />} />
                <p className="text-sm text-muted-foreground leading-relaxed max-w-[70ch]">These details are sent with every chapter so names, voice, pacing, and content boundaries stay consistent across the finished book.</p>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextField label="Book title" value={title} onChange={setTitle} />
                  <TextField label="Author" value={author} onChange={setAuthor} />
                  <TextField label="Genre" value={genre} onChange={setGenre} placeholder="xianxia, romance, thriller…" />
                  <TextField label="Tone" value={tone} onChange={setTone} placeholder="lyrical, dark, playful…" />
                  <TextField label="Style" value={style} onChange={setStyle} placeholder="literary, web novel, fast-paced…" />
                  <TextField label="Target audience" value={targetAudience} onChange={setTargetAudience} placeholder="adult fantasy readers…" />
                </div>
                <label className="block mt-4"><span className="text-xs text-muted-foreground">Description / editorial synopsis</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="mt-1 w-full resize-y bg-muted/30 border border-border focus:border-foreground focus:bg-background outline-none p-3 text-sm leading-relaxed" placeholder="What should the translator understand about this story?" /></label>
                <div className="mt-5">
                  <div className="text-xs text-muted-foreground mb-2">Content rating</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {RATING_OPTIONS.map((option) => <button key={option.value} type="button" title={option.description} aria-pressed={rating === option.value} onClick={() => setRating(rating === option.value ? "" : option.value)} className={cn("p-3 text-left border transition-colors", rating === option.value ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground/40")}><div className="text-sm">{option.label}</div><div className={cn("text-[10px] mt-1 leading-relaxed", rating === option.value ? "text-background/70" : "text-muted-foreground")}>{option.description}</div></button>)}
                  </div>
                </div>
                <div className="mt-5 flex justify-end"><button type="button" disabled={savingDetails} onClick={() => void syncBookDetails()} className="h-10 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40 disabled:opacity-50 text-sm">{savingDetails ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.4} /> : <Check className="w-4 h-4" strokeWidth={1.4} />} Save editorial details</button></div>
              </section>

              <section className="border border-border/60 p-5 sm:p-7">
                <SectionTitle eyebrow="Translation direction" title="Add a persistent hint" icon={<Info className="w-4 h-4" strokeWidth={1.4} />} />
                <p className="text-sm text-muted-foreground leading-relaxed max-w-[70ch]">Use this for rules that do not fit into genre or tone: preferred name spellings, tense, dialect, localization choices, or things the model must never do.</p>
                <textarea value={translationHint} onChange={(event) => {
                  const value = event.target.value;
                  setTranslationHint(value);
                  try {
                    localStorage.setItem(`raynets.full-book-hint.${book.id}`, value);
                  } catch {
                    // Non-critical: the hint still applies to this run.
                  }
                }} rows={5} className="mt-5 w-full resize-y bg-muted/30 border border-border focus:border-foreground focus:bg-background outline-none p-3 text-sm leading-relaxed" placeholder="Example: Keep cultivation ranks in Title Case. Use American English. Preserve honorifics naturally. Never translate the sect name as a literal phrase." />
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground"><HintChip onClick={() => setTranslationHint((value) => `${value}${value ? "\n" : ""}Preserve character voice and relationship dynamics in dialogue.`)} label="Character voice" /><HintChip onClick={() => setTranslationHint((value) => `${value}${value ? "\n" : ""}Adapt idioms into natural English rather than translating them word-for-word.`)} label="Natural idioms" /><HintChip onClick={() => setTranslationHint((value) => `${value}${value ? "\n" : ""}Keep recurring names and terms consistent with the glossary.`)} label="Glossary consistency" /></div>
              </section>
            </main>

            <aside className="space-y-6 xl:sticky xl:top-24">
              <section className="border border-border/60 p-5">
                <SectionTitle eyebrow="Step 01" title="Extract the glossary" icon={<Sparkles className="w-4 h-4" strokeWidth={1.4} />} />
                <p className="text-sm text-muted-foreground leading-relaxed">Gemini scans the entire book in safe chunks and saves character names, locations, slang, and difficult terms before translation begins.</p>
                <button type="button" disabled={glossaryBusy || busy} onClick={() => void runGlossaryExtraction()} className="mt-5 w-full h-11 inline-flex items-center justify-center gap-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 text-sm">{glossaryBusy ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.4} /> : <Sparkles className="w-4 h-4" strokeWidth={1.4} />}{glossaryBusy ? "Extracting…" : glossaryEntries.length ? "Refresh glossary" : "Extract glossary"}</button>
                {glossaryBusy && <ProgressLine done={glossaryProgress.done} total={glossaryProgress.total} label={`${glossaryProgress.saved} terms saved`} />}
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{bookGlossaryEntries.length} book-specific terms · built-in reference terms are also used</span><button type="button" onClick={() => navigate(`/library/${book.id}/glossary`)} className="underline hover:text-foreground">Open glossary</button></div>
              </section>

              <section className="border border-border/60 p-5">
                <SectionTitle eyebrow="Translation engine" title="Choose Gemini or DeepSeek" icon={<Languages className="w-4 h-4" strokeWidth={1.4} />} />
                <p className="text-sm text-muted-foreground leading-relaxed">Pick the primary provider for this run. The other enabled provider can take over when the primary provider fails. This choice only affects Full-book mode.</p>
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Full-book translation provider">
                  <ProviderChoice
                    id="deepseek"
                    label="DeepSeek"
                    description="Local proxy · no API key"
                    ready={providerReady("deepseek")}
                    deepSeekConnection={deepSeekConnection}
                    selected={fullBookProvider === "deepseek"}
                    onSelect={() => setFullBookProvider("deepseek")}
                  />
                  <ProviderChoice
                    id="gemini"
                    label="Gemini"
                    description="Google API key required"
                    ready={providerReady("gemini")}
                    selected={fullBookProvider === "gemini"}
                    onSelect={() => setFullBookProvider("gemini")}
                  />
                </div>
                {!selectedProviderReady && <p className="mt-3 text-xs text-amber-200/80">Configure the selected provider in Settings before starting. Full-book translation will not silently run without a usable primary engine.</p>}
                <button type="button" disabled={busy || glossaryBusy || chapters.length === 0 || !selectedProviderReady} onClick={() => void runFullTranslation()} className="mt-5 w-full h-12 inline-flex items-center justify-center gap-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 text-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.4} /> : <WandSparkles className="w-4 h-4" strokeWidth={1.4} />}{busy ? paused ? "Translation paused" : "Translating book…" : translatedChapters === chapters.length ? "Translate again" : "Start full-book translation"}</button>
                {message && <div className="mt-4 border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/80 leading-relaxed">{message}</div>}
              </section>

              <section className="border border-border/60 bg-muted/20 p-5">
                <div className="flex items-start gap-3"><Info className="w-4 h-4 mt-0.5 text-muted-foreground" strokeWidth={1.4} /><div><div className="text-sm font-medium">No reading required</div><p className="mt-1 text-xs text-muted-foreground leading-relaxed">This workspace is intentionally batch-first. Use the Library reader later for review, edits, hints, and listening.</p></div></div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </StudioShell>
  );
}

function EmptyBookState(props: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  dragActive: boolean;
  setDragActive: (active: boolean) => void;
  onFile: (file: File) => void;
  onUseExisting: (id: string) => void;
  books: Book[];
}) {
  return (
    <div className="mt-12 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
      <section
        role="button"
        tabIndex={0}
        aria-label="Upload an EPUB for full-book translation"
        onClick={() => props.inputRef.current?.click()}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.inputRef.current?.click(); } }}
        onDragEnter={(event) => { event.preventDefault(); props.setDragActive(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => props.setDragActive(false)}
        onDrop={(event) => { event.preventDefault(); props.setDragActive(false); const file = event.dataTransfer.files[0]; if (file) void props.onFile(file); }}
        className={cn("min-h-[380px] border border-dashed p-8 sm:p-14 grid place-items-center text-center cursor-pointer transition-all", props.dragActive ? "border-foreground bg-accent/20 scale-[1.01]" : "border-border hover:border-foreground/50 hover:bg-muted/20")}
      >
        <input ref={props.inputRef} type="file" accept=".epub,application/epub+zip" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void props.onFile(file); event.currentTarget.value = ""; }} />
        <div>
          <div className="w-16 h-16 mx-auto border border-border grid place-items-center"><Upload className="w-7 h-7 text-muted-foreground" strokeWidth={1.2} /></div>
          <h2 className="font-display text-3xl mt-6">Bring the whole book</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-[42ch] mx-auto leading-relaxed">Drop an EPUB here or browse your device. Full-book mode parses the entire spine and prepares it for one controlled translation run.</p>
          <div className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground"><FolderOpen className="w-3.5 h-3.5" strokeWidth={1.4} /> Choose EPUB</div>
        </div>
      </section>
      <aside className="border border-border/60 p-5 sm:p-6">
        <div className="text-xs uppercase tracking-[0.16em] text-accent">Already in the library?</div>
        <h2 className="font-display text-2xl mt-2">Continue a volume</h2>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">Pick an imported EPUB and move straight into the production desk.</p>
        <div className="mt-5 space-y-2 max-h-64 overflow-y-auto thin-scrollbar">
          {props.books.length === 0 ? <div className="text-sm text-muted-foreground border border-border/50 p-3">No EPUBs yet.</div> : props.books.map((book) => <button type="button" key={book.id} onClick={() => props.onUseExisting(book.id)} className="w-full text-left p-3 border border-border/50 hover:border-foreground/40 transition-colors"><div className="text-sm font-medium truncate">{book.title}</div><div className="text-xs text-muted-foreground mt-1 truncate">{book.author}</div></button>)}
        </div>
      </aside>
    </div>
  );
}

function SectionTitle({ eyebrow, title, icon }: { eyebrow: string; title: string; icon: React.ReactNode }) {
  return <div className="flex items-start gap-3 mb-4"><div className="w-8 h-8 border border-border grid place-items-center text-muted-foreground">{icon}</div><div><div className="text-[10px] uppercase tracking-[0.18em] text-accent">{eyebrow}</div><h2 className="text-xl font-semibold mt-0.5">{title}</h2></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="bg-background p-3 sm:p-4"><div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</div><div className="font-mono text-lg mt-1 tabular-nums">{value}</div></div>;
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block"><span className="text-xs text-muted-foreground">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 w-full bg-muted/30 border border-border focus:border-foreground focus:bg-background outline-none px-3 py-2.5 text-sm" /></label>;
}

function HintChip({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="px-2.5 py-1.5 border border-border/60 hover:border-foreground/40 transition-colors">+ {label}</button>;
}

function ProviderChoice({
  id,
  label,
  description,
  ready,
  deepSeekConnection,
  selected,
  onSelect,
}: {
  id: FullBookProvider;
  label: string;
  description: string;
  ready: boolean;
  deepSeekConnection?: "checking" | "connected" | "not-connected";
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "min-w-0 w-full text-left border p-3 transition-colors",
        selected ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40",
        !ready && !selected ? "opacity-60" : "",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-w-0">
        <span className="min-w-0 break-words text-sm font-medium">{label}</span>
        <span className={cn("shrink-0 text-[10px] uppercase tracking-[0.12em]", selected ? "text-background/70" : ready ? "text-emerald-400" : "text-amber-300")}>
          {id === "deepseek"
            ? deepSeekConnection === "checking"
              ? "Checking…"
              : deepSeekConnection === "connected"
                ? "Connected"
                : "Not connected"
            : ready ? "Key ready" : "Needs setup"}
        </span>
      </div>
      <div className={cn("mt-1 min-w-0 break-words whitespace-normal text-xs", selected ? "text-background/70" : "text-muted-foreground")}>{description}</div>
    </button>
  );
}

function ProgressLine({ done, total, label }: { done: number; total: number; label: string }) {
  const percent = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  return <div className="mt-4"><div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>{done} / {total || "…"} chunks</span><span>{label}</span></div><div className="mt-2 h-1 bg-muted"><div className="h-full bg-foreground transition-all" style={{ width: `${percent}%` }} /></div></div>;
}

function makeTranslation(
  bookId: string,
  chapter: Chapter,
  rows: (string | null)[],
  status: ChapterTranslation["status"],
  provider: ChapterTranslation["provider"],
  error?: string,
): ChapterTranslation {
  const paragraphs = chapter.paragraphs.map((source, index) => {
    const translated = rows[index];
    return translated?.trim() && translated.trim() !== source.trim() ? translated : null;
  });
  return {
    id: `${bookId}:${chapter.id}`,
    bookId,
    chapterId: chapter.id,
    paragraphs,
    status,
    provider,
    progress: paragraphs.filter((paragraph) => paragraph?.trim()).length / Math.max(1, paragraphs.length),
    completedAt: status === "completed" ? Date.now() : undefined,
    error,
  };
}

function isCompleteTranslation(translation: ChapterTranslation | undefined, chapter: Chapter): boolean {
  return !!translation && translation.status === "completed" && translation.paragraphs.length === chapter.paragraphs.length && translation.paragraphs.every((paragraph) => !!paragraph?.trim());
}

function buildTranslationContext(args: {
  book: Book;
  genre: string;
  tone: string;
  style: string;
  targetAudience: string;
  rating: ContentRating;
  translationHint: string;
}): string {
  const lines = [
    `Full-book literary translation for “${args.book.title}”.`,
    args.genre && `Genre: ${args.genre}.`,
    args.tone && `Tone: ${args.tone}.`,
    args.style && `Style: ${args.style}.`,
    args.targetAudience && `Target audience: ${args.targetAudience}.`,
    args.rating && `Content rating: ${args.rating}.`,
    args.translationHint.trim() && `Translator's standing instructions: ${args.translationHint.trim()}`,
    "Translate this chapter as part of one continuous book. Preserve names, terminology, voice, tense, and narrative continuity across chapters. Return only the translated paragraphs in order.",
  ];
  return lines.filter(Boolean).join("\n");
}
