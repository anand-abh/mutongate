export type { Card, CardFrontmatter } from "./frontmatter.ts";
export { parseCard, serializeCard, splitFrontmatter } from "./frontmatter.ts";
export { slugify } from "./slug.ts";
export {
  TRIVIA_SLUG,
  TRIVIA_TITLE,
  TRIVIA_USE_WHEN,
  isTriviaProposal,
  mergeTriviaBodies,
  normalizeTriviaFields,
  type ProposalInput,
  type ProposalKind,
} from "./trivia.ts";