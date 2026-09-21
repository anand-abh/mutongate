# Database analytics (10 / 40 / 174)

Mutongate runs Harbor `pi` with a **vector card hive** and agentic `muton_search` (no auto-inject), plus **stock ungated reflect**. It is **not** an `alb --system` entry. Use the scripts in this repo against a local [agent-learning-bench](https://github.com/manojbajaj95/agent-learning-bench) clone.

Sizes (BIRD-SQL `formula_1`, 174 questions):

| Label | Steps | Task path Harbor sees |
|-------|------:|------------------------|
| smoke | 10 | `<bench>/.alb/smoke/database-analytics` (first 10; same dest `alb smoke` uses) |
| medium | 40 | `<bench>/.alb/smoke/database-analytics` (first 40; `alb run --n 40` / `alb prepare --n 40`) |
| full (`dull`) | 174 | `<bench>/tasks/database-analytics` (no slice) |

There is no `.alb/medium/` directory and no `database-analytics-hooks10` path. Smoke and medium **share** `.alb/smoke/database-analytics`; the size runner re-slices to the requested N before each Harbor job.

## Host prerequisites

On the machine that will run trials (not required to read this recipe):

1. Docker daemon
2. Harbor CLI (`uv tool install harbor` or `pip install harbor`)
3. Bun on `PATH` (or set `BUN_BIN` to the executable). The runner bind-mounts that binary into the container.
4. `OPENAI_API_KEY` with access to `gpt-5.6-luna`
5. Bench clone (next to mutongate, or `AGENT_LEARNING_BENCH`)

```bash
git clone https://github.com/manojbajaj95/agent-learning-bench
export AGENT_LEARNING_BENCH=/path/to/agent-learning-bench
export OPENAI_API_KEY=…
# optional: export BUN_BIN="$(command -v bun)"
```

`database-analytics` steps and SQLite are in the bench git tree; `alb prepare` / `download.sh` are not required.

## Run

From the mutongate root:

```bash
./scripts/run-database-analytics.sh 10          # smoke
./scripts/run-database-analytics.sh --n 40      # medium (first-40 slice)
./scripts/run-database-analytics.sh 174         # full
# aliases: smoke | medium | full | dull
```

`--dry-run` still writes the 10/40 slice, then prints the `harbor run` argv without starting Docker.

Equivalent alb slice + low-level wrapper (same mounts/env as the size runner):

```bash
# from the bench clone; dest is always .alb/smoke/database-analytics
alb prepare database-analytics --n 10
alb prepare database-analytics --n 40

./scripts/harbor-run.sh "$AGENT_LEARNING_BENCH/.alb/smoke/database-analytics"
./scripts/harbor-run.sh "$AGENT_LEARNING_BENCH/tasks/database-analytics" mutongate-database-analytics-n174
```

`scripts/run-smoke.sh` is a compatibility alias for `harbor-run.sh`.

## Bun bind

`harbor/mounts.template.json` uses `<BUN_BIN>`. Runners resolve it with `BUN_BIN` → `command -v bun` → `~/.bun/bin/bun` (no hardcoded `/home/ubuntu/.bun/bin/bun`).

## Optional alb overlay

Do not fork the bench. If you want `alb smoke database-analytics --system mutongate`, append this to a **local** `systems.toml` and still pass the same `--mounts` / `--ae` flags the scripts emit (after `--`). Without those extras, the table is just baseline `pi`.

```toml
[systems.mutongate]
summary = "Harbor pi plus mutongate vector hive and muton_search. Prefer mutongate ./scripts/run-database-analytics.sh."
agent = "pi"
```

```bash
alb run database-analytics --n 40 --system mutongate -- --mounts "$(cat harbor/mounts-hooks.json)" …
```

The mutongate scripts are the supported recipe.
