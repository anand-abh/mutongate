import type { Card } from "../cards/index.ts";
import type { CardStore, ProposeInput } from "../store/index.ts";
import { isTriviaProposal, type ProposalInput } from "../cards/trivia.ts";

export type WriteResult = {
  written: Card[];
  skipped: string[];
};

/** Upsert proposals; trivia always goes to the single `trivia` slug. */
export function writeProposedCards(store: CardStore, proposals: ProposeInput[]): WriteResult {
  const written: Card[] = [];
  const skipped: string[] = [];

  for (const proposal of proposals) {
    const title = proposal.title?.trim();
    const useWhen = proposal.use_when?.trim();
    const body = proposal.body?.trim();
    if (!title || !useWhen || !body) {
      skipped.push(title || "(invalid)");
      continue;
    }
    const row: ProposalInput = { title, use_when: useWhen, body, kind: (proposal as ProposalInput).kind };
    if (isTriviaProposal(row)) {
      written.push(store.upsertTrivia(row));
    } else {
      written.push(store.upsert({ title, use_when: useWhen, body }));
    }
  }
  return { written, skipped };
}
