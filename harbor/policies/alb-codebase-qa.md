# ALB codebase-qa (Flask / SWE-QA) — bare

Minimal Muton tips for agent-learning-bench `codebase-qa`.
Task mechanics live in the step instruction; do not restate them here.
Swap via `MUTON_TASK_POLICY=/opt/muton/policies/alb-codebase-qa.md`.

## Agent tips

MUTON HIVE — nothing auto-injected. Prefer `muton_search` when you need prior paths/symbols; `muton_get` if you already know a slug. Skip Muton when the hive is empty or the question is a fresh repo look-up. Do not start steps with `muton_tree` / `muton_ls`. Trust hive paths/symbols enough to open those files first; do not trust stored answer prose — re-check the code.

## Reflection

Store durable locations/symbols (paths, APIs, how pieces connect). Prefer short roots like `module`, `api`, `pattern`, `gotcha`. Do not store gold answer prose or one-off Q&A.
