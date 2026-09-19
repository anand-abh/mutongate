import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rewriteSearchQuery } from "../../src/search/rewrite.ts";

const HARBOR_INSTRUCTION = `# Formula 1 database

The environment has one SQLite database of Formula 1 data.

You cannot open the database file with Python, sqlite3, or any other program.
Those paths are blocked. Query it only with:

\`\`\`text
db query "<sql>"
\`\`\`

\`db query\` runs one read-only SQL statement and prints JSON rows.
Use ordinary SQL to inspect tables (for example \`sqlite_master\` and \`PRAGMA\`).

Read \`/app/question.md\`. It has the question and a **Required output** block.
The only scored file is \`/app/answer.json\`. Write exactly one JSON object:

\`\`\`json
{"answer": <value>}
\`\`\`

Stop after writing \`/app/answer.json\`.
`;

describe("rewriteSearchQuery (soft)", () => {
  test("keeps natural question phrasing from question.md", () => {
    const dir = mkdtempSync(join(tmpdir(), "muton-qr-"));
    const qpath = join(dir, "question.md");
    writeFileSync(
      qpath,
      `Question 1 of 174

Please list the reference names of the drivers who are eliminated in the first period in race number 20.

Required output in /app/answer.json:
{"answer": <a JSON list of driverRef strings>}
`,
    );
    const prev = process.env.MUTON_QUESTION_PATH;
    process.env.MUTON_QUESTION_PATH = qpath;
    try {
      const r = rewriteSearchQuery(HARBOR_INSTRUCTION);
      expect(r.source).toBe("question_file");
      expect(r.rewritten.length).toBeLessThan(HARBOR_INSTRUCTION.length / 4);
      expect(r.rewritten.toLowerCase()).toContain("drivers");
      expect(r.rewritten.toLowerCase()).toContain("eliminated");
      expect(r.rewritten).toContain("20");
      // Soft: keep question words previously dropped in qr1
      expect(r.rewritten.toLowerCase()).toContain("list");
      expect(r.rewritten.toLowerCase()).toContain("names");
      expect(r.rewritten.toLowerCase()).toContain("number");
      expect(r.rewritten.toLowerCase()).not.toContain("sqlite");
      expect(r.rewritten.toLowerCase()).not.toContain("python");
    } finally {
      if (prev === undefined) delete process.env.MUTON_QUESTION_PATH;
      else process.env.MUTON_QUESTION_PATH = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("instruction-only rewrite stays much shorter than prompt", () => {
    const prev = process.env.MUTON_QUESTION_PATH;
    delete process.env.MUTON_QUESTION_PATH;
    try {
      const r = rewriteSearchQuery(HARBOR_INSTRUCTION);
      expect(r.rewritten.length).toBeLessThan(HARBOR_INSTRUCTION.length / 3);
      expect(r.rewritten.split(/\s+/).length).toBeLessThanOrEqual(16);
    } finally {
      if (prev !== undefined) process.env.MUTON_QUESTION_PATH = prev;
    }
  });
});
