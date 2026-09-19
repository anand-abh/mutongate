#!/usr/bin/env bash
# Repeatable database-analytics splits for mutongate (Harbor pi + hybrid/gate).
#
# Sizes:
#   10  | smoke            first 10 → <bench>/.alb/smoke/database-analytics
#   40  | medium           first 40 → same alb slice dest (re-sliced each run)
#   174 | full | dull      all 174 → <bench>/tasks/database-analytics
#
# Usage:
#   ./scripts/run-database-analytics.sh 10
#   ./scripts/run-database-analytics.sh --n 40
#   ./scripts/run-database-analytics.sh full 3 3
#   ./scripts/run-database-analytics.sh smoke --dry-run
#
# Env: AGENT_LEARNING_BENCH, BUN_BIN, OPENAI_API_KEY, MUTON_MODEL
set -euo pipefail
export PATH="${HOME}/.bun/bin:${HOME}/.local/bin:${PATH}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/harbor-lib.sh
source "${SCRIPT_DIR}/harbor-lib.sh"

ROOT="$(mutongate_root)"
export MUTONGATE_ROOT="$ROOT"

usage() {
  cat <<'EOF'
Usage: ./scripts/run-database-analytics.sh <size> [k_instruction] [k_question] [job_name]

  size: 10|smoke   first 10 steps (alb smoke / alb prepare --n 10)
        40|medium  first 40 steps (alb run --n 40 / alb prepare --n 40)
        174|full|dull  all 174 steps (tasks/database-analytics)

  k_* default to 3. Extra Harbor flags go after --.

  10 and 40 both write the alb slice path:
    $AGENT_LEARNING_BENCH/.alb/smoke/database-analytics
  The runner re-slices immediately before Harbor, so the dest matches --n.

Examples:
  export AGENT_LEARNING_BENCH=/path/to/agent-learning-bench
  export OPENAI_API_KEY=…
  ./scripts/run-database-analytics.sh 10
  ./scripts/run-database-analytics.sh --n 40
  ./scripts/run-database-analytics.sh 174
EOF
}

resolve_size() {
  local raw="$1"
  case "$raw" in
    10|smoke) echo 10 ;;
    40|medium) echo 40 ;;
    174|full|dull) echo 174 ;;
    *)
      echo "error: unknown size '${raw}' (use 10|smoke, 40|medium, 174|full|dull)" >&2
      return 2
      ;;
  esac
}

DRY_RUN="${MUTONGATE_DRY_RUN:-0}"
SIZE_RAW=""
K_INST="${MUTON_HYBRID_K_INSTRUCTION:-3}"
K_Q="${MUTON_HYBRID_K_QUESTION:-3}"
JOB_NAME=""
POSITIONAL=()
EXTRA=()
SEEN_DOUBLE_DASH=0
while [[ $# -gt 0 ]]; do
  if [[ "$SEEN_DOUBLE_DASH" -eq 1 ]]; then
    EXTRA+=("$1")
    shift
    continue
  fi
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --n)
      SIZE_RAW="$2"
      shift 2
      ;;
    --)
      SEEN_DOUBLE_DASH=1
      shift
      ;;
    -*)
      echo "error: unknown flag $1 (extra Harbor flags go after --)" >&2
      usage >&2
      exit 2
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

if [[ -z "$SIZE_RAW" ]]; then
  if [[ ${#POSITIONAL[@]} -lt 1 ]]; then
    usage >&2
    exit 2
  fi
  SIZE_RAW="${POSITIONAL[0]}"
  if [[ ${#POSITIONAL[@]} -gt 1 ]]; then
    POSITIONAL=("${POSITIONAL[@]:1}")
  else
    POSITIONAL=()
  fi
fi

if [[ ${#POSITIONAL[@]} -ge 1 ]]; then
  K_INST="${POSITIONAL[0]}"
fi
if [[ ${#POSITIONAL[@]} -ge 2 ]]; then
  K_Q="${POSITIONAL[1]}"
fi
if [[ ${#POSITIONAL[@]} -ge 3 ]]; then
  JOB_NAME="${POSITIONAL[2]}"
fi

N="$(resolve_size "$SIZE_RAW")"
BENCH="$(find_bench_clone "$ROOT")"
SRC="${BENCH}/tasks/database-analytics"
if [[ ! -f "$SRC/task.toml" ]]; then
  echo "error: missing ${SRC}/task.toml" >&2
  exit 1
fi

AVAILABLE="$(count_steps "$SRC/task.toml")"
if [[ "$N" -eq 174 ]]; then
  TASK="$SRC"
  SLICE_DEST=""
  if [[ "$AVAILABLE" -ne 174 ]]; then
    echo "warning: full run expects 174 [[steps]] in task.toml; found ${AVAILABLE}" >&2
  fi
else
  TASK="${BENCH}/.alb/smoke/database-analytics"
  SLICE_DEST="$TASK"
fi

if [[ -z "$JOB_NAME" ]]; then
  JOB_NAME="mutongate-database-analytics-n${N}"
fi

echo "mutongate database-analytics: n=${N} (available in task.toml: ${AVAILABLE})"
echo "  bench: ${BENCH}"
if [[ -n "$SLICE_DEST" ]]; then
  echo "  slice: ${SLICE_DEST}  (alb dest; same path for --n 10 and --n 40)"
else
  echo "  task:  ${TASK}  (full, no slice)"
fi

if [[ -n "$SLICE_DEST" ]]; then
  python3 "${SCRIPT_DIR}/slice_task.py" --src "$SRC" --dest "$SLICE_DEST" --n "$N"
  SLICED="$(count_steps "$SLICE_DEST/task.toml")"
  if [[ "$SLICED" -ne "$N" && "$N" -le "$AVAILABLE" ]]; then
    echo "error: expected ${N} steps in slice, found ${SLICED}" >&2
    exit 1
  fi
fi

export MUTONGATE_DRY_RUN="$DRY_RUN"
HARBOR_ARGS=("$K_INST" "$K_Q" "$TASK" "$JOB_NAME")
if [[ "$DRY_RUN" == "1" ]]; then
  HARBOR_ARGS+=(--dry-run)
fi
if [[ ${#EXTRA[@]} -gt 0 ]]; then
  HARBOR_ARGS+=(-- "${EXTRA[@]}")
fi
exec "${SCRIPT_DIR}/harbor-run.sh" "${HARBOR_ARGS[@]}"
