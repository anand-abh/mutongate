import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRIVIA_SLUG } from "../../src/cards/trivia.ts";
import { gateAndWrite } from "../../src/reflection/gate.ts";
import { parseProposals } from "../../src/reflection/index.ts";
import { searchCards, searchCardsHybrid } from "../../src/search/index.ts";
import { CardStore } from "../../src/store/index.ts";

describe("trivia card", () => {
  test("parseProposals keeps at most one trivia", () => {
    const parsed = parseProposals(
      JSON.stringify([
        {
          kind: "trivia",
          title: "Trivia",
          use_when: "later",
          body: "raceId 20 is Bahrain 2008",
        },
        {
          kind: "trivia",
          title: "Trivia",
          use_when: "later",
          body: "should be dropped",
        },
        {
          kind: "general",
          title: "Join Keys",
          use_when: "SQL",
          body: "races.circuitId",
        },
      ]),
    );
    expect(parsed.filter((p) => p.kind === "trivia")).toHaveLength(1);
    expect(parsed).toHaveLength(2);
  });

  test("gate always merges trivia into slug trivia", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-trivia-"));
    const store = new CardStore(root);
    try {
      let calls = 0;
      const r1 = await gateAndWrite(
        async () => {
          calls += 1;
          return "";
        },
        store,
        [
          {
            kind: "trivia",
            title: "Trivia",
            use_when: "facts",
            body: "fact A",
          },
        ],
      );
      expect(calls).toBe(0);
      expect(r1.written).toBe(1);
      expect(store.read(TRIVIA_SLUG)?.body).toContain("fact A");

      const r2 = await gateAndWrite(
        async () => {
          calls += 1;
          return "";
        },
        store,
        [
          {
            kind: "trivia",
            title: "Trivia",
            use_when: "facts",
            body: "fact B",
          },
        ],
      );
      expect(calls).toBe(0);
      expect(r2.merged).toBe(1);
      expect(store.cardCount()).toBe(1);
      const body = store.read(TRIVIA_SLUG)?.body ?? "";
      expect(body).toContain("fact A");
      expect(body).toContain("fact B");
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("hybrid search always pins trivia", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-trivia-search-"));
    const store = new CardStore(root);
    try {
      store.writeNew({
        title: "Stripe webhook",
        use_when: "payments",
        body: "idempotency keys",
      });
      store.upsertTrivia({
        title: "Trivia",
        use_when: "facts",
        body: "raceId 20 is Bahrain",
      });
      const { hits, channels } = searchCardsHybrid(store, "stripe webhook stuff", {
        kInstruction: 1,
        kQuestion: 0,
      });
      expect(hits[0]?.slug).toBe(TRIVIA_SLUG);
      expect(channels?.some((c) => c.name === "trivia" && c.n_hits === 1)).toBe(
        true,
      );
      expect(hits.some((h) => h.title.toLowerCase().includes("stripe"))).toBe(
        true,
      );
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("non-hybrid search also pins trivia", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-trivia-nh-"));
    const store = new CardStore(root);
    try {
      store.upsertTrivia({
        title: "Trivia",
        use_when: "facts",
        body: "secret race fact",
      });
      store.writeNew({
        title: "Other",
        use_when: "x",
        body: "unrelated",
      });
      const { hits } = searchCards(store, "unrelated query tokenszzzz", {
        k: 1,
        skipRewrite: true,
      });
      expect(hits.some((h) => h.slug === TRIVIA_SLUG)).toBe(true);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
