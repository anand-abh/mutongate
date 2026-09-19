import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mutonHome } from "../store/fs.ts";

/** Built-in reflection prompt. Always used as the base; extra REFLECTION.md is appended. */
export const DEFAULT_REFLECTION_PROMPT = `You extract durable knowledge for a shared hive memory (Muton) from this session transcript.

Return ONLY a JSON array. No markdown fences. No commentary. Each item:
{
  "kind": "general" | "primer",
  "title": "short distinctive name",
  "use_when": "situation, entity, or cue when this applies",
  "body": "the durable fact — concrete and reusable"
}

You MUST include exactly ONE item with kind "primer" every turn (even if the delta is small). That proposal is a candidate update to the single Schema Primer card — durable schema, joins, column encodings, db-query tool constraints, and reusable query patterns learned this session. Title should be "Schema Primer". Do NOT put one-off answer keys (a single race winner/time/count) in the primer; put reusable how-to knowledge there.

Optionally also include 0–5 kind "general" cards for other durable topics that should stay as separate cards (optional; prefer putting schema/join/tooling into the primer instead).

Rules:
- Propose only facts supported by the transcript.
- Primer body should be concise bullet-style facts suitable to merge into a standing cheatsheet.
- Skip: one-off plans, full transcripts, secrets/credentials, generic advice, ephemeral debugging chatter.
- Do NOT invent facts. Do NOT delete cards.
- title and use_when are mandatory and non-empty.`;

/**
 * Default prompt, plus the first extra REFLECTION.md found (project, then home).
 */
export function loadReflectionPrompt(opts?: { cwd?: string; home?: string }): string {
  const cwd = opts?.cwd ?? process.cwd();
  const home = opts?.home ?? mutonHome();
  const extra = readExtraPrompt(cwd, home);
  if (!extra) return DEFAULT_REFLECTION_PROMPT;
  return `${DEFAULT_REFLECTION_PROMPT}\n\n${extra}`;
}

function readExtraPrompt(cwd: string, home: string): string {
  for (const path of [join(cwd, "REFLECTION.md"), join(home, "REFLECTION.md")]) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8").trim();
    if (text) return text;
  }
  return "";
}
