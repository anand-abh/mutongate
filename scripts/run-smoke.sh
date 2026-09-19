#!/usr/bin/env bash
# Example Harbor smoke with mutongate (hybrid k + cardgate).
# Usage: ./scripts/run-smoke.sh <k_instruction> <k_question> <task_path> [job_name]
set -euo pipefail
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"

K_INST="${1:?k_instruction}"
K_Q="${2:?k_question}"
TASK="${3:?task_path}"
JOB_NAME="${4:-mutongate-smoke}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export MUTONGATE_ROOT="$ROOT"

test -n "${OPENAI_API_KEY:-}"
test -f "$ROOT/harbor/bin/muton-real"
test -d "$TASK"

# Refresh mounts to this checkout
python3 - <<PY
import json
from pathlib import Path
root = Path("$ROOT")
mounts = [
  {"type":"bind","source":"/home/ubuntu/.bun/bin/bun","target":"/usr/local/bin/bun","read_only":True},
  {"type":"bind","source": str(root/"harbor/bin/muton-real"),"target":"/usr/local/libexec/muton-real","read_only":True},
  {"type":"bind","source": str(root/"harbor/muton-wrapper.sh"),"target":"/usr/local/bin/muton","read_only":True},
  {"type":"bind","source": str(root/"harbor/muton-home"),"target":"/home/agent/.agents/muton"},
  {"type":"bind","source": str(root/"harbor/opt-muton/muton.ts"),"target":"/opt/muton/muton.ts","read_only":True},
  {"type":"bind","source": str(root/"harbor/opt-muton/bashenv.sh"),"target":"/opt/muton/bashenv.sh","read_only":True},
]
(root/"harbor/mounts-hooks.json").write_text(json.dumps(mounts, indent=2) + "\n")
PY

# Cold hive
rm -rf "$ROOT/harbor/muton-home"
mkdir -p "$ROOT/harbor/muton-home"/{cards,logs,scratch,tmp}
chmod -R a+rwX "$ROOT/harbor/muton-home"
sudo chmod 666 /var/run/docker.sock 2>/dev/null || true

BENCH="$(cd "$TASK/../../.." && pwd)"  # …/agent-learning-bench if task under .alb/smoke/…
cd "$BENCH" 2>/dev/null || cd "$(dirname "$TASK")/../../.."

MOUNTS=$(cat "$ROOT/harbor/mounts-hooks.json")
exec harbor run -p "$TASK" -a pi -m openai/gpt-5.6-luna \
  --agent-timeout-multiplier 5 \
  --n-concurrent 1 \
  --job-name "$JOB_NAME" \
  --ae "OPENAI_API_KEY=${OPENAI_API_KEY}" \
  --ae "MUTON_MODEL=gpt-5.6-luna" \
  --ae "MUTON_API_KEY=${OPENAI_API_KEY}" \
  --ae "MUTON_HYBRID=1" \
  --ae "MUTON_HYBRID_K_INSTRUCTION=${K_INST}" \
  --ae "MUTON_HYBRID_K_QUESTION=${K_Q}" \
  --ae "MUTON_CARD_GATE=1" \
  --ae "BASH_ENV=/opt/muton/bashenv.sh" \
  --ae "PI_CODING_AGENT_DIR=/tmp/pi-muton" \
  --mounts "$MOUNTS" \
  --extra-docker-compose "$ROOT/harbor/compose-use-bridge.yaml" \
  --artifact /tmp/muton-agent-store \
  --yes
