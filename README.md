# mutongate

Private Muton fork: **vector card hive** + **agentic `muton_search` tool** (no auto-inject) + **stock ungated reflect**.

Version: `0.2.1-qr3-cardgate`

## What's included

| Path | Purpose |
|------|---------|
| `src/` | Muton CLI source (hybrid FTS, stock reflect, `src/reflection/gate.ts`) |
| `prompts/REFLECTION.md` | Stock reflection prompt |
| `harbor/` | Harbor/Pi wiring: `muton-real`, wrapper, Pi extension, mounts template |
| `scripts/run-database-analytics.sh` | Smoke 10 / medium 40 / full 174 Harbor runner |
| `scripts/harbor-run.sh` | Low-level `harbor run -p <task>` (any slice or full task path) |

## Build

```bash
bun install && bun run build
cp dist/cli.js harbor/bin/muton-real
echo "0.2.1-qr3-cardgate" > harbor/MUTON_VERSION.txt
```

## Env (the system)

| Variable | Meaning |
|----------|---------|
| `MUTON_HYBRID=1` | Dual FTS (instruction + question) |
| `MUTON_HYBRID_K_INSTRUCTION` | Instruction-channel k (e.g. `3`) |
| `MUTON_HYBRID_K_QUESTION` | Question-channel k (e.g. `3`) |
| `MUTON_VECTOR=1` | Semantic search over card embeddings (agent tool path) |
| `MUTON_MAX_SEARCHES` | Per-step `muton_search` budget (default 10) |
| `MUTON_EMBED_MODEL` | Embedding model (default `text-embedding-3-small`) |
| `MUTON_CARD_GATE` | Legacy; unused on reflect path (always ungated). |
| `MUTON_MODEL` / `MUTON_API_KEY` | Model for reflect + gate |
| `OPENAI_API_KEY` | Passed through to the agent |

Stock reflect = “Prefer concrete state…” (not schemaref / outcome-aware).

## Harbor database-analytics (10 / 40 / 174)

Needs [agent-learning-bench](https://github.com/manojbajaj95/agent-learning-bench) nearby, plus Docker, Harbor CLI, Bun, and `OPENAI_API_KEY`. Details: [docs/DATABASE-ANALYTICS.md](docs/DATABASE-ANALYTICS.md).

```bash
export AGENT_LEARNING_BENCH=/path/to/agent-learning-bench
export OPENAI_API_KEY=…
# Bun is discovered via command -v bun (override with BUN_BIN)

./scripts/run-database-analytics.sh 10          # first 10 → .alb/smoke/database-analytics
./scripts/run-database-analytics.sh --n 40      # first 40 → same alb slice dest
./scripts/run-database-analytics.sh 174         # full task → tasks/database-analytics
```

There is no `database-analytics-hooks10` directory. Smoke/medium share `.alb/smoke/database-analytics`; the runner re-slices to N each time. Full 174 does not slice.

## Docs

- [docs/DATABASE-ANALYTICS.md](docs/DATABASE-ANALYTICS.md) — 10 / 40 / 174 recipes
- [docs/CARDGATE.md](docs/CARDGATE.md) — gate prompt & actions
- [docs/HYBRID.md](docs/HYBRID.md) — hybrid k

## License

Same as upstream Muton (see `LICENSE`).
