import { existsSync, readFileSync } from "node:fs";
import { tokenize } from "./bm25.ts";

/**
 * Instruction / Harbor chrome only. Keep question words like list, year,
 * number, names, give, during — those help FTS match task Cards.
 */
const BOILERPLATE = new Set([
  "formula",
  "database",
  "environment",
  "sqlite",
  "sqlite3",
  "python",
  "program",
  "programs",
  "blocked",
  "paths",
  "query",
  "statement",
  "prints",
  "json",
  "rows",
  "ordinary",
  "sql",
  "inspect",
  "tables",
  "example",
  "sqlite_master",
  "pragma",
  "table_info",
  "app",
  "question",
  "required",
  "output",
  "block",
  "scored",
  "file",
  "answer",
  "write",
  "exactly",
  "object",
  "verifier",
  "strips",
  "whitespace",
  "compares",
  "notes",
  "sessions",
  "cannot",
  "exclusively",
  "pragma",
]);

/** Softer cap than qr1 (was 10). */
const MAX_CONTENT_TERMS = 16;

/** Prefer keeping a short natural question phrase when it fits. */
const MAX_PHRASE_CHARS = 180;

export type RewriteResult = {
  original: string;
  rewritten: string;
  source: "question_file" | "prompt_question" | "prompt";
};

/** Prefer Harbor question file when present (env override for tests). */
export function resolveQuestionText(prompt: string): {
  text: string;
  source: RewriteResult["source"];
} {
  const candidates = [
    process.env.MUTON_QUESTION_PATH,
    "/app/question.md",
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    try {
      if (existsSync(path)) {
        const text = readFileSync(path, "utf8");
        if (text.trim()) return { text, source: "question_file" };
      }
    } catch {
      // ignore unreadable paths
    }
  }

  const extracted = extractQuestionFromPrompt(prompt);
  if (extracted) return { text: extracted, source: "prompt_question" };
  return { text: prompt, source: "prompt" };
}

/** Pull the free-text question body out of common Harbor / eval wrappers. */
export function extractQuestionFromPrompt(prompt: string): string | null {
  const stripped = stripBoilerplateSections(prompt);
  const qBlock = stripped.match(
    /(?:^|\n)\s*Question\s+\d+\s+of\s+\d+\s*\n+([\s\S]*?)(?=\n\s*Required output|\n\s*\{|$)/i,
  );
  if (qBlock?.[1]?.trim()) return qBlock[1].trim();

  const lines = stripped
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith("#") && !l.startsWith("```") && !l.startsWith("-"));
  const interesting = lines.filter(
    (l) =>
      (l.length > 20 && /[?]/.test(l)) ||
      /^(please|what|where|when|which|who|how|calculate|give|list|find)\b/i.test(l),
  );
  if (interesting.length === 1) return interesting[0]!;
  if (interesting.length > 1) return interesting.join(" ");
  return null;
}

function stripBoilerplateSections(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/Required output[\s\S]*$/i, " ")
    .replace(/The only scored file[\s\S]*$/i, " ")
    .replace(/You cannot open the database[\s\S]*?PRAGMA[^\n]*/gi, " ")
    .replace(/`db query[^`]*`/gi, " ")
    .replace(/db query\s+"[^"]*"/gi, " ");
}

function cleanQuestionBody(text: string): string {
  return stripBoilerplateSections(text)
    .replace(/Question\s+\d+\s+of\s+\d+/gi, " ")
    .replace(/\{\s*"answer"[\s\S]*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Soft rewrite: prefer the natural question phrase when short; otherwise a
 * longer content-token skim. Still drops Harbor instruction chrome.
 */
export function rewriteSearchQuery(prompt: string): RewriteResult {
  const original = prompt ?? "";
  const { text, source } = resolveQuestionText(original);
  const cleaned = cleanQuestionBody(text);

  // Prefer nearly-intact question phrasing when concise enough.
  if (
    cleaned &&
    cleaned.length <= MAX_PHRASE_CHARS &&
    (source === "question_file" || source === "prompt_question")
  ) {
    // Light stopword pass only on ultra-common function words via tokenize
    // fallback path is unused here — keep phrase, drop leading "Please".
    const phrase = cleaned.replace(/^(please|pls)\s+/i, "").trim();
    if (phrase.split(/\s+/).length >= 3) {
      return { original, rewritten: phrase, source };
    }
  }

  const terms = tokenize(cleaned || original).filter((t) => !BOILERPLATE.has(t));
  let rewritten = terms.slice(0, MAX_CONTENT_TERMS).join(" ").trim();

  if (!rewritten) {
    rewritten = tokenize(stripBoilerplateSections(original))
      .filter((t) => !BOILERPLATE.has(t))
      .slice(0, MAX_CONTENT_TERMS)
      .join(" ")
      .trim();
  }
  if (!rewritten) {
    rewritten = tokenize(original).slice(0, MAX_CONTENT_TERMS).join(" ");
  }

  return { original, rewritten, source };
}
