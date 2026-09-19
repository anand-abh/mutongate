# Hybrid search

`MUTON_HYBRID=1` runs two FTS queries and merges hits, then **always pins** the single `primer` Schema Primer card when present (total up to **n + m + 1**):

1. **Instruction channel** — task instruction text · k = `MUTON_HYBRID_K_INSTRUCTION` (n)
2. **Question channel** — current `question.md` · k = `MUTON_HYBRID_K_QUESTION` (m)
3. **Primer pin** — slug `primer`, if it exists (+1)

Code defaults are 3+3 if env vars are unset. Harbor database-analytics runs set them explicitly (e.g. 1+1, 3+3, 10+10).

Pi hook (`harbor/opt-muton/muton.ts`) calls `muton search` on `before_agent_start` and injects hit context into the system prompt; reflect (primer judge + ungated general upsert) runs on `session_shutdown`.
