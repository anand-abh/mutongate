import { describe, expect, test } from "bun:test";
import {
  mergeInitialStepBody,
  shouldRecordInitial,
  transcriptToChatLog,
} from "../../src/cards/initial.ts";

describe("initial helpers (legacy)", () => {
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
});
