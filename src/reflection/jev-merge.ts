/**
 * Typesafe System One Noul for propose/merge: embed → k=2 vector neighbors →
 * Noul(proposed, near_i) for each → merge into the higher-p neighbor if p >= threshold.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ProposeInput } from "../store/index.ts";
import { logsDir } from "../store/index.ts";

export type JevNeighbor = {
  slug: string;
  title: string;
  use_when: string;
  body: string;
  score: number;
};

export type JevNoulNeighborResult = {
  rank: number;
  slug: string;
  cosine: number;
  noul: number;
  ms: number;
  error?: string;
};

export type JevMergeDecision = {
  action: "merge" | "create";
  slug?: string;
  picked_noul: number | null;
  threshold: number;
  neighbors: JevNoulNeighborResult[];
  model?: string;
};

const DEFAULT_THRESHOLD = 0.5;

const NOUL_INSTRUCTIONS =
  "Should these two knowledge cards be merged into one? Answer yes if they are the same durable fact, near-duplicates, or one is a refinement/extension of the other. Answer no if they are distinct durable facts that should remain separate cards.";

const NOUL_CRITERIA = {
  true: "Same fact, near-duplicate, or refinement — merge into one card",
  false: "Distinct durable facts — keep as separate cards",
};

export function jevMergeEnabled(): boolean {
  const v = (process.env.MUTON_JEV_MERGE ?? "1").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return Boolean((process.env.TYPESAFE_API_KEY || "").trim());
}

export function jevMergeThreshold(): number {
  const raw = process.env.MUTON_JEV_MERGE_THRESHOLD;
  if (raw === undefined || raw === "") return DEFAULT_THRESHOLD;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return DEFAULT_THRESHOLD;
  return n;
}

/** Deterministic field union when Noul says merge (no second LLM expand). */
export function expandMergedFields(
  neighbor: { title: string; use_when: string; body: string },
  proposal: ProposeInput,
): ProposeInput {
  return {
    title: pickTitle(neighbor.title, proposal.title),
    use_when: unionText(neighbor.use_when, proposal.use_when),
    body: unionText(neighbor.body, proposal.body),
  };
}

function pickTitle(a: string, b: string): string {
  const at = a.trim();
  const bt = b.trim();
  if (!bt) return at;
  if (!at) return bt;
  // Prefer the longer title when refining; keep neighbor if proposal is a short alias.
  return bt.length >= at.length ? bt : at;
}

function unionText(a: string, b: string): string {
  const at = a.trim();
  const bt = b.trim();
  if (!bt) return at;
  if (!at) return bt;
  if (at.includes(bt)) return at;
  if (bt.includes(at)) return bt;
  return `${at}\n\n${bt}`;
}

function logJevMerge(home: string | undefined, payload: Record<string, unknown>): void {
  if (!home) return;
  try {
    const dir = logsDir(home);
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      join(dir, "jev-merge.log"),
      `${JSON.stringify({ ts: new Date().toISOString(), ...payload })}\n`,
    );
  } catch {
    // silent
  }
}

async function noulShouldMerge(
  proposal: ProposeInput,
  neighbor: JevNeighbor,
  rank: number,
): Promise<JevNoulNeighborResult> {
  const apiKey = (process.env.TYPESAFE_API_KEY || "").trim();
  const model = (process.env.MUTON_JEV_MODEL || "jev-latest").trim();
  const base = (process.env.TYPESAFE_API_BASE || "https://api.typesafe.ai/v1").replace(
    /\/$/,
    "",
  );
  const started = Date.now();
  const body = {
    model,
    state: {
      proposed: {
        title: proposal.title,
        use_when: proposal.use_when,
        body: proposal.body,
      },
      neighbor: {
        slug: neighbor.slug,
        title: neighbor.title,
        use_when: neighbor.use_when,
        body: neighbor.body,
        cosine: neighbor.score,
      },
      neighbor_rank: rank,
    },
    questions: {
      should_merge: {
        type: "noul",
        instructions: NOUL_INSTRUCTIONS,
        criteria: NOUL_CRITERIA,
      },
    },
  };
  try {
    const res = await fetch(`${base}/systemone`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    type SystemOneNoul = {
      model?: string;
      answers?: { should_merge?: { noul?: number } };
    };
    let data: SystemOneNoul | null = null;
    try {
      data = JSON.parse(raw) as SystemOneNoul;
    } catch {
      data = null;
    }
    const ms = Date.now() - started;
    if (!res.ok) {
      return {
        rank,
        slug: neighbor.slug,
        cosine: neighbor.score,
        noul: 0,
        ms,
        error: `http-${res.status}:${raw.slice(0, 160)}`,
      };
    }
    const noul = data?.answers?.should_merge?.noul;
    if (typeof noul !== "number" || !Number.isFinite(noul)) {
      return {
        rank,
        slug: neighbor.slug,
        cosine: neighbor.score,
        noul: 0,
        ms,
        error: "bad-noul",
      };
    }
    return {
      rank,
      slug: neighbor.slug,
      cosine: neighbor.score,
      noul,
      ms,
    };
  } catch (err) {
    return {
      rank,
      slug: neighbor.slug,
      cosine: neighbor.score,
      noul: 0,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run Noul against each vector neighbor; pick max p(merge).
 * Returns merge slug when max >= threshold, else create.
 */
export async function decideJevMerge(
  proposal: ProposeInput,
  neighbors: JevNeighbor[],
  opts: { home?: string; threshold?: number } = {},
): Promise<JevMergeDecision> {
  const threshold = opts.threshold ?? jevMergeThreshold();
  const results: JevNoulNeighborResult[] = [];
  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i]!;
    const r = await noulShouldMerge(proposal, n, i + 1);
    results.push(r);
    logJevMerge(opts.home, {
      event: "jev_merge_noul",
      proposed_title: proposal.title,
      ...r,
    });
  }

  let best: JevNoulNeighborResult | null = null;
  for (const r of results) {
    if (r.error) continue;
    if (!best || r.noul > best.noul) best = r;
  }

  const decision: JevMergeDecision = {
    action:
      best && best.noul >= threshold ? "merge" : "create",
    slug: best && best.noul >= threshold ? best.slug : undefined,
    picked_noul: best?.noul ?? null,
    threshold,
    neighbors: results,
    model: (process.env.MUTON_JEV_MODEL || "jev-latest").trim(),
  };

  logJevMerge(opts.home, {
    event: "jev_merge_decision",
    proposed_title: proposal.title,
    proposed_use_when: proposal.use_when,
    proposed_body_chars: proposal.body.length,
    action: decision.action,
    slug: decision.slug ?? null,
    picked_noul: decision.picked_noul,
    threshold: decision.threshold,
    neighbors: results,
  });

  return decision;
}

export { NOUL_INSTRUCTIONS, NOUL_CRITERIA, DEFAULT_THRESHOLD };
