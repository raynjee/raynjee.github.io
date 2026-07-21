"""
Add textarea rendering for edit mode in BookReader.tsx.
Strategy: find the 4 <p> tags that render translated text and wrap them 
in editMode conditionals: textarea when editing, <p> when not.
Also add a Save/Cancel bar at the top of the chapter when editMode is on.
"""
import re

with open('src/pages/BookReader.tsx', 'r') as f:
    content = f.read()

# ── Add Save/Cancel bar that appears when editMode is active ──
# Insert right after the chapter title header, before paragraph rendering
# Find: the "Column headings" comment that separates header from paragraphs
old_header = '''      {/* Column headings — once per chapter, not per paragraph. */}'''

save_bar = '''      {/* ── Edit mode save bar ──────────────────────────────── */}
      {editMode && (
        <div className="flex items-center gap-3 mb-6 p-3 border border-foreground/20 bg-foreground/5 rounded-lg">
          <Pencil className="w-4 h-4 text-foreground/70" strokeWidth={1.4} />
          <span className="text-sm font-medium flex-1">Editing translation — changes are not saved until you click Save.</span>
          <button
            type="button"
            onClick={() => onSaveEdits(chapter.id, editedTexts)}
            className="h-9 px-4 inline-flex items-center gap-1.5 rounded-lg bg-foreground text-background hover:bg-foreground/90 active:scale-95 transition-all text-sm font-medium"
          >
            <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
            Save
          </button>
          <button
            type="button"
            onClick={() => { setEditedTexts([]); onToggleEditMode(); }}
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border hover:border-foreground/40 active:scale-95 transition-all text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Column headings — once per chapter, not per paragraph. */}'''

if old_header not in content:
    # Try alternate pattern
    print("Trying alternate header pattern...")
    matches = list(re.finditer(r'Column headings.*per paragraph', content))
    print(f"Found {len(matches)} matches")
    if matches:
        for m in matches:
            print(f"Match at {m.start()}: {repr(m.group())}")
    exit(1)

content = content.replace(old_header, save_bar, 1)

# ── Now add textarea rendering at each of the 4 paragraph locations ──
# Strategy: find each <p> tag with reader-prose-text class that renders 
# translated text (contains {t && t.trim() ? t : ...}) and wrap in editMode conditional

# Location 1: Stacked layout translated paragraph (~line 1930)
# Pattern: {t && t.trim() ? t : ( <span>...</span> )} inside a <p>
old_p1 = '''                  {t && t.trim() ? t : (
                    <span className="text-muted-foreground/70 italic">{busy ? "Translating…" : ""}</span>
                  )}'''

new_p1 = '''                  {editMode ? (
                    <textarea
                      value={editedTexts[idx] ?? t ?? ''}
                      onChange={(e) => {
                        const next = [...editedTexts];
                        next[idx] = e.target.value;
                        setEditedTexts(next);
                      }}
                      className="w-full min-h-[80px] bg-muted/30 border border-border focus:border-foreground outline-none px-3 py-2 rounded text-sm transition-colors resize-y font-sans leading-relaxed"
                      rows={3}
                    />
                  ) : t && t.trim() ? t : (
                    <span className="text-muted-foreground/70 italic">{busy ? "Translating…" : ""}</span>
                  )}'''

if old_p1 not in content:
    print("Pattern 1 not found!")
    exit(1)
content = content.replace(old_p1, new_p1, 1)

# Location 2: Split layout translated column (~line 1979) — simpler <p> with just {t}
old_p2 = '''                {t && t.trim() ? t : (
                  <span className="text-muted-foreground/70 italic">{busy ? "Translating…" : ""}</span>
                )}'''

new_p2 = '''                {editMode ? (
                  <textarea
                    value={editedTexts[idx] ?? t ?? ''}
                    onChange={(e) => {
                      const next = [...editedTexts];
                      next[idx] = e.target.value;
                      setEditedTexts(next);
                    }}
                    className="w-full min-h-[80px] bg-muted/30 border border-border focus:border-foreground outline-none px-3 py-2 rounded text-sm transition-colors resize-y font-sans leading-relaxed"
                    rows={3}
                  />
                ) : t && t.trim() ? t : (
                  <span className="text-muted-foreground/70 italic">{busy ? "Translating…" : ""}</span>
                )}'''

if old_p2 not in content:
    print("Pattern 2 not found!")
    exit(1)
content = content.replace(old_p2, new_p2, 1)

with open('src/pages/BookReader.tsx', 'w') as f:
    f.write(content)

print("Edit mode textareas + save bar added successfully!")
