import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mutonHome } from "../store/fs.ts";

/** Built-in reflection prompt. Always used as the base; extra REFLECTION.md is appended. */
export const DEFAULT_REFLECTION_PROMPT = `You extract durable knowledge cards from this session transcript for a shared hive memory (Muton).

Return ONLY a JSON array. No markdown fences. No commentary. Each item:
{
  "kind": "general" | "trivia",
  "title": "short distinctive name (also becomes the card filename)",
  "use_when": "situation, entity, or cue when this card applies",
  "body": "the durable fact — concrete and reusable"
}

Card kinds:
- general (default): reusable schema/join/tooling/encoding patterns. Prefer these for durable how-to knowledge. You may propose 0–5 general cards.
- trivia: at most ONE item with kind "trivia". Put non-general, session-specific facts here (concrete answers, raceIds, one-off lookups, verified values) that might help later steps. Title should be "Trivia". The hive keeps a single trivia card; new trivia is merged into it.

Rules:
- Propose only facts supported by the transcript.
- Prefer concrete state: APIs, encodings, workarounds, environment facts, non-obvious constraints, verified lookups.
- Skip: one-off plans, full transcripts, secrets/credentials, generic advice, schema reminders the task already states, ephemeral debugging chatter.
- The store merges near-duplicates. Do not list or reuse existing hive titles (except Trivia). Do NOT delete cards. Do NOT invent facts.
- Prefer fewer high-value general cards (0–5) plus optional 0–1 trivia. Return [] if nothing useful was learned.
- title and use_when are mandatory and non-empty. body is the fact. kind may be omitted (treated as general).`;

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
