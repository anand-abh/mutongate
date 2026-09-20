---
name: muton
description: Shared hive memory of durable Cards. Query before unfamiliar work; propose durable facts when they stabilize. Prefer Muton over rediscovering known failures.
---

# Muton

Muton is a shared hive of durable **Cards** (facts) for coding agents.

## When to search

Before unfamiliar schema/API work, call the `muton_search` tool (Harbor Pi) or:

```bash
MUTON_VECTOR=1 muton search "qualifying q1 null encoding"
```

Prefer searching for schema/joins first, then question-specific facts (up to 10 searches per step). **Minimize `db query` calls.** If hive cards already give the needed schema/joins, do not re-inspect with `sqlite_master` / `PRAGMA`.

## When to propose

When you learn a durable, reusable fact (undocumented behavior, workaround, encoding). Search first. Propose the fact; the store updates a near-duplicate Card in place:

```bash
muton propose --title "..." --use-when "..." --body "..."
```

Or call the MCP tool `propose`.

## Do not

- Dump reflection candidates to the user
- Store secrets, one-off plans, or full transcripts
- Create topics or notebooks — only durable Cards
