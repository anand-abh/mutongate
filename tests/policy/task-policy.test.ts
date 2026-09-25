import { describe, expect, test } from "bun:test";
import { parseTaskPolicyMarkdown } from "../../src/policy/task-policy.ts";

describe("parseTaskPolicyMarkdown", () => {
  test("extracts agent tips and reflection sections", () => {
    const md = `# Task

## Agent tips

Header line
- First guideline
- Second guideline

## Reflection

- Prefer schema/joins
`;
    const p = parseTaskPolicyMarkdown(md);
    expect(p.agentTips).toContain("Header line");
    expect(p.guidelines).toEqual(["First guideline", "Second guideline"]);
    expect(p.reflectionExtra).toContain("Prefer schema/joins");
  });

  test("whole file is tips when no Agent tips heading", () => {
    const md = `# Title

Plain intro
- Only bullet
`;
    const p = parseTaskPolicyMarkdown(md);
    expect(p.guidelines).toEqual(["Only bullet"]);
    expect(p.agentTips).toContain("Plain intro");
    expect(p.reflectionExtra).toBe("");
  });
});
