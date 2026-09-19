# Card gate (primer only)

After stock reflect:

1. Exactly one **primer** proposal (`kind: "primer"`) is judged by `DEFAULT_PRIMER_PROMPT` → merge into slug `primer` or discard.
2. Optional **general** cards (0–5) are always written with lexical upsert (`writeProposedCards`) — **no LLM gate**. They populate the hive freely.

The Schema Primer is **always pinned** on search (hybrid and plain), so hybrid retrieval is **n + m + 1** when a primer exists.

## Primer judge

| Action | Effect |
|--------|--------|
| `merge` | `upsertPrimer` with full rewritten primer body |
| `discard` | no write |

Empty primer + parse error → create from proposal. Existing primer + parse error → discard (avoid bloat).

The primer judge always runs (independent of `MUTON_CARD_GATE`).

## General cards

Ungated. `store.upsert` merges near-duplicates by title/content overlap.

`gateAndWrite` remains available for tests / tooling but is **not** used on the reflect commit path.

## Logs

`$MUTON_HOME/logs/gate.log` — JSONL for primer (and any manual `gateAndWrite`) decisions.
`$MUTON_HOME/logs/reflect.log` — `commit primer+ungated-hive …` lines.
