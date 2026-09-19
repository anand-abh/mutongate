import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isPrimerProposal, type ProposalInput } from "../cards/primer.ts";
import { CardStore, logsDir, type ProposeInput } from "../store/index.ts";
import { hostSupportsResume, usableSessionId } from "./complete/host-cli.ts";
import type { Completer } from "./complete/index.ts";
import { createCompleter } from "./complete/index.ts";
import { gatePrimerProposal } from "./gate.ts";
import { loadReflectionPrompt } from "./prompt.ts";
import { writeProposedCards } from "./writer.ts";

export type ReflectOptions = {
  transcriptPath: string;
  cwd?: string;
  home?: string;
  host?: "claude" | "cursor" | "codex" | "pi" | "auto";
  sessionId?: string;
  completer?: Completer;
};

export type ReflectResult = {
  written: number;
  skipped: number;
  merged?: number;
  discarded?: number;
};

/** Short user text for host session resume. Do not attach the transcript. */
export const RESUME_EXTRACT_PROMPT =
  "From this session, return ONLY the JSON card array. No transcript is attached; use the conversation already in context.";

function shouldTryResume(opts: ReflectOptions): boolean {
  if (!usableSessionId(opts.sessionId)) return false;
  if (opts.completer) return true;
  if (process.env.MUTON_MODEL && process.env.MUTON_API_KEY) return false;
  return hostSupportsResume(opts.host ?? "auto");
}

async function commitProposals(
  complete: Completer,
  store: CardStore,
  proposals: ProposeInput[],
  opts: ReflectOptions,
): Promise<ReflectResult> {
  const primers = proposals.filter(
    (p) => isPrimerProposal(p) || p.kind === "primer",
  );
  const general = proposals.filter(
    (p) => !(isPrimerProposal(p) || p.kind === "primer"),
  );

  let written = 0;
  let skipped = 0;
  let merged = 0;
  let discarded = 0;

  // Primer judge: merge vs discard into the single always-pinned primer card.
  for (const p of primers) {
    const r = await gatePrimerProposal(complete, store, p, {
      host: opts.host,
      cwd: opts.cwd ?? join(store.home, "scratch"),
    });
    written += r.written;
    merged += r.merged;
    discarded += r.discarded;
    skipped += r.skipped;
  }

  // General hive cards: always ungated lexical upsert (no LLM card gate).
  const result = writeProposedCards(store, general);
  written += result.written.length;
  skipped += result.skipped.length;
  log(
    store.home,
    `commit primer+ungated-hive wrote=${written} merged=${merged} discarded=${discarded} skipped=${skipped} general=${result.written.length}`,
  );
  return { written, skipped, merged, discarded };
}

/** Run silent reflection: transcript → model → Cards (optionally gated). */
export async function reflect(opts: ReflectOptions): Promise<ReflectResult> {
  const store = new CardStore(opts.home);
  try {
    const system = loadReflectionPrompt({ cwd: opts.cwd, home: store.home });
    let transcript = readFileSync(opts.transcriptPath, "utf8");
    if (transcript.length > 120_000) {
      transcript = transcript.slice(-120_000);
    }
    if (!transcript.trim()) {
      log(store.home, "path=skip wrote=0 skipped=0 empty-transcript");
      return { written: 0, skipped: 0 };
    }

    const complete = opts.completer ?? createCompleter();
    const scratch = join(store.home, "scratch");
    const resumeCwd = opts.cwd ?? scratch;

    if (shouldTryResume(opts)) {
      try {
        const raw = await complete({
          system,
          user: RESUME_EXTRACT_PROMPT,
          host: opts.host,
          cwd: resumeCwd,
          sessionId: opts.sessionId,
        });
        const parsed = extractProposalArray(raw);
        if (parsed) {
          const result = await commitProposals(
            complete,
            store,
            filterProposals(parsed),
            opts,
          );
          log(
            store.home,
            `path=resume wrote=${result.written} skipped=${result.skipped}` +
              (result.merged != null ? ` merged=${result.merged}` : "") +
              (result.discarded != null ? ` discarded=${result.discarded}` : ""),
          );
          return result;
        }
        log(store.home, "path=resume-fail reason=unparsable");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(store.home, `path=resume-fail reason=${msg.replace(/\s+/g, " ").slice(0, 200)}`);
      }
    } else if (!usableSessionId(opts.sessionId)) {
      log(store.home, "path=fallback reason=no-session-id");
    } else {
      log(store.home, "path=fallback reason=no-resume");
    }

    const raw = await complete({
      system,
      user: transcript,
      host: opts.host,
      cwd: scratch,
    });
    const result = await commitProposals(complete, store, parseProposals(raw), opts);
    log(
      store.home,
      `path=fallback wrote=${result.written} skipped=${result.skipped}` +
        (result.merged != null ? ` merged=${result.merged}` : "") +
        (result.discarded != null ? ` discarded=${result.discarded}` : ""),
    );
    return result;
  } catch (err) {
    log(opts.home ?? store.home, `error: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  } finally {
    store.close();
  }
}

export function extractProposalArray(raw: string): unknown[] | null {
  const text = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const jsonText = fence?.[1]?.trim() ?? text;
  const start = jsonText.indexOf("[");
  const end = jsonText.lastIndexOf("]");
  if (start < 0 || end < 0) return null;
  try {
    const parsed = JSON.parse(jsonText.slice(start, end + 1)) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseProposals(raw: string): ProposeInput[] {
  return filterProposals(extractProposalArray(raw) ?? []);
}

function filterProposals(parsed: unknown[]): ProposeInput[] {
  const out: ProposeInput[] = [];
  let sawPrimer = false;
  for (const p of parsed) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    if (
      typeof o.title !== "string" ||
      typeof o.use_when !== "string" ||
      typeof o.body !== "string"
    ) {
      continue;
    }
    const kindRaw =
      typeof o.kind === "string" ? o.kind.trim().toLowerCase() : undefined;
    const kind =
      kindRaw === "primer" || kindRaw === "general" ? kindRaw : undefined;
    const row: ProposalInput = {
      title: o.title,
      use_when: o.use_when,
      body: o.body,
      kind,
    };
    if (isPrimerProposal(row)) {
      if (sawPrimer) continue; // at most one primer proposal per reflect
      sawPrimer = true;
      out.push({
        title: "Schema Primer",
        use_when: o.use_when,
        body: o.body,
        kind: "primer",
      });
    } else {
      out.push({
        title: o.title,
        use_when: o.use_when,
        body: o.body,
        kind: kind === "general" ? "general" : undefined,
      });
    }
  }
  return out;
}

function log(home: string, line: string): void {
  try {
    appendFileSync(join(logsDir(home), "reflect.log"), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // ignore log failures
  }
}

export { hostSupportsResume, usableSessionId } from "./complete/host-cli.ts";
export { createCompleter } from "./complete/index.ts";
export { loadReflectionPrompt } from "./prompt.ts";
export { writeProposedCards } from "./writer.ts";
export {
  DEFAULT_GATE_PROMPT,
  DEFAULT_PRIMER_PROMPT,
  cardGateEnabled,
  gateAndWrite,
  gatePrimerProposal,
  parseGateDecision,
  formatGateUserMessage,
  formatPrimerUserMessage,
} from "./gate.ts";
