import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_GATE_PROMPT,
  formatGateUserMessage,
  gateAndWrite,
  parseGateDecision,
} from "../../src/reflection/gate.ts";
import { CardStore } from "../../src/store/index.ts";

describe("parseGateDecision", () => {
  test("parses create/merge/discard", () => {
    expect(
      parseGateDecision(
        JSON.stringify({
          action: "discard",
          closest_slug: "a",
          reason: "dup",
          card: null,
        }),
      )?.action,
    ).toBe("discard");
    expect(
      parseGateDecision(
        `\`\`\`json\n{"action":"create","closest_slug":null,"reason":"new","card":{"title":"T","use_when":"U","body":"B"}}\n\`\`\``,
      ),
    ).toEqual({
      action: "create",
      closest_slug: null,
      reason: "new",
      card: { title: "T", use_when: "U", body: "B" },
    });
  });

  test("rejects bad action", () => {
    expect(parseGateDecision('{"action":"eat","reason":"x"}')).toBeNull();
  });
});

describe("gateAndWrite", () => {
  test("empty hive creates without calling completer", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-gate-"));
    const store = new CardStore(root);
    try {
      let calls = 0;
      const result = await gateAndWrite(
        async () => {
          calls += 1;
          return "";
        },
        store,
        [{ title: "A", use_when: "when", body: "fact" }],
      );
      expect(calls).toBe(0);
      expect(result.written).toBe(1);
      expect(result.merged).toBe(0);
      expect(result.discarded).toBe(0);
      expect(store.cardCount()).toBe(1);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("discard leaves hive unchanged", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-gate-"));
    const store = new CardStore(root);
    store.writeNew({ title: "Existing", use_when: "u", body: "old fact" });
    try {
      const result = await gateAndWrite(
        async (req) => {
          expect(req.system).toBe(DEFAULT_GATE_PROMPT);
          expect(req.system).toContain("reusable recipe");
          expect(req.user).toContain("## Proposed card");
          expect(req.user).toContain("existing");
          return JSON.stringify({
            action: "discard",
            closest_slug: "existing",
            reason: "no new info",
            card: null,
          });
        },
        store,
        [{ title: "Dup", use_when: "u", body: "old fact again" }],
      );
      expect(result.discarded).toBe(1);
      expect(result.written).toBe(0);
      expect(store.cardCount()).toBe(1);
      const log = readFileSync(join(root, "logs", "gate.log"), "utf8");
      expect(log).toContain('"action":"discard"');
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("merge updates closest slug", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-gate-"));
    const store = new CardStore(root);
    store.writeNew({ title: "Join Keys", use_when: "SQL joins", body: "races.id" });
    try {
      const result = await gateAndWrite(
        async () =>
          JSON.stringify({
            action: "merge",
            closest_slug: "join-keys",
            reason: "adds driver join",
            card: {
              title: "Join Keys",
              use_when: "SQL joins",
              body: "races.id; results.driverId → drivers",
            },
          }),
        store,
        [
          {
            title: "Driver join",
            use_when: "joining drivers",
            body: "results.driverId → drivers",
          },
        ],
      );
      expect(result.merged).toBe(1);
      expect(store.cardCount()).toBe(1);
      expect(store.read("join-keys")?.body).toContain("driverId");
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("create adds a second card", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-gate-"));
    const store = new CardStore(root);
    store.writeNew({ title: "Join Keys", use_when: "SQL joins", body: "races.id" });
    try {
      const result = await gateAndWrite(
        async () =>
          JSON.stringify({
            action: "create",
            closest_slug: "join-keys",
            reason: "different kind — encoding not joins",
            card: {
              title: "Lap time encoding",
              use_when: "parsing lap times",
              body: "milliseconds in integer column",
            },
          }),
        store,
        [
          {
            title: "Lap time encoding",
            use_when: "parsing lap times",
            body: "milliseconds in integer column",
          },
        ],
      );
      expect(result.written).toBe(1);
      expect(store.cardCount()).toBe(2);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("unparsable gate output upserts instead of discarding", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-gate-"));
    const store = new CardStore(root);
    store.writeNew({ title: "X", use_when: "u", body: "b" });
    try {
      const result = await gateAndWrite(async () => "not json", store, [
        { title: "Y", use_when: "when y", body: "distinct fact about y" },
      ]);
      expect(result.discarded).toBe(0);
      expect(result.written + result.merged).toBe(1);
      expect(store.cardCount()).toBeGreaterThanOrEqual(1);
      const log = readFileSync(join(root, "logs", "gate.log"), "utf8");
      expect(log).toContain("upsert fallback");
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("formatGateUserMessage lists hive", () => {
    const msg = formatGateUserMessage(
      { title: "P", use_when: "w", body: "b" },
      [
        {
          slug: "s1",
          title: "T",
          use_when: "U",
          body: "B",
          created_at: "t",
          updated_at: "t",
        },
      ],
    );
    expect(msg).toContain("slug: s1");
    expect(msg).toContain("Proposed card");
  });
});
