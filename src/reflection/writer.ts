import type { Card } from "../cards/index.ts";
import { INITIAL_SLUG } from "../cards/initial.ts";
import { isPrimerProposal, type ProposalInput } from "../cards/primer.ts";
import type { CardStore, ProposeInput } from "../store/index.ts";
import { slugify } from "../cards/slug.ts";

export type WriteResult = {
  written: Card[];
  skipped: string[];
};

/**
 * Upsert general proposals. Skips reserved slugs (initial / primer proposals).
 */
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
    const row: ProposalInput = {
      title,
      use_when: useWhen,
      body,
      kind: (proposal as ProposalInput).kind,
    };
    if (isPrimerProposal(row) || slugify(title) === INITIAL_SLUG || title.toLowerCase() === "initial") {
      skipped.push(title);
      continue;
    }
    written.push(store.upsert({ title, use_when: useWhen, body }));
  }
  return { written, skipped };
}
