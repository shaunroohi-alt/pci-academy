# Switchboard

One local web console for **Anthropic Claude**, **OpenAI**, **Google Gemini** and **Astra**, a slot for any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, LiteLLM, OpenRouter, your own gateway, and so on). It also has a **code workspace** where a tool-using agent reads, edits and runs code in a sandboxed folder, plus an optional bridge to the official **Claude Code CLI**.

Next.js 16, React 19 and TypeScript. It uses only the official SDKs (`@anthropic-ai/sdk`, `openai`, `@google/genai`). API keys are read on the server and are never sent to the browser.

---

## Features

| | |
|---|---|
| **Providers** | Claude (Messages API), OpenAI (Chat Completions), Gemini (GenAI SDK), Astra (any OpenAI-compatible URL), and an offline Mock provider for demos and tests |
| **Model selector** | Model lists come live from each provider's `/models` endpoint and are cached for 10 minutes. If a listing fails, the `.env` list or built-in defaults are used. You can also type any model ID |
| **Streaming chat** | Server-Sent Events, stop and regenerate, token usage, Markdown with GFM tables and highlighted code with a copy button |
| **Conversation history** | Stored as JSON files in `DATA_DIR`. Writes are atomic and serialised per conversation. Conversations can be searched, renamed and deleted, and survive a reload (`?c=<id>`) |
| **System prompts** | Set per conversation, with presets. Temperature and max output tokens are optional overrides |
| **Attachments** | Images, PDFs and text or code files, by drag-and-drop, paste or picker. Each provider gets its native format (Claude `image`/`document`, OpenAI `image_url`/`file`, Gemini `inlineData`). If a provider can't read a file type, the file is replaced by a visible note, so it is never silently dropped |
| **Code workspace** | Agent loop with `list_files`, `read_file`, `write_file`, `edit_file`, `search` and an optional `run_command`. Works with Claude, OpenAI, Gemini, and Astra if the endpoint supports tools. Includes a file tree, an editor with ⌘/Ctrl+S to save, and a live terminal |
| **Claude Code CLI bridge** | Runs `claude -p --output-format stream-json` in the workspace and shows its tool calls live. Requires your own installed and signed-in Claude Code |
| **Errors and rate limits** | Errors from every SDK are normalised to `rate_limited`, `auth`, `overloaded`, `network` and similar, with `Retry-After` passed through. The SDKs retry automatically, and each client IP has its own token-bucket limit |
| **Security** | Keys stay on the server. Optional HTTP Basic auth (`APP_PASSWORD`). Keys are redacted from error messages. Child processes run without secrets. The workspace sandbox blocks path traversal and symlink escapes. The shell is off by default |
| **Ops** | `/api/health` (add `?deep=1` to check keys), Docker multi-stage image with a healthcheck, docker-compose, CI workflow |

---

## Quick start (macOS)

```bash
cd switchboard
./scripts/setup-macos.sh   # installs Node 22 via Homebrew if needed, npm ci, creates .env, runs tests, builds
open -e .env               # add at least one key (or ENABLE_MOCK_PROVIDER=true to try it offline)
npm start                  # http://localhost:3000
```

Manual setup, same on Linux:

```bash
cd switchboard
npm ci
cp .env.example .env && chmod 600 .env   # then edit
npm run dev                               # dev server with hot reload on :3000
# or
npm run build && npm start                # production
```

Requires **Node.js ≥ 20.9**. Node 22 is recommended (see `.nvmrc`).

### Try it without any keys

```bash
ENABLE_MOCK_PROVIDER=true ENABLE_SHELL=true npm run dev
```

The Mock provider echoes your messages. Its `fail` model simulates a 429, and in the workspace it runs a scripted `list_files` call, so you can exercise the whole UI offline.

---

## Configuration

Everything is set in `.env`. See [`.env.example`](.env.example), which documents every variable. The main ones:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables Claude |
| `OPENAI_API_KEY` | Enables OpenAI |
| `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | Enables Gemini |
| `ASTRA_BASE_URL`, `ASTRA_API_KEY`, `ASTRA_MODELS`, `ASTRA_LABEL` | Enables the Astra slot for any OpenAI-compatible server |
| `ASTRA_SUPPORTS_IMAGES`, `ASTRA_SUPPORTS_TOOLS` | Declare what your endpoint can do. Tools are required for workspace agent mode |
| `*_MODELS`, `*_DEFAULT_MODEL` | Pin the model list or default model per provider. This skips the live listing |
| `APP_PASSWORD` (`APP_USERNAME`, default `admin`) | HTTP Basic auth for the whole app except `/api/health` |
| `RATE_LIMIT_PER_MINUTE` | Per-IP request budget. `0` turns it off |
| `DATA_DIR`, `WORKSPACE_DIR` | Where conversations and workspace files are stored |
| `ENABLE_SHELL`, `SHELL_TIMEOUT_MS` | Lets the agent and the terminal run commands in the workspace |
| `ENABLE_CLAUDE_CODE_CLI`, `CLAUDE_CODE_BIN`, `CLAUDE_CODE_ARGS` | Claude Code CLI bridge |

Restart the server after you edit `.env`.

### About "Astra"

No identifiable official public "Astra" model API was found, so the app does **not** pretend to have one. Astra is a configurable adapter for any server that speaks the OpenAI Chat Completions protocol. Examples:

```bash
# Ollama (local)
ASTRA_BASE_URL=http://localhost:11434/v1
ASTRA_MODELS=llama3.1,qwen2.5-coder
# LM Studio
ASTRA_BASE_URL=http://localhost:1234/v1
# Any hosted OpenAI-compatible API
ASTRA_BASE_URL=https://api.example.com/v1
ASTRA_API_KEY=...
ASTRA_SUPPORTS_TOOLS=true
```

If "Astra" is a specific service with its own non-OpenAI API, add a provider as described under [Adding a provider](#adding-a-provider).

### Claude model notes

- Default list: `claude-opus-5`, `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5`, `claude-haiku-4-5`. When a key is set, the live `/v1/models` list replaces it.
- Current Claude models (Fable 5.x, Opus 5.x, Sonnet 5, Opus 4.7/4.8) reject `temperature`, so the app only forwards it to models that accept it, such as Haiku 4.5 and the 4.6 family.
- For `claude-opus-5` and `claude-fable-5-1`, the app turns on Anthropic's server-side refusal fallback by default (`fallbacks: "default"`). If one of those models declines a request, the API re-runs it on a fallback model in the same call. Set `ANTHROPIC_REFUSAL_FALLBACK=false` to turn this off.
- In agent mode, assistant turns (including thinking blocks) are replayed unchanged, so history stays append-only, as the current Claude models require.

---

## Code workspace

Open **Code workspace** in the sidebar.

- **API agent**: pick any provider or model with tool support and describe a task. The agent works only inside `WORKSPACE_DIR`, and each tool call is shown with its input and output. With `ENABLE_SHELL=true` it can also run builds, tests and git. It stops after `MAX_AGENT_STEPS` steps.
- **Claude Code CLI**: install [Claude Code](https://docs.claude.com/en/docs/claude-code), run `claude` once to sign in (or set `ANTHROPIC_API_KEY`), then set `ENABLE_CLAUDE_CODE_CLI=true`. By default it runs with `--permission-mode acceptEdits`: it can edit files, but it declines shell commands that would need interactive approval. You can change this with `CLAUDE_CODE_ARGS`, at your own risk.
- **Terminal**: runs `sh -c` in the workspace root when `ENABLE_SHELL=true`. It has a timeout and an output cap, and provider keys are removed from its environment.

> ⚠️ `ENABLE_SHELL` runs commands with the server's OS permissions. The path sandbox protects file tools, not shell commands. Enable it only on a machine you trust, and preferably inside Docker.

To work on an existing project, point `WORKSPACE_DIR` at it. With Docker, mount it at `/workspace`.

---

## Docker

```bash
cd switchboard
cp .env.example .env         # add keys
mkdir -p workspace           # create it yourself so it isn't created as root-owned
docker compose up -d --build
open http://localhost:3000
docker compose logs -f
```

- Conversations are stored in the named volume `switchboard-data`. `./workspace` is bind-mounted at `/workspace`.
- The port is bound to `127.0.0.1` by default. Before exposing it on a network, set `APP_PASSWORD` and put it behind TLS (Caddy, nginx, Traefik or a tunnel).
- To reach Ollama on the host, use `ASTRA_BASE_URL=http://host.docker.internal:11434/v1`.
- Plain Docker: `docker build -t switchboard . && docker run -p 3000:3000 --env-file .env -v sb-data:/data switchboard`

## Deploying elsewhere

`npm run build` produces `.next/standalone`, a self-contained Node server (`node .next/standalone/server.js` after copying `.next/static` into `.next/standalone/.next/static`, which is what the Dockerfile does). It runs on any VM, Fly.io, Railway, Render or Kubernetes that supports **persistent disks and long-lived HTTP responses**. Serverless platforms such as Vercel can host the chat, but the file-based history, workspace and shell need a persistent disk, so a container host fits better.

Before exposing it publicly, do all of the following:

1. Set `APP_PASSWORD`.
2. Use HTTPS.
3. Keep `ENABLE_SHELL=false` unless the host is isolated.
4. Set `RATE_LIMIT_PER_MINUTE` and your provider-side spend limits.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` / `npm start` | Production build and serve (`PORT` defaults to 3000) |
| `npm test` | Vitest suite |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` and ESLint |
| `npm run check` | typecheck, lint and tests |

The tests cover the SSE codec, error normalisation, the rate limiter, the store (including concurrent writes), provider message formatting, sandbox escapes (traversal and symlinks), workspace tools, the shell gating and timeout, the Claude Code stream parser, Basic auth, the API routes end to end, and **each provider SDK path over real HTTP** against local fake Anthropic, OpenAI and Gemini servers (streaming, tool-call loops, thinking-block and thought-signature replay, 429 handling).

---

## Architecture

```
src/
  app/api/
    chat/                    POST → SSE stream; persists user + assistant messages
    conversations/[id]/      GET · PATCH (title/settings) · DELETE
    models/                  provider status + model lists (live, cached)
    health/                  liveness/readiness (+ ?deep=1 key check)
    workspace/files|agent|exec|claude-code
  lib/server/
    config.ts                the only place that reads env
    providers/               anthropic · openai-compatible (OpenAI + Astra) · gemini · mock
    workspace/               sandbox · tools · agent loop · exec · claude-code bridge
    store.ts                 atomic JSON conversation store
    errors.ts rate-limit.ts http.ts validation.ts
  lib/shared/                types + SSE codec shared by client and server
  components/                React UI (App, ChatView, WorkspaceView, ModelPicker, …)
  proxy.ts                   optional HTTP Basic auth
```

### Adding a provider

1. Implement `ChatProvider` (`src/lib/server/providers/types.ts`). That means `stream()` yields `text`, `usage` and `done` events, plus optionally `fetchModels()` and `startAgent()` for tool use.
2. Register it in `src/lib/server/providers/index.ts` and add its ID to `PROVIDER_IDS` in `src/lib/shared/types.ts`.
3. Add a `.p-<id>` colour in `globals.css`.

## Troubleshooting

- **"not configured"**: the key is missing from the environment the server runs in. Edit `.env` and restart.
- **`auth` error**: the provider rejected the key. Use **Test API keys** in the status dialog (bottom left) to check.
- **`rate_limited`**: this comes from either the provider (the message says "for this provider") or the app's own limit (the message says "to this server"). Wait for the time shown, or raise `RATE_LIMIT_PER_MINUTE`.
- **The model list shows "Built-in defaults"**: live listing failed or no key is set. You can still type any model ID in the picker.
- **Astra `network` error**: check that `ASTRA_BASE_URL` is reachable from the server. Inside Docker, `localhost` means the container itself.
- **Unexpected endpoint or key being used**: variables already exported in your shell (for example `ANTHROPIC_BASE_URL`) take precedence over `.env`. Unset stray ones before starting the server.
