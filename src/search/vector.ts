import type { Card } from "../cards/index.ts";
import type { CardStore } from "../store/index.ts";
import {
  bufferToVector,
  cosineSimilarity,
  embedText,
} from "./embed.ts";
import { formatContext, type SearchChannel, type SearchResult } from "./index.ts";
import type { RankedHit } from "./rerank.ts";

export type VectorSearchOptions = {
  k?: number;
  maxChars?: number;
  minScore?: number;
};

const DEFAULT_K = 5;
const DEFAULT_MAX_CHARS = 12_000;

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
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
 * Embed the query and rank hive cards by cosine similarity.
 * Falls back to empty hits when the hive has no embeddings yet.
 */
export async function searchCardsVector(
  store: CardStore,
  query: string,
  options: VectorSearchOptions = {},
): Promise<SearchResult> {
  const k = options.k ?? envInt("MUTON_VECTOR_K", DEFAULT_K);
  const maxChars =
    options.maxChars ?? envInt("MUTON_MAX_CHARS", DEFAULT_MAX_CHARS);
  const minScore = options.minScore;

  if (!query.trim() || store.cardCount() === 0 || k <= 0) {
    return {
      hits: [],
      context: "",
      rewrite: {
        original: query,
        rewritten: "[vector]",
        source: "prompt",
      },
      channels: [
        {
          name: "vector" as SearchChannel["name"],
          query_chars: query.length,
          query_head: query.slice(0, 120).replace(/\n/g, "\\n"),
          n_hits: 0,
          slugs: [],
        },
      ],
    };
  }

  const { vector: qVec } = await embedText(query);
  const rows = store.listEmbeddings();
  const scored: RankedHit[] = [];
  for (const row of rows) {
    const card = store.read(row.slug);
    if (!card) continue;
    const v = bufferToVector(row.vector);
    if (v.length !== qVec.length) continue;
    const score = cosineSimilarity(qVec, v);
    if (minScore !== undefined && score < minScore) continue;
    scored.push(cardToHit(card, score));
  }
  scored.sort((a, b) => b.score - a.score);
  const hits = scored.slice(0, k);
  const channels: SearchChannel[] = [
    {
      name: "vector" as SearchChannel["name"],
      query_chars: query.length,
      query_head: query.slice(0, 120).replace(/\n/g, "\\n"),
      n_hits: hits.length,
      slugs: hits.map((h) => h.slug),
    },
  ];
  return {
    hits,
    context: formatContext(hits, maxChars),
    rewrite: {
      original: query,
      rewritten: `[vector] k=${k}`,
      source: "prompt",
    },
    channels,
  };
}
