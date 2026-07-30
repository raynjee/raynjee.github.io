import re

with open('src/pages/BookReader.tsx', 'r') as f:
    content = f.read()

# Insert edit button BEFORE the delete button in the ChapterReader header
# Find the delete button pattern (unique enough)
old = '''              {translation && translation.paragraphs.some((p) => p && p.trim()) && (
                <button
                  type="button"
                  onClick={onDeleteTranslation}
                  className="h-10 px-3 inline-flex items-center gap-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="Delete this chapter's translation"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.4} />
                  <span className="text-sm">Delete</span>
                </button>
              )}'''

new = '''              {translation && translation.paragraphs.some((p) => p && p.trim()) && (
                <button
                  type="button"
                  onClick={onToggleEditMode}
                  className={cn(
                    "h-10 px-3 inline-flex items-center gap-2 border transition-colors cursor-pointer",
                    editMode
                      ? "bg-foreground text-background border-foreground"
                      : "border-border hover:border-foreground/40"
                  )}
                  title={editMode ? "Exit edit mode" : "Edit translation text manually"}
                >
                  <Pencil className="w-3.5 h-3.5" strokeWidth={1.4} />
                  <span className="text-sm">Edit</span>
                </button>
              )}
              {translation && translation.paragraphs.some((p) => p && p.trim()) && (
                <button
                  type="button"
                  onClick={onDeleteTranslation}
                  className="h-10 px-3 inline-flex items-center gap-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="Delete this chapter's translation"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.4} />
                  <span className="text-sm">Delete</span>
                </button>
              )}'''

if old not in content:
    print("ERROR: old string not found!")
    # Try to find something close
    idx = content.find('onClick={onDeleteTranslation}')
    if idx >= 0:
        print(f"Found onDeleteTranslation at offset {idx}")
        print(repr(content[idx-50:idx+200]))
    exit(1)

content = content.replace(old, new, 1)

# Also add edit button to the mobile tools drawer
# Find the delete translation button in the tools drawer
old_mobile = '''                            {activeTranslation &&
                            activeTranslation.paragraphs.some((p) => p && p.trim()) && (
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteTranslation();
                                  closeToolsDrawer();
                                }}
                                className="h-10 px-3 inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors text-sm"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={1.4} />
                                <span className="text-sm">Delete translation</span>
                              </button>
                            )}'''

new_mobile = '''                            {activeTranslation &&
                            activeTranslation.paragraphs.some((p) => p && p.trim()) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditMode((v) => !v);
                                  closeToolsDrawer();
                                }}
                                className={cn(
                                  "h-10 px-3 w-full inline-flex items-center justify-center gap-2 rounded-lg border transition-colors text-sm",
                                  editMode
                                    ? "bg-foreground text-background border-foreground"
                                    : "border-border hover:border-foreground/40"
                                )}
                              >
                                <Pencil className="w-4 h-4" strokeWidth={1.4} />
                                <span className="text-sm">{editMode ? "Done editing" : "Edit translation"}</span>
                              </button>
                            )}
                            {activeTranslation &&
                            activeTranslation.paragraphs.some((p) => p && p.trim()) && (
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteTranslation();
                                  closeToolsDrawer();
                                }}
                                className="h-10 px-3 inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors text-sm"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={1.4} />
                                <span className="text-sm">Delete translation</span>
                              </button>
                            )}'''

if old_mobile not in content:
    print("ERROR: old_mobile string not found!")
    idx = content.find('onDeleteTranslation')
    print(f"First onDeleteTranslation at offset {idx}")
    # Find second occurrence
    idx2 = content.find('onDeleteTranslation', idx + 1)
    print(f"Second onDeleteTranslation at offset {idx2}")
    if idx2 >= 0:
        print(repr(content[idx2-100:idx2+300]))
    exit(1)

content = content.replace(old_mobile, new_mobile, 1)

with open('src/pages/BookReader.tsx', 'w') as f:
    f.write(content)

print("Edit buttons added successfully!")
