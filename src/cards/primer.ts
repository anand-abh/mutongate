import type { ProposeInput } from "../store/index.ts";

/** Fixed slug — at most one schema primer in the hive. */
export const PRIMER_SLUG = "primer";

export const PRIMER_TITLE = "Schema Primer";

export const PRIMER_USE_WHEN =
  "Starting any database-analytics question — durable schema, joins, encodings, and db-query constraints";

export type ProposalKind = "primer" | "general";

export type ProposalInput = ProposeInput & { kind?: ProposalKind };

/** Detect a primer proposal via kind or title. */
export function isPrimerProposal(p: {
  title?: string;
  kind?: string | null;
}): boolean {
  if (typeof p.kind === "string" && p.kind.trim().toLowerCase() === "primer") {
    return true;
  }
  const t = (p.title ?? "").trim().toLowerCase();
  return t === "primer" || t === "schema primer";
}

/** Canonical frontmatter for the single primer card. */
export function normalizePrimerFields(body: string): ProposeInput {
  return {
    title: PRIMER_TITLE,
    use_when: PRIMER_USE_WHEN,
    body: body.trim(),
  };
}

/** Union primer bodies when the decision model returns only a delta. */
export function mergePrimerBodies(existing: string, incoming: string): string {
  const a = existing.trim();
  const b = incoming.trim();
  if (!b) return a;
  if (!a) return b;
  if (a.includes(b)) return a;
  return `${a}\n\n${b}`;
}
