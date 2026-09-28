import { CardStore } from "../../store/index.ts";

export async function cmdGet(args: string[]): Promise<void> {
  let json = false;
  const slugParts: string[] = [];
  for (const a of args) {
    if (a === "--json") {
      json = true;
      continue;
    }
    slugParts.push(a);
  }
  const slug = slugParts.join(" ").trim();
  if (!slug) {
    console.error("Usage: muton get [--json] <slug>");
    process.exit(1);
  }
  const store = new CardStore();
  try {
    const card = store.read(slug);
    if (!card) {
      if (json) {
        console.log(JSON.stringify({ error: "not_found", slug }));
      } else {
        console.error(`Card not found: ${slug}`);
      }
      process.exit(1);
    }
    const paths = store.getPaths(slug);
    if (json) {
      console.log(JSON.stringify({ ...card, paths }));
      return;
    }
    console.log(`# ${card.title}`);
    console.log(`slug: ${card.slug}`);
    console.log(`paths: ${paths.join(", ") || "(none)"}`);
    console.log(`use_when: ${card.use_when}`);
    console.log(`created_at: ${card.created_at}`);
    console.log(`updated_at: ${card.updated_at}`);
    console.log("");
    console.log(card.body);
  } finally {
    store.close();
  }
}
