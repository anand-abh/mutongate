import { describe, expect, test } from "bun:test";
import {
  buildTree,
  formatTree,
  normalizePath,
  normalizePaths,
  UNCATEGORIZED_PATH,
} from "../../src/store/paths.ts";

describe("normalizePath", () => {
  test("lowercases and strips slashes", () => {
    expect(normalizePath(" Schema/Joins/ ")).toBe("schema/joins");
  });

  test("rejects empty", () => {
    expect(normalizePath("   ")).toBeNull();
  });
});

describe("normalizePaths", () => {
  test("dedupes and falls back to uncategorized", () => {
    expect(normalizePaths([])).toEqual([UNCATEGORIZED_PATH]);
    expect(normalizePaths(["schema", "Schema", "lookup/circuits"])).toEqual([
      "schema",
      "lookup/circuits",
    ]);
  });
});

describe("buildTree", () => {
  test("nests children under prefix", () => {
    const counts = new Map([
      ["schema", 2],
      ["schema/joins", 1],
      ["lookup", 3],
    ]);
    const nodes = buildTree(counts, "", 2);
    expect(nodes.map((n) => n.path)).toEqual(["lookup", "schema"]);
    const schema = nodes.find((n) => n.path === "schema")!;
    expect(schema.count).toBe(3); // 2 + 1 under
    expect(schema.children.some((c) => c.path === "schema/joins")).toBe(true);
    expect(formatTree(nodes)).toContain("schema/");
  });
});
