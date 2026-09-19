#!/usr/bin/env bash
# Backward-compatible Harbor wrapper. Prefer run-database-analytics.sh for 10/40/174.
# Usage: ./scripts/run-smoke.sh <k_instruction> <k_question> <task_path> [job_name]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/harbor-run.sh" "$@"
