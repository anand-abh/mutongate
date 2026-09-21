# mutongate

Private Muton fork for **Harbor / Pi database-analytics** experiments: a durable **vector card hive**, an agentic **`muton_search`** tool (no auto-inject), and **silent ungated reflect** that proposes cards and optionally **merges** them into near neighbors.

Version: `0.3.0`

## What this is

Mutongate wraps [Muton](https://github.com/manojbajaj95/muton)-style shared memory around the BIRD-SQL Formula 1 `database-analytics` task in [agent-learning-bench](https://github.com/manojbajaj95/agent-learning-bench).

Per question the Pi agent should:

1. Call **`muton_search`** (semantic) for schema / joins / encodings, then for question-specific facts (≤10 searches/step).
2. Prefer **1–2 targeted `db query` calls** (soft ceiling **≤4** per question); trust hive schema instead of re-probing with `sqlite_master` / `PRAGMA` when search already covered the tables.
3. Write `/app/answer.json`, then on session end **reflect** silently into the hive.

Cards live as markdown under `MUTON_HOME` (Harbor: cold hive each run). On write, Muton embeds `title + use_when + body` and stores vectors in `index.sqlite`.

## Architecture (src)

Dependency direction (outer → inner; never reverse):

```text
cli → hooks / mcp / hosts / reflection / search → store → cards
```

| Area | Role |
|------|------|
| `cards/` | Frontmatter parse/serialize (`title`, `use_when`, timestamps + body) |
| `store/` | Filesystem hive + SQLite FTS/embeddings index |
| `search/` | BM25 fallback, embeddings, **vector** cosine retrieval |
| `reflection/` | Session-end propose; **vector k-NN + agent merge** on write |
| `cli/` / `mcp/` / `hooks/` | Surfaces for humans, tools, and host shutdown |

Do not add a catch-all `utils.ts`. Paths live in `store/`; host completion lives in `reflection/complete/`.

## Cards and propose/merge

- **Card file:** `~/.agents/muton/cards/<slug>.md` (Harbor live dir is `/tmp/muton-agent-store` via wrapper).
- **Required fields:** `title`, `use_when`; system: `created_at`, `updated_at`; body = durable fact.
- **Reflect:** stock prompt, 0–5 proposals, **no review gate**, logs only under `logs/` (hooks stay silent).
- **On propose** (CLI / MCP / reflect):
  1. Embed the proposal; retrieve **`MUTON_MERGE_K`** nearest cards (default **2**).
  2. A small completer call decides **`create`** vs **`merge`** into one neighbor slug.
  3. Merge **expands** `title` / `use_when` / `body` (keeps slug + `created_at`); create allocates a new slug.
  4. Fallback: lexical FTS near-dup upsert if merge agent is off, neighbors missing, or the decision call fails.

| Variable | Default | Meaning |
|----------|---------|---------|
| `MUTON_MERGE_K` | `2` | Vector neighbors considered for merge |
| `MUTON_MERGE_AGENT` | on (`1`) | Set `0` / `false` to force lexical upsert only |

## Agent search guidelines (Harbor Pi)

Injected by `harbor/opt-muton/muton.ts` (override the task’s schema-inspect nudge):

- Minimize `db query`; prefer 1–2; **at most 4 per question**.
- `muton_search` before SQL; schema/joins first, then entities.
- Trust usable hive schema — do not re-run `sqlite_master` / `PRAGMA` when search covered those tables.
- Fall back to DB inspection only when search misses; avoid fishing / duplicate probes.

## Layout (repo)

| Path | Purpose |
|------|---------|
| `src/` | Muton CLI / library source |
| `prompts/REFLECTION.md` | Optional extra reflection text (appended to built-in prompt) |
| `harbor/` | Pi extension, `muton-real` binary, wrapper, mounts, compose bridge |
| `scripts/run-database-analytics.sh` | Smoke 10 / medium 40 / full 174 |
| `scripts/harbor-run.sh` | Low-level `harbor run -p <task>` |
| `docs/VECTOR.md` | Vector hive + `muton_search` detail |
| `docs/DATABASE-ANALYTICS.md` | Bench prerequisites and recipes |

## Build / develop

```bash
bun install
bun test
bun run typecheck
bun run lint
bun run build
cp dist/cli.js harbor/bin/muton-real
echo "0.3.0" > harbor/MUTON_VERSION.txt
```

Requires Node ≥ 22.14 and Bun for the Harbor bind-mount.

## Env (Harbor agent)

| Variable | Meaning |
|----------|---------|
| `MUTON_VECTOR=1` | Semantic search over card embeddings (Harbor default) |
| `MUTON_MAX_SEARCHES` | Per-step `muton_search` budget (default / Harbor: **10**) |
| `MUTON_VECTOR_K` | Default k for CLI/MCP vector search (default 5) |
| `MUTON_MERGE_K` | Neighbors for propose-merge (default **2**) |
| `MUTON_MERGE_AGENT` | Agent merge on propose (default on) |
| `MUTON_EMBED_MODEL` | Embeddings model (default `text-embedding-3-small`) |
| `MUTON_EMBED_MOCK=1` | Deterministic fake embeddings (tests) |
| `MUTON_MODEL` / `MUTON_API_KEY` | Reflect (+ merge decision) HTTP completer |
| `OPENAI_API_KEY` | Passed through to the Pi agent |
| `MUTON_HOME` | Hive root (wrapper overrides to a writable live dir) |

Harbor runs: **cold hive**, `MUTON_VECTOR=1`, ungated reflect, no auto-inject of search hits.

## Harbor database-analytics (10 / 40 / 174)

Needs a local [agent-learning-bench](https://github.com/manojbajaj95/agent-learning-bench) clone, Docker, Harbor CLI, Bun, and `OPENAI_API_KEY`. Full recipes: [docs/DATABASE-ANALYTICS.md](docs/DATABASE-ANALYTICS.md).

```bash
export AGENT_LEARNING_BENCH=/path/to/agent-learning-bench
export OPENAI_API_KEY=…

./scripts/run-database-analytics.sh 10          # first 10 → .alb/smoke/database-analytics
./scripts/run-database-analytics.sh --n 40      # first 40 → same alb slice dest
./scripts/run-database-analytics.sh 174         # full → tasks/database-analytics
```

Smoke and medium **share** `.alb/smoke/database-analytics`; the runner re-slices to N each time. There is no separate medium path and no `database-analytics-hooks10` directory.

### Headline medium (first 40) reference

Rough checkpoints on this stack (mean `db_queries` / hits):

| Setup | mean `db_queries` | hits |
|-------|------------------:|-----:|
| Vector tool only | ~3.0 | ~31/40 |
| + minimize-db guidelines | ~1.6 | 33/40 |
| + ≤4 queries tip | ~1.48 | 33/40 |
| + agent vector merge (k=2) | **~1.43** | **33/40** |

ICL first-40 floor from the shared CSV is about **1.15** mean queries / **34/40** hits. Treat numbers as experimental; re-run after prompt or hive changes.

## CLI snippets

```bash
MUTON_VECTOR=1 muton search --json --k 5 "qualifying q1 null encoding"
muton propose --title "…" --use-when "…" --body "…"
muton reflect --transcript /path/to/session.jsonl --host pi
```

Without `MUTON_VECTOR`, search falls back to BM25 FTS.

## Docs

- [docs/VECTOR.md](docs/VECTOR.md) — embeddings, `muton_search`, guidelines
- [docs/DATABASE-ANALYTICS.md](docs/DATABASE-ANALYTICS.md) — 10 / 40 / 174 Harbor recipes
- [AGENTS.md](AGENTS.md) — contributor commands and module nesting rules

## License

Same as upstream Muton (see `LICENSE`).
