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
  if (!title || !useWhen || !body) {
    console.error("Usage: muton propose --title <t> --use-when <u> --body <b>");
    process.exit(1);
  }
  const store = new CardStore();
  try {
    const { card, merged } = await proposeCard(store, {
      title,
      use_when: useWhen,
      body,
    });
    try {
      await store.embedCard(card);
    } catch (err) {
      console.error(
        `${merged ? "Merged" : "Wrote"} ${card.slug} (embed failed: ${err instanceof Error ? err.message : err})`,
      );
      return;
    }
    console.log(`${merged ? "Merged" : "Wrote"} ${card.slug}`);
  } finally {
    store.close();
  }
}
