import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const EXTENSION = `// Muton Pi extension — inject Cards; defer reflect until post-verify
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

export default function (pi) {
  pi.on("before_agent_start", async (event) => {
    try {
      const prompt = event.prompt ?? "";
      const out = await runMuton(["search", "--json", prompt || "project"]);
      const data = JSON.parse(out);
      const context = data.context;
      if (!context) return;
      return {
        systemPrompt: event.systemPrompt + "\\n\\n" + context,
      };
    } catch {
      return;
    }
  });

  // Queue transcript for post-verify reflect (needs reward.json / step correctness).
  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      const file = ctx.sessionManager?.getSessionFile?.();
      if (!file || !existsSync(file)) return;
      const home = process.env.MUTON_HOME || "/tmp/muton-agent-store";
      mkdirSync(\`\${home}/tmp\`, { recursive: true });
      const dest = \`\${home}/tmp/pending-transcript.jsonl\`;
      copyFileSync(file, dest);
      writeFileSync(
        \`\${home}/pending-reflect.json\`,
        JSON.stringify({
          transcript: dest,
          original: file,
          host: "pi",
          ts: new Date().toISOString(),
        }),
      );
    } catch {
      // silent
    }
  });
}

function runMuton(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("muton", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(stderr || stdout))));
  });
}
`;

/** Install Pi extension to ~/.pi/agent/extensions/muton.ts */
export function installPi(): string {
  const path = join(homedir(), ".pi", "agent", "extensions", "muton.ts");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, EXTENSION);
  return path;
}
