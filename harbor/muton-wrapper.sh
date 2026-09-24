#!/bin/bash
# Harbor agent (uid 1001) cannot reliably write host-uid-1000 bind files.
REAL_MUTON=/usr/local/libexec/muton-real
SYNC_DIR=/home/agent/.agents/muton
LIVE_DIR=/tmp/muton-agent-store
mkdir -p "$LIVE_DIR/cards" "$LIVE_DIR/logs" "$LIVE_DIR/scratch" "$LIVE_DIR/tmp" "$SYNC_DIR"

# Seed live store from the bind-mounted hive when live is empty (fresh container)
# OR when sync has cards but live has none in sqlite yet (cards dir placeholder only).
sync_cards="$(ls -A "$SYNC_DIR/cards" 2>/dev/null | wc -l | tr -d ' ')"
live_cards="$(ls -A "$LIVE_DIR/cards" 2>/dev/null | wc -l | tr -d ' ')"
if [ "${sync_cards:-0}" -gt 0 ] && [ "${live_cards:-0}" -eq 0 ]; then
  cp -a "$SYNC_DIR/cards/." "$LIVE_DIR/cards/" 2>/dev/null || true
  if [ -f "$SYNC_DIR/index.sqlite" ]; then
    cp -a "$SYNC_DIR/index.sqlite" "$LIVE_DIR/index.sqlite" 2>/dev/null || true
  fi
fi

export PATH="/usr/local/bin:$PATH"
export MUTON_HOME="$LIVE_DIR"
# Log every CLI invocation for post-hoc analysis
echo "$(date -Is) muton $*" >> "$LIVE_DIR/muton-cli-calls.log" 2>/dev/null || true
"$REAL_MUTON" "$@"
rc=$?

if [ -d "$SYNC_DIR" ] && [ -w "$SYNC_DIR" ]; then
  mkdir -p "$SYNC_DIR/cards" "$SYNC_DIR/logs"
  if [ -d "$LIVE_DIR/cards" ]; then
    cp -a "$LIVE_DIR/cards/." "$SYNC_DIR/cards/" 2>/dev/null || true
  fi
  if [ -f "$LIVE_DIR/index.sqlite" ]; then
    if [ ! -e "$SYNC_DIR/index.sqlite" ] || [ -w "$SYNC_DIR/index.sqlite" ]; then
      cp -a "$LIVE_DIR/index.sqlite" "$SYNC_DIR/index.sqlite" 2>/dev/null || true
    else
      cp -a "$LIVE_DIR/index.sqlite" "$SYNC_DIR/index-agent.sqlite" 2>/dev/null || true
    fi
  fi
  for f in reflect-audit.log muton-cli-calls.log search-rewrite.log search-debug.log hook-debug.log post-verify-reflect.log; do
    if [ -f "$LIVE_DIR/$f" ]; then
      cp -a "$LIVE_DIR/$f" "$SYNC_DIR/$f" 2>/dev/null || true
    fi
  done
  if [ -d "$LIVE_DIR/logs" ]; then
    cp -a "$LIVE_DIR/logs/." "$SYNC_DIR/logs/" 2>/dev/null || true
  fi
fi
exit $rc
