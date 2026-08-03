// Characters — per-book character database for maintaining translation consistency.
// Stores rich character profiles (name, aliases, role, description) that the AI
// can reference during translation to keep names and traits consistent.

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  X,
  Users,
  Pencil,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { StudioShell } from "@/components/StudioShell";
import { useLibrary } from "@/hooks/use-library";
import { listCharacters, putCharacter, deleteCharacter } from "@/lib/db";
import type { Character, CharacterRole } from "@/lib/types";
import { toast } from "sonner";
import { uid } from "@/lib/util";
import { cn } from "@/lib/utils";

// ── Constants ───────────────────────────────────────────────────────────

const ROLES: CharacterRole[] = ["protagonist", "antagonist", "supporting", "minor"];
const ROLE_LABEL: Record<CharacterRole, string> = {
  protagonist: "Protagonist",
  antagonist: "Antagonist",
  supporting: "Supporting",
  minor: "Minor",
};
const ROLE_COLOR: Record<CharacterRole, string> = {
  protagonist: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  antagonist: "bg-red-500/15 text-red-400 border-red-500/30",
  supporting: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  minor: "bg-muted text-muted-foreground border-border",
};

const GENDERS: Array<NonNullable<Character["gender"]>> = ["F", "M", "N"];
const GENDER_LABEL: Record<string, string> = { F: "Female", M: "Male", N: "Neutral" };
const GENDER_ICON: Record<string, string> = { F: "♀", M: "♂", N: "◆" };

// ── Draft type ──────────────────────────────────────────────────────────

interface CharDraft {
  name: string;
  translation: string;
  aliasesStr: string; // comma-separated for the form
  gender: Character["gender"];
  role: CharacterRole | null;
  description: string;
  notes: string;
}

const EMPTY_DRAFT: CharDraft = {
  name: "",
  translation: "",
  aliasesStr: "",
  gender: null,
  role: null,
  description: "",
  notes: "",
};

function draftFromCharacter(c: Character): CharDraft {
  return {
    name: c.name,
    translation: c.translation,
    aliasesStr: c.aliases.join(", "),
    gender: c.gender,
    role: c.role,
    description: c.description,
    notes: c.notes,
  };
}

function characterFromDraft(draft: CharDraft, bookId: string, existing?: Character): Character {
  const aliases = draft.aliasesStr
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  const now = Date.now();
  return {
    id: existing?.id ?? `${bookId}:char:${uid()}`,
    bookId,
    name: draft.name.trim(),
    translation: draft.translation.trim(),
    aliases,
    gender: draft.gender,
    role: draft.role,
    description: draft.description.trim(),
    notes: draft.notes.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

// ── Main component ──────────────────────────────────────────────────────

export default function Characters() {
  const { bookId } = useParams<{ bookId: string }>();
  const { books } = useLibrary();
  const navigate = useNavigate();

  const book = useMemo(() => books.find((b) => b.id === bookId), [books, bookId]);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState<CharDraft>(EMPTY_DRAFT);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<CharacterRole | "all">("all");

  // ── Load characters ───────────────────────────────────────────────────

  const reload = useCallback(async () => {
    if (!bookId) return;
    const list = await listCharacters(bookId);
    setCharacters(list);
  }, [bookId]);

  useEffect(() => { reload(); }, [reload]);

  // ── CRUD ──────────────────────────────────────────────────────────────

  const startEdit = (c: Character) => {
    setEditingId(c.id);
    setDraft(draftFromCharacter(c));
    setShowAddForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  };

  const saveEdit = async (id: string) => {
    const existing = characters.find((c) => c.id === id);
    if (!existing || !bookId) return;
    if (!draft.name.trim() || !draft.translation.trim()) {
      toast.error("Name and translation are required.");
      return;
    }
    const updated = characterFromDraft(draft, bookId, existing);
    await putCharacter(updated);
    setCharacters((prev) => prev.map((c) => (c.id === id ? updated : c)));
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    toast("Character updated.");
  };

  const addCharacter = async () => {
    if (!bookId) return;
    if (!draft.name.trim() || !draft.translation.trim()) {
      toast.error("Name and translation are required.");
      return;
    }
    const character = characterFromDraft(draft, bookId);
    await putCharacter(character);
    setCharacters((prev) => [...prev, character]);
    setShowAddForm(false);
    setDraft(EMPTY_DRAFT);
    toast.success("Character added.");
  };

  const removeCharacter = async (id: string) => {
    await deleteCharacter(id);
    setCharacters((prev) => prev.filter((c) => c.id !== id));
    toast("Character deleted.");
  };

  // ── Filter & search ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = characters;
    if (filterRole !== "all") {
      list = list.filter((c) => c.role === filterRole);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.translation.toLowerCase().includes(q) ||
          c.aliases.some((a) => a.toLowerCase().includes(q)) ||
          c.description.toLowerCase().includes(q) ||
          c.notes.toLowerCase().includes(q),
      );
    }
    return list;
  }, [characters, searchQuery, filterRole]);

  // ── Stats ─────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const byRole: Record<string, number> = {};
    for (const c of characters) {
      const r = c.role ?? "unassigned";
      byRole[r] = (byRole[r] ?? 0) + 1;
    }
    return byRole;
  }, [characters]);

  // ── Not found ─────────────────────────────────────────────────────────

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
              Characters
            </h1>
            <p className="text-muted-foreground mt-1">{book.title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Role filter pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setFilterRole("all")}
                className={cn(
                  "h-8 px-3 text-[10px] uppercase tracking-[0.14em] rounded-md border transition-colors",
                  filterRole === "all"
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
                )}
              >
                All ({characters.length})
              </button>
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setFilterRole(filterRole === r ? "all" : r)}
                  className={cn(
                    "h-8 px-3 text-[10px] uppercase tracking-[0.14em] rounded-md border transition-colors",
                    filterRole === r
                      ? ROLE_COLOR[r]
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
                  )}
                >
                  {ROLE_LABEL[r]} ({stats[r] ?? 0})
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(true);
                setDraft(EMPTY_DRAFT);
                setEditingId(null);
              }}
              className="h-10 px-3 sm:px-4 inline-flex items-center gap-1.5 sm:gap-2 bg-foreground text-background hover:bg-foreground/90"
            >
              <Plus className="w-4 h-4" strokeWidth={1.4} />
              <span className="text-xs uppercase tracking-[0.18em]">Add</span>
            </button>
          </div>
        </div>

        {/* ── Search ──────────────────────────────────────────────── */}
        <div className="mt-8 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.4} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${characters.length} characters by name, alias, or description…`}
            className="w-full h-11 pl-10 pr-10 bg-transparent border border-border focus:border-foreground outline-none text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.6} />
            </button>
          )}
        </div>

        {/* ── Add form ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-6 border border-border bg-card p-5"
            >
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4">
                New character
              </div>
              <CharacterForm
                draft={draft}
                setDraft={setDraft}
                onSave={addCharacter}
                onCancel={() => { setShowAddForm(false); setDraft(EMPTY_DRAFT); }}
                saveLabel="Add character"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Empty state ──────────────────────────────────────────── */}
        {characters.length === 0 && !showAddForm ? (
          <div className="mt-8 sm:mt-12 border border-border bg-card p-8 sm:p-12 text-center">
            <Users className="w-8 h-8 sm:w-10 sm:h-10 mx-auto text-muted-foreground" strokeWidth={1.2} />
            <div className="mt-4 font-display text-xl sm:text-2xl">No characters yet</div>
            <p className="text-muted-foreground mt-2 max-w-[44ch] mx-auto text-sm leading-relaxed">
              Add characters manually to track their names, aliases, roles, and descriptions.
              This helps the AI maintain consistent translations across chapters.
            </p>
          </div>
        ) : null}

        {/* ── Character cards ──────────────────────────────────────── */}
        <div className="mt-6 space-y-3">
          {filtered.map((char) => {
            const isEditing = editingId === char.id;
            const isExpanded = expandedId === char.id;

            if (isEditing) {
              return (
                <motion.div
                  key={char.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border border-foreground/30 bg-card p-5"
                >
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4">
                    Editing character
                  </div>
                  <CharacterForm
                    draft={draft}
                    setDraft={setDraft}
                    onSave={() => saveEdit(char.id)}
                    onCancel={cancelEdit}
                    saveLabel="Save changes"
                  />
                </motion.div>
              );
            }

            return (
              <motion.div
                key={char.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-border bg-card hover:border-foreground/20 transition-colors"
              >
                {/* Card header — always visible */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : char.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left"
                >
                  {/* Gender indicator */}
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 border",
                      char.gender === "F"
                        ? "bg-pink-500/10 text-pink-400 border-pink-500/30"
                        : char.gender === "M"
                          ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                          : "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {char.gender ? GENDER_ICON[char.gender] : "?"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{char.name}</span>
                      <span className="text-xs text-muted-foreground truncate">→ {char.translation}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {char.role && (
                        <span
                          className={cn(
                            "text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border",
                            ROLE_COLOR[char.role],
                          )}
                        >
                          {ROLE_LABEL[char.role]}
                        </span>
                      )}
                      {char.aliases.length > 0 && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          aka {char.aliases.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); startEdit(char); }}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.4} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeCharacter(char.id); }}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.4} />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" strokeWidth={1.4} />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" strokeWidth={1.4} />
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-0 border-t border-border mt-0 space-y-3">
                        <div className="pt-3" />
                        {char.description && (
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
                              Description
                            </div>
                            <p className="text-sm leading-relaxed">{char.description}</p>
                          </div>
                        )}
                        {char.aliases.length > 0 && (
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
                              Aliases
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {char.aliases.map((a, i) => (
                                <span
                                  key={i}
                                  className="text-xs px-2 py-0.5 rounded bg-muted border border-border"
                                >
                                  {a}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {char.notes && (
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
                              Notes
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{char.notes}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* ── No results ──────────────────────────────────────────── */}
        {filtered.length === 0 && characters.length > 0 && (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            No characters match your search.
          </div>
        )}
      </div>
    </StudioShell>
  );
}

// ── Character form component ────────────────────────────────────────────

function CharacterForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saveLabel,
}: {
  draft: CharDraft;
  setDraft: React.Dispatch<React.SetStateAction<CharDraft>>;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="space-y-4">
      {/* Row 1: Name + Translation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1 block">
            Name (original) *
          </label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. 周娇娇"
            className="w-full h-9 px-3 bg-transparent border border-border focus:border-foreground outline-none text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1 block">
            Translation / Romanization *
          </label>
          <input
            type="text"
            value={draft.translation}
            onChange={(e) => setDraft((d) => ({ ...d, translation: e.target.value }))}
            placeholder="e.g. Zhou Jiaojiao"
            className="w-full h-9 px-3 bg-transparent border border-border focus:border-foreground outline-none text-sm"
          />
        </div>
      </div>

      {/* Row 2: Aliases */}
      <div>
        <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1 block">
          Aliases <span className="text-muted-foreground/60">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={draft.aliasesStr}
          onChange={(e) => setDraft((d) => ({ ...d, aliasesStr: e.target.value }))}
          placeholder="e.g. 娇娇, Little Zhou, Miss Zhou"
          className="w-full h-9 px-3 bg-transparent border border-border focus:border-foreground outline-none text-sm"
        />
      </div>

      {/* Row 3: Gender + Role */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1 block">
            Gender
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, gender: null }))}
              className={cn(
                "h-8 px-3 text-xs rounded-md border transition-colors",
                draft.gender === null
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/40",
              )}
            >
              —
            </button>
            {GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, gender: d.gender === g ? null : g }))}
                className={cn(
                  "h-8 px-3 text-xs rounded-md border transition-colors",
                  draft.gender === g
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40",
                )}
              >
                {GENDER_ICON[g]} {GENDER_LABEL[g]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1 block">
            Role
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, role: null }))}
              className={cn(
                "h-8 px-3 text-[10px] uppercase tracking-[0.12em] rounded-md border transition-colors",
                draft.role === null
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/40",
              )}
            >
              —
            </button>
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, role: d.role === r ? null : r }))}
                className={cn(
                  "h-8 px-3 text-[10px] uppercase tracking-[0.12em] rounded-md border transition-colors",
                  draft.role === r
                    ? ROLE_COLOR[r]
                    : "border-border text-muted-foreground hover:border-foreground/40",
                )}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Description */}
      <div>
        <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1 block">
          Description
        </label>
        <textarea
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="Brief description of the character's role, appearance, or key traits…"
          rows={2}
          className="w-full px-3 py-2 bg-transparent border border-border focus:border-foreground outline-none text-sm resize-none"
        />
      </div>

      {/* Row 5: Notes */}
      <div>
        <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1 block">
          Translator notes
        </label>
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          placeholder="Notes for the AI translator — e.g. name conventions, speech patterns…"
          rows={2}
          className="w-full px-3 py-2 bg-transparent border border-border focus:border-foreground outline-none text-sm resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          className="h-9 px-4 inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 text-xs uppercase tracking-[0.18em]"
        >
          <Check className="w-3.5 h-3.5" strokeWidth={1.8} />
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 px-4 inline-flex items-center gap-2 border border-border hover:border-foreground/40 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
