import { appendFileSync } from "node:fs";
import { join } from "node:path";
import type { Card } from "../cards/index.ts";
import {
  isPrimerProposal,
  mergePrimerBodies,
  normalizePrimerFields,
  PRIMER_SLUG,
  type ProposalInput,
} from "../cards/primer.ts";
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

/** System prompt for post-reflect card gating (general cards only). */
export const DEFAULT_GATE_PROMPT = `You maintain a shared hive of durable knowledge cards (Muton).

You are given ONE proposed card and the FULL current hive catalog. Your job:
1. Identify the single closest existing card (by topic / kind of knowledge — not loose keyword overlap).
2. Choose exactly one action:
   - merge — ONLY when the proposal is the same schema/tooling/encoding abstraction as the closest card and adds or corrects durable fields for that same topic. Do NOT merge race-, circuit-, season-, constructor-, or result-specific facts into a general join/schema card.
   - create — durable new information that is a different topic than the closest card; OR a concrete lookup/answer that includes a reusable recipe (joins, WHERE filters, raceId/circuitId/driverId, column encodings, ORDER BY / DISTINCT rules). Prefer create over discard when the closest card's use_when/topic does not match the proposal's use_when.
   - discard — ONLY when the proposal adds nothing beyond the closest card of the SAME topic, OR it is a bare answer (a number/name/list) with no joins, filters, ids, or encoding — no reusable lookup recipe.

If the hive is empty or nothing is meaningfully similar, choose create.

Keep answer keys when the body encodes how to look the value up again. Discard bare answers with no recipe.
Prefer create over discard when topics diverge.
Prefer create over merge for circuit-/race-/result-/season-specific facts; reserve merge for true schema/tooling duplicates.
Do not manage the Schema Primer card here — primer updates are decided by a separate primer judge.

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

/** Judge whether a primer proposal should update the single Schema Primer. */
export const DEFAULT_PRIMER_PROMPT = `You maintain ONE Schema Primer card for a database-analytics coding agent that starts a FRESH chat on every question.

The primer is always injected into the next session. It must stay compact and high-value: durable schema, joins, column encodings, db-query tool constraints, and reusable query patterns. It must NOT become a dump of one-off answers.

You are given:
1. The CURRENT primer (may be empty).
2. A PROPOSED primer update extracted from the latest session.

Decide exactly one action:
- merge — the proposal adds durable informational value not already covered. Return the FULL updated primer as card.body (rewrite/union into a concise cheatsheet; dedupe; keep bullets short).
- discard — the proposal is redundant with the current primer, only a one-off answer key (single race/result with no reusable pattern), speculative, or empty of durable value.

Prefer KEEP / merge for: table relationships, key columns, encodings (e.g. NULL meanings), join paths, DISTINCT/ORDER rules, db query interface limits.
Prefer DISCARD for: single-question answers, race-specific values without a general rule, duplicate schema already listed, vague advice.

Return ONLY JSON:
{
  "action": "merge" | "discard",
  "reason": "one short sentence",
  "card": { "title": "Schema Primer", "use_when": "...", "body": "..." }
}

Rules:
- discard: card may be null.
- merge: card.body is the complete primer text to store (not just the delta).
- Keep the primer under ~1500 tokens of content when possible; drop lower-value lines if needed.`;

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

export function formatPrimerUserMessage(
  currentBody: string | null,
  proposal: ProposeInput,
): string {
  return `## Current Schema Primer
${currentBody?.trim() ? currentBody.trim() : "(empty — no primer yet)"}

## Proposed primer update
title: ${proposal.title}
use_when: ${proposal.use_when}
body:
${proposal.body}`;
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
  return { title, use_when, body, kind: p.kind };
}

/**
 * Decide whether a primer proposal updates the single Schema Primer.
 * Always uses the Completer (independent of MUTON_CARD_GATE for general cards).
 */
export async function gatePrimerProposal(
  complete: Completer,
  store: CardStore,
  proposal: ProposeInput,
  opts?: { host?: "claude" | "cursor" | "codex" | "pi" | "auto"; cwd?: string },
): Promise<GateWriteResult> {
  const result: GateWriteResult = {
    written: 0,
    merged: 0,
    discarded: 0,
    skipped: 0,
    events: [],
  };
  const proposed = normalizeProposal(proposal);
  if (!proposed) {
    result.skipped += 1;
    return result;
  }

  const existing = store.read(PRIMER_SLUG);
  let decision: GateDecision | null = null;
  let parseError: string | undefined;
  try {
    const raw = await complete({
      system: DEFAULT_PRIMER_PROMPT,
      user: formatPrimerUserMessage(existing?.body ?? null, proposed),
      host: opts?.host,
      cwd: opts?.cwd ?? join(store.home, "scratch"),
    });
    decision = parseGateDecision(raw);
    if (!decision) parseError = "unparsable-primer-json";
    else if (decision.action === "create") {
      // Primer judge only returns merge|discard; treat create as merge.
      decision = { ...decision, action: "merge" };
    }
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }

  if (!decision) {
    // Soft fail: if no primer yet, create from proposal; else discard to avoid bloat.
    if (!existing) {
      const card = store.upsertPrimer(proposed);
      const event: GateEvent = {
        ts: new Date().toISOString(),
        action: "create",
        proposed,
        closest_slug: null,
        reason: "primer parse/error — created from proposal",
        result_slug: card.slug,
        error: parseError,
      };
      result.written += 1;
      result.events.push(event);
      logGate(store.home, event);
    } else {
      const event: GateEvent = {
        ts: new Date().toISOString(),
        action: "discard",
        proposed,
        closest_slug: PRIMER_SLUG,
        reason: "primer parse/error — discarded",
        result_slug: null,
        error: parseError,
      };
      result.discarded += 1;
      result.events.push(event);
      logGate(store.home, event);
    }
    return result;
  }

  if (decision.action === "discard") {
    const event: GateEvent = {
      ts: new Date().toISOString(),
      action: "discard",
      proposed,
      closest_slug: existing ? PRIMER_SLUG : null,
      reason: decision.reason,
      result_slug: null,
    };
    result.discarded += 1;
    result.events.push(event);
    logGate(store.home, event);
    return result;
  }

  // merge
  const mergedBody =
    decision.card?.body?.trim() ||
    (existing
      ? mergePrimerBodies(existing.body, proposed.body)
      : proposed.body);
  const fields = normalizePrimerFields(mergedBody);
  const card = store.upsertPrimer(fields);
  const event: GateEvent = {
    ts: new Date().toISOString(),
    action: existing ? "merge" : "create",
    proposed,
    closest_slug: existing ? PRIMER_SLUG : null,
    reason: decision.reason,
    result_slug: card.slug,
  };
  if (existing) result.merged += 1;
  else result.written += 1;
  result.events.push(event);
  logGate(store.home, event);
  return result;
}

/**
 * Gate each general proposal against the live hive via the Completer.
 * Primer proposals must be handled via gatePrimerProposal (not here).
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

    const asProposal: ProposalInput = {
      ...proposed,
      kind: (rawProp as ProposalInput).kind,
    };
    if (isPrimerProposal(asProposal) || isPrimerProposal(proposed)) {
      const primed = await gatePrimerProposal(complete, store, proposed, opts);
      result.written += primed.written;
      result.merged += primed.merged;
      result.discarded += primed.discarded;
      result.skipped += primed.skipped;
      result.events.push(...primed.events);
      continue;
    }

    const hive = store.listCards().filter((c) => c.slug !== PRIMER_SLUG);

    // Empty hive (ignoring primer): create without an LLM gate call
    if (hive.length === 0 && !store.read(PRIMER_SLUG)) {
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

    // If only primer exists, still allow LLM gate against primer+empty general set
    const catalog = store.listCards();

    let decision: GateDecision | null = null;
    let parseError: string | undefined;
    try {
      const raw = await complete({
        system: DEFAULT_GATE_PROMPT,
        user: formatGateUserMessage(proposed, catalog),
        host: opts?.host,
        cwd: opts?.cwd ?? join(store.home, "scratch"),
      });
      decision = parseGateDecision(raw);
      if (!decision) parseError = "unparsable-gate-json";
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }

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
      if (!slug || slug === PRIMER_SLUG || !store.read(slug)) {
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
