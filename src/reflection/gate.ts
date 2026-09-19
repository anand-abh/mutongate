import { appendFileSync } from "node:fs";
import { join } from "node:path";
import type { Card } from "../cards/index.ts";
import type { Completer } from "./complete/index.ts";
import type { CardStore, ProposeInput } from "../store/index.ts";
import { logsDir } from "../store/index.ts";

export type GateAction = "create" | "merge" | "discard";

export type GateDecision = {
  action: GateAction;
  closest_slug: string | null;
  reason: string;
  card: ProposeInput | null;
};

export type GateEvent = {
  ts: string;
  action: GateAction;
  proposed: ProposeInput;
  closest_slug: string | null;
  reason: string;
  result_slug: string | null;
  error?: string;
};

export type GateWriteResult = {
  written: number;
  merged: number;
  discarded: number;
  skipped: number;
  events: GateEvent[];
};

/** System prompt for post-reflect card gating. */
export const DEFAULT_GATE_PROMPT = `You maintain a shared hive of durable knowledge cards (Muton).

You are given ONE proposed card and the FULL current hive catalog. Your job:
1. Identify the single closest existing card (by topic / kind of knowledge — not loose keyword overlap).
2. Choose exactly one action:
   - merge — ONLY when the proposal is the same schema/tooling/encoding abstraction as the closest card and adds or corrects durable fields for that same topic. Do NOT merge race-, circuit-, season-, constructor-, or result-specific facts into a general join/schema card.
   - create — durable new information that is a different topic than the closest card; OR a concrete lookup/answer that includes a reusable recipe (joins, WHERE filters, raceId/circuitId/driverId, column encodings, ORDER BY / DISTINCT rules). Prefer create over discard when the closest card's use_when/topic does not match the proposal's use_when.
   - discard — ONLY when the proposal adds nothing beyond the closest card of the SAME topic, OR it is a bare answer (a number/name/list) with no joins, filters, ids, or encoding — no reusable lookup recipe.

If the hive is empty or nothing is meaningfully similar, choose create.

Keep answer keys when the body encodes how to look the value up again. Discard bare answers with no recipe.
Prefer create over discard when topics diverge (example: closest is a general races↔circuits join, but the proposal is a specific race count or qualifying result).
Prefer create over merge for circuit-/race-/result-/season-specific facts; reserve merge for true schema/tooling duplicates.

Return ONLY JSON (no markdown fences, no commentary):
{
  "action": "create" | "merge" | "discard",
  "closest_slug": "existing-slug-or-null",
  "reason": "one short sentence",
  "card": { "title": "...", "use_when": "...", "body": "..." }
}

Rules for the JSON:
- discard: card may be null.
- create: card is the (optionally cleaned) proposal; set closest_slug if you considered one.
- merge: closest_slug is REQUIRED and must be an existing slug; card is the full replacement fields for that slug (union of old + new durable facts).`;

export function cardGateEnabled(): boolean {
  const v = (process.env.MUTON_CARD_GATE ?? "1").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off" || v === "no");
}

export function formatHiveCatalog(cards: Card[]): string {
  if (cards.length === 0) return "(empty hive)";
  return cards
    .map(
      (c) =>
        `### slug: ${c.slug}\ntitle: ${c.title}\nuse_when: ${c.use_when}\nbody: ${c.body}`,
    )
    .join("\n\n");
}

export function formatGateUserMessage(proposal: ProposeInput, cards: Card[]): string {
  return `## Proposed card
title: ${proposal.title}
use_when: ${proposal.use_when}
body: ${proposal.body}

## Hive catalog (${cards.length} cards)
${formatHiveCatalog(cards)}`;
}

export function parseGateDecision(raw: string): GateDecision | null {
  const text = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const jsonText = fence?.[1]?.trim() ?? text;
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(jsonText.slice(start, end + 1)) as Record<string, unknown>;
    const action = parsed.action;
    if (action !== "create" && action !== "merge" && action !== "discard") return null;
    const closest =
      parsed.closest_slug === null || parsed.closest_slug === undefined
        ? null
        : typeof parsed.closest_slug === "string"
          ? parsed.closest_slug.trim() || null
          : null;
    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : "(no reason)";
    let card: ProposeInput | null = null;
    const c = parsed.card;
    if (c && typeof c === "object" && !Array.isArray(c)) {
      const o = c as Record<string, unknown>;
      if (
        typeof o.title === "string" &&
        typeof o.use_when === "string" &&
        typeof o.body === "string" &&
        o.title.trim() &&
        o.use_when.trim() &&
        o.body.trim()
      ) {
        card = {
          title: o.title.trim(),
          use_when: o.use_when.trim(),
          body: o.body.trim(),
        };
      }
    }
    return { action, closest_slug: closest, reason, card };
  } catch {
    return null;
  }
}

function logGate(home: string, event: GateEvent): void {
  try {
    appendFileSync(join(logsDir(home), "gate.log"), `${JSON.stringify(event)}\n`);
  } catch {
    // ignore
  }
}

function normalizeProposal(p: ProposeInput): ProposeInput | null {
  const title = p.title?.trim();
  const use_when = p.use_when?.trim();
  const body = p.body?.trim();
  if (!title || !use_when || !body) return null;
  return { title, use_when, body };
}

/**
 * Gate each proposal against the live hive via the same Completer as reflect.
 * Sequential: later proposals see earlier creates/merges.
 */
export async function gateAndWrite(
  complete: Completer,
  store: CardStore,
  proposals: ProposeInput[],
  opts?: { host?: "claude" | "cursor" | "codex" | "pi" | "auto"; cwd?: string },
): Promise<GateWriteResult> {
  const result: GateWriteResult = {
    written: 0,
    merged: 0,
    discarded: 0,
    skipped: 0,
    events: [],
  };

  for (const rawProp of proposals) {
    const proposed = normalizeProposal(rawProp);
    if (!proposed) {
      result.skipped += 1;
      continue;
    }

    const hive = store.listCards();

    // Empty hive: create without an LLM gate call
    if (hive.length === 0) {
      const card = store.writeNew(proposed);
      const event: GateEvent = {
        ts: new Date().toISOString(),
        action: "create",
        proposed,
        closest_slug: null,
        reason: "empty hive",
        result_slug: card.slug,
      };
      result.written += 1;
      result.events.push(event);
      logGate(store.home, event);
      continue;
    }

    let decision: GateDecision | null = null;
    let parseError: string | undefined;
    try {
      const raw = await complete({
        system: DEFAULT_GATE_PROMPT,
        user: formatGateUserMessage(proposed, hive),
        host: opts?.host,
        cwd: opts?.cwd ?? join(store.home, "scratch"),
      });
      decision = parseGateDecision(raw);
      if (!decision) parseError = "unparsable-gate-json";
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }

    // Soft failure: bad gate output → lexical upsert (do not drop learning)
    if (!decision) {
      const before = store.cardCount();
      const card = store.upsert(proposed);
      const created = store.cardCount() > before;
      const event: GateEvent = {
        ts: new Date().toISOString(),
        action: created ? "create" : "merge",
        proposed,
        closest_slug: created ? null : card.slug,
        reason: "gate parse/error — upsert fallback",
        result_slug: card.slug,
        error: parseError,
      };
      if (created) result.written += 1;
      else result.merged += 1;
      result.events.push(event);
      logGate(store.home, event);
      continue;
    }

    if (decision.action === "discard") {
      const event: GateEvent = {
        ts: new Date().toISOString(),
        action: "discard",
        proposed,
        closest_slug: decision.closest_slug,
        reason: decision.reason,
        result_slug: null,
      };
      result.discarded += 1;
      result.events.push(event);
      logGate(store.home, event);
      continue;
    }

    if (decision.action === "merge") {
      const slug = decision.closest_slug;
      const mergedCard = decision.card ?? proposed;
      if (!slug || !store.read(slug)) {
        // Invalid merge target → fall back to create
        const card = store.writeNew(mergedCard);
        const event: GateEvent = {
          ts: new Date().toISOString(),
          action: "create",
          proposed,
          closest_slug: slug,
          reason: `${decision.reason} (merge target missing — created)`,
          result_slug: card.slug,
          error: slug ? `missing-slug:${slug}` : "merge-without-slug",
        };
        result.written += 1;
        result.events.push(event);
        logGate(store.home, event);
        continue;
      }
      const card = store.update(slug, mergedCard);
      const event: GateEvent = {
        ts: new Date().toISOString(),
        action: "merge",
        proposed,
        closest_slug: slug,
        reason: decision.reason,
        result_slug: card.slug,
      };
      result.merged += 1;
      result.events.push(event);
      logGate(store.home, event);
      continue;
    }

    // create
    const createCard = decision.card ?? proposed;
    const card = store.writeNew(createCard);
    const event: GateEvent = {
      ts: new Date().toISOString(),
      action: "create",
      proposed,
      closest_slug: decision.closest_slug,
      reason: decision.reason,
      result_slug: card.slug,
    };
    result.written += 1;
    result.events.push(event);
    logGate(store.home, event);
  }

  return result;
}
