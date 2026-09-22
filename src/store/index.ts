import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Card, parseCard, serializeCard, slugify } from "../cards/index.ts";
import { cardsDir, indexPath, logsDir, mutonHome, scratchDir, tmpDir } from "./fs.ts";
import {
  buildTree,
  formatTree,
  normalizePath,
  normalizePaths,
  type PathListing,
  type TreeNode,
  UNCATEGORIZED_PATH,
} from "./paths.ts";
import { CardIndex, type FtsHit } from "./sqlite.ts";

const MERGE_SEARCH_K = 5;
const TITLE_OVERLAP = 0.8;
const CONTENT_OVERLAP = 0.5;
const FTS_QUERY_MAX = 500;

export type ProposeInput = {
  title: string;
  use_when: string;
  body: string;
  /** Soft taxonomy paths (multi-parent). SQLite only — not in markdown. */
  paths?: string[];
};

export class CardStore {
  readonly home: string;
  private index: CardIndex | null = null;

  constructor(home = mutonHome()) {
    this.home = home;
    this.ensureDirs();
  }

  ensureDirs(): void {
    for (const dir of [
      cardsDir(this.home),
      tmpDir(this.home),
      scratchDir(this.home),
      logsDir(this.home),
    ]) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private getIndex(): CardIndex {
    if (!this.index) {
      this.index = new CardIndex(indexPath(this.home));
      if (this.index.count() === 0) {
        const cards = this.listCards();
        if (cards.length > 0) this.index.rebuild(cards);
      }
    }
    return this.index;
  }

  close(): void {
    this.index?.close();
    this.index = null;
  }

  listCards(): Card[] {
    const dir = cardsDir(this.home);
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    } catch {
      return [];
    }
    const cards: Card[] = [];
    for (const file of files) {
      const slug = file.replace(/\.md$/, "");
      try {
        const markdown = readFileSync(join(dir, file), "utf8");
        cards.push(parseCard(markdown, slug));
      } catch {
        // skip corrupt cards
      }
    }
    return cards;
  }

  read(slug: string): Card | null {
    try {
      const markdown = readFileSync(join(cardsDir(this.home), `${slug}.md`), "utf8");
      return parseCard(markdown, slug);
    } catch {
      return null;
    }
  }

  /** Allocate a unique slug from title. */
  allocateSlug(title: string): string {
    const base = slugify(title);
    let slug = base;
    let n = 2;
    while (this.read(slug)) {
      slug = `${base}-${n}`;
      n += 1;
    }
    return slug;
  }

  /**
   * Write a card. Near-duplicate title/use_when/body updates the existing slug.
   * ponytail: FTS + token overlap; add embeddings only if the hive still grows.
   */
  upsert(input: ProposeInput, now = new Date()): Card {
    const title = input.title.trim();
    const use_when = input.use_when.trim();
    const body = input.body.trim();
    const match = this.findMergeMatch({ title, use_when, body });
    if (match) return this.update(match.slug, { title, use_when, body }, now);
    return this.writeNew({ title, use_when, body }, now);
  }

  update(slug: string, input: ProposeInput, now = new Date()): Card {
    const existing = this.read(slug);
    if (!existing) throw new Error(`Card not found: ${slug}`);
    return this.persist({
      ...existing,
      title: input.title.trim(),
      use_when: input.use_when.trim(),
      body: input.body.trim(),
      updated_at: now.toISOString(),
    });
  }

  writeNew(input: ProposeInput, now = new Date()): Card {
    const iso = now.toISOString();
    const slug = this.allocateSlug(input.title);
    return this.persist({
      slug,
      title: input.title.trim(),
      use_when: input.use_when.trim(),
      body: input.body.trim(),
      created_at: iso,
      updated_at: iso,
    });
  }

  private findMergeMatch(input: ProposeInput): { slug: string } | undefined {
    const query = [input.title, input.use_when, input.body]
      .join(" ")
      .trim()
      .slice(0, FTS_QUERY_MAX);
    if (!query) return undefined;
    const hits = this.searchRaw(query, MERGE_SEARCH_K);
    if (hits.length === 0) return undefined;

    const lower = input.title.toLowerCase();
    const exact = hits.find((h) => h.title.toLowerCase() === lower);
    if (exact) return exact;

    let best: FtsHit | undefined;
    let bestScore = 0;
    for (const [i, hit] of hits.entries()) {
      const titleScore = tokenOverlap(hit.title, input.title);
      const contentScore = tokenOverlap(combinedText(hit), combinedText(input));
      const merge = titleScore > TITLE_OVERLAP || (i === 0 && contentScore > CONTENT_OVERLAP);
      if (!merge) continue;
      if (!best || contentScore > bestScore) {
        best = hit;
        bestScore = contentScore;
      }
    }
    return best;
  }

  private persist(card: Card): Card {
    const path = join(cardsDir(this.home), `${card.slug}.md`);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, serializeCard(card), "utf8");
    renameSync(tmp, path);
    this.getIndex().upsert(card);
    return card;
  }

  searchRaw(query: string, limit = 20) {
    return this.getIndex().search(query, limit);
  }

  /** Persist embedding for a card (vector hive). */
  upsertEmbedding(slug: string, model: string, vector: Buffer): void {
    this.getIndex().upsertEmbedding(slug, model, vector);
  }

  listEmbeddings() {
    return this.getIndex().listEmbeddings();
  }

  /** Embed and store vector for one card. Best-effort; throws on API failure. */
  async embedCard(card: Card): Promise<void> {
    const { embedText, cardEmbedText, vectorToBuffer } = await import("../search/embed.ts");
    const { vector, model } = await embedText(cardEmbedText(card));
    this.upsertEmbedding(card.slug, model, vectorToBuffer(vector));
  }

  cardCount(): number {
    return this.getIndex().count();
  }

  rebuildIndex(): void {
    this.getIndex().rebuild(this.listCards());
  }

  /** Replace taxonomy paths for a slug (normalized; empty → uncategorized). */
  setPaths(slug: string, paths: string[] | undefined): string[] {
    const normalized = normalizePaths(paths ?? []);
    this.getIndex().setPaths(slug, normalized);
    return normalized;
  }

  /** Union paths onto slug (merge). */
  addPaths(slug: string, paths: string[] | undefined): string[] {
    const normalized = normalizePaths(paths ?? []);
    // If only uncategorized and card already has real paths, skip adding uncategorized.
    const existing = this.getIndex().getPaths(slug);
    const toAdd =
      normalized.length === 1 &&
      normalized[0] === UNCATEGORIZED_PATH &&
      existing.some((p) => p !== UNCATEGORIZED_PATH)
        ? []
        : normalized;
    if (toAdd.length) this.getIndex().addPaths(slug, toAdd);
    // Drop uncategorized if real paths now exist
    const after = this.getIndex().getPaths(slug);
    if (after.includes(UNCATEGORIZED_PATH) && after.some((p) => p !== UNCATEGORIZED_PATH)) {
      const cleaned = after.filter((p) => p !== UNCATEGORIZED_PATH);
      this.getIndex().setPaths(slug, cleaned);
      return cleaned;
    }
    return after.length ? after : [UNCATEGORIZED_PATH];
  }

  getPaths(slug: string): string[] {
    const paths = this.getIndex().getPaths(slug);
    return paths.length ? paths : [];
  }

  tree(opts?: { path?: string; depth?: number }): {
    total_cards: number;
    path_assignments: number;
    root: string;
    nodes: TreeNode[];
    text: string;
  } {
    const depth = opts?.depth ?? 2;
    const rawRoot = opts?.path?.trim() ?? "";
    const root = rawRoot
      ? (normalizePaths([rawRoot]).find((p) => p !== UNCATEGORIZED_PATH) ??
        normalizePathLoose(rawRoot))
      : "";
    const counts = this.getIndex().pathCounts();
    const nodes = buildTree(counts, root, depth);
    const text =
      this.cardCount() === 0
        ? "(empty hive — 0 cards)"
        : counts.size === 0
          ? `(${this.cardCount()} cards, none categorized yet)`
          : nodes.length === 0 && root
            ? `(no cards under ${root}/)`
            : formatTree(nodes);
    return {
      total_cards: this.cardCount(),
      path_assignments: this.getIndex().totalPathAssignments(),
      root: root || "/",
      nodes,
      text,
    };
  }

  ls(pathRaw: string): PathListing {
    const path = normalizePaths([pathRaw])[0] ?? UNCATEGORIZED_PATH;
    const slugs = this.getIndex().listByPath(path);
    const cards: PathListing["cards"] = [];
    for (const slug of slugs) {
      const card = this.read(slug);
      if (!card) continue;
      cards.push({
        slug: card.slug,
        title: card.title,
        use_when: card.use_when,
      });
    }
    return { path, cards };
  }
}

function combinedText(fields: { title: string; use_when: string; body: string }): string {
  return `${fields.title} ${fields.use_when} ${fields.body}`;
}

function normalizePathLoose(raw: string): string {
  return normalizePath(raw) ?? UNCATEGORIZED_PATH;
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.max(ta.size, tb.size);
}

export {
  cardsDir,
  indexPath,
  logsDir,
  mutonHome,
  scratchDir,
  sessionStatePath,
  tmpDir,
} from "./fs.ts";
export {
  buildTree,
  formatTree,
  normalizePath,
  normalizePaths,
  PATH_VOCAB_HINTS,
  type PathListing,
  type TreeNode,
  UNCATEGORIZED_PATH,
} from "./paths.ts";
