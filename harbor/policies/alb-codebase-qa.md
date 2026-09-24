# ALB codebase-qa (Flask / SWE-QA) — trust hive

Minimal Muton tips for agent-learning-bench `codebase-qa`.
Task mechanics live in the step instruction; do not restate them here.
Swap via `MUTON_TASK_POLICY=/opt/muton/policies/alb-codebase-qa.md`.

## Agent tips

MUTON HIVE — nothing auto-injected. Prefer **`muton_get`** when you know or can guess a slug; otherwise **`muton_search`**. `muton_tree` / `muton_ls` are OK to discover slugs, then get.
- `muton_search` queries must be **natural-language questions or sentences** (close to `/app/question.md`), not keyword bags or boilerplate like “relevant files/symbols.”
- When a returned card names a `/data/repo` path or states the needed behavior: `read` that path if you need a quote, then write `/app/answer.json`. Do **not** broad `grep`/`rg`/`find` to re-discover what the card already said.
- Trust location/symbol/behavior facts from get/search. Do not trust answer prose with no path — then explore the repo.
- Skip Muton only if get/search yield nothing useful.

## Reflection

Store durable locations/symbols (paths, APIs, how pieces connect). Prefer short roots like `module`, `api`, `pattern`, `gotcha`. Do not store gold answer prose or one-off Q&A.
