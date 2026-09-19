#!/usr/bin/env bash
# Shared Harbor/mutongate helpers. Sourced by harbor-run.sh and
# run-database-analytics.sh — not executed directly.
# shellcheck shell=bash

mutongate_root() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  echo "$here"
}

realpath_py() {
  python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$1"
}

# Resolve the host Bun binary to bind-mount into the Harbor container.
# Honors BUN_BIN; otherwise `command -v bun`, then ~/.bun/bin/bun.
discover_bun() {
  local candidate=""
  if [[ -n "${BUN_BIN:-}" ]]; then
    candidate="$BUN_BIN"
  elif command -v bun >/dev/null 2>&1; then
    candidate="$(command -v bun)"
  elif [[ -x "${HOME}/.bun/bin/bun" ]]; then
    candidate="${HOME}/.bun/bin/bun"
  else
    echo "error: bun not found (tried command -v bun and ~/.bun/bin/bun). Install Bun or set BUN_BIN." >&2
    return 1
  fi
  if [[ ! -e "$candidate" ]]; then
    echo "error: bun not found at ${candidate}" >&2
    return 1
  fi
  realpath_py "$candidate"
}

# Walk parents of a task path until systems.toml + tasks/ (alb repo root).
find_bench_root() {
  local dir start
  dir="$(cd "$1" && pwd)"
  start="$dir"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/systems.toml" && -d "$dir/tasks" ]]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  echo "error: cannot find agent-learning-bench root from ${start} (need systems.toml and tasks/)." >&2
  return 1
}

find_bench_clone() {
  local root="$1"
  local candidate
  if [[ -n "${AGENT_LEARNING_BENCH:-}" ]]; then
    candidate="${AGENT_LEARNING_BENCH}"
    if [[ -f "$candidate/systems.toml" && -d "$candidate/tasks/database-analytics" ]]; then
      realpath_py "$candidate"
      return 0
    fi
    echo "error: AGENT_LEARNING_BENCH=${candidate} is not an agent-learning-bench clone." >&2
    return 1
  fi
  for candidate in \
    "${root}/../agent-learning-bench" \
    "${PWD}" \
    "${PWD}/agent-learning-bench"; do
    if [[ -f "$candidate/systems.toml" && -d "$candidate/tasks/database-analytics" ]]; then
      realpath_py "$candidate"
      return 0
    fi
  done
  echo "error: agent-learning-bench not found. Clone it next to mutongate or set AGENT_LEARNING_BENCH:" >&2
  echo "  git clone https://github.com/manojbajaj95/agent-learning-bench" >&2
  return 1
}

# Fill harbor/mounts.template.json → harbor/mounts-hooks.json.
write_mounts() {
  local root="$1" bun="$2" out="$3"
  python3 - "$root" "$bun" "$out" <<'PY'
import json
import sys
from pathlib import Path

root, bun, out = sys.argv[1], sys.argv[2], sys.argv[3]
template = Path(root) / "harbor" / "mounts.template.json"
data = json.loads(template.read_text())
for mount in data:
    source = mount.get("source", "")
    source = source.replace("<MUTONGATE_ROOT>", root).replace("<BUN_BIN>", bun)
    mount["source"] = source
Path(out).write_text(json.dumps(data, indent=2) + "\n")
PY
}

count_steps() {
  python3 -c 'import re,sys,pathlib; t=pathlib.Path(sys.argv[1]).read_text(); print(len(re.findall(r"^\[\[steps\]\]", t, re.M)))' "$1"
}

cold_hive() {
  local root="$1"
  rm -rf "$root/harbor/muton-home"
  mkdir -p "$root/harbor/muton-home"/{cards,logs,scratch,tmp}
  chmod -R a+rwX "$root/harbor/muton-home"
}
