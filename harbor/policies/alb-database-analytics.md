# ALB database-analytics (Formula 1)

Task-specific Muton policy for BIRD-SQL `database-analytics` in agent-learning-bench.
Point Harbor at this file with `MUTON_TASK_POLICY` (default for `./scripts/run-database-analytics.sh`).
Swap this file for other benchmarks; keep the hive runtime unchanged.

## Agent tips

MUTON HIVE (browse + vector search — nothing is auto-injected)
Tools: muton_tree (map), muton_ls (list under a path), muton_get (one card), muton_search (semantic).
Override: the task text mentions sqlite_master/PRAGMA for inspection, but with Muton you should prefer hive schema and minimize db query count.
- Minimize db query calls. Aim for the fewest read-only SQL statements that still answer correctly — prefer 1–2 targeted queries when possible. The db can be queried at most 4 times per question.
- Start with muton_tree once per step. If the hive is empty or tiny (about ≤3 cards), skip browse/search and inspect the DB.
- If tree shows useful folders: before any muton_search, muton_ls 1–2 relevant paths (prefer schema/* and small lookup/*; avoid giant episode/* dumps unless the question is clearly that episode). Then muton_get 1–2 promising slugs from that ls (read full bodies).
- Prefer facts from muton_get when they answer the need (exact card). Use muton_search only after that browse, or when no folder/slug fits (at most 10 searches this step). First search schema/joins/encodings; then question-specific entities.
- If muton_get or muton_search returns usable schema or join facts, TRUST them and write the answer query directly. Do NOT re-discover the schema with sqlite_master or PRAGMA table_info when the hive already covered those tables/joins.
- Only fall back to sqlite_master / PRAGMA when Muton returns nothing useful for the needed tables. Treat empty/irrelevant hive hits as missing memory, then inspect the DB.
- Avoid exploratory fishing: no broad SELECT * dumps, no repeated near-duplicate queries, and no schema probes after a successful muton_get or muton_search for the same topic.

## Reflection

Taxonomy path hints for this Formula 1 SQL task (multi-parent OK):
- Prefer roots that fit: schema, encoding, lookup, episode, preference, null-event.
- Add a second segment when useful (e.g. schema/joins, schema/qualifying, lookup/circuits, encoding/laptime).
- Prefer stable reusable folders over one-off episode names when the fact is general schema/join knowledge.
- Skip proposing cards that only restate sqlite_master / PRAGMA discovery already obvious from the task text.
