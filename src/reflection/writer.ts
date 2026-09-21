import type { Card } from "../cards/index.ts";
import type { CardStore, ProposeInput } from "../store/index.ts";
import type { Completer } from "./complete/types.ts";
import { proposeCard } from "./merge-propose.ts";

export type WriteResult = {
  written: Card[];
  merged: Card[];
  skipped: string[];
};

export type WriteProposedOptions = {
  completer?: Completer;
  lexicalOnly?: boolean;
};

/**
 * Propose each card via vector k-NN + agent merge (default), or lexical upsert.
 */
export async function writeProposedCards(
  store: CardStore,
  proposals: ProposeInput[],
  opts: WriteProposedOptions = {},
): Promise<WriteResult> {
  const written: Card[] = [];
  const merged: Card[] = [];
  const skipped: string[] = [];

  for (const proposal of proposals) {
    const title = proposal.title?.trim();
    const useWhen = proposal.use_when?.trim();
    const body = proposal.body?.trim();
    if (!title || !useWhen || !body) {
      skipped.push(title || "(invalid)");
      continue;
    }
    const outcome = await proposeCard(
      store,
      { title, use_when: useWhen, body },
      { completer: opts.completer, lexicalOnly: opts.lexicalOnly },
    );
    written.push(outcome.card);
    if (outcome.merged) merged.push(outcome.card);
  }
  return { written, merged, skipped };
}
