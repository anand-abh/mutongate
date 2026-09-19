`MUTON_HYBRID=1` runs two FTS queries and merges hits, then **always pins** the `initial` chat-log card when present (total up to **n + m + 1**):

1. **Instruction channel** — task instruction text · k = `MUTON_HYBRID_K_INSTRUCTION` (n)
2. **Question channel** — current `question.md` · k = `MUTON_HYBRID_K_QUESTION` (m)
3. **Initial pin** — slug `initial`, if it exists (+1) — chat logs from the first three steps

Code defaults are 3+3 if env vars are unset. Harbor database-analytics runs set them explicitly (e.g. 5+5).

Pi hook (`harbor/opt-muton/muton.ts`) calls `muton search` on `before_agent_start` and injects hit context into the system prompt; reflect (ungated 0–5 + optional initial append) runs on `session_shutdown`.
