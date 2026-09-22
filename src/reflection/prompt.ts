import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mutonHome } from "../store/fs.ts";

/** Built-in reflection prompt. Always used as the base; extra REFLECTION.md is appended. */
export const DEFAULT_REFLECTION_PROMPT = `You extract 0–5 durable knowledge cards from this session transcript for a shared hive memory (Muton).

Return ONLY a JSON array. No markdown fences. No commentary. Each item:
{
  "title": "short distinctive name (also becomes the card filename)",
  "use_when": "situation, entity, or cue when this card applies",
  "body": "the durable fact — concrete and reusable",
  "paths": ["schema/qualifying", "lookup"]
}

Taxonomy paths (soft directory for browsing the hive later):
- paths is a JSON array of 1–3 slash-separated folders (multi-parent OK).
- Invent paths that fit the fact's domain — do not force unrelated labels.
- Example top-level folders when they fit: schema, encoding, lookup, episode, preference, null-event.
- Add a second segment when useful (e.g. schema/joins, lookup/circuits). For other tasks invent sensible roots (e.g. api/auth, deploy/k8s).
- Prefer stable reusable folders over one-off episode names when the fact is general.

Rules:
- Propose only durable facts that would help another agent later.
- Prefer concrete state: APIs, encodings, workarounds, environment facts, non-obvious constraints.
- Skip: one-off plans, full transcripts, secrets/credentials, generic advice, schema reminders the task already states, ephemeral debugging chatter.
- Near-duplicates may be merged into existing hive cards later; prefer distinct durable facts. Do NOT delete cards. Do NOT invent facts not supported by the transcript.
- Prefer fewer high-value cards (0–5). Return [] if nothing durable was learned.
- title and use_when are mandatory and non-empty. body is the durable fact. paths should be present when you can classify the card.`;

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
