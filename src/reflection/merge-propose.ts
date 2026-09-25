import type { Card } from "../cards/index.ts";
import { cardEmbedText } from "../search/embed.ts";
import { searchCardsVector } from "../search/vector.ts";
import type { CardStore, ProposeInput } from "../store/index.ts";
import { createCompleter } from "./complete/index.ts";
import type { Completer } from "./complete/types.ts";

const DEFAULT_MERGE_K = 2;

export type ProposeOutcome = {
  card: Card;
  /** True when an existing neighbor was expanded instead of creating a new slug. */
  merged: boolean;
};

export type ProposeCardOptions = {
  completer?: Completer;
  /** Override MUTON_MERGE_K (default 2). */
  k?: number;
  now?: Date;
  /** Skip agent merge; use lexical upsert only. */
  lexicalOnly?: boolean;
};

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function mergeAgentEnabled(): boolean {
  const v = (process.env.MUTON_MERGE_AGENT ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

const MERGE_SYSTEM = `You decide whether a proposed Muton knowledge card should merge into one existing neighbor or be created as a new card.

Return ONLY JSON (no markdown fences, no commentary):
{"action":"create"}
OR
{"action":"merge","slug":"<neighbor-slug>","title":"...","use_when":"...","body":"..."}

Rules:
- Merge when the proposal is the same fact, a near-duplicate, or a refinement/extension of one neighbor.
- On merge, expand ALL fields (title, use_when, and body) so the result keeps prior facts and adds the new information. Do not drop useful prior detail.
- Create when the proposal is a distinct durable fact that should stay its own card.
- When action is merge, slug MUST be one of the neighbor slugs listed.
- Do not invent facts that are not in the proposal or the chosen neighbor.`;

function formatNeighbor(hit: {
  slug: string;
  title: string;
  use_when: string;
  body: string;
  score?: number;
}): string {
  const score = typeof hit.score === "number" ? ` score=${hit.score.toFixed(4)}` : "";
  return [
    `slug=${hit.slug}${score}`,
    `title: ${hit.title}`,
    `use_when: ${hit.use_when}`,
    `body: ${hit.body}`,
  ].join("\n");
}

function buildMergeUser(
  proposal: ProposeInput,
  neighbors: Array<{
    slug: string;
    title: string;
    use_when: string;
    body: string;
    score: number;
  }>,
): string {
  const blocks = neighbors.map((n, i) => `### Neighbor ${i + 1}\n${formatNeighbor(n)}`);
  return [
    "## Neighbors (vector nearest)",
    blocks.join("\n\n"),
    "",
    "## Proposal",
    `title: ${proposal.title}`,
    `use_when: ${proposal.use_when}`,
    `body: ${proposal.body}`,
    "",
    "Decide create vs merge. Return ONLY the JSON object.",
  ].join("\n");
}

type MergeDecision =
  | { action: "create" }
  | { action: "merge"; slug: string; title: string; use_when: string; body: string };

function parseMergeDecision(raw: string, allowedSlugs: Set<string>): MergeDecision | null {
  const text = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const jsonText = fence?.[1]?.trim() ?? text;
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    const parsed = JSON.parse(jsonText.slice(start, end + 1)) as Record<string, unknown>;
    if (parsed.action === "create") return { action: "create" };
    if (parsed.action !== "merge") return null;
    if (
      typeof parsed.slug !== "string" ||
      typeof parsed.title !== "string" ||
      typeof parsed.use_when !== "string" ||
      typeof parsed.body !== "string"
    ) {
      return null;
    }
    const slug = parsed.slug.trim();
    const title = parsed.title.trim();
    const use_when = parsed.use_when.trim();
    const body = parsed.body.trim();
    if (!slug || !title || !use_when || !body) return null;
    if (!allowedSlugs.has(slug)) return null;
    return { action: "merge", slug, title, use_when, body };
  } catch {
    return null;
  }
}

/**
 * Propose a card: vector k-NN (default 2) → agent merge-or-create → expand or writeNew.
 * Falls back to lexical upsert when merge agent is off, hive has no embeddings, or the agent call fails.
 * Callers that pass `paths` should apply them via store.setPaths/addPaths after (writer does this).
 */
export async function proposeCard(
  store: CardStore,
  input: ProposeInput,
  opts: ProposeCardOptions = {},
): Promise<ProposeOutcome> {
  const title = input.title.trim();
  const use_when = input.use_when.trim();
  const body = input.body.trim();
  const proposal = { title, use_when, body };
  const now = opts.now ?? new Date();
  const applyPaths = (card: Card, merged: boolean): ProposeOutcome => {
    if (merged) store.addPaths(card.slug, input.paths);
    else store.setPaths(card.slug, input.paths);
    return { card, merged };
  };

  if (opts.lexicalOnly || !mergeAgentEnabled()) {
    const before = store.cardCount();
    const card = store.upsert(proposal, now);
    return applyPaths(card, store.cardCount() === before);
  }

  const k = opts.k ?? envInt("MUTON_MERGE_K", DEFAULT_MERGE_K);
  if (k <= 0 || store.cardCount() === 0) {
    const card = store.writeNew(proposal, now);
    return applyPaths(card, false);
  }

  let neighbors: Array<{
    slug: string;
    title: string;
    use_when: string;
    body: string;
    score: number;
  }> = [];
  try {
    const result = await searchCardsVector(store, cardEmbedText(proposal), { k });
    neighbors = result.hits.map((h) => ({
      slug: h.slug,
      title: h.title,
      use_when: h.use_when,
      body: h.body,
      score: h.score,
    }));
  } catch {
    const beforeSlugs = new Set(store.listCards().map((c) => c.slug));
    const card = store.upsert(proposal, now);
    return applyPaths(card, beforeSlugs.has(card.slug));
  }

  if (neighbors.length === 0) {
    // No embeddings yet — lexical near-dup still helps cold hive.
    const beforeSlugs = new Set(store.listCards().map((c) => c.slug));
    const card = store.upsert(proposal, now);
    return applyPaths(card, beforeSlugs.has(card.slug));
  }

  const allowed = new Set(neighbors.map((n) => n.slug));
  const complete = opts.completer ?? createCompleter();
  try {
    const raw = await complete({
      system: MERGE_SYSTEM,
      user: buildMergeUser(proposal, neighbors),
    });
    const decision = parseMergeDecision(raw, allowed);
    if (!decision || decision.action === "create") {
      const card = store.writeNew(proposal, now);
      return applyPaths(card, false);
    }
    const card = store.update(
      decision.slug,
      {
        title: decision.title,
        use_when: decision.use_when,
        body: decision.body,
      },
      now,
    );
    return applyPaths(card, true);
  } catch {
    const beforeSlugs = new Set(store.listCards().map((c) => c.slug));
    const card = store.upsert(proposal, now);
    return applyPaths(card, beforeSlugs.has(card.slug));
  }
}

export { buildMergeUser, MERGE_SYSTEM, parseMergeDecision };
