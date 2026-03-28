#!/bin/bash
# PreToolUse hook: blocks dangerous commands
# Exit 0 = allow, Exit 2 = block (stderr sent to Claude)

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [ "$TOOL" = "Bash" ]; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

  # Block destructive commands
  if echo "$COMMAND" | grep -qEi '(rm -rf /|drop\s+table|DROP\s+DATABASE|truncate\s+table|mkfs\.|dd if=|:(){ :|fork bomb)'; then
    echo "BLOCKED: Destructive command detected: $COMMAND" >&2
    exit 2
  fi

  # Block accidental secret exposure
  if echo "$COMMAND" | grep -qEi '(cat.*\.env|echo.*TOKEN|echo.*SECRET|echo.*PASSWORD|curl.*token=)'; then
    echo "BLOCKED: Potential secret exposure in command: $COMMAND" >&2
    exit 2
  fi
fi

exit 0
