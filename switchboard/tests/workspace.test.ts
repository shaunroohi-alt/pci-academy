import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { childEnv } from "@/lib/server/workspace/exec";
import { resolveInWorkspace } from "@/lib/server/workspace/sandbox";
import { executeTool, toolSpecs } from "@/lib/server/workspace/tools";
import { parseClaudeCodeLine } from "@/lib/server/workspace/claude-code";

const root = mkdtempSync(path.join(tmpdir(), "sb-ws-"));
const outside = mkdtempSync(path.join(tmpdir(), "sb-out-"));
writeFileSync(path.join(outside, "secret.txt"), "top secret");
const ctx = { root, shellEnabled: false, shellTimeoutMs: 5000 };

describe("workspace sandbox", () => {
  it("rejects traversal and absolute escapes", async () => {
    await expect(resolveInWorkspace(root, "../x")).rejects.toThrow(/escapes/);
    await expect(resolveInWorkspace(root, "a/../../x")).rejects.toThrow(/escapes/);
    // Leading slashes are treated as workspace-relative, not filesystem-absolute.
    expect(await resolveInWorkspace(root, "/etc/passwd")).toBe(path.join(await import("node:fs/promises").then((f) => f.realpath(root)), "etc/passwd"));
  });

  it("rejects symlinks pointing outside", async () => {
    symlinkSync(outside, path.join(root, "link"));
    await expect(resolveInWorkspace(root, "link/secret.txt")).rejects.toThrow(/symlink/);
    const r = await executeTool("read_file", { path: "link/secret.txt" }, ctx);
    expect(r.isError).toBe(true);
    expect(r.output).not.toContain("top secret");
  });
});

describe("workspace tools", () => {
  it("writes, reads, edits, lists and searches", async () => {
    expect((await executeTool("write_file", { path: "src/app.ts", content: "const a = 1;\nconst b = 2;\n" }, ctx)).isError).toBe(false);
    const read = await executeTool("read_file", { path: "src/app.ts", start_line: 2, end_line: 2 }, ctx);
    expect(read.output).toContain("2  const b = 2;");
    expect((await executeTool("edit_file", { path: "src/app.ts", old_string: "const b = 2;", new_string: "const b = 3;" }, ctx)).isError).toBe(false);
    expect((await executeTool("edit_file", { path: "src/app.ts", old_string: "const", new_string: "let" }, ctx)).output).toMatch(/occurs 2 times/);
    expect((await executeTool("edit_file", { path: "src/app.ts", old_string: "nope", new_string: "x" }, ctx)).isError).toBe(true);
    const list = await executeTool("list_files", {}, ctx);
    expect(list.output).toContain("src/app.ts");
    const search = await executeTool("search", { pattern: "b = 3" }, ctx);
    expect(search.output).toBe("src/app.ts:2: const b = 3;");
  });

  it("validates tool input and unknown tools", async () => {
    expect((await executeTool("read_file", { nope: 1 }, ctx)).output).toMatch(/Invalid input/);
    expect((await executeTool("rm_rf", {}, ctx)).output).toMatch(/Unknown tool/);
    expect((await executeTool("read_file", { path: "missing.txt" }, ctx)).output).toMatch(/Not found/);
  });

  it("gates the shell tool", async () => {
    expect(toolSpecs(false).some((t) => t.name === "run_command")).toBe(false);
    expect(toolSpecs(true).some((t) => t.name === "run_command")).toBe(true);
    expect((await executeTool("run_command", { command: "echo hi" }, ctx)).isError).toBe(true);
    const r = await executeTool("run_command", { command: "echo hi && exit 3" }, { ...ctx, shellEnabled: true });
    expect(r.output).toContain("hi");
    expect(r.output).toContain("exit code 3");
    expect(r.isError).toBe(true);
    const slow = await executeTool("run_command", { command: "sleep 5" }, { ...ctx, shellEnabled: true, shellTimeoutMs: 200 });
    expect(slow.output).toContain("timed out");
  });

  it("never passes credentials to child processes", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.APP_PASSWORD = "pw";
    const env = childEnv();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.APP_PASSWORD).toBeUndefined();
    expect(env.PATH).toBeDefined();
    delete process.env.OPENAI_API_KEY;
    delete process.env.APP_PASSWORD;
  });
});

describe("Claude Code stream-json parsing", () => {
  it("maps assistant text, tool use, tool results and result lines", () => {
    expect(parseClaudeCodeLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Hi" }, { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a" } }] } }))).toEqual([
      { type: "text", delta: "Hi\n" },
      { type: "tool_call", id: "t1", name: "Read", input: { file_path: "a" } },
    ]);
    expect(parseClaudeCodeLine(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "data" }] }] } }))[0]).toMatchObject({ type: "tool_result", id: "t1", output: "data", isError: false });
    expect(parseClaudeCodeLine(JSON.stringify({ type: "result", is_error: true, result: "bad", usage: { input_tokens: 1, output_tokens: 2 } })).map((e) => e.type)).toEqual(["usage", "error"]);
    expect(parseClaudeCodeLine("plain text")).toEqual([{ type: "log", stream: "stdout", text: "plain text" }]);
  });
});

mkdirSync(path.join(root, "node_modules"), { recursive: true });
