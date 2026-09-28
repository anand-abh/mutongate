# Example: generic coding task

Copy and edit for a non-ALB benchmark. No SQL / sqlite_master wording.

## Agent tips

MUTON HIVE (browse + vector search — nothing is auto-injected)
Tools: muton_tree (map), muton_ls (list under a path), muton_get (one card), muton_search (semantic).
- Start with muton_tree once when unsure what the hive holds. If empty or tiny, proceed without Muton.
- When folders look relevant, muton_ls then muton_get promising slugs before muton_search.
- Use muton_search for open-ended semantic recall (budget applies per step). Prefer concrete prior facts over rediscovering known failures.
- Propose durable cards at session end via reflect — do not dump candidates to the user.

## Reflection

- Invent taxonomy roots that fit this domain (e.g. api/auth, deploy/k8s, test/flakes).
- Prefer reusable procedures and constraints over one-off session notes.
