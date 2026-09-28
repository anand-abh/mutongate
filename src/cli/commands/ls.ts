import { CardStore } from "../../store/index.ts";

export async function cmdLs(args: string[]): Promise<void> {
  let json = false;
  const pathParts: string[] = [];
  for (const a of args) {
    if (a === "--json") {
      json = true;
      continue;
    }
    pathParts.push(a);
  }
  const path = pathParts.join(" ").trim();
  if (!path) {
    console.error("Usage: muton ls [--json] <path>");
    process.exit(1);
  }
  const store = new CardStore();
  try {
    const listing = store.ls(path);
    if (json) {
      console.log(JSON.stringify(listing));
      return;
    }
    if (listing.cards.length === 0) {
      console.log(`No cards under ${listing.path}/`);
      return;
    }
    console.log(`${listing.path}/ (${listing.cards.length})`);
    for (const c of listing.cards) {
      console.log(`- ${c.slug}`);
      console.log(`  ${c.title}`);
      console.log(`  use_when: ${c.use_when}`);
    }
  } finally {
    store.close();
  }
}
