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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Enabled provider IDs — recomputed whenever settings change.
  const enabledProviderIds = useMemo(
    () => settings.providers.filter((p) => p.enabled).map((p) => p.id),
    [settings.providers],
  );

  // Provider to use for extraction — defaults to active provider, but can be
  // overridden by the dropdown. Auto-falls back to the first enabled provider
  // if the current selection becomes disabled.
  const [extractProvider, setExtractProvider] = useState<string>(
    () => enabledProviderIds.includes(settings.activeProvider)
      ? settings.activeProvider
      : (enabledProviderIds[0] ?? "deepseek"),
  );

  // Keep extractProvider in sync when settings change: prefer the active
  // provider if enabled, otherwise fall back to the first enabled one.
  useEffect(() => {
    const next = enabledProviderIds.includes(settings.activeProvider)
      ? settings.activeProvider
      : (enabledProviderIds[0] ?? "deepseek");
    setExtractProvider(next);
  }, [settings.activeProvider, enabledProviderIds]);

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

  // ── Extract from EPUB ────────────────────────────────────────────────

  const onExtract = async () => {
    if (!bookId || !book) return;
    setExtracting(true);
    try {
      // 1. Gather every paragraph from every chapter.
      const chaps = await listChapters(bookId);
      const allText = chaps
        .flatMap((c) => c.paragraphs)
        .filter((p) => p?.trim())
        .join("\n\n");

      if (!allText.trim()) {
        toast.error("This book has no readable paragraph content.");
        return;
      }

      // 2. Build the provider request. Auto-fallback if somehow the selected
      // provider is no longer enabled (e.g. it was disabled while on the page).
      let cfg = settings.providers.find((p) => p.id === extractProvider);
      if (!cfg || !cfg.enabled) {
        // Fall back to the first enabled provider.
        const fallback = settings.providers.find((p) => p.enabled);
        if (!fallback) {
          toast.error("No enabled provider. Enable a provider in Settings first.");
          return;
        }
        cfg = fallback;
        setExtractProvider(fallback.id);
        toast.message(`Switched to ${fallback.id === "gemini" ? "Gemini" : "DeepSeek"} for extraction.`);
      }

      const extracted = await callProviderForExtraction(
        cfg,
        EXTRACTION_PROMPT,
        allText,
        cfg.id,
      );
      if (!extracted || extracted.length === 0) {
        toast.error("The AI returned no glossary entries.");
        return;
      }

      // 3. Persist each extracted entry.
      const now = Date.now();
      let saved = 0;
      for (const item of extracted) {
        const term = (item.term ?? "").trim();
        const translation = (item.translation ?? "").trim();
        if (!term || !translation) continue;
        const category: GlossaryEntry["category"] =
          item.category != null && (CATEGORIES as string[]).includes(item.category)
            ? (item.category as GlossaryEntry["category"])
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
          category,
          gender,
          notes: (item.notes ?? "").trim(),
          createdAt: now + saved,
          updatedAt: now + saved,
        };
        await putGlossaryEntry(entry);
        saved++;
      }
      await reloadEntries();
      toast.success(`Extracted ${saved} glossary entries.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Extraction failed: ${msg.slice(0, 200)}`);
    } finally {
      setExtracting(false);
    }
  };

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
              {settings.providers.filter((p) => p.enabled).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === "gemini" ? "Gemini" : "DeepSeek"}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onExtract}
              disabled={extracting}
              className="h-10 px-4 inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              {extracting ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.4} />
              ) : (
                <Sparkles className="w-4 h-4" strokeWidth={1.4} />
              )}
              <span className="text-xs uppercase tracking-[0.18em]">
                {extracting ? "Extracting…" : "Extract"}
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
              <span className="text-xs uppercase tracking-[0.18em] hidden sm:inline">Add entry</span>
              <span className="text-xs uppercase tracking-[0.18em] sm:hidden">Add</span>
            </button>
          </div>
        </div>

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
                {entries.map((entry) =>
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
              {entries.map((entry) =>
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
