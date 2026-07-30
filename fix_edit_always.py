import re

with open('src/pages/BookReader.tsx', 'r') as f:
    content = f.read()

# ── Fix 1: Mobile tools drawer — remove condition wrapping edit button ──
# The edit button has the condition:
#   {activeTranslation && activeTranslation.paragraphs.some((p) => p && p.trim()) && (
old_mobile = '''                          {activeTranslation &&
                            activeTranslation.paragraphs.some((p) => p && p.trim()) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditMode(!editMode);
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
                            )}'''

new_mobile = '''                          <button
                                type="button"
                                onClick={() => {
                                  setEditMode(!editMode);
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
                              </button>'''

if old_mobile not in content:
    print("ERROR: mobile condition not found!")
    # Find the edit button code
    idx = content.find('setEditMode(!editMode)')
    print(f"Found at offset {idx}")
    print(repr(content[idx-200:idx+500]))
    exit(1)

content = content.replace(old_mobile, new_mobile, 1)

# ── Fix 2: Desktop header — remove condition wrapping edit button ──
old_desktop = '''              {translation && translation.paragraphs.some((p) => p && p.trim()) && (
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
              )}'''

new_desktop = '''              <button
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
                </button>'''

if old_desktop not in content:
    print("ERROR: desktop condition not found!")
    idx = content.find('onToggleEditMode')
    print(f"Found at offset {idx}")
    print(repr(content[idx-150:idx+400]))
    exit(1)

content = content.replace(old_desktop, new_desktop, 1)

with open('src/pages/BookReader.tsx', 'w') as f:
    f.write(content)

print("Both edit buttons now always visible!")
