import { spawn } from "node:child_process";

export interface ExecResult {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
  truncated: boolean;
}

const MAX_OUTPUT = 100_000;

/** Environment for child processes: never hand provider credentials to spawned commands. */
export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/(_API_KEY|_TOKEN|_SECRET|PASSWORD|ASTRA_HEADERS)$/i.test(k)) continue;
    env[k] = v;
  }
  return { ...env, ...extra } as NodeJS.ProcessEnv;
}

/**
 * Run a shell command in the workspace with a timeout and output cap.
 * `onData` receives output as it arrives (for the live terminal).
 */
export function runCommand(
  command: string,
  cwd: string,
  opts: { timeoutMs: number; signal?: AbortSignal; onData?: (chunk: string, stream: "stdout" | "stderr") => void },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], { cwd, env: childEnv(), detached: process.platform !== "win32" });
    let output = "";
    let truncated = false;
    let timedOut = false;
    const kill = () => {
      try {
        if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, opts.timeoutMs);
    const onAbort = () => kill();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const collect = (stream: "stdout" | "stderr") => (buf: Buffer) => {
      const s = buf.toString("utf8");
      opts.onData?.(s, stream);
      if (output.length < MAX_OUTPUT) {
        output += s;
        if (output.length > MAX_OUTPUT) {
          output = output.slice(0, MAX_OUTPUT);
          truncated = true;
        }
      } else truncated = true;
    };
    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));
    child.on("error", (e) => {
      output += `\n${e.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve({ exitCode: code, output, timedOut, truncated });
    });
  });
}
