# Initial chat-log card

After each of the first **3** Harbor steps (configurable via `MUTON_INITIAL_STEPS`), reflect appends a compact chat log of that step's Pi session into the fixed card slug `initial`.

On search (hybrid and plain), `initial` is **always pinned** when present (total hits up to **n + m + 1**).

There is **no Schema Primer** and **no LLM card gate**. General reflect proposals (0–5) lexical-upsert into the hive ungated.

## Step detection

1. `MUTON_STEP_PATH` or `/app/.step.txt` (integer)
2. Else `Question N of` in `MUTON_QUESTION_PATH` or `/app/question.md`

## Logs

`$MUTON_HOME/logs/reflect.log` — `initial step=N …` and `commit ungated-hive …` lines.
