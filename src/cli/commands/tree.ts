import { CardStore } from "../../store/index.ts";

export async function cmdTree(args: string[]): Promise<void> {
  let json = false;
  let path: string | undefined;
  let depth = 2;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--depth" && args[i + 1]) {
      depth = Number.parseInt(args[++i]!, 10) || 2;
      continue;
    }
    if (a === "--path" && args[i + 1]) {
      path = args[++i];
      continue;
    }
    if (!a.startsWith("-") && !path) {
      path = a;
    }
  }
  const store = new CardStore();
  try {
    const tree = store.tree({ path, depth });
    if (json) {
      console.log(JSON.stringify(tree));
      return;
    }
    console.log(
      `hive: ${tree.total_cards} cards, ${tree.path_assignments} path assignments, root=${tree.root}`,
    );
    console.log(tree.text);
  } finally {
    store.close();
  }
}
