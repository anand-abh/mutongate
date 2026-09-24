# ALB codebase-qa (Flask / SWE-QA) — trust hive

Minimal Muton tips for agent-learning-bench `codebase-qa`.
Task mechanics live in the step instruction; do not restate them here.
Swap via `MUTON_TASK_POLICY=/opt/muton/policies/alb-codebase-qa.md`.

## Agent tips

MUTON HIVE — nothing auto-injected.
- Call `muton_search` early when the hive may hold prior paths/symbols (`muton_get` if you already know a slug). Do not start with `muton_tree` / `muton_ls`.
- After `muton_search` / `muton_get` returns a card that names a path under `/data/repo`: allowed tools until `/app/answer.json` is written are only `read` on that path (optional second `read` on a path the first file clearly imports) and `write`. Forbidden: `bash` with `grep`/`rg`/`find`, and any other `/data/repo` walk.
- Sequence: search → read cited file → write answer. Stop. Do not “verify with a repo search.”
- Use `bash` grep/rg/find only if Muton returned no cards (or only cards with no `/data/repo` path).

## Reflection

Store durable locations/symbols (paths, APIs, how pieces connect). Prefer short roots like `module`, `api`, `pattern`, `gotcha`. Do not store gold answer prose or one-off Q&A.
