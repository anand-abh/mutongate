# mutongate

Private Muton fork: **hybrid Card search** + **stock reflect** + **LLM card gate** (create / merge / discard).

Version: `0.2.1-qr3-cardgate`

## What's included

| Path | Purpose |
|------|---------|
| `src/` | Muton CLI source (hybrid FTS, stock reflect, `src/reflection/gate.ts`) |
| `prompts/REFLECTION.md` | Stock reflection prompt |
| `harbor/` | Harbor/Pi wiring: `muton-real`, wrapper, Pi extension, mounts |
| `scripts/run-smoke.sh` | Example Harbor smoke runner |

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
| `MUTON_CARD_GATE=1` | LLM gate after reflect (default on) |
| `MUTON_MODEL` / `MUTON_API_KEY` | Model for reflect + gate |
| `OPENAI_API_KEY` | Passed through to the agent |

Stock reflect = “Prefer concrete state…” (not schemaref / outcome-aware).

## Harbor smoke (needs agent-learning-bench nearby)

```bash
export MUTONGATE_ROOT=/path/to/mutongate
export OPENAI_API_KEY=…
# rewrite mounts to your absolute MUTONGATE_ROOT if needed
./scripts/run-smoke.sh 3 3 /path/to/agent-learning-bench/.alb/smoke/database-analytics-hooks10
```

## Docs

- [docs/CARDGATE.md](docs/CARDGATE.md) — gate prompt & actions
- [docs/HYBRID.md](docs/HYBRID.md) — hybrid k

## License

Same as upstream Muton (see `LICENSE`).
