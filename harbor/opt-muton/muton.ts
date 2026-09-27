// Muton Pi extension — vector search + taxonomy browse + silent reflect.
// Task-specific tips come from MUTON_TASK_POLICY (markdown); this file stays general.
import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const MAX_SEARCHES = Number.parseInt(process.env.MUTON_MAX_SEARCHES || "10", 10) || 10;

/** Generic hive tip when no task policy is mounted. */
const CORE_TIP_HEADER = [
  "MUTON HIVE (browse + vector search — nothing is auto-injected)",
  "Tools: muton_tree (map), muton_ls (list under a path), muton_get (one card), muton_search (semantic).",
].join("\n");

const CORE_GUIDELINES = [
  "Nothing is auto-injected — call muton_tree / muton_ls / muton_get / muton_search explicitly when you need hive memory.",
  "Start with muton_tree when unsure what the hive holds. If empty or tiny, proceed without further Muton calls.",
  "When folders look relevant, muton_ls then muton_get promising slugs before muton_search.",
  "Use muton_search for open-ended semantic recall (per-step search budget applies).",
];

const DEFAULT_POLICY_PATH = "/opt/muton/policies/alb-database-analytics.md";

function loadType() {
  const bases = [];
  try {
    const which = execFileSync("bash", ["-lc", "command -v pi"], {
      encoding: "utf8",
    }).trim();
    if (which) bases.push(which);
  } catch {
    // ignore
  }
  bases.push(join(process.cwd(), "package.json"), "/proc/self/exe");
  for (const base of bases) {
    try {
      const req = createRequire(base);
      for (const spec of ["typebox", "@sinclair/typebox"]) {
        try {
          return req(spec).Type;
        } catch {
          // try next
        }
      }
    } catch {
      // try next base
    }
  }
  return null;
}

function homeDir() {
  return process.env.MUTON_HOME || "/tmp/muton-agent-store";
}

function searchCountPath() {
  return join(homeDir(), "logs", "muton-search-count.json");
}

function readSearchCount() {
  try {
    const p = searchCountPath();
    if (!existsSync(p)) return 0;
    const data = JSON.parse(readFileSync(p, "utf8"));
    return typeof data.count === "number" ? data.count : 0;
  } catch {
    return 0;
  }
}

function writeSearchCount(count) {
  try {
    const dir = join(homeDir(), "logs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(searchCountPath(), `${JSON.stringify({ count })}\n`);
  } catch {
    // ignore
  }
}

function logHook(payload) {
  try {
    const home = homeDir();
    mkdirSync(home, { recursive: true });
    appendFileSync(
      join(home, "hook-debug.log"),
      `${JSON.stringify({ ts: new Date().toISOString(), ...payload })}\n`,
    );
  } catch {
    // ignore
  }
}

/** Inline policy loader (Pi extension cannot import src/). Mirrors src/policy/task-policy.ts. */
function loadTaskPolicy() {
  const fromEnv = (process.env.MUTON_TASK_POLICY || "").trim();
  const path =
    fromEnv && existsSync(fromEnv)
      ? fromEnv
      : existsSync(DEFAULT_POLICY_PATH)
        ? DEFAULT_POLICY_PATH
        : null;
  if (!path) {
    return { path: null, agentTips: "", guidelines: [] };
  }
  try {
    const md = readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
    const lines = md.split(/\r?\n/);
    const agentTipsHeading = /^##\s+agent\s+tips\s*$/i;
    const reflectionHeading = /^##\s+reflection\s*$/i;
    const anyH2 = /^##\s+/;

    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (agentTipsHeading.test(lines[i].trim())) {
        start = i + 1;
        break;
      }
    }
    let tipsBody = "";
    if (start >= 0) {
      let end = lines.length;
      for (let i = start; i < lines.length; i++) {
        const t = lines[i].trim();
        if (anyH2.test(t) && !agentTipsHeading.test(t)) {
          end = i;
          break;
        }
      }
      tipsBody = lines.slice(start, end).join("\n").trim();
    } else {
      const bodyLines = [...lines];
      if (bodyLines[0]?.match(/^#\s+/)) bodyLines.shift();
      while (bodyLines[0]?.trim() === "") bodyLines.shift();
      const refIdx = bodyLines.findIndex((l) => reflectionHeading.test(l.trim()));
      tipsBody = (refIdx >= 0 ? bodyLines.slice(0, refIdx) : bodyLines)
        .join("\n")
        .trim();
    }

    const guidelines = [];
    for (const line of tipsBody.split(/\r?\n/)) {
      const m = line.match(/^\s*-\s+(.+)$/);
      if (m) guidelines.push(m[1].trim());
    }
    return { path, agentTips: tipsBody, guidelines };
  } catch {
    return { path, agentTips: "", guidelines: [] };
  }
}

function buildSystemTip(policy) {
  if (policy.agentTips) {
    return `\n${policy.agentTips}`;
  }
  return `\n${CORE_TIP_HEADER}\n${CORE_GUIDELINES.map((g) => `- ${g}`).join("\n")}`;
}

export default function (pi) {
  const policy = loadTaskPolicy();
  const guidelines =
    policy.guidelines.length > 0 ? policy.guidelines : CORE_GUIDELINES;

  // Reset per-step search budget; inject tips only (no auto-retrieved cards).
  pi.on("before_agent_start", async (event) => {
    writeSearchCount(0);
    logHook({
      event: "before_agent_start",
      prompt_chars: (event.prompt ?? "").length,
      vector: process.env.MUTON_VECTOR || null,
      auto_inject: "0",
      task_policy: policy.path,
      tip_chars: policy.agentTips.length || CORE_TIP_HEADER.length,
    });
    return {
      systemPrompt: `${event.systemPrompt || ""}${buildSystemTip(policy)}`,
    };
  });

  const Type = loadType();

  const searchParams = Type
    ? Type.Object({
        query: Type.String({
          description:
            "Natural-language search over durable Muton cards in the shared hive",
        }),
        k: Type.Optional(
          Type.Number({
            description: "Max cards to return (default 5)",
          }),
        ),
      })
    : {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Natural-language search over durable Muton cards in the shared hive",
          },
          k: {
            type: "number",
            description: "Max cards to return (default 5)",
          },
        },
        required: ["query"],
      };

  const treeParams = Type
    ? Type.Object({
        path: Type.Optional(
          Type.String({
            description: "Optional path prefix (e.g. schema). Omit for full tree.",
          }),
        ),
        depth: Type.Optional(
          Type.Number({ description: "Tree depth (default 2)" }),
        ),
      })
    : {
        type: "object",
        properties: {
          path: { type: "string", description: "Optional path prefix" },
          depth: { type: "number", description: "Tree depth (default 2)" },
        },
      };

  const lsParams = Type
    ? Type.Object({
        path: Type.String({
          description: "Taxonomy path to list, e.g. schema or schema/joins",
        }),
      })
    : {
        type: "object",
        properties: {
          path: { type: "string", description: "Taxonomy path to list" },
        },
        required: ["path"],
      };

  const getParams = Type
    ? Type.Object({
        slug: Type.String({ description: "Card slug to fetch" }),
      })
    : {
        type: "object",
        properties: {
          slug: { type: "string", description: "Card slug to fetch" },
        },
        required: ["slug"],
      };

  pi.registerTool({
    name: "muton_tree",
    label: "Muton Tree",
    description:
      "Show the Muton hive taxonomy directory (folder counts, no card bodies). Use first to see whether the hive is empty and what categories exist.",
    promptSnippet: "Browse Muton hive directory map (counts only)",
    promptGuidelines: guidelines,
    parameters: treeParams,
    async execute(_toolCallId, params) {
      const path = String(params?.path ?? "").trim();
      const depth =
        typeof params?.depth === "number" && params.depth > 0
          ? Math.min(params.depth, 4)
          : 2;
      try {
        const args = ["tree", "--json", "--depth", String(depth)];
        if (path) args.push("--path", path);
        const out = await runMuton(args);
        let data;
        try {
          data = JSON.parse(out);
        } catch {
          data = null;
        }
        logHook({
          event: "muton_tree",
          path: path || "/",
          depth,
          total_cards: data?.total_cards ?? null,
          path_assignments: data?.path_assignments ?? null,
        });
        const text = data
          ? `Muton hive map (root=${data.root}): ${data.total_cards} cards, ${data.path_assignments} path assignments\n${data.text}`
          : out || "(empty)";
        return {
          content: [{ type: "text", text }],
          details: {
            total_cards: data?.total_cards,
            path_assignments: data?.path_assignments,
            root: data?.root,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logHook({ event: "muton_tree_error", error: msg.slice(0, 200) });
        return {
          content: [{ type: "text", text: `muton_tree failed: ${msg}` }],
          details: { error: msg },
        };
      }
    },
  });

  pi.registerTool({
    name: "muton_ls",
    label: "Muton Ls",
    description:
      "List Muton card slugs and titles under a taxonomy path (no bodies). Use after muton_tree to drill into a folder.",
    promptSnippet: "List Muton cards under a taxonomy path",
    promptGuidelines: guidelines,
    parameters: lsParams,
    async execute(_toolCallId, params) {
      const path = String(params?.path ?? "").trim();
      if (!path) {
        return {
          content: [{ type: "text", text: "path is required" }],
          details: { error: "missing-path" },
        };
      }
      try {
        const out = await runMuton(["ls", "--json", path]);
        let data;
        try {
          data = JSON.parse(out);
        } catch {
          data = null;
        }
        const cards = data?.cards || [];
        logHook({
          event: "muton_ls",
          path,
          n: cards.length,
          slugs: cards.map((c) => c.slug),
        });
        if (!cards.length) {
          return {
            content: [
              {
                type: "text",
                text: `No cards under ${data?.path || path}/`,
              },
            ],
            details: { path: data?.path || path, n: 0 },
          };
        }
        const lines = cards.map(
          (c) => `- ${c.slug}\n  ${c.title}\n  use_when: ${c.use_when}`,
        );
        return {
          content: [
            {
              type: "text",
              text: `${data.path}/ (${cards.length})\n${lines.join("\n")}`,
            },
          ],
          details: { path: data.path, n: cards.length, slugs: cards.map((c) => c.slug) },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logHook({ event: "muton_ls_error", error: msg.slice(0, 200) });
        return {
          content: [{ type: "text", text: `muton_ls failed: ${msg}` }],
          details: { error: msg },
        };
      }
    },
  });

  pi.registerTool({
    name: "muton_get",
    label: "Muton Get",
    description:
      "Fetch one Muton card by slug (full body + taxonomy paths). Use after muton_ls or when you know the slug.",
    promptSnippet: "Fetch one Muton card by slug",
    promptGuidelines: guidelines,
    parameters: getParams,
    async execute(_toolCallId, params) {
      const slug = String(params?.slug ?? "").trim();
      if (!slug) {
        return {
          content: [{ type: "text", text: "slug is required" }],
          details: { error: "missing-slug" },
        };
      }
      try {
        const out = await runMuton(["get", "--json", slug]);
        let data;
        try {
          data = JSON.parse(out);
        } catch {
          data = null;
        }
        if (!data || data.error) {
          logHook({ event: "muton_get", slug, found: false });
          return {
            content: [{ type: "text", text: `Card not found: ${slug}` }],
            details: { found: false, slug },
          };
        }
        logHook({
          event: "muton_get",
          slug,
          found: true,
          paths: data.paths || [],
        });
        const paths = (data.paths || []).join(", ") || "(none)";
        const text = [
          `### ${data.title}`,
          `slug: ${data.slug}`,
          `paths: ${paths}`,
          `Use when: ${data.use_when}`,
          data.body || "",
        ].join("\n");
        return {
          content: [{ type: "text", text }],
          details: { found: true, slug, paths: data.paths || [] },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logHook({ event: "muton_get_error", error: msg.slice(0, 200) });
        return {
          content: [{ type: "text", text: `muton_get failed: ${msg}` }],
          details: { error: msg },
        };
      }
    },
  });

  pi.registerTool({
    name: "muton_search",
    label: "Muton Search",
    description:
      "Semantic search over the shared Muton card hive (vector embeddings). Limit: 10 calls per step.",
    promptSnippet: "Search Muton hive cards by meaning",
    promptGuidelines: guidelines,
    parameters: searchParams,
    async execute(_toolCallId, params) {
      const used = readSearchCount();
      if (used >= MAX_SEARCHES) {
        return {
          content: [
            {
              type: "text",
              text: `muton_search budget exhausted (${MAX_SEARCHES} searches this step). Continue with other tools or local reasoning.`,
            },
          ],
          details: { blocked: true, used, max: MAX_SEARCHES },
        };
      }
      const query = String(params?.query ?? "").trim();
      if (!query) {
        return {
          content: [{ type: "text", text: "query is required" }],
          details: { error: "missing-query" },
        };
      }
      const k =
        typeof params?.k === "number" && params.k > 0 ? Math.min(params.k, 10) : 5;
      try {
        const out = await runMuton([
          "search",
          "--json",
          "--k",
          String(k),
          query,
        ]);
        writeSearchCount(used + 1);
        let data;
        try {
          data = JSON.parse(out);
        } catch {
          data = null;
        }
        logHook({
          event: "muton_search",
          query_chars: query.length,
          query_head: query.slice(0, 120),
          used: used + 1,
          n_hits: data?.hits?.length ?? 0,
          hit_slugs: (data?.hits || []).map((h) => h.slug),
        });
        if (!data) {
          return {
            content: [{ type: "text", text: out || "No cards found." }],
            details: { used: used + 1 },
          };
        }
        const text =
          data.context?.trim() ||
          (data.hits?.length
            ? data.hits
                .map(
                  (h) =>
                    `### ${h.title}\nUse when: ${h.use_when}\nscore=${h.score}\n${h.body || ""}`,
                )
                .join("\n\n")
            : "No cards found.");
        return {
          content: [
            {
              type: "text",
              text: `${text}\n\n(muton_search ${used + 1}/${MAX_SEARCHES})`,
            },
          ],
          details: {
            used: used + 1,
            max: MAX_SEARCHES,
            n_hits: data.hits?.length ?? 0,
            slugs: (data.hits || []).map((h) => h.slug),
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logHook({ event: "muton_search_error", error: msg.slice(0, 200) });
        return {
          content: [{ type: "text", text: `muton_search failed: ${msg}` }],
          details: { error: msg },
        };
      }
    },
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      const file = ctx.sessionManager?.getSessionFile?.();
      if (!file || !existsSync(file)) return;
      await runMuton(["reflect", "--transcript", file, "--host", "pi"]);
    } catch {
      // silent
    }
  });
}

function runMuton(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("muton", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        MUTON_VECTOR: process.env.MUTON_VECTOR || "1",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(stderr || stdout || `exit ${code}`)),
    );
  });
}
