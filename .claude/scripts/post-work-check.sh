#!/bin/bash
# Stop hook for the implementer agent — runs once when it finishes.
# If the project defines a lint or test script, run it and feed failures
# back so the implementer fixes them before reporting the task done.
# No-ops harmlessly if there's no package.json or no matching script.

[ -f package.json ] || exit 0

FAILED=0
OUTPUT=""

for SCRIPT in lint test; do
  if npm run 2>/dev/null | grep -qE "^\s*$SCRIPT\b"; then
    RESULT=$(npm run "$SCRIPT" --silent 2>&1)
    if [ $? -ne 0 ]; then
      FAILED=1
      OUTPUT="$OUTPUT

$SCRIPT failed:
$RESULT"
    fi
  fi
done

if [ $FAILED -eq 1 ]; then
  echo "$OUTPUT" >&2
  exit 2
fi

exit 0
