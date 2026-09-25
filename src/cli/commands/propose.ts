import { proposeCard } from "../../reflection/merge-propose.ts";
import { CardStore } from "../../store/index.ts";

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  return args[idx + 1];
}

export async function cmdPropose(args: string[]): Promise<void> {
  const title = flag(args, "--title");
  const useWhen = flag(args, "--use-when");
  const body = flag(args, "--body");
  const pathsRaw = flag(args, "--paths");
  if (!title || !useWhen || !body) {
    console.error("Usage: muton propose --title <t> --use-when <u> --body <b> [--paths p1,p2]");
    process.exit(1);
  }
  const paths = pathsRaw
    ? pathsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const store = new CardStore();
  try {
    const { card, merged } = await proposeCard(store, {
      title,
      use_when: useWhen,
      body,
      paths,
    });
    try {
      await store.embedCard(card);
    } catch (err) {
      console.error(
        `${merged ? "Merged" : "Wrote"} ${card.slug} paths=[${store.getPaths(card.slug).join(",")}] (embed failed: ${err instanceof Error ? err.message : err})`,
      );
      return;
    }
    console.log(
      `${merged ? "Merged" : "Wrote"} ${card.slug} paths=[${store.getPaths(card.slug).join(",")}]`,
    );
  } finally {
    store.close();
  }
}
