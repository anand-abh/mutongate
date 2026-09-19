import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  INITIAL_SLUG,
  mergeInitialStepBody,
  shouldRecordInitial,
  transcriptToChatLog,
} from "../../src/cards/initial.ts";
import { reflect } from "../../src/reflection/index.ts";
import { searchCards, searchCardsHybrid } from "../../src/search/index.ts";
import { CardStore } from "../../src/store/index.ts";

describe("initial chat-log card", () => {
  test("transcriptToChatLog extracts user/assistant text from Pi JSONL", () => {
    const raw = [
      JSON.stringify({ type: "session", id: "1" }),
      JSON.stringify({
        type: "message",
        message: {
          role: "user",
          content: [{ type: "text", text: "Hello question" }],
        },
      }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "secret" },
            { type: "text", text: "Answer body" },
          ],
        },
      }),
    ].join("\n");
    const log = transcriptToChatLog(raw);
    expect(log).toContain("USER:");
    expect(log).toContain("Hello question");
    expect(log).toContain("ASSISTANT:");
    expect(log).toContain("Answer body");
    expect(log).not.toContain("secret");
  });

  test("mergeInitialStepBody is idempotent per step", () => {
    const a = mergeInitialStepBody(undefined, 1, "first");
    expect(a).toContain("## Step 1");
    const b = mergeInitialStepBody(a, 2, "second");
    expect(b).toContain("## Step 2");
    const c = mergeInitialStepBody(b, 1, "first-revised");
    expect(c).toContain("first-revised");
    expect(c.match(/## Step 1/g)?.length).toBe(1);
  });

  test("shouldRecordInitial respects window", () => {
    expect(shouldRecordInitial(1)).toBe(true);
    expect(shouldRecordInitial(3)).toBe(true);
    expect(shouldRecordInitial(4)).toBe(false);
    expect(shouldRecordInitial(null)).toBe(false);
  });

  test("reflect records initial when MUTON_STEP_PATH <= 3", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-initial-"));
    const transcript = join(root, "t.jsonl");
    const stepFile = join(root, "step.txt");
    writeFileSync(stepFile, "2\n");
    writeFileSync(
      transcript,
      `${JSON.stringify({
        type: "message",
        message: {
          role: "user",
          content: [{ type: "text", text: "step two chat" }],
        },
      })}\n`,
    );
    const prev = process.env.MUTON_STEP_PATH;
    process.env.MUTON_STEP_PATH = stepFile;
    try {
      const result = await reflect({
        transcriptPath: transcript,
        home: root,
        completer: async () =>
          JSON.stringify([
            {
              title: "Some fact",
              use_when: "later",
              body: "durable",
            },
          ]),
      });
      expect(result.initial).toBe(true);
      expect(result.written).toBe(1);
      const store = new CardStore(root);
      try {
        const card = store.read(INITIAL_SLUG);
        expect(card?.body).toContain("## Step 2");
        expect(card?.body).toContain("step two chat");
        expect(store.cardCount()).toBe(2);
      } finally {
        store.close();
      }
    } finally {
      if (prev === undefined) delete process.env.MUTON_STEP_PATH;
      else process.env.MUTON_STEP_PATH = prev;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("hybrid search always pins initial (n+m+1)", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-initial-search-"));
    const store = new CardStore(root);
    try {
      store.writeNew({
        title: "Stripe webhook",
        use_when: "payments",
        body: "idempotency keys",
      });
      store.upsertInitial("## Step 1\n\nUSER:\nearly chat");
      const { hits, channels } = searchCardsHybrid(store, "stripe webhook stuff", {
        kInstruction: 1,
        kQuestion: 0,
      });
      expect(hits[0]?.slug).toBe(INITIAL_SLUG);
      expect(hits.length).toBe(2);
      expect(channels?.some((c) => c.name === "initial" && c.n_hits === 1)).toBe(
        true,
      );
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("non-hybrid search also pins initial", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-initial-nh-"));
    const store = new CardStore(root);
    try {
      store.upsertInitial("## Step 1\n\nchat");
      const { hits } = searchCards(store, "unrelated query tokenszzzz", {
        k: 1,
        skipRewrite: true,
      });
      expect(hits.some((h) => h.slug === INITIAL_SLUG)).toBe(true);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
