# Vector hive + agentic search

Cards are written with the **stock** reflection prompt (0–5), **ungated**, with **no** primer and **no** initial chat-log card.

On each card write, Muton embeds `title + use_when + body` via an OpenAI-compatible `/embeddings` API (`MUTON_EMBED_MODEL`, default `text-embedding-3-small`) and stores the vector in `index.sqlite` (`card_embeddings`).

## Agent retrieval

Harbor Pi does **not** auto-inject search hits. The extension registers a `muton_search` tool:

- Semantic (cosine) search over card embeddings
- Budget: **10** calls per step (`MUTON_MAX_SEARCHES`)
- Prompt guidelines tell the model to search for **schema** facts and **question-specific** facts before relying on the DB alone

Env for Harbor: `MUTON_VECTOR=1`, `MUTON_HYBRID=0`, `MUTON_CARD_GATE=0`.

## CLI

```bash
MUTON_VECTOR=1 muton search --json --k 5 "qualifying q1 null encoding"
```

Tests can set `MUTON_EMBED_MOCK=1` for deterministic local vectors.
