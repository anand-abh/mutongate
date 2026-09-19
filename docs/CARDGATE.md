# Card gate

After stock reflect:

1. Exactly one **primer** proposal (`kind: "primer"`) is judged by `DEFAULT_PRIMER_PROMPT` → merge into slug `primer` or discard.
2. Optional **general** cards (0–5) are gated by `DEFAULT_GATE_PROMPT` when `MUTON_CARD_GATE=1`.

The Schema Primer is **always pinned** on search (hybrid and plain).

## Primer judge

| Action | Effect |
|--------|--------|
| `merge` | `upsertPrimer` with full rewritten primer body |
| `discard` | no write |

Empty primer + parse error → create from proposal. Existing primer + parse error → discard (avoid bloat).

## General gate

| Action | Effect |
|--------|--------|
| `create` | `writeNew` |
| `merge` | `update(closest_slug, …)` |
| `discard` | no write |

`MUTON_CARD_GATE=0` skips the general LLM gate (lexical upsert) but **still** runs the primer judge.

## Logs

`$MUTON_HOME/logs/gate.log` — JSONL for both primer and general decisions.
