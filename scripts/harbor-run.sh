#!/usr/bin/env bash
# Harbor pi + mutongate against any database-analytics task path:
#   <bench>/.alb/smoke/database-analytics   (alb first-N slice; 10 or 40)
#   <bench>/tasks/database-analytics        (full 174)
#
# Usage:
#   ./scripts/harbor-run.sh <task_path> [job_name]
#   ./scripts/harbor-run.sh "$BENCH/.alb/smoke/database-analytics" --dry-run
set -euo pipefail
export PATH="${HOME}/.bun/bin:${HOME}/.local/bin:${PATH}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/harbor-lib.sh
source "${SCRIPT_DIR}/harbor-lib.sh"

ROOT="$(mutongate_root)"
export MUTONGATE_ROOT="$ROOT"

usage() {
  sed -n '2,8p' "$0" | tr -d '#'
  echo "Env: BUN_BIN, OPENAI_API_KEY, MUTON_MODEL, MUTONGATE_DRY_RUN=1"
}

DRY_RUN="${MUTONGATE_DRY_RUN:-0}"
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
    --)
      SEEN_DOUBLE_DASH=1
      shift
      ;;
    -*)
      echo "error: unknown flag $1 (extra Harbor flags go after --)" >&2
      exit 2
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

if [[ ${#POSITIONAL[@]} -lt 1 ]]; then
  usage >&2
  exit 2
fi

TASK="${POSITIONAL[0]}"
JOB_NAME="mutongate-database-analytics"
if [[ ${#POSITIONAL[@]} -ge 2 ]]; then
  JOB_NAME="${POSITIONAL[1]}"
fi

if [[ ! -d "$TASK" ]]; then
  echo "error: task path does not exist: ${TASK}" >&2
  echo "Expected an alb slice (.alb/smoke/database-analytics) or tasks/database-analytics." >&2
  exit 1
fi
TASK="$(realpath_py "$TASK")"
if [[ ! -f "$TASK/task.toml" ]]; then
  echo "error: ${TASK} has no task.toml (not a Harbor task / slice)." >&2
  exit 1
fi

test -f "$ROOT/harbor/bin/muton-real"

if [[ "$DRY_RUN" != "1" ]]; then
  test -n "${OPENAI_API_KEY:-}"
fi

BUN_BIN_RESOLVED="$(discover_bun)"
export BUN_BIN="$BUN_BIN_RESOLVED"

MOUNTS_FILE="$ROOT/harbor/mounts-hooks.json"
write_mounts "$ROOT" "$BUN_BIN_RESOLVED" "$MOUNTS_FILE"
MOUNTS="$(cat "$MOUNTS_FILE")"

BENCH="$(find_bench_root "$TASK")"
STEPS="$(count_steps "$TASK/task.toml")"
MODEL="${MUTON_MODEL:-gpt-5.6-luna}"
# Task-specific tips/reflection extras (one markdown file). Override per benchmark.
TASK_POLICY="${MUTON_TASK_POLICY:-/opt/muton/policies/alb-database-analytics.md}"

CMD=(
  harbor run -p "$TASK" -a pi -m "openai/${MODEL}"
  --agent-timeout-multiplier 5
  --n-concurrent 1
  --job-name "$JOB_NAME"
  --ae "OPENAI_API_KEY=${OPENAI_API_KEY:-}"
  --ae "MUTON_MODEL=${MODEL}"
  --ae "MUTON_API_KEY=${OPENAI_API_KEY:-}"
  --ae "MUTON_VECTOR=1"
  --ae "MUTON_MAX_SEARCHES=10"
  --ae "MUTON_TASK_POLICY=${TASK_POLICY}"
  --ae "BASH_ENV=/opt/muton/bashenv.sh"
  --ae "PI_CODING_AGENT_DIR=/tmp/pi-muton"
  --mounts "$MOUNTS"
  --extra-docker-compose "$ROOT/harbor/compose-use-bridge.yaml"
  --artifact /tmp/muton-agent-store
  --yes
)
if [[ ${#EXTRA[@]} -gt 0 ]]; then
  CMD+=("${EXTRA[@]}")
fi

echo "mutongate harbor-run: ${STEPS} steps"
echo "  task:  ${TASK}"
echo "  bench: ${BENCH}"
echo "  bun:   ${BUN_BIN_RESOLVED}"
echo "  job:   ${JOB_NAME}"
echo "  vector-tool: on  max_searches: 10  (cold hive; no auto-inject)"
echo "  task_policy: ${TASK_POLICY}"

if [[ "$DRY_RUN" == "1" ]]; then
  printf 'dry-run:'
  printf ' %q' "${CMD[@]}"
  printf '\n'
  exit 0
fi

if ! command -v harbor >/dev/null 2>&1; then
  echo "error: harbor is not on PATH (uv tool install harbor / pip install harbor)." >&2
  exit 1
fi

cold_hive "$ROOT"
sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
cd "$BENCH"
exec "${CMD[@]}"
