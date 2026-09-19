import type { ProposeInput } from "../store/index.ts";

/** Fixed slug — at most one trivia card in the hive. */
export const TRIVIA_SLUG = "trivia";

export const TRIVIA_TITLE = "Trivia";

export const TRIVIA_USE_WHEN =
  "Non-general session facts (specific answers, raceIds, one-off lookups) that may help later steps";

export type ProposalKind = "trivia" | "general";

export type ProposalInput = ProposeInput & { kind?: ProposalKind };

/** Detect a trivia proposal via kind or title. */
export function isTriviaProposal(p: {
  title?: string;
  kind?: string | null;
}): boolean {
  if (typeof p.kind === "string" && p.kind.trim().toLowerCase() === "trivia") {
    return true;
  }
  return (p.title ?? "").trim().toLowerCase() === "trivia";
}

/** Canonical frontmatter for the single trivia card. */
export function normalizeTriviaFields(body: string): ProposeInput {
  return {
    title: TRIVIA_TITLE,
    use_when: TRIVIA_USE_WHEN,
    body: body.trim(),
  };
}

/** Append incoming trivia onto existing body (dedupe exact blocks). */
export function mergeTriviaBodies(existing: string, incoming: string): string {
  const a = existing.trim();
  const b = incoming.trim();
  if (!b) return a;
  if (!a) return b;
  if (a.includes(b)) return a;
  return `${a}\n\n---\n\n${b}`;
}
