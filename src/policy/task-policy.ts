/** Load optional task-specific Muton policy (tips + reflection extras). */

import { existsSync, readFileSync } from "node:fs";

export type TaskPolicy = {
  /** Absolute or configured path, if any file was read. */
  path: string | null;
  /** Full agent-tips section body (injected into system prompt). */
  agentTips: string;
  /** Bullet lines from agent tips (for tool promptGuidelines). */
  guidelines: string[];
  /** Optional reflection overlay. */
  reflectionExtra: string;
};

const AGENT_TIPS_HEADING = /^##\s+agent\s+tips\s*$/i;
const REFLECTION_HEADING = /^##\s+reflection\s*$/i;
const ANY_H2 = /^##\s+/;

/**
 * Resolve policy path: MUTON_TASK_POLICY, else defaultPath if it exists.
 */
export function resolveTaskPolicyPath(defaultPath?: string): string | null {
  const fromEnv = (process.env.MUTON_TASK_POLICY || "").trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  if (defaultPath && existsSync(defaultPath)) return defaultPath;
  return null;
}

/** Parse markdown policy into tips + reflection sections. */
export function parseTaskPolicyMarkdown(md: string): Omit<TaskPolicy, "path"> {
  const text = md.replace(/^\uFEFF/, "").trim();
  if (!text) {
    return { agentTips: "", guidelines: [], reflectionExtra: "" };
  }

  const lines = text.split(/\r?\n/);
  const agentTips = extractSection(lines, AGENT_TIPS_HEADING);
  const reflectionExtra = extractSection(lines, REFLECTION_HEADING);

  let tipsBody = agentTips;
  if (!tipsBody) {
    // Whole file is tips (skip a single leading # title).
    const bodyLines = [...lines];
    if (bodyLines[0]?.match(/^#\s+/)) bodyLines.shift();
    while (bodyLines[0]?.trim() === "") bodyLines.shift();
    // Drop reflection section if present without agent-tips heading.
    const refIdx = bodyLines.findIndex((l) => REFLECTION_HEADING.test(l.trim()));
    tipsBody = (refIdx >= 0 ? bodyLines.slice(0, refIdx) : bodyLines).join("\n").trim();
  }

  return {
    agentTips: tipsBody,
    guidelines: extractGuidelineBullets(tipsBody),
    reflectionExtra: reflectionExtra.trim(),
  };
}

export function loadTaskPolicy(opts?: { defaultPath?: string }): TaskPolicy {
  const path = resolveTaskPolicyPath(opts?.defaultPath);
  if (!path) {
    return { path: null, agentTips: "", guidelines: [], reflectionExtra: "" };
  }
  try {
    const parsed = parseTaskPolicyMarkdown(readFileSync(path, "utf8"));
    return { path, ...parsed };
  } catch {
    return { path, agentTips: "", guidelines: [], reflectionExtra: "" };
  }
}

function extractSection(lines: string[], heading: RegExp): string {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && heading.test(line.trim())) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const t = line.trim();
    if (ANY_H2.test(t) && !heading.test(t)) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

function extractGuidelineBullets(tips: string): string[] {
  const out: string[] = [];
  for (const line of tips.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s+(.+)$/);
    if (m?.[1]) out.push(m[1].trim());
  }
  return out;
}
