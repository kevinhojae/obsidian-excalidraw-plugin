export type ClaudeResult =
  | { ok: true; stdout: string }
  | { ok: false; reason: "not-found" | "timeout" | "exit"; detail: string };

/** Desktop Obsidian exposes Node built-ins via window.require; a bare require would be bundled by rollup. */
const nodeRequire = (id: string): unknown => (window as unknown as { require: (id: string) => unknown }).require(id);

/** Obsidian is a GUI app without the shell PATH, so the binary path is explicit. */
export const resolveClaudePath = (configured: string): string => {
  if (configured.trim()) return configured.trim();
  const os = nodeRequire("os") as typeof import("os");
  return `${os.homedir()}/.local/bin/claude`;
};

/** Run `claude -p --output-format json` with the prompt on stdin. Never goes through the user's shell. */
export const runClaude = (binaryPath: string, prompt: string, timeoutMs = 60000): Promise<ClaudeResult> =>
  new Promise((resolve) => {
    const { spawn } = nodeRequire("child_process") as typeof import("child_process");
    let stdout = "";
    let stderr = "";
    let settled = false;
    const done = (r: ClaudeResult) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(r);
      }
    };

    // Pinned so the pairing model does not change with the user's Claude Code default.
    const child = spawn(binaryPath, ["-p", "--model", "opus", "--output-format", "json"], { shell: false });
    const timer = setTimeout(() => {
      child.kill();
      done({ ok: false, reason: "timeout", detail: `${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (e: NodeJS.ErrnoException) =>
      done({ ok: false, reason: e.code === "ENOENT" ? "not-found" : "exit", detail: e.message }),
    );
    child.on("close", (code) =>
      done(code === 0 ? { ok: true, stdout } : { ok: false, reason: "exit", detail: `code ${code}: ${stderr.slice(0, 300)}` }),
    );
    child.stdin.end(prompt);
  });
