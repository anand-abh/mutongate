#!/usr/bin/env bash
# Two-arm programming-language smoke (first N steps).
# Usage:
#   ./scripts/run-pl-smoke.sh baseline [n=5]
#   ./scripts/run-pl-smoke.sh muton [n=5]
set -euo pipefail
export PATH="${HOME}/.bun/bin:${HOME}/.local/bin:${PATH}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/harbor-lib.sh
source "${SCRIPT_DIR}/harbor-lib.sh"

ROOT="$(mutongate_root)"
ARM="${1:?arm: baseline|muton}"
N="${2:-5}"
BENCH="$(find_bench_clone "$ROOT")"
SRC="${BENCH}/tasks/programming-language"
SLICE="${BENCH}/.alb/smoke/programming-language"
MODEL="${MUTON_MODEL:-gpt-5.6-luna}"
JOB="pl-smoke${N}-${ARM}"

test -n "${OPENAI_API_KEY:-}"
python3 "${SCRIPT_DIR}/slice_task.py" --src "$SRC" --dest "$SLICE" --n "$N"

HARBOR_ARGS=(
  harbor run
  -p "$SLICE"
  -a language_agent.agent:SequentialPi
  -m "openai/${MODEL}"
  --ak version=0.85.1
  --agent-timeout-multiplier 5
  --n-concurrent 1
  --job-name "$JOB"
  --ae "OPENAI_API_KEY=${OPENAI_API_KEY}"
  --yes
)

export PYTHONPATH="${SLICE}:${PYTHONPATH:-}"

if [[ "$ARM" == "muton" ]]; then
  BUN_BIN_RESOLVED="$(discover_bun)"
  MOUNTS_FILE="$ROOT/harbor/mounts-hooks.json"
  write_mounts "$ROOT" "$BUN_BIN_RESOLVED" "$MOUNTS_FILE"
  cold_hive "$ROOT"
  HARBOR_ARGS+=(
    --ae "MUTON_MODEL=${MODEL}"
    --ae "MUTON_API_KEY=${OPENAI_API_KEY}"
    --ae "MUTON_VECTOR=1"
    --ae "MUTON_MAX_SEARCHES=10"
    --ae "BASH_ENV=/opt/muton/bashenv.sh"
    --ae "PI_CODING_AGENT_DIR=/tmp/pi-muton"
    --mounts "$(cat "$MOUNTS_FILE")"
    --extra-docker-compose "$ROOT/harbor/compose-use-bridge.yaml"
    --artifact /tmp/muton-agent-store
  )
elif [[ "$ARM" != "baseline" ]]; then
  echo "error: arm must be baseline or muton" >&2
  exit 2
fi

echo "PL smoke arm=${ARM} n=${N} job=${JOB}"
echo "  slice: ${SLICE}"
cd "$BENCH"
sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
exec "${HARBOR_ARGS[@]}"
