# Muton task policies

Task-specific tips and reflection extras live here as **one markdown file per task**.
The hive runtime (`muton` CLI, Pi tools, reflect/merge) stays fixed; only `MUTON_TASK_POLICY` changes.

## File format

```markdown
# <task name>

Optional prose.

## Agent tips

Plain text injected into the Pi system prompt (plus bullet lines as tool guidelines).
Include every task-facing instruction here (SQL budgets, trust-vs-inspect, folder bias, …).

## Reflection

Optional extra text appended to the built-in reflection prompt.
```

- If `## Agent tips` is missing, the whole file (minus a leading `#` title) is treated as tips.
- If `MUTON_TASK_POLICY` is unset or the file is missing, the Pi extension injects only a short **generic** hive tip (no SQL / schema / ALB wording).

## Harbor

Mounted at `/opt/muton/policies`. `scripts/harbor-run.sh` sets:

```bash
MUTON_TASK_POLICY=/opt/muton/policies/alb-database-analytics.md
```

Override for another bench:

```bash
MUTON_TASK_POLICY=/opt/muton/policies/my-other-task.md \
  ./scripts/harbor-run.sh /path/to/other-task
```

Add a new file under this directory (and a mounts entry is already recursive via the `policies/` bind).
