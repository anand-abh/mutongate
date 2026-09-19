import { existsSync, readFileSync } from "node:fs";

/** Fixed slug — chat logs from the first N Harbor steps. */
export const INITIAL_SLUG = "initial";

export const INITIAL_TITLE = "Initial";

export const INITIAL_USE_WHEN =
  "Every succeeding database-analytics step — chat logs from the first three steps";

/** How many early steps contribute chat logs to the initial card. */
export function initialStepWindow(): number {
  const v = process.env.MUTON_INITIAL_STEPS;
  if (v === undefined || v === "") return 3;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

/**
 * Current Harbor step index (1-based), or null if unknown.
 * Prefers `/app/.step.txt`, then `Question N of` in question.md.
 */
export function resolveStepNumber(): number | null {
  for (const path of [
    process.env.MUTON_STEP_PATH,
    "/app/.step.txt",
  ].filter((p): p is string => Boolean(p))) {
    try {
      if (!existsSync(path)) continue;
      const n = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
      if (Number.isFinite(n) && n >= 1) return n;
    } catch {
      // ignore
    }
  }
  for (const path of [
    process.env.MUTON_QUESTION_PATH,
    "/app/question.md",
  ].filter((p): p is string => Boolean(p))) {
    try {
      if (!existsSync(path)) continue;
      const text = readFileSync(path, "utf8");
      const m = /Question\s+(\d+)\s+of\s+\d+/i.exec(text);
      if (m) {
        const n = Number.parseInt(m[1]!, 10);
        if (Number.isFinite(n) && n >= 1) return n;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/** True when this step should append its transcript into the initial card. */
export function shouldRecordInitial(step: number | null): boolean {
  if (step == null) return false;
  return step >= 1 && step <= initialStepWindow();
}

type ContentPart = {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: unknown;
  output?: unknown;
};

/**
 * Turn a Pi session JSONL (or plain text) into a compact chat log for the card body.
 */
export function transcriptToChatLog(raw: string, maxChars = 40_000): string {
  const text = raw.trim();
  if (!text) return "";
  const lines = text.split("\n");
  const looksJsonl = lines.some((l) => {
    const t = l.trim();
    return t.startsWith("{") && t.includes('"type"');
  });
  if (!looksJsonl) {
    return text.length > maxChars ? text.slice(-maxChars) : text;
  }

  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    let row: {
      type?: string;
      message?: { role?: string; content?: ContentPart[] | string };
    };
    try {
      row = JSON.parse(t) as typeof row;
    } catch {
      continue;
    }
    if (row.type !== "message" || !row.message) continue;
    const role = (row.message.role ?? "unknown").toUpperCase();
    const parts = flattenContent(row.message.content);
    if (!parts) continue;
    out.push(`${role}:\n${parts}`);
  }
  const joined = out.join("\n\n");
  if (!joined) {
    return text.length > maxChars ? text.slice(-maxChars) : text;
  }
  return joined.length > maxChars ? joined.slice(-maxChars) : joined;
}

function flattenContent(content: ContentPart[] | string | undefined): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  const bits: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string") {
      bits.push(part.text.trim());
    } else if (part.type === "toolCall" || part.type === "tool_use") {
      const name = part.name ?? "tool";
      const args =
        typeof part.arguments === "string"
          ? part.arguments
          : JSON.stringify(part.arguments ?? {});
      bits.push(`[tool ${name}] ${String(args).slice(0, 500)}`);
    } else if (part.type === "toolResult" || part.type === "tool_result") {
      const out =
        typeof part.output === "string"
          ? part.output
          : JSON.stringify(part.output ?? part.text ?? "");
      bits.push(`[tool result] ${String(out).slice(0, 800)}`);
    }
    // skip thinking blocks
  }
  return bits.filter(Boolean).join("\n").trim();
}

/** Merge a new step section into an existing initial card body (idempotent per step). */
export function mergeInitialStepBody(
  existing: string | undefined,
  step: number,
  chatLog: string,
): string {
  const section = `## Step ${step}\n\n${chatLog.trim()}`.trim();
  const marker = `## Step ${step}`;
  const cur = (existing ?? "").trim();
  if (!cur) return section;
  if (cur.includes(marker)) {
    // Replace existing section for this step
    const re = new RegExp(`## Step ${step}\\n[\\s\\S]*?(?=\\n## Step \\d+|$)`);
    return cur.replace(re, section).trim();
  }
  return `${cur}\n\n${section}`.trim();
}
