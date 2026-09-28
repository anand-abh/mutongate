# Vector hive + agentic search

Cards are written with the **stock** reflection prompt (0–5), **ungated**, plus optional
task-policy `## Reflection` extras from `MUTON_TASK_POLICY`.

On each card write, Muton embeds `title + use_when + body` via an OpenAI-compatible `/embeddings` API (`MUTON_EMBED_MODEL`, default `text-embedding-3-small`) and stores the vector in `index.sqlite` (`card_embeddings`).

## Agent retrieval

Harbor Pi does **not** auto-inject search hits. The extension registers:

- `muton_tree` / `muton_ls` / `muton_get` — taxonomy browse
- `muton_search` — semantic (cosine) search over card embeddings (budget: **10**/step via `MUTON_MAX_SEARCHES`)

**Generic** tip (when no policy): nothing auto-injected; prefer tree → ls → get before search.

**Task-specific** tips (SQL budgets, trust hive vs `sqlite_master`, folder bias, …) live in a single swappable markdown file:

```bash
MUTON_TASK_POLICY=/opt/muton/policies/alb-database-analytics.md
```

See `harbor/policies/README.md`. The Pi extension (`harbor/opt-muton/muton.ts`) loads that file; the hive runtime stays fixed across benchmarks.

Harbor env: `MUTON_VECTOR=1`, `MUTON_MAX_SEARCHES=10`, cold hive every run.

## CLI

```bash
MUTON_VECTOR=1 muton search --json --k 5 "qualifying q1 null encoding"
```

Without `MUTON_VECTOR`, CLI/MCP fall back to BM25 FTS. Tests can set `MUTON_EMBED_MOCK=1` for deterministic local vectors.
