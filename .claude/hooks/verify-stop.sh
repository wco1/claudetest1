#!/bin/bash
# Stop hook: basic verification before Claude finishes a turn
# Checks for common issues in recently modified files

INPUT=$(cat)

# Get recently modified files (last 2 minutes)
RECENT_FILES=$(find /home/user/claudetest1 -name '*.py' -o -name '*.js' -o -name '*.html' -newer /tmp/.claude-last-check 2>/dev/null | head -5)

# Update timestamp
touch /tmp/.claude-last-check

if [ -z "$RECENT_FILES" ]; then
  exit 0
fi

# Check Python syntax
for f in $RECENT_FILES; do
  if [[ "$f" == *.py ]]; then
    python3 -c "import py_compile; py_compile.compile('$f', doraise=True)" 2>/dev/null
    if [ $? -ne 0 ]; then
      echo "WARNING: Python syntax error in $f" >&2
    fi
  fi
done

exit 0
