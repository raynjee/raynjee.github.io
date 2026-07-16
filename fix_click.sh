#!/bin/bash
cd /home/daytona/codebase
python3 << 'PYEOF'
with open("src/pages/BookReader.tsx", "r") as f:
    content = f.read()

# Find lines with onPointerDown but NOT preceded by onClick
lines = content.split("\n")
fixed = 0
i = 0
while i < len(lines):
    # Look for a line with onPointerDown but check the previous line doesn't have onClick
    line = lines[i]
    if "onPointerDown={() =>" in line:
        # Check if previous non-empty line doesn't already have onClick
        prev = i - 1
        while prev >= 0 and lines[prev].strip() == "":
            prev -= 1
        if prev >= 0 and "onClick" not in lines[prev]:
            # Need to add onClick BEFORE this onPointerDown
            # Find indentation (spaces before onPointerDown)
            indent = line[:len(line) - len(line.lstrip())]
            onclick_block = [
                f'{indent}onClick={{() => {{',
                f'{indent}  const timer = longPressRef.current.get(idx);',
                f'{indent}  if (timer) {{ clearTimeout(timer); longPressRef.current.delete(idx); }}',
                f'{indent}  const ri = chapterIdxToReadableIdx[idx];',
                f'{indent}  if (ri >= 0) onParagraphJump(ri);',
                f'{indent}}}}',
            ]
            # Insert before the onPointerDown line
            lines[i:i] = onclick_block
            fixed += 1
            i += len(onclick_block)
    i += 1

with open("src/pages/BookReader.tsx", "w") as f:
    f.write("\n".join(lines))

print(f"Added onClick to {fixed} more paragraph elements")
PYEOF
