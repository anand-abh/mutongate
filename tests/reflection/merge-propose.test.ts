import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseMergeDecision,
  proposeCard,
} from "../../src/reflection/merge-propose.ts";
import { CardStore } from "../../src/store/index.ts";

describe("parseMergeDecision", () => {
  test("parses create and merge", () => {
    expect(parseMergeDecision('{"action":"create"}', new Set(["a"]))).toEqual({
      action: "create",
    });
    expect(
      parseMergeDecision(
        '{"action":"merge","slug":"a","title":"T","use_when":"U","body":"B"}',
        new Set(["a"]),
      ),
    ).toEqual({ action: "merge", slug: "a", title: "T", use_when: "U", body: "B" });
  });

  test("rejects merge to unknown slug", () => {
    expect(
      parseMergeDecision(
        '{"action":"merge","slug":"other","title":"T","use_when":"U","body":"B"}',
        new Set(["a"]),
      ),
    ).toBeNull();
  });
});

describe("proposeCard vector merge", () => {
  let home: string;
  let store: CardStore;
  const prevMock = process.env.MUTON_EMBED_MOCK;
  const prevAgent = process.env.MUTON_MERGE_AGENT;
  const prevK = process.env.MUTON_MERGE_K;

  afterEach(() => {
    store?.close();
    if (home) rmSync(home, { recursive: true, force: true });
    if (prevMock === undefined) delete process.env.MUTON_EMBED_MOCK;
    else process.env.MUTON_EMBED_MOCK = prevMock;
    if (prevAgent === undefined) delete process.env.MUTON_MERGE_AGENT;
    else process.env.MUTON_MERGE_AGENT = prevAgent;
    if (prevK === undefined) delete process.env.MUTON_MERGE_K;
    else process.env.MUTON_MERGE_K = prevK;
  });

  test("agent merge expands all fields on nearest neighbor", async () => {
    process.env.MUTON_EMBED_MOCK = "1";
    process.env.MUTON_MERGE_AGENT = "1";
    process.env.MUTON_MERGE_K = "2";
    home = mkdtempSync(join(tmpdir(), "muton-merge-"));
    store = new CardStore(home);
    const first = store.writeNew({
      title: "Stripe rate limit returns 200",
      use_when: "Stripe HTTP responses",
      body: "Read JSON error even when status is 200.",
    });
    await store.embedCard(first);
    store.writeNew({
      title: "Postgres timestamps UTC",
      use_when: "Database writes",
      body: "Always use TIMESTAMPTZ.",
    });
    await store.embedCard(store.read("postgres-timestamps-utc")!);

    const outcome = await proposeCard(
      store,
      {
        title: "Stripe 200 error body",
        use_when: "Handling Stripe HTTP",
        body: "Parse the error field before treating 2xx as success.",
      },
      {
        completer: async () =>
          JSON.stringify({
            action: "merge",
            slug: first.slug,
            title: "Stripe 200 error body",
            use_when: "Stripe HTTP responses and 200 bodies",
            body:
              "Read JSON error even when status is 200. Parse the error field before treating 2xx as success.",
          }),
      },
    );

    expect(outcome.merged).toBe(true);
    expect(outcome.card.slug).toBe(first.slug);
    expect(outcome.card.title).toBe("Stripe 200 error body");
    expect(outcome.card.use_when).toContain("200 bodies");
    expect(outcome.card.body).toContain("Parse the error field");
    expect(outcome.card.body).toContain("status is 200");
    expect(store.cardCount()).toBe(2);
  });

  test("agent create writes a new card", async () => {
    process.env.MUTON_EMBED_MOCK = "1";
    home = mkdtempSync(join(tmpdir(), "muton-merge-create-"));
    store = new CardStore(home);
    const first = store.writeNew({
      title: "Stripe rate limit returns 200",
      use_when: "Stripe HTTP",
      body: "Check JSON on 200.",
    });
    await store.embedCard(first);

    const outcome = await proposeCard(
      store,
      {
        title: "Postgres timestamps UTC",
        use_when: "Database writes",
        body: "Always use TIMESTAMPTZ.",
      },
      {
        completer: async () => '{"action":"create"}',
      },
    );

    expect(outcome.merged).toBe(false);
    expect(outcome.card.slug).toBe("postgres-timestamps-utc");
    expect(store.cardCount()).toBe(2);
  });

  test("lexicalOnly keeps FTS near-dup upsert", async () => {
    home = mkdtempSync(join(tmpdir(), "muton-merge-lex-"));
    store = new CardStore(home);
    const first = store.writeNew({
      title: "Stripe rate limit returns 200",
      use_when: "Stripe HTTP responses",
      body: "Read JSON error even when status is 200.",
    });
    const outcome = await proposeCard(
      store,
      {
        title: "Stripe 200 error body",
        use_when: "Handling Stripe HTTP",
        body: "Read JSON error even when status is 200.",
      },
      { lexicalOnly: true },
    );
    expect(outcome.merged).toBe(true);
    expect(outcome.card.slug).toBe(first.slug);
    expect(store.cardCount()).toBe(1);
  });
});
