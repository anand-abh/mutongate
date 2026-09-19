import { existsSync, readFileSync } from "node:fs";
import type { Card } from "../cards/index.ts";
import { INITIAL_SLUG } from "../cards/initial.ts";
import type { CardStore } from "../store/index.ts";
import type { RankedHit } from "./rerank.ts";
import { rerank } from "./rerank.ts";
import { rewriteSearchQuery, type RewriteResult } from "./rewrite.ts";

export type SearchOptions = {
  k?: number;
  maxChars?: number;
  minScore?: number;
  excludeSlugs?: Set<string>;
  /** Skip query rewrite (tests / debugging). */
  skipRewrite?: boolean;
  /** Dual-channel: k_instruction from prompt + k_question from question file. */
  hybrid?: boolean;
  kInstruction?: number;
  kQuestion?: number;
};

export type SearchChannel = {
  name: "instruction" | "question" | "initial";
  query_chars: number;
  query_head: string;
  n_hits: number;
  slugs: string[];
};

export type SearchResult = {
  hits: RankedHit[];
  context: string;
  rewrite?: RewriteResult;
  channels?: SearchChannel[];
};

const DEFAULT_K = 5;
/** Large enough to fit the initial chat-log card plus hybrid hits. */
const DEFAULT_MAX_CHARS = 100_000;
const DEFAULT_K_INSTRUCTION = 3;
const DEFAULT_K_QUESTION = 3;

function envFlag(name: string): boolean {
  const v = process.env[name];
  return v === "1" || v === "true";
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function readQuestionText(): string | null {
  const candidates = [
    process.env.MUTON_QUESTION_PATH,
    "/app/question.md",
  ].filter((p): p is string => Boolean(p));
  for (const path of candidates) {
    try {
      if (existsSync(path)) {
        const text = readFileSync(path, "utf8").trim();
        if (text) return text;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function rankQuery(
  store: CardStore,
  query: string,
  k: number,
  exclude: Set<string>,
  minScore?: number,
): RankedHit[] {
  if (!query.trim() || store.cardCount() === 0 || k <= 0) return [];
  const raw = store.searchRaw(query, Math.max(k * 4, 20));
  let ranked = rerank(raw, query).filter((h) => !exclude.has(h.slug));
  if (minScore !== undefined) {
    ranked = ranked.filter((h) => h.score >= minScore);
  }
  return ranked.slice(0, k);
}

/** Pin the initial chat-log card (if any) as a synthetic top hit. */
function initialHit(store: CardStore): RankedHit | null {
  const card = store.read(INITIAL_SLUG);
  if (!card) return null;
  return cardToHit(card, Number.POSITIVE_INFINITY);
}

function cardToHit(card: Card, score: number): RankedHit {
  return {
    slug: card.slug,
    title: card.title,
    use_when: card.use_when,
    body: card.body,
    created_at: card.created_at,
    updated_at: card.updated_at,
    bm25: 0,
    score,
  };
}

/**
 * Hybrid k+k: instruction + question channels, plus always-pinned initial card.
 */
export function searchCardsHybrid(
  store: CardStore,
  instruction: string,
  options: SearchOptions = {},
): SearchResult {
  const maxChars = options.maxChars ?? envInt("MUTON_MAX_CHARS", DEFAULT_MAX_CHARS);
  const kInst =
    options.kInstruction ??
    envInt("MUTON_HYBRID_K_INSTRUCTION", DEFAULT_K_INSTRUCTION);
  const kQ =
    options.kQuestion ?? envInt("MUTON_HYBRID_K_QUESTION", DEFAULT_K_QUESTION);
  const exclude = new Set<string>(options.excludeSlugs ?? []);
  const pinned = initialHit(store);
  if (pinned) exclude.add(INITIAL_SLUG);
  const channels: SearchChannel[] = [];

  if (pinned) {
    channels.push({
      name: "initial",
      query_chars: 0,
      query_head: "(pinned)",
      n_hits: 1,
      slugs: [INITIAL_SLUG],
    });
  }

  const instHits = rankQuery(
    store,
    instruction,
    kInst,
    exclude,
    options.minScore,
  );
  channels.push({
    name: "instruction",
    query_chars: instruction.length,
    query_head: instruction.slice(0, 120).replace(/\n/g, "\\n"),
    n_hits: instHits.length,
    slugs: instHits.map((h) => h.slug),
  });

  const taken = new Set<string>([...exclude, ...instHits.map((h) => h.slug)]);
  const question = readQuestionText();
  let qHits: RankedHit[] = [];
  if (question) {
    qHits = rankQuery(store, question, kQ, taken, options.minScore);
    channels.push({
      name: "question",
      query_chars: question.length,
      query_head: question.slice(0, 120).replace(/\n/g, "\\n"),
      n_hits: qHits.length,
      slugs: qHits.map((h) => h.slug),
    });
  } else {
    channels.push({
      name: "question",
      query_chars: 0,
      query_head: "",
      n_hits: 0,
      slugs: [],
    });
  }

  const hits = pinned ? [pinned, ...instHits, ...qHits] : [...instHits, ...qHits];
  const context = formatContext(hits, maxChars);
  return {
    hits,
    context,
    rewrite: {
      original: instruction,
      rewritten: question
        ? `[hybrid] initial+instruction[${kInst}]+question[${kQ}]`
        : `[hybrid] initial+instruction[${kInst}] only`,
      source: question ? "question_file" : "prompt",
    },
    channels,
  };
}

/** Search Cards with BM25 then rerank; always pin initial when present. */
export function searchCards(
  store: CardStore,
  query: string,
  options: SearchOptions = {},
): SearchResult {
  const hybrid =
    options.hybrid ||
    envFlag("MUTON_HYBRID") ||
    envFlag("MUTON_HYBRID_SEARCH");
  if (hybrid) {
    return searchCardsHybrid(store, query, options);
  }

  const k = options.k ?? DEFAULT_K;
  const maxChars = options.maxChars ?? envInt("MUTON_MAX_CHARS", DEFAULT_MAX_CHARS);
  const exclude = new Set<string>(options.excludeSlugs ?? []);
  const pinned = initialHit(store);
  if (pinned) exclude.add(INITIAL_SLUG);

  const skipRewrite =
    options.skipRewrite ||
    envFlag("MUTON_SKIP_REWRITE");
  const rewrite = skipRewrite
    ? {
        original: query,
        rewritten: query.trim(),
        source: "prompt" as const,
      }
    : rewriteSearchQuery(query);
  const effective = rewrite.rewritten;

  if (!effective.trim() || store.cardCount() === 0) {
    const hits = pinned ? [pinned] : [];
    return { hits, context: formatContext(hits, maxChars), rewrite };
  }

  const ranked = rankQuery(store, effective, k, exclude, options.minScore);
  const hits = pinned ? [pinned, ...ranked] : ranked;
  const context = formatContext(hits, maxChars);
  return { hits, context, rewrite };
}

export function formatContext(hits: RankedHit[], maxChars: number): string {
  if (hits.length === 0) return "";
  const parts: string[] = [
    "MUTON CARDS (trusted shared memory — prefer these facts when they apply)",
  ];
  let used = parts[0]!.length;
  for (const hit of hits) {
    const block = ["", `### ${hit.title}`, `Use when: ${hit.use_when}`, hit.body].join("\n");
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join("\n");
}

export type { RankedHit } from "./rerank.ts";
export { rerank } from "./rerank.ts";
