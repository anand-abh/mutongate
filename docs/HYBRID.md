# Hybrid search

`MUTON_HYBRID=1` runs two FTS queries and merges hits:

1. **Instruction channel** — task instruction text · k = `MUTON_HYBRID_K_INSTRUCTION`
2. **Question channel** — current `question.md` · k = `MUTON_HYBRID_K_QUESTION`

Code defaults are 3+3 if env vars are unset. Harbor smokes set them explicitly (e.g. 3+3, 10+3, 10+10).

Pi hook (`harbor/opt-muton/muton.ts`) calls `muton search` on `before_agent_start` and injects hit context into the system prompt; reflect+gate run on `session_shutdown`.
