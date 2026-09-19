import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRIMER_SLUG } from "../../src/cards/primer.ts";
import {
  DEFAULT_PRIMER_PROMPT,
  gatePrimerProposal,
} from "../../src/reflection/gate.ts";
import { parseProposals } from "../../src/reflection/index.ts";
import { searchCards, searchCardsHybrid } from "../../src/search/index.ts";
import { CardStore } from "../../src/store/index.ts";

describe("schema primer", () => {
  test("parseProposals keeps at most one primer", () => {
    const parsed = parseProposals(
      JSON.stringify([
        {
          kind: "primer",
          title: "Schema Primer",
          use_when: "db",
          body: "races.circuitId → circuits",
        },
        {
          kind: "primer",
          title: "Schema Primer",
          use_when: "db",
          body: "should be dropped",
        },
        {
          kind: "general",
          title: "Other",
          use_when: "x",
          body: "y",
        },
      ]),
    );
    expect(parsed.filter((p) => p.kind === "primer")).toHaveLength(1);
    expect(parsed).toHaveLength(2);
  });

  test("primer judge merge writes single primer slug", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-primer-"));
    const store = new CardStore(root);
    try {
      const r1 = await gatePrimerProposal(
        async (req) => {
          expect(req.system).toBe(DEFAULT_PRIMER_PROMPT);
          expect(req.user).toContain("(empty");
          return JSON.stringify({
            action: "merge",
            reason: "new schema fact",
            card: {
              title: "Schema Primer",
              use_when: "db questions",
              body: "- races.circuitId joins circuits",
            },
          });
        },
        store,
        {
          kind: "primer",
          title: "Schema Primer",
          use_when: "db",
          body: "races.circuitId joins circuits",
        },
      );
      expect(r1.written).toBe(1);
      expect(store.read(PRIMER_SLUG)?.body).toContain("circuitId");

      const r2 = await gatePrimerProposal(
        async (req) => {
          expect(req.user).toContain("circuitId");
          return JSON.stringify({
            action: "merge",
            reason: "adds encoding",
            card: {
              title: "Schema Primer",
              use_when: "db questions",
              body: "- races.circuitId joins circuits\n- results.position NULL means DNF",
            },
          });
        },
        store,
        {
          kind: "primer",
          title: "Schema Primer",
          use_when: "db",
          body: "position NULL = DNF",
        },
      );
      expect(r2.merged).toBe(1);
      expect(store.cardCount()).toBe(1);
      expect(store.read(PRIMER_SLUG)?.body).toContain("DNF");
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("primer judge discard leaves primer unchanged", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-primer-d-"));
    const store = new CardStore(root);
    store.upsertPrimer({
      title: "Schema Primer",
      use_when: "db",
      body: "- existing fact",
    });
    try {
      const r = await gatePrimerProposal(
        async () =>
          JSON.stringify({
            action: "discard",
            reason: "one-off answer",
            card: null,
          }),
        store,
        {
          kind: "primer",
          title: "Schema Primer",
          use_when: "db",
          body: "race 20 winner was X",
        },
      );
      expect(r.discarded).toBe(1);
      expect(store.read(PRIMER_SLUG)?.body).toBe("- existing fact");
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("hybrid search always pins primer", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-primer-search-"));
    const store = new CardStore(root);
    try {
      store.writeNew({
        title: "Stripe webhook",
        use_when: "payments",
        body: "idempotency keys",
      });
      store.upsertPrimer({
        title: "Schema Primer",
        use_when: "db",
        body: "- races join circuits on circuitId",
      });
      const { hits, channels } = searchCardsHybrid(store, "stripe webhook stuff", {
        kInstruction: 1,
        kQuestion: 0,
      });
      expect(hits[0]?.slug).toBe(PRIMER_SLUG);
      expect(channels?.some((c) => c.name === "primer" && c.n_hits === 1)).toBe(
        true,
      );
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("non-hybrid search also pins primer", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-primer-nh-"));
    const store = new CardStore(root);
    try {
      store.upsertPrimer({
        title: "Schema Primer",
        use_when: "db",
        body: "- schema fact",
      });
      const { hits } = searchCards(store, "unrelated query tokenszzzz", {
        k: 1,
        skipRewrite: true,
      });
      expect(hits.some((h) => h.slug === PRIMER_SLUG)).toBe(true);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
