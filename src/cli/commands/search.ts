import { appendFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { searchCards } from "../../search/index.ts";
import { searchCardsVector } from "../../search/vector.ts";
import { tokenize, toFtsQuery } from "../../search/bm25.ts";
import { CardStore } from "../../store/index.ts";

function logLine(file: string, payload: Record<string, unknown>): void {
  const home = process.env.MUTON_HOME;
  if (!home) return;
  try {
    mkdirSync(home, { recursive: true });
    appendFileSync(join(home, file), `${JSON.stringify({ ts: new Date().toISOString(), ...payload })}\n`);
  } catch {
    // best-effort
  }
}

function envFlag(name: string): boolean {
  const v = process.env[name];
  return v === "1" || v === "true";
}

export async function cmdSearch(args: string[]): Promise<void> {
  const json = args.includes("--json");
  let k = 5;
  const queryParts: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--json") continue;
    if (a === "--k" && args[i + 1]) {
      k = Number.parseInt(args[++i]!, 10) || 5;
      continue;
    }
    queryParts.push(a);
  }
  const query = queryParts.join(" ").trim();
  if (!query) {
    console.error("Usage: muton search [--json] [--k N] <query>");
    process.exit(1);
  }
  const store = new CardStore();
  try {
    const vector = envFlag("MUTON_VECTOR") || envFlag("MUTON_VECTOR_SEARCH");
    const result = vector
      ? await searchCardsVector(store, query, { k })
      : searchCards(store, query, {
          k,
          skipRewrite: true,
        });

    logLine("search-debug.log", {
      mode: vector ? "vector" : "fts",
      argv_chars: query.length,
      argv_sha256: createHash("sha256").update(query).digest("hex").slice(0, 16),
      argv_head: query.slice(0, 120).replace(/\n/g, "\\n"),
      channels: result.channels ?? null,
      n_hits: result.hits.length,
      hit_slugs: result.hits.map((h) => h.slug),
      hit_scores: result.hits.map((h) => h.score),
      context_chars: (result.context || "").length,
      card_count: store.cardCount(),
      embedding_count: store.listEmbeddings().length,
      fts_tokens_instruction: tokenize(query),
      fts_query_instruction: toFtsQuery(query),
    });

    logLine("search-rewrite.log", {
      source: result.rewrite?.source ?? "prompt",
      original_chars: query.length,
      rewritten_chars: (result.rewrite?.rewritten ?? query).length,
      rewritten: result.rewrite?.rewritten ?? query,
      channels: result.channels ?? null,
    });

    if (json) {
      console.log(
        JSON.stringify({
          hits: result.hits.map((h) => ({
            slug: h.slug,
            title: h.title,
            use_when: h.use_when,
            score: h.score,
            body: h.body,
          })),
          context: result.context,
          query_original: query,
          query_rewritten: result.rewrite?.rewritten ?? query,
          query_source: result.rewrite?.source ?? "prompt",
          channels: result.channels ?? null,
        }),
      );
      return;
    }
    if (result.hits.length === 0) {
      console.log("No cards found.");
      return;
    }
    for (const h of result.hits) {
      console.log(`- ${h.title} (${h.slug}) score=${h.score.toFixed(4)}`);
      console.log(`  use_when: ${h.use_when}`);
    }
  } finally {
    store.close();
  }
}
