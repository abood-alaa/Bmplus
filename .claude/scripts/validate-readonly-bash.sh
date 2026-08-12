#!/bin/bash
# PreToolUse backstop for read-only advisor agents (frontend-advisor,
# backend-advisor, database-advisor, security-reviewer).
# The agents' own instructions say "never write" — this hook makes it
# actually impossible via Bash, not just discouraged.
# Exit 2 blocks the command and returns the message to the agent.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

[ -z "$COMMAND" ] && exit 0

# Block explicit file-modifying commands
if echo "$COMMAND" | grep -qE '\b(rm|mv|cp|touch|mkdir|chmod|chown|tee)\b|sed[[:space:]]+-i'; then
  echo "Blocked: this agent is read-only. No file modification commands allowed. Report the finding instead — the implementer agent applies changes." >&2
  exit 2
fi

# Block git state changes (read-only git — diff, status, log, show, blame — is fine)
if echo "$COMMAND" | grep -qE '\bgit[[:space:]]+(add|commit|push|merge|rebase|checkout[[:space:]]+-b|reset|stash[[:space:]]+pop|apply)\b'; then
  echo "Blocked: this agent is read-only. No git state changes allowed." >&2
  exit 2
fi

# Block redirection into real files (allow harmless /dev/null, /dev/stderr, /dev/stdout, &1, &2)
if echo "$COMMAND" | grep -qE '>>?[[:space:]]*[^[:space:]]+'; then
  TARGET=$(echo "$COMMAND" | grep -oE '>>?[[:space:]]*[^[:space:]]+' | tail -1 | sed -E 's/^>>?[[:space:]]*//')
  case "$TARGET" in
    /dev/null|/dev/stderr|/dev/stdout|\&1|\&2) ;;
    *)
      echo "Blocked: this agent is read-only. Cannot redirect output into a file ($TARGET)." >&2
      exit 2
      ;;
  esac
fi

exit 0
