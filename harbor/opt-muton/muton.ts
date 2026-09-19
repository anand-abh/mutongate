// Muton Pi extension — hybrid 3+3 search (instruction + question), await reflect
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";

export default function (pi) {
  pi.on("before_agent_start", async (event) => {
    try {
      const prompt = event.prompt ?? "";
      const home = process.env.MUTON_HOME || "/tmp/muton-agent-store";
      try {
        mkdirSync(home, { recursive: true });
        appendFileSync(
          `${home}/hook-debug.log`,
          `${JSON.stringify({
            ts: new Date().toISOString(),
            event: "before_agent_start",
            prompt_chars: prompt.length,
            hybrid: process.env.MUTON_HYBRID || null,
          })}\n`,
        );
      } catch {
        // ignore
      }

      const out = await runMuton(["search", "--json", prompt || "project"]);
      const data = JSON.parse(out);
      const context = data.context;
      try {
        appendFileSync(
          `${home}/hook-debug.log`,
          `${JSON.stringify({
            ts: new Date().toISOString(),
            event: "search_result",
            n_hits: (data.hits || []).length,
            hit_slugs: (data.hits || []).map((h) => h.slug),
            channels: data.channels || null,
            context_chars: (context || "").length,
          })}\n`,
        );
      } catch {
        // ignore
      }
      if (!context) return;
      return {
        systemPrompt: event.systemPrompt + "\n\n" + context,
      };
    } catch {
      return;
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      const file = ctx.sessionManager?.getSessionFile?.();
      if (!file || !existsSync(file)) return;
      await runMuton(["reflect", "--transcript", file, "--host", "pi"]);
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
