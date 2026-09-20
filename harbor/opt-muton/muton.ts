// Muton Pi extension — agentic vector search tool + silent reflect
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
  "Minimize db query calls. Aim for the fewest read-only SQL statements that still answer correctly — prefer 1–2 targeted queries when possible.",
  "Use muton_search before any db query (at most 10 searches this step). First search for schema/joins/encodings/db-query constraints; then search for question-specific entities or lookup patterns.",
  "If muton_search returns usable schema or join facts, TRUST them and write the answer query directly. Do NOT re-discover the schema with sqlite_master or PRAGMA table_info when the hive already covered those tables/joins.",
  "Only fall back to sqlite_master / PRAGMA when muton_search returns nothing useful for the needed tables. Treat empty/irrelevant hive hits as missing memory, then inspect the DB.",
  "Avoid exploratory fishing: no broad SELECT * dumps, no repeated near-duplicate queries, and no schema probes after a successful muton_search for the same topic.",
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
      "MUTON HIVE (vector search — call muton_search; nothing is auto-injected)",
      "Override: the task text mentions sqlite_master/PRAGMA for inspection, but with Muton you should prefer hive schema from muton_search and minimize db query count.",
      ...SEARCH_GUIDELINES.map((g) => `- ${g}`),
    ].join("\n");
    return {
      systemPrompt: `${event.systemPrompt || ""}\n${tip}`,
    };
  });

  const Type = loadType();
  const parameters = Type
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

  pi.registerTool({
    name: "muton_search",
    label: "Muton Search",
    description:
      "Semantic search over the shared Muton card hive (vector embeddings). Use for schema/join facts and question-specific prior knowledge. Limit: 10 calls per step.",
    promptSnippet: "Search Muton hive cards by meaning (schema + question-specific)",
    promptGuidelines: SEARCH_GUIDELINES,
    parameters,
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
