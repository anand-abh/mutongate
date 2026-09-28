import { afterEach, describe, expect, test } from "bun:test";
import {
  decideJevMerge,
  expandMergedFields,
  jevMergeEnabled,
  jevMergeThreshold,
} from "../../src/reflection/jev-merge.ts";

describe("expandMergedFields", () => {
  test("unions body and prefers longer title", () => {
    const fields = expandMergedFields(
      {
        title: "Stripe 200",
        use_when: "Stripe HTTP",
        body: "Read JSON on 200.",
      },
      {
        title: "Stripe 200 error body",
        use_when: "Handling Stripe HTTP",
        body: "Parse the error field first.",
      },
    );
    expect(fields.title).toBe("Stripe 200 error body");
    expect(fields.use_when).toContain("Stripe HTTP");
    expect(fields.use_when).toContain("Handling");
    expect(fields.body).toContain("Read JSON");
    expect(fields.body).toContain("Parse the error");
  });

  test("does not duplicate contained text", () => {
    const fields = expandMergedFields(
      { title: "A", use_when: "U", body: "full body with detail" },
      { title: "A", use_when: "U", body: "full body" },
    );
    expect(fields.body).toBe("full body with detail");
  });
});

describe("jevMergeThreshold / enabled", () => {
  const prevT = process.env.MUTON_JEV_MERGE_THRESHOLD;
  const prevM = process.env.MUTON_JEV_MERGE;
  const prevK = process.env.TYPESAFE_API_KEY;

  afterEach(() => {
    if (prevT === undefined) delete process.env.MUTON_JEV_MERGE_THRESHOLD;
    else process.env.MUTON_JEV_MERGE_THRESHOLD = prevT;
    if (prevM === undefined) delete process.env.MUTON_JEV_MERGE;
    else process.env.MUTON_JEV_MERGE = prevM;
    if (prevK === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = prevK;
  });

  test("default threshold 0.6", () => {
    delete process.env.MUTON_JEV_MERGE_THRESHOLD;
    expect(jevMergeThreshold()).toBe(0.6);
  });

  test("enabled needs key", () => {
    process.env.MUTON_JEV_MERGE = "1";
    delete process.env.TYPESAFE_API_KEY;
    expect(jevMergeEnabled()).toBe(false);
    process.env.TYPESAFE_API_KEY = "test";
    expect(jevMergeEnabled()).toBe(true);
  });
});

describe("decideJevMerge", () => {
  const prevK = process.env.TYPESAFE_API_KEY;
  const prevFetch = globalThis.fetch;

  afterEach(() => {
    if (prevK === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = prevK;
    globalThis.fetch = prevFetch;
  });

  test("merges into higher-noul neighbor when above threshold", async () => {
    process.env.TYPESAFE_API_KEY = "test";
    let call = 0;
    globalThis.fetch = (async () => {
      call += 1;
      const noul = call === 1 ? 0.4 : 0.85;
      return new Response(
        JSON.stringify({
          model: "jev-test",
          answers: { should_merge: { type: "noul", noul } },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const decision = await decideJevMerge(
      {
        title: "Proposal",
        use_when: "U",
        body: "B",
      },
      [
        {
          slug: "near-a",
          title: "A",
          use_when: "Ua",
          body: "Ba",
          score: 0.9,
        },
        {
          slug: "near-b",
          title: "B",
          use_when: "Ub",
          body: "Bb",
          score: 0.7,
        },
      ],
      { threshold: 0.6 },
    );

    expect(call).toBe(2);
    expect(decision.action).toBe("merge");
    expect(decision.slug).toBe("near-b");
    expect(decision.picked_noul).toBe(0.85);
  });

  test("creates when max noul below threshold", async () => {
    process.env.TYPESAFE_API_KEY = "test";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          answers: { should_merge: { type: "noul", noul: 0.2 } },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const decision = await decideJevMerge(
      { title: "P", use_when: "U", body: "B" },
      [
        {
          slug: "near-a",
          title: "A",
          use_when: "Ua",
          body: "Ba",
          score: 0.5,
        },
      ],
      { threshold: 0.6 },
    );
    expect(decision.action).toBe("create");
    expect(decision.slug).toBeUndefined();
    expect(decision.picked_noul).toBe(0.2);
  });
});
