import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { proposeCard } from "../reflection/merge-propose.ts";
import { searchCards } from "../search/index.ts";
import { searchCardsVector } from "../search/vector.ts";
import { CardStore } from "../store/index.ts";

export async function startMcpServer(home?: string): Promise<void> {
  const store = new CardStore(home);
  const server = new McpServer({ name: "muton", version: "0.1.0" });
  const useVector = process.env.MUTON_VECTOR === "1" || process.env.MUTON_VECTOR === "true";

  server.tool(
    "search",
    "Search durable Muton Cards in the shared hive before acting",
    { query: z.string().describe("Search query") },
    async ({ query }) => {
      const { context, hits } = useVector
        ? await searchCardsVector(store, query, { k: 5 })
        : searchCards(store, query, { k: 5 });
      return {
        content: [
          {
            type: "text" as const,
            text: context || JSON.stringify({ hits: hits.map((h) => h.title) }),
          },
        ],
      };
    },
  );

  server.tool(
    "tree",
    "High-level taxonomy directory of the Muton hive (counts, no card bodies)",
    {
      path: z.string().optional().describe("Optional path prefix to list under"),
      depth: z.number().optional().describe("Tree depth (default 2)"),
    },
    async ({ path, depth }) => {
      const tree = store.tree({ path, depth });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(tree),
          },
        ],
      };
    },
  );

  server.tool(
    "ls",
    "List card slugs/titles under a taxonomy path (no bodies)",
    { path: z.string().describe("Taxonomy path, e.g. schema or schema/joins") },
    async ({ path }) => {
      const listing = store.ls(path);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(listing) }],
      };
    },
  );

  server.tool(
    "get",
    "Fetch one Muton card by slug (full body + paths)",
    { slug: z.string().describe("Card slug") },
    async ({ slug }) => {
      const card = store.read(slug);
      if (!card) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "not_found", slug }),
            },
          ],
        };
      }
      const paths = store.getPaths(slug);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ...card, paths }) }],
      };
    },
  );

  server.tool(
    "propose",
    "Create or merge a durable Card in the shared hive (vector neighbors + agent expand)",
    {
      title: z.string(),
      use_when: z.string(),
      body: z.string(),
      paths: z.array(z.string()).optional().describe("Optional taxonomy paths (multi-parent)"),
    },
    async ({ title, use_when, body, paths }) => {
      const { card, merged } = await proposeCard(store, {
        title,
        use_when,
        body,
        paths,
      });
      try {
        await store.embedCard(card);
      } catch {
        // card still stored
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `${merged ? "Merged" : "Stored"} card ${card.slug} paths=[${store.getPaths(card.slug).join(",")}]`,
          },
        ],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
