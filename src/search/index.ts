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
};

export type SearchChannel = {
  name: "fts" | "vector";
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
const DEFAULT_MAX_CHARS = 100_000;

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

/** Search Cards with BM25 then rerank (CLI/MCP fallback when vector is off). */
export function searchCards(
  store: CardStore,
  query: string,
  options: SearchOptions = {},
): SearchResult {
  const k = options.k ?? DEFAULT_K;
  const maxChars = options.maxChars ?? envInt("MUTON_MAX_CHARS", DEFAULT_MAX_CHARS);
  const exclude = new Set<string>(options.excludeSlugs ?? []);

  const skipRewrite = options.skipRewrite || envFlag("MUTON_SKIP_REWRITE");
  const rewrite = skipRewrite
    ? {
        original: query,
        rewritten: query.trim(),
        source: "prompt" as const,
      }
    : rewriteSearchQuery(query);
  const effective = rewrite.rewritten;

  if (!effective.trim() || store.cardCount() === 0) {
    return { hits: [], context: "", rewrite };
  }

  const hits = rankQuery(store, effective, k, exclude, options.minScore);
  const context = formatContext(hits, maxChars);
  return {
    hits,
    context,
    rewrite,
    channels: [
      {
        name: "fts",
        query_chars: effective.length,
        query_head: effective.slice(0, 120).replace(/\n/g, "\\n"),
        n_hits: hits.length,
        slugs: hits.map((h) => h.slug),
      },
    ],
  };
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
