# ALB codebase-qa (Flask / SWE-QA) — trust hive

Minimal Muton tips for agent-learning-bench `codebase-qa`.
Task mechanics live in the step instruction; do not restate them here.
Swap via `MUTON_TASK_POLICY=/opt/muton/policies/alb-codebase-qa.md`.

## Agent tips

MUTON HIVE — nothing auto-injected.
- Call `muton_search` early when the hive may hold prior paths/symbols (`muton_get` if you already know a slug). Do not start with `muton_tree` / `muton_ls`.
- On a hit that cites a real `/data/repo` path or symbol: `read` that file (and nearby lines if needed), then write `/app/answer.json`. Do **not** follow with broad `grep` / `rg` / `find` “to confirm” — that is wasted cost. One confirming read of the cited path is enough.
- If the card already states the behavior and names the file, answer from card + that one read. Skip rediscovering via repo-wide search.
- Skip Muton only when search returns nothing useful. Never trust answer prose with no path — then explore the repo.

## Reflection

Store durable locations/symbols (paths, APIs, how pieces connect). Prefer short roots like `module`, `api`, `pattern`, `gotcha`. Do not store gold answer prose or one-off Q&A.
