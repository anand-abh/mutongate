import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mutonHome } from "../store/fs.ts";

/** Built-in reflection prompt. Always used as the base; extra REFLECTION.md is appended. */
export const DEFAULT_REFLECTION_PROMPT = `You extract durable knowledge cards from this session transcript for a shared hive memory (Muton).

Return ONLY a JSON array. No markdown fences. No commentary. Each item:
{
  "kind": "general" | "primer",
  "title": "short distinctive name (also becomes the card filename)",
  "use_when": "situation, entity, or cue when this card applies",
  "body": "the durable fact — concrete and reusable"
}

Two kinds of items (both in the same array):

1) General cards (kind "general", or omit kind): propose 0–5 durable knowledge cards for the shared hive.
Rules for general cards:
- Propose only durable facts that would help another agent later.
- Prefer concrete state: APIs, encodings, workarounds, environment facts, non-obvious constraints.
- Skip: one-off plans, full transcripts, secrets/credentials, generic advice, schema reminders the task already states, ephemeral debugging chatter.
- The store merges near-duplicates. Do not list or reuse existing hive titles. Do NOT delete cards. Do NOT invent facts not supported by the transcript.
- Prefer fewer high-value cards (0–5). If nothing durable was learned for the hive, omit general cards.

2) Schema Primer (kind "primer"): you MUST include exactly ONE additional item with kind "primer" every turn.
- Title should be "Schema Primer".
- Body: concise bullet-style durable schema/join/encoding/db-query-constraint facts learned this session, suitable to merge into a standing cheatsheet.
- Do NOT put one-off answer keys (a single race winner/time/count) in the primer.

title and use_when are mandatory and non-empty for every item.`;

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
