/** Soft examples for prompts — the model may invent other paths for new domains. */
export const PATH_VOCAB_HINTS = [
  "schema",
  "encoding",
  "lookup",
  "episode",
  "preference",
  "null-event",
] as const;

export const UNCATEGORIZED_PATH = "uncategorized";

const MAX_PATH_DEPTH = 3;
const MAX_SEGMENT_LEN = 48;
const MAX_PATHS_PER_CARD = 6;

/**
 * Normalize a taxonomy path: lowercase, slash-separated, no leading/trailing slash.
 * Returns null if empty/invalid after cleanup.
 */
export function normalizePath(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!cleaned) return null;
  const segments = cleaned.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const clipped = segments.slice(0, MAX_PATH_DEPTH).map((s) => {
    const t = s.replace(/^-+|-+$/g, "").slice(0, MAX_SEGMENT_LEN);
    return t || "x";
  });
  return clipped.join("/");
}

/** Dedupe + normalize; empty input → [uncategorized]. */
export function normalizePaths(raw: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,;]/).map((s) => s.trim())
      : [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const p = normalizePath(item);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= MAX_PATHS_PER_CARD) break;
  }
  if (out.length === 0) return [UNCATEGORIZED_PATH];
  return out;
}

export type TreeNode = {
  path: string;
  count: number;
  children: TreeNode[];
};

export type PathListing = {
  path: string;
  cards: Array<{ slug: string; title: string; use_when: string }>;
};

/** Build a nested tree from flat path→count (exact path card counts). */
export function buildTree(pathCounts: Map<string, number>, rootPrefix = "", depth = 2): TreeNode[] {
  const prefix = rootPrefix.replace(/^\/+|\/+$/g, "");
  const childSegCounts = new Map<string, { direct: number; under: number }>();

  for (const [path, n] of pathCounts) {
    if (prefix) {
      if (path === prefix) continue;
      if (!path.startsWith(`${prefix}/`)) continue;
      const rest = path.slice(prefix.length + 1);
      const seg = rest.split("/")[0]!;
      const key = `${prefix}/${seg}`;
      const cur = childSegCounts.get(key) ?? { direct: 0, under: 0 };
      if (rest === seg) cur.direct += n;
      cur.under += n;
      childSegCounts.set(key, cur);
    } else {
      const seg = path.split("/")[0]!;
      const cur = childSegCounts.get(seg) ?? { direct: 0, under: 0 };
      if (path === seg) cur.direct += n;
      cur.under += n;
      childSegCounts.set(seg, cur);
    }
  }

  const nodes: TreeNode[] = [];
  for (const [path, { under }] of [...childSegCounts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const node: TreeNode = {
      path,
      count: under,
      children: depth > 1 ? buildTree(pathCounts, path, depth - 1) : [],
    };
    nodes.push(node);
  }
  return nodes;
}

export function formatTree(nodes: TreeNode[], indent = 0): string {
  if (nodes.length === 0) return "(empty hive — no categorized cards yet)";
  const lines: string[] = [];
  for (const n of nodes) {
    lines.push(`${"  ".repeat(indent)}${n.path}/  (${n.count})`);
    if (n.children.length) lines.push(formatTree(n.children, indent + 1));
  }
  return lines.join("\n");
}
