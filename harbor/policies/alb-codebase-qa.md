# ALB codebase-qa (Flask / SWE-QA)

Task-specific Muton policy for agent-learning-bench `codebase-qa`.
Built on top of the task instruction (read-only `/data/repo`, ground answers in files/symbols).
Swap via `MUTON_TASK_POLICY=/opt/muton/policies/alb-codebase-qa.md`.

## Agent tips

MUTON HIVE (browse + vector search — nothing is auto-injected)
Tools: muton_tree (map), muton_ls (list under a path), muton_get (one card), muton_search (semantic).

Task world (from the step instruction):
- One read-only Flask tree at `/data/repo`. Do not edit it.
- Read `/app/question.md`, find the answer in the repository, write `/app/answer.json` as `{"answer": "..."}`.
- Ground the answer in files and symbols you actually found. Stop after writing the answer.

Muton usage:
- Start with muton_tree once per step when the hive may hold prior layout/symbol facts. If empty or tiny (about ≤3 cards), explore the repo without further Muton calls.
- When folders look relevant, muton_ls then muton_get promising slugs before muton_search.
- Use muton_search for open-ended recall (module layout, “where is X”, prior gotchas). Prefer hive-named paths/symbols before broad repo-wide greps or re-walking the whole tree.
- TRUST location and symbol facts from muton_get / muton_search when they point at real paths under `/data/repo` — open those files first. Do NOT treat a prior *answer string* in a card as ground truth; re-check the code if the question asks for behavior or wording.
- Prefer fewer redundant explores: reuse known module maps instead of rediscovering the same subtree every question.

## Reflection

Taxonomy path hints for this Flask codebase task (multi-parent OK):
- Prefer roots: layout, module, api, pattern, gotcha, test.
- Add a second segment when useful (e.g. module/blueprints, api/json, test/cli).
- Store durable **locations, symbols, and reusable behavior** (file paths, class/function names, how pieces connect).
- Do NOT store full gold-style answer prose or one-off Q&A pairs — those poison later steps and fail the holdout spirit of the bench.
- Skip cards that only restate the task instruction.
