#!/bin/bash
# PostToolUse hook: auto-format files after editing
# Runs after Edit/Write operations

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

EXTENSION="${FILE_PATH##*.}"

case "$EXTENSION" in
  py)
    # Python: fix trailing whitespace and ensure final newline
    if command -v python3 &> /dev/null; then
      python3 -c "
import pathlib, re
p = pathlib.Path('$FILE_PATH')
text = p.read_text()
text = re.sub(r'[ \t]+$', '', text, flags=re.MULTILINE)
if not text.endswith('\n'): text += '\n'
p.write_text(text)
" 2>/dev/null || true
    fi
    ;;
  js|ts|jsx|tsx|html|css|json)
    # JS/Web: use prettier if available
    if command -v npx &> /dev/null; then
      npx prettier --write "$FILE_PATH" 2>/dev/null || true
    fi
    ;;
esac

exit 0
