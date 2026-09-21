# Vector hive + agentic search

Cards are written with the **stock** reflection prompt (0–5), **ungated**.

On each card write, Muton embeds `title + use_when + body` via an OpenAI-compatible `/embeddings` API (`MUTON_EMBED_MODEL`, default `text-embedding-3-small`) and stores the vector in `index.sqlite` (`card_embeddings`).

## Agent retrieval

Harbor Pi does **not** auto-inject search hits. The extension registers a `muton_search` tool:

- Semantic (cosine) search over card embeddings
- Budget: **10** calls per step (`MUTON_MAX_SEARCHES`)
- Prompt guidelines tell the model to:
  1. **Minimize `db query` count** (prefer 1–2 targeted SQL statements)
  2. Search **schema** then **question-specific** facts via `muton_search` first
  3. **Trust hive schema** — do not re-run `sqlite_master` / `PRAGMA` when search already covered the needed tables/joins
  4. Only fall back to DB schema inspection when search misses

Harbor env: `MUTON_VECTOR=1`, `MUTON_MAX_SEARCHES=10` (cold hive every run). Guidelines tell the agent to search the hive for durable facts (language rules, schema, style, etc.) before rediscovering them; SQL tasks still get a prefer-few-queries tip.

## CLI

```bash
MUTON_VECTOR=1 muton search --json --k 5 "qualifying q1 null encoding"
```

Without `MUTON_VECTOR`, CLI/MCP fall back to BM25 FTS. Tests can set `MUTON_EMBED_MOCK=1` for deterministic local vectors.
