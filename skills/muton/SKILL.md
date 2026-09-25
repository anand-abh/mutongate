---
name: muton
description: Shared hive memory of durable Cards. Query before unfamiliar work; propose durable facts when they stabilize. Prefer Muton over rediscovering known failures.
---

# Muton

Muton is a shared hive of durable **Cards** (facts) for coding agents.

## Tools

| Tool / CLI | Role |
|------------|------|
| `muton_tree` / `muton tree` | Taxonomy map (folder counts) |
| `muton_ls` / `muton ls <path>` | List slugs under a path |
| `muton_get` / `muton get <slug>` | Full card body |
| `muton_search` / `muton search` | Semantic (vector) search |
| `muton propose` / MCP `propose` | Write a durable card |
| `muton reflect` | Session-end propose (silent) |

## When to search / browse

Before unfamiliar work, browse or search the hive rather than rediscovering known facts:

```bash
MUTON_VECTOR=1 muton search "topic you need"
```

Prefer `tree` → `ls` → `get` when the taxonomy has useful folders; use `search` for open-ended recall (Harbor default: up to 10 searches per step).

**Task-specific behavior** (SQL budgets, trust-vs-inspect, folder bias, …) lives in a swappable policy file — see `harbor/policies/` and `MUTON_TASK_POLICY`. Do not put benchmark tips in this skill.

## When to propose

When you learn a durable, reusable fact (undocumented behavior, workaround, encoding). Search first. Propose the fact; the store may merge a near-duplicate:

```bash
muton propose --title "..." --use-when "..." --body "..."
```

Or call the MCP tool `propose`.

## Do not

- Dump reflection candidates to the user
- Store secrets, one-off plans, or full transcripts
- Create topics or notebooks — only durable Cards
