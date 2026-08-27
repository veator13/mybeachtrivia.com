#!/bin/bash
# Beach Trivia — daily leads research runner.
# Triggered by launchd at several times a day; the date-stamp guard below means
# it only does real work the FIRST time the Mac is awake on any given day.

set -uo pipefail

AGENT_DIR="$HOME/beachtrivia-leads-agent"
STAMP="$AGENT_DIR/.last-run"
TODAY="$(date +%Y-%m-%d)"

mkdir -p "$AGENT_DIR/logs"

# Already ran today? bail.
if [ -f "$STAMP" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$TODAY" ]; then
  exit 0
fi

# Need a network connection.
if ! curl -sf -m 10 https://www.google.com >/dev/null 2>&1; then
  echo "$(date)  no network, will retry at next launchd interval" >> "$AGENT_DIR/logs/skips.log"
  exit 0
fi

LOG="$AGENT_DIR/logs/$TODAY.log"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

{
  echo "================================================================"
  echo "Beach Trivia leads research — started $(date)"
  echo "================================================================"
  cd "$AGENT_DIR" || exit 1
  /opt/homebrew/bin/claude -p "$(cat "$AGENT_DIR/task.md")" --verbose 2>&1
  echo ""
  echo "---- claude exited $? — $(date) ----"
} >> "$LOG" 2>&1

# Stamp the day regardless of outcome so a persistent failure doesn't loop all day.
echo "$TODAY" > "$STAMP"
