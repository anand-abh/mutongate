#!/usr/bin/env bun
import { cmdGet } from "./commands/get.ts";
import { cmdHook } from "./commands/hook.ts";
import { cmdInstall } from "./commands/install.ts";
import { cmdLs } from "./commands/ls.ts";
import { cmdMcp } from "./commands/mcp.ts";
import { cmdPropose } from "./commands/propose.ts";
import { cmdReflect } from "./commands/reflect.ts";
import { cmdSearch } from "./commands/search.ts";
import { cmdTree } from "./commands/tree.ts";

const HELP = `muton — shared hive memory for coding agents

Usage:
  muton install --target cursor,claude,codex,pi
  muton search [--json] <query>
  muton tree [--json] [--depth N] [--path <path>]
  muton ls [--json] <path>
  muton get [--json] <slug>
  muton propose --title <t> --use-when <u> --body <b> [--paths p1,p2]
  muton reflect --transcript <path> [--cwd <dir>] [--host <name>] [--session-id <id>]
  muton hook <session-start|prompt-submit|session-end> [--host <name>]
  muton mcp
`;

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "install":
      cmdInstall(rest);
      break;
    case "search":
      await cmdSearch(rest);
      break;
    case "tree":
      await cmdTree(rest);
      break;
    case "ls":
      await cmdLs(rest);
      break;
    case "get":
      await cmdGet(rest);
      break;
    case "propose":
      await cmdPropose(rest);
      break;
    case "reflect":
      await cmdReflect(rest);
      break;
    case "hook":
      await cmdHook(rest);
      break;
    case "mcp":
      await cmdMcp();
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
