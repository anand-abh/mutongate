import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchCardsVector } from "../../src/search/vector.ts";
import { CardStore } from "../../src/store/index.ts";

describe("vector hive search", () => {
  test("ranks by embedding similarity (mock)", async () => {
    const prev = process.env.MUTON_EMBED_MOCK;
    process.env.MUTON_EMBED_MOCK = "1";
    const root = mkdtempSync(join(tmpdir(), "muton-vec-"));
    const store = new CardStore(root);
    try {
      const a = store.writeNew({
        title: "Qualifying periods",
        use_when: "Q1 Q2 Q3 elimination",
        body: "q1/q2/q3 are TEXT lap times; null means eliminated that period",
      });
      const b = store.writeNew({
        title: "Stripe webhooks",
        use_when: "payments",
        body: "idempotency keys on webhook handlers",
      });
      await store.embedCard(a);
      await store.embedCard(b);
      expect(store.listEmbeddings()).toHaveLength(2);

      const { hits, channels } = await searchCardsVector(
        store,
        "qualifying q1 null elimination encoding",
        { k: 2 },
      );
      expect(channels?.[0]?.name).toBe("vector");
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.slug).toBe(a.slug);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
      if (prev === undefined) delete process.env.MUTON_EMBED_MOCK;
      else process.env.MUTON_EMBED_MOCK = prev;
    }
  });
});
