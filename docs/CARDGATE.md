# Card gate

After stock reflect proposes 0–5 cards, each proposal is gated by the **same completer** against the full hive.

## Actions

| Action | Effect |
|--------|--------|
| `create` | `writeNew` |
| `merge` | `update(closest_slug, unified card)` |
| `discard` | no write |

Empty hive → create without an LLM call.  
`MUTON_CARD_GATE=0` disables the gate (lexical upsert only).

## System prompt

See `src/reflection/gate.ts` → `DEFAULT_GATE_PROMPT`.

## User message shape

```
## Proposed card
title / use_when / body

## Hive catalog (N cards)
### slug: …
title / use_when / body
```

## Logs

`$MUTON_HOME/logs/gate.log` — JSONL per decision (`action`, `proposed`, `closest_slug`, `reason`, `result_slug`).
