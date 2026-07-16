// Glossary — per-book reference of characters, locations, slang, and deep
// words extracted by the AI (editable by the user). This glossary feeds
// back into future translations so the LLM remembers names and terms.

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Sparkles,
  Loader2,
  Trash2,
  Check,
  X,
  BookOpen,
  Pencil,
  Search,
  CopyMinus,
} from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { StudioShell } from "@/components/StudioShell";
import { useLibrary } from "@/hooks/use-library";
import { useSettings } from "@/hooks/use-settings";
import { listChapters, listGlossaryEntries, putGlossaryEntry, deleteGlossaryEntry } from "@/lib/db";
import type { GlossaryEntry, ProviderConfig } from "@/lib/types";
import { toast } from "sonner";
import { uid } from "@/lib/util";
import { cn } from "@/lib/utils";

// ── Extraction prompt ───────────────────────────────────────────────────
// Sent to the LLM alongside the full novel text. The LLM must return a raw
// JSON array — no fences, no commentary. Any deviation fails parsing.
const EXTRACTION_PROMPT = [
  "You are a Chinese literary analyst. Extract an exhaustive glossary from the provided novel text. Go paragraph by paragraph, extracting EVERY character name, family title, location, difficult word, and slang term. Do not skip any.",
  "",
  "Output STRICTLY a raw JSON array of objects, with NO markdown code fences, NO commentary, and NO markdown wrapping.",
  "",
  "Each object must have these exact fields:",
  '- "term": original Chinese text',
  '- "translation": English meaning',
  '- "category": strictly "character", "location", "word", or "slang"',
  '- "gender": strictly "F" (female), "M" (male), "N" (neutral/ambiguous), or null (for non-character entries). Base character gender on name patterns (芳→F, 强→M), titles (奶奶→F, 叔叔→M), honorifics, and contextual clues.',
  '- "notes": brief context in English (one sentence)',
  "",
  'Example: [{"term":"周娇娇","translation":"Zhou Jiaojiao","category":"character","gender":"F","notes":"Protagonist"},{"term":"老大","translation":"Eldest","category":"character","gender":"N","notes":"Gender ambiguous from context"}]',
].join("\n");

// ── Helpers ───────────────────────────────────────────────────────────

function formatEta(remaining: number, avgChunkMs: number): string {
  if (remaining <= 0) return "done";
  const totalSec = Math.ceil((remaining * avgChunkMs) / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

const CATEGORIES: Array<GlossaryEntry["category"]> = [
  "character",
  "location",
  "word",
  "slang",
];

const CATEGORY_LABELS: Record<GlossaryEntry["category"], string> = {
  character: "Character",
  location: "Location",
  word: "Word",
  slang: "Slang",
};

const GENDERS: Array<NonNullable<GlossaryEntry["gender"]>> = ["F", "M", "N"];
const GENDER_LABEL: Record<string, string> = {
  F: "Female",
  M: "Male",
  N: "Neutral",
};

export default function Glossary() {
  const { bookId } = useParams<{ bookId: string }>();
  const { books } = useLibrary();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const book = useMemo(
    () => books.find((b) => b.id === bookId),
    [books, bookId],
  );

  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState<{ done: number; total: number; avgChunkMs: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Glossary extraction is intentionally Gemini-only. DeepSeek is reserved for
  // translation so it does not burn local proxy chat requests on analysis.
  const enabledProviderIds = useMemo(
    () => settings.providers.filter((p) => p.enabled && p.id === "gemini").map((p) => p.id),
    [settings.providers],
  );

  // Provider to use for extraction. Kept as state so existing checkpoint logic
  // remains stable, but the only allowed value is Gemini.
  const [extractProvider, setExtractProvider] = useState<string>(
    () => enabledProviderIds[0] ?? "gemini",
  );

  // Keep extractProvider in sync when settings change.
  useEffect(() => {
    const next = enabledProviderIds[0] ?? "gemini";
    setExtractProvider(next);
  }, [enabledProviderIds]);

  // Draft state for new & edited rows.
  const [draft, setDraft] = useState<{
    term: string;
    translation: string;
    category: GlossaryEntry["category"];
    gender: GlossaryEntry["gender"];
    notes: string;
  }>({
    term: "",
    translation: "",
    category: "character",
    gender: null,
    notes: "",
  });

  // ── Load entries ─────────────────────────────────────────────────────

  const reloadEntries = useCallback(async () => {
    if (!bookId) return;
    const list = await listGlossaryEntries(bookId);
    setEntries(list);
  }, [bookId]);

  useEffect(() => {
    reloadEntries();
    // Reconnect to a running extraction that survived page navigation.
    const win = window as unknown as { __glossaryExtraction?: boolean };
    if (win.__glossaryExtraction) {
      setExtracting(true);
    }
  }, [reloadEntries]);

  // ── Start editing a row ──────────────────────────────────────────────

  const startEdit = (e: GlossaryEntry) => {
    setEditingId(e.id);
    setDraft({
      term: e.term,
      translation: e.translation,
      category: e.category,
      gender: e.gender,
      notes: e.notes,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetDraft();
  };

  const resetDraft = () => {
    setDraft({ term: "", translation: "", category: "character", gender: null, notes: "" });
  };

  // ── Save edited row ──────────────────────────────────────────────────

  const saveEdit = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    if (!draft.term.trim() || !draft.translation.trim()) {
      toast.error("Term and translation are required.");
      return;
    }
    const updated: GlossaryEntry = {
      ...entry,
      term: draft.term.trim(),
      translation: draft.translation.trim(),
      category: draft.category,
      gender: draft.gender,
      notes: draft.notes.trim(),
      updatedAt: Date.now(),
    };
    await putGlossaryEntry(updated);
    setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    setEditingId(null);
    resetDraft();
  };

  // ── Delete a row ─────────────────────────────────────────────────────

  const deleteEntry = async (id: string) => {
    await deleteGlossaryEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    toast("Entry deleted.");
  };

  // ── Remove duplicates ──────────────────────────────────────────────

  const removeDuplicates = async () => {
    if (!bookId) return;
    // Group by term (case-insensitive, trimmed). For each group with >1
    // entries, keep the best one and delete the rest.
    const groups = new Map<string, GlossaryEntry[]>();
    for (const e of entries) {
      const key = e.term.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }

    let removed = 0;
    const toDelete: string[] = [];

    for (const [, group] of groups) {
      if (group.length <= 1) continue;
      // Score each entry: prefer ones with notes, gender, longer translation, newer.
      const score = (e: GlossaryEntry) =>
        (e.notes.trim() ? 3 : 0) +
        (e.gender ? 2 : 0) +
        Math.min(e.translation.length, 30) +
        (e.updatedAt / 1e12);
      group.sort((a, b) => score(b) - score(a));
      // Keep the first (best), delete the rest.
      for (let i = 1; i < group.length; i++) {
        toDelete.push(group[i].id);
      }
    }

    if (toDelete.length === 0) {
      toast.message("No duplicates found.");
      return;
    }

    // Delete from IndexedDB and state.
    await Promise.all(toDelete.map((id) => deleteGlossaryEntry(id)));
    setEntries((prev) => prev.filter((e) => !toDelete.includes(e.id)));
    toast.success(`Removed ${toDelete.length} duplicate${toDelete.length > 1 ? "s" : ""}.`);
  };

  // ── Add a new row ────────────────────────────────────────────────────

  const addEntry = async () => {
    if (!bookId) return;
    if (!draft.term.trim() || !draft.translation.trim()) {
      toast.error("Term and translation are required.");
      return;
    }
    const entry: GlossaryEntry = {
      id: `${bookId}:${uid()}`,
      bookId,
      term: draft.term.trim(),
      translation: draft.translation.trim(),
      category: draft.category,
      gender: draft.gender,
      notes: draft.notes.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await putGlossaryEntry(entry);
    setEntries((prev) => [entry, ...prev]);
    setShowAddForm(false);
    resetDraft();
  };

  // ── Extract from EPUB (chunked + resumable) ─────────────────────────

  const CHUNK_CHARS = settings.glossaryChunkSize ?? 4000;
  const CHUNK_DELAY_MS = settings.glossaryChunkDelayMs ?? 3000;
  const EXTRACT_STATE_KEY = `atelier.glossary-extract.${bookId}`;

  interface ExtractCheckpoint {
    bookId: string;
    providerId: string;
    totalChunks: number;
    completedChunks: number[]; // indices of successfully processed chunks
    seenTerms: string[];
    totalSaved: number;
    chunkErrors: number;
    startedAt: number;
  }

  const loadCheckpoint = (): ExtractCheckpoint | null => {
    try {
      const raw = localStorage.getItem(EXTRACT_STATE_KEY);
      if (!raw) return null;
      const cp = JSON.parse(raw) as ExtractCheckpoint;
      if (cp.bookId !== bookId) return null;
      return cp;
    } catch {
      return null;
    }
  };

  const saveCheckpoint = (cp: ExtractCheckpoint) => {
    try {
      localStorage.setItem(EXTRACT_STATE_KEY, JSON.stringify(cp));
    } catch {
      // localStorage full — non-critical, extraction continues
    }
  };

  const clearCheckpoint = () => {
    try {
      localStorage.removeItem(EXTRACT_STATE_KEY);
    } catch {
      // ignore
    }
  };

  // Check for a saved checkpoint on mount so we can offer resume.
  const savedCheckpoint = useMemo(() => loadCheckpoint(), [bookId]);
  const [resuming, setResuming] = useState(false);

  const onExtract = async (resumeFrom?: ExtractCheckpoint) => {
    if (!bookId || !book) return;
    setExtracting(true);
    setExtractProgress(null);
    setResuming(false);
    // Persist on window so extraction survives page navigation.
    (window as unknown as { __glossaryExtraction?: boolean }).__glossaryExtraction = true;
    try {
      // 1. Gather every paragraph from every chapter.
      const chaps = await listChapters(bookId);
      const allParagraphs = chaps
        .flatMap((c) => c.paragraphs)
        .filter((p) => p?.trim());

      if (allParagraphs.length === 0) {
        toast.error("This book has no readable paragraph content.");
        return;
      }

      // 2. Build the provider config. Glossary extraction is Gemini-only.
      const cfg = settings.providers.find((p) => p.id === "gemini" && p.enabled);
      if (!cfg) {
        toast.error("Glossary extraction requires Gemini. Enable Gemini and add an API key in Settings.");
        return;
      }
      setExtractProvider("gemini");

      // 3. Split paragraphs into chunks of ~CHUNK_CHARS, never cutting mid-paragraph.
      const chunks: string[] = [];
      let buf = "";
      for (const p of allParagraphs) {
        const candidate = buf ? `${buf}\n\n${p}` : p;
        if (candidate.length > CHUNK_CHARS && buf.length > 0) {
          chunks.push(buf);
          buf = p;
        } else {
          buf = candidate;
        }
      }
      if (buf.trim()) chunks.push(buf);

      const totalChunks = chunks.length;

      // 4. Resume or start fresh.
      const completedSet = new Set(resumeFrom?.completedChunks ?? []);
      const seen = new Set<string>(resumeFrom?.seenTerms ?? []);
      let totalSaved = resumeFrom?.totalSaved ?? 0;
      let chunkErrors = resumeFrom?.chunkErrors ?? 0;
      const now = Date.now();
      let delayMs = CHUNK_DELAY_MS; // adaptive — grows on 429, resets on success
      const extractionStartedAt = Date.now();

      // If resuming, seed the table with already-persisted entries.
      if (resumeFrom) {
        await reloadEntries();
        totalSaved = Math.max(totalSaved, entries.length);
      }

      // Initial guess: use configured delay (refined after first chunk completes).
      let currentAvgMs = CHUNK_DELAY_MS;
      setExtractProgress({ done: completedSet.size, total: totalChunks, avgChunkMs: currentAvgMs });

      // Helper to bump progress without touching the measured average.
      const tickProgress = (done: number) => {
        setExtractProgress({ done, total: totalChunks, avgChunkMs: currentAvgMs });
      };

      // 5. Process each not-yet-completed chunk.
      for (let ci = 0; ci < totalChunks; ci++) {
        // Skip already-completed chunks.
        if (completedSet.has(ci)) continue;

        // Rate-limit delay (skip first chunk if not resuming).
        const chunksSoFar = ci > 0 || resumeFrom ? ci : 0;
        if (chunksSoFar > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }

        tickProgress(completedSet.size);

        // Time this chunk to build a real average.
        const chunkStart = Date.now();

        const chunkPrompt = [
          `This is portion ${ci + 1} of ${totalChunks} of a novel. Extract glossary entries from ONLY the text below.`,
          ci < totalChunks - 1
            ? "Do NOT repeat terms you found in earlier portions unless you discover NEW information about them (e.g., a more accurate translation or clearer gender)."
            : "This is the final portion. Include any remaining terms you find, but skip terms already covered in earlier portions if you have nothing new to add.",
          "",
          chunks[ci],
        ].join("\n");

        try {
          const extracted = await callProviderForExtraction(
            cfg,
            EXTRACTION_PROMPT,
            chunkPrompt,
            cfg.id,
          );
          // Success — reset adaptive delay back to baseline.
          delayMs = CHUNK_DELAY_MS;

          if (extracted && extracted.length > 0) {
            const fresh: GlossaryEntry[] = [];
            for (const item of extracted) {
              const term = (item.term ?? "").trim();
              const translation = (item.translation ?? "").trim();
              if (!term || !translation) continue;
              if (seen.has(term)) continue;
              seen.add(term);
              const category =
                item.category != null && (CATEGORIES as string[]).includes(item.category)
                  ? item.category
                  : "word";
              const gender =
                item.gender === "F" || item.gender === "M" || item.gender === "N"
                  ? item.gender
                  : null;
              const entry: GlossaryEntry = {
                id: `${bookId}:${uid()}`,
                bookId,
                term,
                translation,
                category: category as GlossaryEntry["category"],
                gender: gender as GlossaryEntry["gender"],
                notes: (item.notes ?? "").trim(),
                createdAt: now + totalSaved,
                updatedAt: now + totalSaved,
              };
              await putGlossaryEntry(entry);
              fresh.push(entry);
              totalSaved++;
            }
            if (fresh.length > 0) {
              setEntries((prev) => [...prev, ...fresh]);
            }
          }

          // Mark chunk complete and save checkpoint immediately.
          completedSet.add(ci);

          // Recompute actual average time per chunk from wall clock.
          const elapsed = Date.now() - extractionStartedAt;
          const chunksDone = completedSet.size;
          currentAvgMs = elapsed / chunksDone;

          setExtractProgress({ done: chunksDone, total: totalChunks, avgChunkMs: currentAvgMs });

          saveCheckpoint({
            bookId,
            providerId: cfg.id,
            totalChunks,
            completedChunks: [...completedSet],
            seenTerms: [...seen],
            totalSaved,
            chunkErrors,
            startedAt: resumeFrom?.startedAt ?? now,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const isRateLimit = msg.includes("429") || msg.includes("quota") || msg.includes("rate");

          if (isRateLimit) {
            // Adaptive backoff — double the delay (capped at 60s).
            delayMs = Math.min(delayMs * 2, 60_000);
            console.warn(
              `Glossary chunk ${ci + 1}/${totalChunks} rate-limited, backing off to ${(delayMs / 1000).toFixed(1)}s`,
            );
            toast.message(`Rate limited — backing off to ${(delayMs / 1000).toFixed(0)}s delay`, {
              duration: 3000,
            });
            // Retry this chunk after the backoff delay.
            await new Promise((r) => setTimeout(r, delayMs));
            ci--; // re-process this chunk
            continue;
          }

          chunkErrors++;
          console.warn(`Glossary chunk ${ci + 1}/${totalChunks} failed:`, msg.slice(0, 120));
          // Still mark as complete so we don't get stuck on a broken chunk.
          completedSet.add(ci);
          saveCheckpoint({
            bookId,
            providerId: cfg.id,
            totalChunks,
            completedChunks: [...completedSet],
            seenTerms: [...seen],
            totalSaved,
            chunkErrors,
            startedAt: resumeFrom?.startedAt ?? now,
          });
        }
      }

      // 6. All done — clear checkpoint.
      clearCheckpoint();
      setExtractProgress({ done: totalChunks, total: totalChunks, avgChunkMs: 0 });

      if (totalSaved === 0) {
        toast.error("The AI returned no glossary entries across any chunk.");
        return;
      }

      const warning = chunkErrors > 0
        ? ` (${chunkErrors} chunk${chunkErrors > 1 ? "s" : ""} failed)`
        : "";
      toast.success(`Extracted ${totalSaved} glossary entries from ${totalChunks} chunk${totalChunks > 1 ? "s" : ""}${warning}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Extraction failed: ${msg.slice(0, 200)}`);
    } finally {
      setExtracting(false);
      setExtractProgress(null);
      (window as unknown as { __glossaryExtraction?: boolean }).__glossaryExtraction = false;
    }
  };

  // ── Filtered entries for search ────────────────────────────────────

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.trim().toLowerCase();
    return entries.filter(
      (e) =>
        e.term.toLowerCase().includes(q) ||
        e.translation.toLowerCase().includes(q) ||
        e.notes.toLowerCase().includes(q),
    );
  }, [entries, searchQuery]);

  if (!book || !bookId) {
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

  return (
    <StudioShell>
      <div className="mx-auto max-w-[1100px] px-6 lg:px-10 pt-10 pb-20">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <button
              className="text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-3"
              onClick={() => navigate(`/library/${bookId}`)}
            >
              ← Back to reader
            </button>
            <div className="studio-caps text-muted-foreground">Reference</div>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl mt-2 tracking-tight">
            Glossary
          </h1>
            <p className="text-muted-foreground mt-1">{book.title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Provider selector for extraction */}
            <select
              value={extractProvider}
              onChange={(e) => setExtractProvider(e.target.value)}
              disabled={extracting}
              className="h-10 px-3 bg-transparent border border-border text-xs uppercase tracking-[0.18em] outline-none cursor-pointer disabled:opacity-50"
              aria-label="Provider for glossary extraction"
            >
              {settings.providers.some((p) => p.enabled && p.id === "gemini") ? (
                <option value="gemini">Gemini</option>
              ) : (
                <option value="gemini">Gemini required</option>
              )}
            </select>
            {/* Resume button — shown when a previous extraction was interrupted */}
            {savedCheckpoint && !extracting && (
              <button
                type="button"
                onClick={() => {
                  setResuming(true);
                  onExtract(savedCheckpoint);
                }}
                className="h-10 px-4 inline-flex items-center gap-2 border border-foreground/30 hover:border-foreground/60 bg-foreground/5"
                title={`Resume from chunk ${savedCheckpoint.completedChunks.length + 1} of ${savedCheckpoint.totalChunks} (${savedCheckpoint.totalSaved} entries saved)`}
              >
                <Sparkles className="w-4 h-4" strokeWidth={1.4} />
                <span className="text-xs uppercase tracking-[0.18em]">
                  Resume ({savedCheckpoint.completedChunks.length}/{savedCheckpoint.totalChunks})
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (savedCheckpoint && !resuming) {
                  clearCheckpoint();
                }
                onExtract();
              }}
              disabled={extracting}
              className="h-10 px-4 inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              {extracting ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.4} />
              ) : (
                <Sparkles className="w-4 h-4" strokeWidth={1.4} />
              )}
              <span className="text-xs uppercase tracking-[0.18em]">
                {extracting && extractProgress
                  ? `Chunk ${extractProgress.done + 1}/${extractProgress.total}…`
                  : extracting
                    ? "Extracting…"
                    : savedCheckpoint
                      ? "Start fresh"
                      : "Extract"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(true);
                resetDraft();
              }}
              className="h-10 px-3 sm:px-4 inline-flex items-center gap-1.5 sm:gap-2 border border-border hover:border-foreground/40"
            >
              <Plus className="w-4 h-4" strokeWidth={1.4} />
            </button>
            {entries.length > 0 && (
              <button
                type="button"
                onClick={removeDuplicates}
                className="h-10 px-3 inline-flex items-center gap-1.5 border border-border hover:border-destructive/40 text-muted-foreground hover:text-destructive transition-colors"
                title="Remove duplicate entries (keeps the best copy of each term)"
              >
                <CopyMinus className="w-4 h-4" strokeWidth={1.4} />
                <span className="text-xs uppercase tracking-[0.18em] hidden sm:inline">Dedup</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Extraction progress bar ──────────────────────────────── */}
        {extracting && extractProgress && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="uppercase tracking-[0.18em]">
                Extracting glossary · {extractProgress.done}/{extractProgress.total} chunks
              </span>
              <span className="tabular-nums">
                ~{formatEta(extractProgress.total - extractProgress.done, extractProgress.avgChunkMs)} remaining
              </span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-foreground/60 rounded-full transition-all duration-500"
                style={{
                  width: `${extractProgress.total > 0 ? (extractProgress.done / extractProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* ── Add-form ─────────────────────────────────────────────── */}
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 border border-border bg-card p-5"
          >
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4">
              New glossary entry
            </div>
            <GlossaryEditForm
              draft={draft}
              setDraft={setDraft}
              onSave={addEntry}
              onCancel={() => {
                setShowAddForm(false);
                resetDraft();
              }}
              saveLabel="Add entry"
            />
          </motion.div>
        )}

        {/* ── Table ─────────────────────────────────────────────────── */}
        {entries.length === 0 && !extracting ? (
          <div className="mt-8 sm:mt-12 border border-border bg-card p-8 sm:p-12 text-center">
            <BookOpen
              className="w-8 h-8 sm:w-10 sm:h-10 mx-auto text-muted-foreground"
              strokeWidth={1.2}
            />
            <div className="mt-4 font-display text-xl sm:text-2xl">
              No glossary yet
            </div>
            <p className="text-muted-foreground mt-2 max-w-[44ch] mx-auto text-sm leading-relaxed">
              Click <strong>Extract from EPUB</strong> to have the AI scan the
              entire novel for characters, locations, slang, and difficult
              words — or add entries by hand.
            </p>
          </div>
        ) : (
          <>
            {/* Search bar */}
            <div className="mt-8 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.4} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${entries.length} entries by term, translation, or notes…`}
                className="w-full h-11 pl-10 pr-10 bg-transparent border border-border focus:border-foreground outline-none text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.4} />
                </button>
              )}
            </div>
            {searchQuery && filteredEntries.length === 0 && (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                No entries match "{searchQuery}".
              </p>
            )}

            {/* Desktop table (md+) */}
            <div className="hidden md:block mt-8 border border-border">
              {/* Table header */}
              <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-border bg-card text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <span className="col-span-3">Term</span>
                <span className="col-span-3">Translation</span>
                <span className="col-span-1">Category</span>
                <span className="col-span-1">Gender</span>
                <span className="col-span-3">Notes</span>
                <span className="col-span-1 text-right">Actions</span>
              </div>

              {/* Table body */}
              <div className="divide-y divide-border max-h-[calc(100vh-16rem)] overflow-y-auto thin-scrollbar">
                {filteredEntries.map((entry) =>
                  editingId === entry.id ? (
                    <GlossaryEditRow
                      key={entry.id}
                      draft={draft}
                      setDraft={setDraft}
                      onSave={() => saveEdit(entry.id)}
                      onCancel={cancelEdit}
                    />
                  ) : (
                    <GlossaryViewRow
                      key={entry.id}
                      entry={entry}
                      onEdit={() => startEdit(entry)}
                      onDelete={() => deleteEntry(entry.id)}
                    />
                  ),
                )}
              </div>
            </div>

            {/* Mobile card list (< md) */}
            <div className="md:hidden mt-6 space-y-3">
              {filteredEntries.map((entry) =>
                editingId === entry.id ? (
                  <div key={entry.id} className="border border-border bg-card p-4">
                    <GlossaryEditForm
                      draft={draft}
                      setDraft={setDraft}
                      onSave={() => saveEdit(entry.id)}
                      onCancel={cancelEdit}
                      saveLabel="Save"
                      mobile
                    />
                  </div>
                ) : (
                  <GlossaryMobileCard
                    key={entry.id}
                    entry={entry}
                    onEdit={() => startEdit(entry)}
                    onDelete={() => deleteEntry(entry.id)}
                  />
                ),
              )}
            </div>
          </>
        )}
      </div>
    </StudioShell>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────

function GlossaryMobileCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: GlossaryEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border border-border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium leading-tight">{entry.term}</p>
          <p className="text-sm text-foreground/80 mt-0.5">{entry.translation}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            aria-label="Edit entry"
          >
            <Pencil className="w-4 h-4" strokeWidth={1.4} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-2 text-muted-foreground hover:text-destructive active:scale-95 transition-all"
            aria-label="Delete entry"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.4} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-block text-[10px] uppercase tracking-[0.16em] px-2 py-0.5 border border-border text-muted-foreground">
          {CATEGORY_LABELS[entry.category]}
        </span>
        {entry.gender && (
          <span className="inline-block text-[10px] uppercase tracking-[0.16em] px-2 py-0.5 border border-border text-muted-foreground">
            {GENDER_LABEL[entry.gender] ?? entry.gender}
          </span>
        )}
      </div>
      {entry.notes && (
        <p className="text-xs text-muted-foreground leading-relaxed">{entry.notes}</p>
      )}
    </div>
  );
}

// ── View row (desktop) ───────────────────────────────────────────────────

function GlossaryViewRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: GlossaryEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const genderBadge = entry.gender
    ? GENDER_LABEL[entry.gender] ?? entry.gender
    : null;

  return (
    <div className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-muted/40 transition-colors">
      <span className="col-span-3 text-sm font-medium">{entry.term}</span>
      <span className="col-span-3 text-sm text-foreground/85">
        {entry.translation}
      </span>
      <span className="col-span-1">
        <span className="inline-block text-[10px] uppercase tracking-[0.16em] px-2 py-0.5 border border-border text-muted-foreground">
          {CATEGORY_LABELS[entry.category]}
        </span>
      </span>
      <span className="col-span-1">
        {genderBadge && (
          <span
            className={cn(
              "inline-block text-[10px] uppercase tracking-[0.16em] px-2 py-0.5 border",
              entry.gender === "F"
                ? "border-border text-muted-foreground"
                : entry.gender === "M"
                  ? "border-border text-muted-foreground"
                  : "border-border text-muted-foreground",
            )}
          >
            {genderBadge}
          </span>
        )}
      </span>
      <span className="col-span-3 text-xs text-muted-foreground truncate">
        {entry.notes || "—"}
      </span>
      <span className="col-span-1 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Edit entry"
        >
          <Pencil className="w-3.5 h-3.5" strokeWidth={1.4} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Delete entry"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.4} />
        </button>
      </span>
    </div>
  );
}

// ── Edit row ───────────────────────────────────────────────────────────

function GlossaryEditRow({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: {
    term: string;
    translation: string;
    category: GlossaryEntry["category"];
    gender: GlossaryEntry["gender"];
    notes: string;
  };
  setDraft: React.Dispatch<
    React.SetStateAction<{
      term: string;
      translation: string;
      category: GlossaryEntry["category"];
      gender: GlossaryEntry["gender"];
      notes: string;
    }>
  >;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-4 py-3 bg-card">
      <GlossaryEditForm
        draft={draft}
        setDraft={setDraft}
        onSave={onSave}
        onCancel={onCancel}
        saveLabel="Save"
      />
    </div>
  );
}

// ── Reusable edit form ─────────────────────────────────────────────────

function GlossaryEditForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saveLabel,
  mobile,
}: {
  draft: {
    term: string;
    translation: string;
    category: GlossaryEntry["category"];
    gender: GlossaryEntry["gender"];
    notes: string;
  };
  setDraft: React.Dispatch<
    React.SetStateAction<{
      term: string;
      translation: string;
      category: GlossaryEntry["category"];
      gender: GlossaryEntry["gender"];
      notes: string;
    }>
  >;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
  mobile?: boolean;
}) {
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSave();
    }
  };

  // Mobile: stacked layout
  if (mobile) {
    return (
      <div onKeyDown={handleKey} className="space-y-3">
        <input
          type="text"
          value={draft.term}
          onChange={(e) => setDraft((d) => ({ ...d, term: e.target.value }))}
          placeholder="Chinese term"
          className="w-full bg-muted/50 border border-border rounded focus:border-foreground outline-none px-3 py-2.5 text-base"
          autoFocus
        />
        <input
          type="text"
          value={draft.translation}
          onChange={(e) =>
            setDraft((d) => ({ ...d, translation: e.target.value }))
          }
          placeholder="English translation"
          className="w-full bg-muted/50 border border-border rounded focus:border-foreground outline-none px-3 py-2.5 text-base"
        />
        <div className="flex items-center gap-2">
          <select
            value={draft.category}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                category: e.target.value as GlossaryEntry["category"],
              }))
            }
            className="flex-1 bg-muted/50 border border-border rounded focus:border-foreground outline-none px-3 py-2.5 text-base"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            {GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() =>
                  setDraft((d) => ({ ...d, gender: d.gender === g ? null : g }))
                }
                className={cn(
                  "h-10 px-3 text-xs uppercase tracking-[0.16em] border rounded transition-colors",
                  draft.gender === g
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40",
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <input
          type="text"
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          placeholder="Context note (optional)"
          className="w-full bg-muted/50 border border-border rounded focus:border-foreground outline-none px-3 py-2.5 text-base"
        />
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onSave}
            className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 bg-foreground text-background hover:bg-foreground/90 rounded"
          >
            <Check className="w-4 h-4" strokeWidth={1.4} />
            <span className="text-xs uppercase tracking-[0.18em]">
              {saveLabel}
            </span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 border border-border hover:border-foreground/40 rounded"
          >
            <X className="w-4 h-4" strokeWidth={1.4} />
            <span className="text-xs uppercase tracking-[0.18em]">
              Cancel
            </span>
          </button>
        </div>
      </div>
    );
  }

  // Desktop: grid layout
  return (
    <div onKeyDown={handleKey}>
      <div className="grid grid-cols-12 gap-3 items-end">
        <input
          type="text"
          value={draft.term}
          onChange={(e) => setDraft((d) => ({ ...d, term: e.target.value }))}
          placeholder="Chinese term"
          className="col-span-3 bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-sm"
          autoFocus
        />
        <input
          type="text"
          value={draft.translation}
          onChange={(e) =>
            setDraft((d) => ({ ...d, translation: e.target.value }))
          }
          placeholder="English translation"
          className="col-span-2 bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-sm"
        />
        <select
          value={draft.category}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              category: e.target.value as GlossaryEntry["category"],
            }))
          }
          className="col-span-1 bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-xs"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <div className="col-span-2 flex items-center gap-1">
          {GENDERS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() =>
                setDraft((d) => ({ ...d, gender: d.gender === g ? null : g }))
              }
              className={cn(
                "h-7 px-2 text-[10px] uppercase tracking-[0.16em] border transition-colors",
                draft.gender === g
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/40",
              )}
            >
              {g}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          placeholder="Context note"
          className="col-span-2 bg-transparent border-b border-border focus:border-foreground outline-none py-1.5 text-xs"
        />
        <div className="col-span-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSave}
            className="h-8 px-3 inline-flex items-center gap-1.5 bg-foreground text-background hover:bg-foreground/90"
          >
            <Check className="w-3.5 h-3.5" strokeWidth={1.4} />
            <span className="text-[10px] uppercase tracking-[0.18em]">
              {saveLabel}
            </span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-3 inline-flex items-center gap-1.5 border border-border hover:border-foreground/40"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.4} />
            <span className="text-[10px] uppercase tracking-[0.18em]">
              Cancel
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Provider call for glossary extraction ──────────────────────────────
// We cannot reuse the paragraph-translation path because the extraction
// prompt asks for a JSON array (not a numbered list). So this is a
// lightweight clone of the relevant parts of callDeepSeek/callGemini
// adapted to a freeform system+user chat completion.

async function callProviderForExtraction(
  cfg: ProviderConfig,
  systemPrompt: string,
  userContent: string,
  provider: string,
): Promise<
  Array<{
    term?: string;
    translation?: string;
    category?: string;
    gender?: string | null;
    notes?: string;
  }>
> {
  if (provider !== "gemini") {
    throw new Error("Glossary extraction is Gemini-only.");
  }
  if (provider === "gemini") {
    if (!cfg.apiKey) throw new Error("Gemini API key is missing.");
    const model = cfg.model || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      generationConfig: { temperature: 0.35 },
    };
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => res.statusText);
        throw new Error(`Gemini error ${res.status}: ${t.slice(0, 200)}`);
      }
      const data = await res.json();
      const raw =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return parseGlossaryJson(raw);
    } finally {
      clearTimeout(timeout);
    }
  } else {
    const base = cfg.baseUrl?.replace(/\/$/, "") || "http://127.0.0.1:8001/v1";
    const url = `${base}/chat/completions`;
    const body = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      stream: false,
      temperature: 0.35,
    };
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => res.statusText);
        throw new Error(`DeepSeek error ${res.status}: ${t.slice(0, 200)}`);
      }
      const data = await res.json();
      const raw = data?.choices?.[0]?.message?.content ?? "";
      return parseGlossaryJson(raw);
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ── JSON parsing with robust markdown-fence stripping ──────────────────

function parseGlossaryJson(raw: string): ReturnType<
  typeof callProviderForExtraction
> extends Promise<infer T>
  ? T
  : never {
  let text = raw.trim();
  // Strip ```json fences if present.
  const fence = /^```(?:json)?\s*\n([\s\S]*)\n```$/;
  const m = fence.exec(text);
  if (m) text = m[1].trim();
  // Strip leading/trailing code fences that are bare.
  if (text.startsWith("```")) {
    text = text.replace(/^```[\s\S]*?```$/, "").trim();
  }
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("The AI did not return a JSON array.");
  }
  return parsed;
}
