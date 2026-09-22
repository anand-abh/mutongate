// Muton Pi extension — vector search + taxonomy browse + silent reflect
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

const SEARCH_GUIDELINES = [
  "Minimize db query calls. Aim for the fewest read-only SQL statements that still answer correctly — prefer 1–2 targeted queries when possible. The db can be queried at most 4 times per question.",
  "Start with muton_tree once per step. If the hive is empty or tiny (about ≤3 cards), skip browse/search and inspect the DB.",
  "If tree shows useful folders: before any muton_search, muton_ls 1–2 relevant paths (prefer schema/* and small lookup/*; avoid giant episode/* dumps unless the question is clearly that episode). Then muton_get 1–2 promising slugs from that ls (read full bodies).",
  "Prefer facts from muton_get when they answer the need (exact card). Use muton_search only after that browse, or when no folder/slug fits (at most 10 searches this step). First search schema/joins/encodings; then question-specific entities.",
  "If muton_get or muton_search returns usable schema or join facts, TRUST them and write the answer query directly. Do NOT re-discover the schema with sqlite_master or PRAGMA table_info when the hive already covered those tables/joins.",
  "Only fall back to sqlite_master / PRAGMA when Muton returns nothing useful for the needed tables. Treat empty/irrelevant hive hits as missing memory, then inspect the DB.",
  "Avoid exploratory fishing: no broad SELECT * dumps, no repeated near-duplicate queries, and no schema probes after a successful muton_get or muton_search for the same topic.",
];

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

export default function (pi) {
  // Reset per-step search budget; inject guidelines only (no auto-retrieved cards).
  pi.on("before_agent_start", async (event) => {
    writeSearchCount(0);
    logHook({
      event: "before_agent_start",
      prompt_chars: (event.prompt ?? "").length,
      vector: process.env.MUTON_VECTOR || null,
      auto_inject: "0",
    });
    const tip = [
      "",
      "MUTON HIVE (browse + vector search — nothing is auto-injected)",
      "Tools: muton_tree (map), muton_ls (list under a path), muton_get (one card), muton_search (semantic).",
      "Override: the task text mentions sqlite_master/PRAGMA for inspection, but with Muton you should prefer hive schema and minimize db query count.",
      ...SEARCH_GUIDELINES.map((g) => `- ${g}`),
    ].join("\n");
    return {
      systemPrompt: `${event.systemPrompt || ""}\n${tip}`,
    };
  });

  const Type = loadType();

  const searchParams = Type
    ? Type.Object({
        query: Type.String({
          description:
            "Natural-language search over durable Muton cards (schema, joins, encodings, or question-specific facts)",
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
              "Natural-language search over durable Muton cards (schema, joins, encodings, or question-specific facts)",
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
    promptGuidelines: SEARCH_GUIDELINES,
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
    promptGuidelines: SEARCH_GUIDELINES,
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
    promptGuidelines: SEARCH_GUIDELINES,
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
      "Semantic search over the shared Muton card hive (vector embeddings). Use for schema/join facts and question-specific prior knowledge. Limit: 10 calls per step.",
    promptSnippet: "Search Muton hive cards by meaning (schema + question-specific)",
    promptGuidelines: SEARCH_GUIDELINES,
    parameters: searchParams,
    async execute(_toolCallId, params) {
      const used = readSearchCount();
      if (used >= MAX_SEARCHES) {
        return {
          content: [
            {
              type: "text",
              text: `muton_search budget exhausted (${MAX_SEARCHES} searches this step). Continue with db query / local reasoning.`,
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
