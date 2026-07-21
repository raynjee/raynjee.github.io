/* ImportTranslations — receives scraped chapter data from the bookmarklet
 * and matches it to a book's raw chapters for one-click importing.
 *
 * The bookmarklet sends data via URL hash: /#/import?data=<base64json>
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Loader2,
  X,
  ChevronDown,
  Bookmark,
  Globe,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { StudioShell } from "@/components/StudioShell";
import { useLibrary, saveTranslation } from "@/hooks/use-library";
import { listChapters } from "@/lib/db";
import type { Chapter, ChapterTranslation } from "@/lib/types";
import { SCENE_BREAK } from "@/lib/text-import";
import { cn } from "@/lib/utils";

interface ScrapedChapter {
  title: string;
  paragraphs: string[];
}

interface ImportData {
  chapters: ScrapedChapter[];
  source: string;
}

// Self-contained bookmarklet — fetched from the static file at runtime.
// Edit public/bookmarklet-slim.js then run the minify script to update.
// We fetch it instead of importing because Vite can't ?raw-import .js files from public/.
const BOOKMARKLET_BOOTSTRAP = `javascript:fetch('https://raynjee.github.io/bookmarklet.js').then(r=>r.text()).then(eval)`;
const BOOKMARKLET_FULL_FALLBACK = BOOKMARKLET_BOOTSTRAP; // shown while loading

export default function ImportTranslationsPage() {
  const navigate = useNavigate();
  const { books, refresh } = useLibrary();
  const [data, setData] = useState<ImportData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Fetch the bookmarklet code from the static file at runtime
  const [bookmarkletFull, setBookmarkletFull] = useState(BOOKMARKLET_FULL_FALLBACK);
  useEffect(() => {
    fetch('/bookmarklet-slim.min.js')
      .then(r => r.text())
      .then(code => { if (code.startsWith('javascript:')) setBookmarkletFull(code); })
      .catch(() => {}); // keep fallback
  }, []);

  // Parse data from URL on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
      const raw = params.get("data");
      if (!raw) {
        setLoading(false);
        return;
      }
      // Try both encoding schemes:
      // Scheme 1 (new slim bookmarklet): btoa(bytes) where bytes = encodeURIComponent(JSON).replace(/%XX/g, chr)
      // Scheme 2 (old bookmarklet): btoa(unescape(encodeURIComponent(JSON)))
      let json: string;
      try {
        const bytes = atob(raw);
        let pct = '';
        for (let i = 0; i < bytes.length; i++) {
          const hex = bytes.charCodeAt(i).toString(16).padStart(2, '0');
          pct += '%' + hex;
        }
        json = decodeURIComponent(pct);
      } catch {
        // Fallback: old scheme using unescape
        try {
          json = decodeURIComponent((function(s: string) {
            return s.replace(/%([0-9A-F]{2})/g, function(_, p) {
              return String.fromCharCode(parseInt(p, 16));
            });
          })(escape(atob(raw))));
        } catch {
          throw new Error('decode failed');
        }
      }
      const parsed = JSON.parse(json) as ImportData;
      if (!parsed.chapters?.length) {
        setError("No chapters found in the import data.");
        setLoading(false);
        return;
      }
      setData(parsed);
      setLoading(false);
    } catch (e) {
      setError("Could not decode import data. It may be corrupt or too large.");
      setLoading(false);
    }
  }, []);

  // Selected book + starting chapter index
  const [selectedBookId, setSelectedBookId] = useState("");
  const [startChapterIdx, setStartChapterIdx] = useState(0);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);

  // Load chapters for the selected book
  const [rawChapters, setRawChapters] = useState<Chapter[]>([]);
  const selectedBook = books.find((b) => b.id === selectedBookId);

  useEffect(() => {
    if (!selectedBookId) { setRawChapters([]); return; }
    listChapters(selectedBookId).then((list) => {
      const book = books.find((b) => b.id === selectedBookId);
      if (!book) { setRawChapters(list); return; }
      setRawChapters(book.chapterOrder.map((id) => list.find((c) => c.id === id)).filter((x): x is Chapter => !!x));
    });
  }, [selectedBookId, books]);

  // Match preview: show which scraped chapters map to which raw chapters
  const matchPreview = useMemo(() => {
    if (!data || rawChapters.length === 0) return [];
    const preview: { scrapedIdx: number; scrapedTitle: string; paras: number;
      rawTitle: string | null; rawParas: number | null; match: "ok" | "mismatch" | "no-raw" }[] = [];
    for (let i = 0; i < data.chapters.length; i++) {
      const rawIdx = startChapterIdx + i;
      const raw = rawChapters[rawIdx];
      const scraped = data.chapters[i];
      preview.push({
        scrapedIdx: i,
        scrapedTitle: scraped.title,
        paras: scraped.paragraphs.length,
        rawTitle: raw?.title ?? null,
        rawParas: raw?.paragraphs.filter((p) => p !== SCENE_BREAK && p.trim()).length ?? null,
        match: !raw ? "no-raw"
          : Math.abs(scraped.paragraphs.length - (raw.paragraphs.filter((p) => p !== SCENE_BREAK && p.trim()).length)) <= 3
          ? "ok" : "mismatch",
      });
    }
    return preview;
  }, [data, rawChapters, startChapterIdx]);

  const onImport = useCallback(async () => {
    if (!data || !selectedBookId || rawChapters.length === 0) return;
    setImporting(true);
    let count = 0;
    for (let i = 0; i < data.chapters.length; i++) {
      const rawIdx = startChapterIdx + i;
      const raw = rawChapters[rawIdx];
      if (!raw) break;
      const scraped = data.chapters[i];
      const paragraphs: (string | null)[] = raw.paragraphs.map((p, pi) => {
        if (p === SCENE_BREAK) return null;
        const sIdx = raw.paragraphs.slice(0, pi).filter((x) => x !== SCENE_BREAK).length;
        const translation = scraped.paragraphs[sIdx]?.trim();
        return translation && translation !== p.trim() ? translation : null;
      });
      const tr: ChapterTranslation = {
        id: `${selectedBookId}:${raw.id}`,
        bookId: selectedBookId,
        chapterId: raw.id,
        paragraphs,
        status: paragraphs.some((p) => p) ? "completed" : "idle",
        provider: "manual",
        progress: paragraphs.filter((p) => p).length / Math.max(1, paragraphs.length),
        completedAt: Date.now(),
      };
      try {
        await saveTranslation(tr);
        count++;
        setImported(count);
      } catch (e) {
        toast.error(`Failed to save chapter "${raw.title}": ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
    setImporting(false);
    await refresh();
    toast.success(`Imported ${count} chapter${count !== 1 ? "s" : ""}.`);
    navigate("/library");
  }, [data, selectedBookId, rawChapters, startChapterIdx, refresh, navigate]);

  const hasData = !!data || !!error;
  const [howToOpen, setHowToOpen] = useState(!hasData);

  // ── Paste import (no bookmarklet needed) ────────────────────────
  const [pasteText, setPasteText] = useState("");
  const [pasteParsing, setPasteParsing] = useState(false);

  const parsePastedChapters = useCallback((text: string): ScrapedChapter[] => {
    if (!text.trim()) return [];
    // Detect chapter boundaries:
    // "Chapter 1", "Ch. 1", "Chapter 1: Title", "1. Title", "Vol 1 Ch 1"
    // Also: "---", "***", blank-line-separated sections
    const chapterPatterns = [
      /^(?:Chapter|Ch\.?|CH)\s*\d+/im,
      /^\d+[\.\)\-]\s+\S/m,
      /^Vol(?:ume)?\s*\d+\s*(?:Ch|Chapter)\s*\d+/im,
    ];
    const lines = text.split(/\n/);
    const chapters: { title: string; lines: string[] }[] = [];
    let current: { title: string; lines: string[] } | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      // Check if this line is a chapter header
      const isHeader = chapterPatterns.some((p) => p.test(line));
      if (isHeader && (!current || current.lines.length > 0)) {
        if (current && current.lines.length > 0) {
          chapters.push(current);
        }
        current = { title: line.replace(/^[\s\-–—]+|[\s\-–—]+$/g, ""), lines: [] };
        continue;
      }
      if (current) {
        current.lines.push(line);
      } else {
        // No chapter header found yet — start one
        current = { title: "Untitled", lines: [line] };
      }
    }
    if (current && current.lines.length > 0) chapters.push(current);

    // If no chapters detected, treat entire paste as one chapter
    if (chapters.length === 0 && text.trim()) {
      chapters.push({ title: "Pasted text", lines: text.trim().split(/\n/).filter((l) => l.trim()) });
    }

    // Convert lines to paragraph arrays, filtering very short lines
    return chapters.map((c) => ({
      title: c.title,
      paragraphs: c.lines.filter((l) => l.length > 5),
    })).filter((c) => c.paragraphs.length > 0);
  }, []);

  const handlePasteImport = useCallback(() => {
    setPasteParsing(true);
    const chapters = parsePastedChapters(pasteText);
    if (chapters.length === 0) {
      toast.error("No chapters detected. Make sure your text includes chapter titles like 'Chapter 1' or 'Ch. 1'.");
      setPasteParsing(false);
      return;
    }
    const importData: ImportData = { chapters, source: "pasted text" };
    setData(importData);
    setError("");
    setPasteParsing(false);
    toast.success(`Detected ${chapters.length} chapter${chapters.length !== 1 ? "s" : ""}.`);
  }, [pasteText, parsePastedChapters]);

  // Clipboard helper — falls back from async API to legacy execCommand for iOS Safari
  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied!`);
    } catch {
      // Fallback for iOS Safari / older browsers
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast.success(`${label} copied!`);
      } catch {
        toast.error("Failed to copy — select the text manually.");
      }
    }
  }, []);

  if (loading) {
    return (
      <StudioShell>
        <div className="mx-auto max-w-[900px] px-6 lg:px-10 pt-24 text-center">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" strokeWidth={1.4} />
          <p className="mt-4 text-muted-foreground text-sm">Decoding import data…</p>
        </div>
      </StudioShell>
    );
  }

  return (
    <StudioShell>
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-10 pt-6 sm:pt-10 pb-32">
        <button
          className="text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-4"
          onClick={() => navigate("/library")}
        >
          ← Back to library
        </button>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="studio-caps text-muted-foreground">Import translations</div>
        {hasData ? (
          <>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl mt-1 tracking-tight">
              {data ? `${data.chapters.length} chapter${data.chapters.length !== 1 ? "s" : ""} scraped` : "Import error"}
            </h1>
            {data && (
              <p className="text-xs text-muted-foreground mt-2 truncate max-w-[60ch]">
                From: {data.source}
              </p>
            )}
            {error && (
              <p className="text-sm text-muted-foreground mt-2 max-w-[58ch]">{error}</p>
            )}
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl mt-1 tracking-tight">
              Grab chapters from the web
            </h1>
            <p className="text-muted-foreground mt-2 text-sm max-w-[58ch] leading-relaxed">
              Use the bookmarklet on any novel site to scrape translated chapters,
              then come back here to import them into your books. One tap — no copy-paste.
            </p>
          </>
        )}

        {/* ── Paste import (always available, no bookmarklet needed) ── */}
        {!data && (
          <div className="mt-8 studio-card p-4 sm:p-5">
            <div className="studio-caps text-muted-foreground mb-2">Paste translated chapters</div>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed max-w-[58ch]">
              Copy the translated text from any novel site — one chapter or many.
              The app auto-detects chapter titles like "Chapter 1", "Ch. 2", "1. Title", etc.
              <strong> Works on every site, every browser — no bookmarklet needed.</strong>
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`Paste translated chapters here...\n\nChapter 1: The Fall\nThe sky was dark and brooding...\nHe walked through the gates...\n\nChapter 2: The Rebirth\nLight flooded the chamber...`}
              className="w-full min-h-[200px] bg-muted/50 border border-border focus:border-foreground outline-none px-4 py-3 rounded text-sm transition-colors resize-y font-mono leading-relaxed"
              rows={8}
            />
            <div className="flex items-center gap-3 mt-3">
              <button
                type="button"
                disabled={!pasteText.trim() || pasteParsing}
                onClick={handlePasteImport}
                className="h-10 px-5 inline-flex items-center gap-2 rounded-lg bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 active:scale-[0.97] transition-all font-medium text-sm"
              >
                {pasteParsing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.4} />
                    Parsing…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" strokeWidth={1.4} />
                    Detect chapters
                  </>
                )}
              </button>
              {pasteText.trim() && (
                <button
                  type="button"
                  onClick={() => setPasteText("")}
                  className="h-10 px-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Tip: On iPhone, use Safari's <strong>Reader Mode</strong> (tap the Aa icon) to get clean, ad-free text, then Copy All.
            </p>
          </div>
        )}

        {/* ── Import UI (when data is present) ──────────────────── */}
        {data && (
          <>
            {/* Book selector */}
            <div className="mt-8 space-y-4">
              <div className="studio-card p-4 sm:p-5">
                <label className="studio-caps text-muted-foreground block mb-2">Import into</label>
                <select
                  value={selectedBookId}
                  onChange={(e) => setSelectedBookId(e.target.value)}
                  className="w-full bg-muted/50 border border-border focus:border-foreground outline-none px-3 py-2.5 rounded text-sm transition-colors"
                >
                  <option value="">Select a book…</option>
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} · {b.author} · {rawChapters.length || b.chapterOrder.length} chapters
                    </option>
                  ))}
                </select>
              </div>

              {selectedBook && rawChapters.length > 0 && (
                <div className="studio-card p-4 sm:p-5">
                  <label className="studio-caps text-muted-foreground block mb-2">
                    Start matching from chapter
                  </label>
                  <select
                    value={startChapterIdx}
                    onChange={(e) => setStartChapterIdx(Number(e.target.value))}
                    className="w-full bg-muted/50 border border-border focus:border-foreground outline-none px-3 py-2.5 rounded text-sm transition-colors"
                  >
                    {rawChapters.map((c, i) => (
                      <option key={c.id} value={i}>
                        Ch {i + 1}: {c.title}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    First scraped chapter → Chapter {startChapterIdx + 1} of "{selectedBook.title}"
                  </p>
                </div>
              )}
            </div>

            {/* Match preview */}
            {selectedBook && matchPreview.length > 0 && (
              <section className="mt-8">
                <div className="studio-caps text-muted-foreground mb-3">Match preview</div>
                <div className="border border-border overflow-hidden rounded">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-border bg-muted/30 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <span className="col-span-1">#</span>
                    <span className="col-span-5">Scraped chapter</span>
                    <span className="col-span-5">Raw chapter</span>
                    <span className="col-span-1 text-center">OK?</span>
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto thin-scrollbar divide-y divide-border">
                    {matchPreview.map((m) => (
                      <div key={m.scrapedIdx} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center">
                        <span className="col-span-1 text-muted-foreground tabular-nums text-xs">
                          {m.scrapedIdx + 1}
                        </span>
                        <span className="col-span-5 truncate" title={m.scrapedTitle}>
                          {m.scrapedTitle}
                          <span className="text-muted-foreground ml-1.5 text-[10px]">({m.paras}p)</span>
                        </span>
                        <span className="col-span-5 truncate" title={m.rawTitle ?? ""}>
                          {m.rawTitle ?? <span className="text-muted-foreground italic">No raw chapter</span>}
                          {m.rawParas != null && (
                            <span className="text-muted-foreground ml-1.5 text-[10px]">({m.rawParas}p)</span>
                          )}
                        </span>
                        <span className="col-span-1 text-center">
                          {m.match === "ok" ? (
                            <Check className="w-4 h-4 inline text-green-500" strokeWidth={2} />
                          ) : m.match === "mismatch" ? (
                            <span className="text-[10px] text-orange-400 font-medium">PARA</span>
                          ) : (
                            <X className="w-3.5 h-3.5 inline text-muted-foreground/40" strokeWidth={1.5} />
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {matchPreview.some((m) => m.match === "mismatch") && (
                  <p className="mt-3 text-[11px] text-orange-400/80">
                    ⚠ Some chapters have different paragraph counts. Paragraphs will be paired 1:1 — extras skipped.
                  </p>
                )}
              </section>
            )}

            {/* Import button */}
            {selectedBook && matchPreview.length > 0 && (
              <div className="mt-8 flex items-center gap-3">
                <button
                  type="button"
                  disabled={importing}
                  onClick={onImport}
                  className="h-12 px-6 inline-flex items-center gap-2 rounded-lg bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 active:scale-[0.97] transition-all font-medium text-sm"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.4} />
                      Importing… ({imported}/{matchPreview.length})
                    </>
                  ) : (
                    <>
                      <BookOpen className="w-4 h-4" strokeWidth={1.4} />
                      Import {matchPreview.filter((m) => m.match !== "no-raw").length} chapters
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/library")}
                  className="h-12 px-4 inline-flex items-center gap-2 rounded-lg border border-border/50 hover:bg-muted transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Tutorial section ──────────────────────────────────── */}
        <div className="mt-10">
          <button
            type="button"
            onClick={() => setHowToOpen((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Bookmark className="w-4 h-4" strokeWidth={1.4} />
            <span>{howToOpen ? "Hide" : "Show"} tutorial — How to grab chapters</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", howToOpen && "rotate-180")} strokeWidth={1.4} />
          </button>

          {howToOpen && (
            <div className="mt-6 space-y-10">
              {/* ── Section 1: Install the bookmarklet ───────────── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold">1</span>
                  <h2 className="text-base font-semibold">Install the bookmarklet (once)</h2>
                </div>

                <p className="text-sm text-muted-foreground mb-5 leading-relaxed max-w-[58ch]">
                  A bookmarklet is a bookmark that runs code instead of opening a URL. Install once — works forever.
                  <strong>Two versions below:</strong> pick the one for your browser.
                </p>

                {/* ⚠️ Critical warning */}
                <div className="border border-orange-400/30 bg-orange-400/5 rounded-lg p-4 mb-5">
                  <div className="flex gap-3">
                    <span className="text-lg shrink-0">⚠️</span>
                    <div className="text-sm leading-relaxed">
                      <p className="font-medium text-foreground mb-1">Do NOT paste into the address bar!</p>
                      <p className="text-muted-foreground">
                        Mobile browsers block <code className="font-mono text-[10px]">javascript:</code> in the address bar.
                        You MUST save it as a <strong>bookmark</strong> (follow the steps below), then tap the bookmark
                        from your bookmarks menu while on the novel site.
                      </p>
                    </div>
                  </div>
                </div>

                {/* iPhone instructions */}
                <div className="border border-border rounded-lg p-4 sm:p-5 mb-4">
                  <h3 className="text-sm font-medium mb-3">📱 iPhone / iPad — Safari</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">Use the <strong>Full version</strong> below.</p>
                  <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside leading-relaxed">
                    <li>Open <strong>Safari</strong> (not Chrome or Edge — those can't run bookmarklets on iPhone)</li>
                    <li>Go to <strong>any website</strong> (e.g. google.com) — it doesn't matter which</li>
                    <li>Tap the <strong>Share</strong> button <span className="text-foreground">↑</span> (square with arrow)</li>
                    <li>Scroll down → tap <strong>"Add Bookmark"</strong> → tap <strong>Save</strong></li>
                    <li>Tap the <strong>Bookmarks icon</strong> 📖 (open book icon at bottom)</li>
                    <li>Find the bookmark you just made → tap <strong>Edit</strong> (bottom right)</li>
                    <li>Tap the bookmark → rename it to <strong>"Grab Chapters"</strong></li>
                    <li>Delete the URL → paste the code below → tap <strong>Done</strong></li>
                  </ol>
                </div>

                {/* iPhone Edge / Chrome note */}
                <div className="border border-orange-400/30 bg-orange-400/5 rounded-lg p-4 mb-4">
                  <div className="flex gap-3">
                    <span className="text-lg shrink-0">⚠️</span>
                    <div className="text-sm">
                      <p className="font-medium text-foreground mb-1">iPhone Edge / Chrome users:</p>
                      <p className="text-muted-foreground leading-relaxed">
                        On iPhone, Edge and Chrome don't support <code className="font-mono text-[10px]">javascript:</code> bookmarks.
                        Use <strong>Safari</strong> to install the bookmarklet — once saved, you can browse with any browser
                        and open the bookmarklet in Safari whenever you need to scrape chapters.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Android Chrome instructions */}
                <div className="border border-border rounded-lg p-4 sm:p-5 mb-4">
                  <h3 className="text-sm font-medium mb-3">📱 Android — Chrome</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">Use the <strong>Short bootstrap</strong> (Edge/Chrome block long URLs).</p>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside leading-relaxed">
                    <li>Open Chrome → tap the <strong>⋮</strong> menu (top right)</li>
                    <li>Tap <strong>☆ Star</strong> (add bookmark) → tap <strong>Edit</strong></li>
                    <li>Name: <strong>"Grab Chapters"</strong></li>
                    <li>Delete the URL → paste the code below → tap <strong>✓</strong> or <strong>Save</strong></li>
                    <li>To use: open the novel site → tap address bar → type "Grab Chapters" → tap it</li>
                  </ol>
                </div>

                {/* Android Edge instructions */}
                <div className="border border-border rounded-lg p-4 sm:p-5 mb-4">
                  <h3 className="text-sm font-medium mb-3">📱 Android — Edge</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">Use the <strong>Short bootstrap</strong> (Edge blocks long javascript: URLs).</p>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside leading-relaxed">
                    <li>Open Edge → tap the <strong>⋯</strong> menu (bottom center)</li>
                    <li>Tap <strong>"Add to favorites"</strong> → tap <strong>Edit</strong> (pencil icon)</li>
                    <li>Name: <strong>"Grab Chapters"</strong></li>
                    <li>Delete the URL → paste the code below → tap <strong>Save</strong></li>
                    <li>To use: open the novel site → tap address bar → type "Grab Chapters" → tap it</li>
                  </ol>
                </div>

                {/* Android Firefox instructions */}
                <div className="border border-border rounded-lg p-4 sm:p-5 mb-4">
                  <h3 className="text-sm font-medium mb-3">📱 Android — Firefox</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">Use the <strong>Full version</strong> (Firefox handles long URLs fine).</p>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside leading-relaxed">
                    <li>Open Firefox → tap the <strong>⋮</strong> menu (top right)</li>
                    <li>Tap <strong>☆</strong> (bookmark) → tap <strong>Edit</strong></li>
                    <li>Name: <strong>"Grab Chapters"</strong></li>
                    <li>Delete the URL → paste the code below → tap <strong>✓</strong></li>
                    <li>To use: go to novel site → tap ⋮ → <strong>Bookmarks</strong> → "Grab Chapters"</li>
                  </ol>
                </div>

                {/* Desktop instructions */}
                <div className="border border-border rounded-lg p-4 sm:p-5 mb-4">
                  <h3 className="text-sm font-medium mb-3">💻 Desktop (Chrome / Edge / Firefox)</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">Either version works on desktop. The Full version is recommended (no network dependency).</p>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside leading-relaxed">
                    <li>Make sure your bookmarks bar is visible (Ctrl+Shift+B in most browsers)</li>
                    <li>Right-click the bookmarks bar → <strong>"Add page"</strong></li>
                    <li>Name: <strong>"Grab Chapters"</strong></li>
                    <li>URL: paste the code below</li>
                    <li>Save — done! Click it on any novel site to scrape chapters.</li>
                  </ol>
                </div>

                {/* ── Full version (Safari / Firefox) ───────────── */}
                <div className="border border-border rounded-lg overflow-hidden mb-4">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
                    <span className="text-xs text-muted-foreground font-mono">Full version — Safari / Firefox / Desktop</span>
                    <button
                      type="button"
                      onClick={() => copyText(bookmarkletFull, "Full version")}
                      className="h-7 px-2.5 inline-flex items-center gap-1.5 border border-border hover:border-foreground/40 transition-colors text-xs rounded"
                    >
                      <Copy className="w-3 h-3" strokeWidth={1.4} />
                      Copy (6 KB)
                    </button>
                  </div>
                  <div className="p-4 bg-muted/20">
                    <code className="text-[10px] sm:text-[11px] font-mono text-foreground/60 break-all leading-relaxed select-all line-clamp-3">
                      {bookmarkletFull}
                    </code>
                  </div>
                </div>

                {/* ── Short bootstrap (Edge / Chrome mobile) ──────── */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
                    <span className="text-xs text-muted-foreground font-mono">Short bootstrap — Edge / Chrome mobile</span>
                    <button
                      type="button"
                      onClick={() => copyText(BOOKMARKLET_BOOTSTRAP, "Bootstrap version")}
                      className="h-7 px-2.5 inline-flex items-center gap-1.5 border border-border hover:border-foreground/40 transition-colors text-xs rounded"
                    >
                      <Copy className="w-3 h-3" strokeWidth={1.4} />
                      Copy (~80 chars)
                    </button>
                  </div>
                  <div className="p-4 bg-muted/20">
                    <code className="text-[11px] sm:text-xs font-mono text-foreground/80 break-all leading-relaxed select-all">
                      {BOOKMARKLET_BOOTSTRAP}
                    </code>
                  </div>
                </div>
              </section>

              {/* ── Section 2: Scrape chapters ───────────────────── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold">2</span>
                  <h2 className="text-base font-semibold">Scrape translated chapters</h2>
                </div>

                <div className="border border-border rounded-lg p-4 sm:p-5 space-y-3">
                  <div className="flex gap-3">
                    <Globe className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.4} />
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>Go to the novel site → open the <strong>Table of Contents</strong> page (the page that lists all chapter links).</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Bookmark className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.4} />
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>Tap your bookmarks → tap <strong>"Grab Chapters"</strong>.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Zap className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.4} />
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>A bar appears at the bottom. It finds all chapter links, fetches each one, and extracts just the translated text. <strong>~10–20 seconds for 100 chapters.</strong></p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Sparkles className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.4} />
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>Tap <strong>"Send N chapters"</strong> → a new tab opens here with all the data ready to import.</p>
                    </div>
                  </div>
                </div>

                {/* How it works technically */}
                <div className="mt-4 border border-border rounded-lg p-4 sm:p-5 bg-muted/10">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-[0.12em] mb-2">How it works</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground leading-relaxed">
                    <div className="p-3 border border-border/50 rounded">
                      <div className="font-medium text-foreground mb-1">1. Fast fetch</div>
                      <p>Tries the quickest method first — sends your browser cookies with the request. Works on most sites.</p>
                    </div>
                    <div className="p-3 border border-border/50 rounded">
                      <div className="font-medium text-foreground mb-1">2. Cloudflare bypass</div>
                      <p>If the site says "Checking your browser…", it falls back to a hidden iframe — which passes Cloudflare's checks naturally since you're already browsing the site.</p>
                    </div>
                    <div className="p-3 border border-border/50 rounded">
                      <div className="font-medium text-foreground mb-1">3. Smart extraction</div>
                      <p>Finds the largest text block on each chapter page, strips ads/navigation/comments, and keeps only the translated paragraphs.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Section 3: Import into your book ─────────────── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold">3</span>
                  <h2 className="text-base font-semibold">Import into your book</h2>
                </div>

                <div className="border border-border rounded-lg p-4 sm:p-5 space-y-3">
                  <div className="flex gap-3">
                    <span className="text-muted-foreground shrink-0 mt-0.5">1.</span>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>After the bookmarklet sends you here, pick which <strong>book</strong> to import into.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground shrink-0 mt-0.5">2.</span>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>Choose the <strong>starting chapter</strong> — the first scraped chapter maps to this raw chapter. (Use this when importing chapters 50–100 of a 200-chapter book.)</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground shrink-0 mt-0.5">3.</span>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>Review the <strong>match preview</strong> — ✅ green check = paragraph counts match, ⚠ = counts differ (still works, extras are skipped).</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground shrink-0 mt-0.5">4.</span>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p>Tap <strong>"Import N chapters"</strong> — all translations are saved instantly, paired 1:1 with your raws.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Troubleshooting ──────────────────────────────── */}
              <section>
                <h2 className="text-base font-semibold mb-3">Troubleshooting</h2>
                <div className="border border-border rounded-lg divide-y divide-border">
                  <div className="p-4">
                    <div className="text-sm font-medium text-foreground mb-1">"No chapters found"</div>
                    <p className="text-xs text-muted-foreground">Make sure you're on the <strong>Table of Contents / Index</strong> page — the page listing every chapter link. Single-chapter pages only grab that one chapter. If the site uses unusual link patterns, try the paste fallback below.</p>
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-medium text-foreground mb-1">"Couldn't fetch any chapters"</div>
                    <p className="text-xs text-muted-foreground">Some sites block all automated requests (even iframes). For these, manually copy the translated text and paste it in the BookEditor's Edit mode for each chapter.</p>
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-medium text-foreground mb-1">Bookmarklet does nothing when tapped</div>
                    <p className="text-xs text-muted-foreground">Make sure you pasted the <strong>full code</strong> — it starts with <code className="font-mono text-[10px]">javascript:</code> and is about 9,000 characters. If the <code className="font-mono text-[10px]">javascript:</code> prefix gets stripped (common on iPhone), add it back manually before pasting. On some Android browsers, you may need to paste into a notes app first, copy again, then paste into the bookmark URL field.</p>
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-medium text-foreground mb-1">Doesn't work on Edge / Chrome mobile</div>
                    <p className="text-xs text-muted-foreground">Make sure you're using the <strong>Short bootstrap</strong> version, not the Full version — Edge and Chrome block long <code className="font-mono text-[10px]">javascript:</code> URLs. Also ensure: (1) you saved it as a bookmark (not pasted in the address bar), (2) the <code className="font-mono text-[10px]">javascript:</code> prefix wasn't stripped, (3) you're on the novel site when tapping the bookmark.</p>
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-medium text-foreground mb-1">Data too large error</div>
                    <p className="text-xs text-muted-foreground">Try scraping fewer chapters at once (e.g., 50 at a time). Very long books may exceed URL length limits on some browsers.</p>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
