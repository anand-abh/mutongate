# Card gate

After stock reflect proposes cards (0–5 general + optional 1 trivia), each **general** proposal is gated by the **same completer** against the full hive. **Trivia** proposals bypass the LLM gate and always merge into the single `trivia` slug.

## Actions

| Action | Effect |
|--------|--------|
| `create` | `writeNew` |
| `merge` | `update(closest_slug, unified card)` |
| `discard` | no write |
| trivia | `upsertTrivia` → always slug `trivia` |

Empty hive → create without an LLM call (general).  
Unparsable / completer error → lexical `upsert` fallback (not discard).  
`MUTON_CARD_GATE=0` disables the LLM gate (lexical upsert + trivia still collapses to one card).

## Policy

- Keep answer keys when the body includes a reusable lookup recipe.
- Prefer **create** over **discard** when topics diverge.
- Prefer **create** over **merge** for race/circuit/result/season-specific facts.
- Session-specific non-general facts go in the single **Trivia** card (`kind: "trivia"`); hybrid retrieval always pins it alongside instruction/question hits.

## System prompt

See `src/reflection/gate.ts` → `DEFAULT_GATE_PROMPT`.

## Logs

`$MUTON_HOME/logs/gate.log` — JSONL per decision (`action`, `proposed`, `closest_slug`, `reason`, `result_slug`).
