# PCI Web App

The PCI Academy web application, built from the *PCI Web App — Consolidated Blueprint & Implementation Roadmap* (canon 2026.09.25). An observational intelligence environment: it receives material, separates it, compares it where evidence permits, distinguishes evidence from interpretation, surfaces patterns and contradictions, produces an observational report — and stops.

> Visibility is the output. Human choice begins outside the PCI Engine.

- **Blueprint traceability** (what is built, where, how it is verified, and what is not done): [`docs/BLUEPRINT_TRACEABILITY.md`](docs/BLUEPRINT_TRACEABILITY.md)
- **Handoff** (decisions and content that belong to the canon owner): [`docs/HANDOFF.md`](docs/HANDOFF.md)

## Quick start

```bash
cd web
pnpm install
pnpm dev              # http://localhost:3000
```

No backend is needed. Without Supabase settings the app runs **local-first**: every observation, journal entry and report is stored in the browser (IndexedDB) on that device, and the on-device PCI engine performs analysis offline.

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Static export to `out/` plus service-worker precache manifest |
| `pnpm start` | Serve `out/` exactly as GitHub Pages would (set `BASE_PATH` to test a sub-path) |
| `pnpm lint` / `pnpm typecheck` | ESLint (Next + React Compiler rules) / TypeScript |
| `pnpm test` | Unit, AI regression corpus, repository/sync, and SQL/RLS tests (Vitest + PGlite) |
| `pnpm test:e2e` | Playwright end-to-end tests against the static build, served under `/pci-academy/` as on Pages. Build for that path first: `BASE_PATH=/pci-academy/ pnpm build` |
| `pnpm db:migrate` | Apply `supabase/migrations` to a throwaway Postgres twice (applies and repeats cleanly) |
| `pnpm content:sync` / `content:check` | Regenerate / verify the book and companion-article seeds from the manuscript files in `content/manuscript/` |
| `pnpm db:seed` | Regenerate `supabase/seed.sql` from `content/seeds` |
| `pnpm edge:sync` / `edge:check` | Copy / verify the engine modules shared with the Edge Function |
| `pnpm gate` | The production build gate: lint · typecheck · test · manuscript check · edge check · build (§10.6) |

## Architecture

```
web/
  app/                    Routes (Next.js App Router, static export)
    today observe journal ledger contrary library academy relate
    community services search account admin onboarding
  components/             App shell, UI primitives, report view, reader
  lib/
    pci/                  The PCI Engine — canon registry, schema, decomposition,
                          comparison, temporal, patterns, contradictions, observer,
                          epistemic, lenses, causal, integrity audit, report,
                          constitutional validator, pipeline, contract
    ai/                   Provider abstraction (§8.1): local engine, remote service
    db/                   Repository (domain rules), IndexedDB store, Supabase sync
    content/              Catalog, publication validation, CMS lifecycle, markdown
    relational/           Archive-wide graph, patterns, Cognitive Twin
    search/  audio/  entitlements.ts  env.ts
  content/manuscript/     The Art of Being (12 chapters) and PCI Companion
                          Articles, as the author's markdown — source of truth
  content/seeds/          Framework texts, glossary, book registry (built from
                          the manuscript), journal prompts, courses
  supabase/
    migrations/           Schema, RLS, write-once triggers, publication validation,
                          entitlements, pgvector index
    functions/pci-analyze Edge Function holding the AI key (Deno)
    seed.sql              Generated, idempotent
  tests/unit tests/sql tests/e2e
```

### The processing pipeline (§8.2)

```
Material → PCI contract → provider → schema validation → constitutional validator
         → Meta-Observational Integrity Audit → observational report → persistence
```

- **Provider abstraction.** `lib/ai/provider.ts` defines `analyze / embed / summarize / transcribe / synthesizeSpeech`. Two providers ship: the **local engine** (deterministic, lexical, offline, nothing leaves the device) and the **remote service** (Supabase Edge Function `pci-analyze`, which holds the AI key server-side and calls Claude under the PCI contract with the report schema as structured output). Other model providers plug into `supabase/functions/_shared/model.ts` without changing PCI.
- **The schema has no field for prescriptions** — no recommendation, treatment, action plan, best choice, personality or alignment score. Objects are strict, so an output carrying one fails validation.
- **The constitutional validator** scans every engine-authored string for the fifteen prohibited transformations (§2.2) and the blueprint's rejected phrases (§8.3), and checks every quote against the material — a quote that does not occur verbatim is an interpretation presented as evidence. User words are exempt only when they genuinely occur in the material.
- **Quarantine.** Output that fails is stored as a quarantined version with its violations and is never shown as a PCI report. The server gives an AI provider one repair round first; the device validates again regardless.
- **Immutable evidence, revisable analysis** (§7.5). Raw input and analysis versions are write-once in the repository and in Postgres (trigger + no update policy). New information becomes an addendum and a new version.

### Where data lives

| Mode | Storage | Isolation |
|---|---|---|
| Local (no backend configured) | IndexedDB in the browser | The device |
| Account (Supabase configured, signed in) | IndexedDB working copy + Supabase Postgres via an outbox | Row-Level Security on every private table; composite key `(user_id, id)` |

The sync engine queues every write, retries failures, and detects conflicts (a document changed elsewhere since this device last saw it). Conflicts are surfaced in Account, never overwritten silently; keeping the other device's version saves this device's text to the Ledger.

Longitudinal comparison — the engine reading earlier material — is **off by default** and only runs with explicit permission. Training reuse is off and nothing in the app reads it as on.

## Deployment

### Static site (GitHub Pages)

`.github/workflows/deploy.yml` runs the release gate and deploys `web/out` to GitHub Pages on every push to `main`. The site is served under `/<repository-name>/`; `BASE_PATH` handles that.

### Cloudflare Worker (pci.academy)

`wrangler.jsonc` at the repository root deploys `web/out` plus a small Worker (`web/worker/`) that answers `/api/*`. `/api/contrary` writes the On the Contrary **Contrary Position** or **Balance** as prose with Claude (`claude-opus-5-5`), checks the draft against the constitutional validator with one repair round, and is rate-limited per visitor. It needs one Worker secret, `ANTHROPIC_API_KEY` (Cloudflare dashboard → Workers → pci-academy → Settings → Variables and Secrets, or `npx wrangler secret put ANTHROPIC_API_KEY`). Optional plain variable `CONTRARY_MODEL` overrides the model. Without the key the button explains that the writer is not configured.

`/api/reflect` uses the same key, model and rate limit to write the **Observation** and **Analysis** of every Observe and Journal report as prose, from the material, the engine's findings and (only when the user allows comparison) the earlier material the engine compared against. Both parts go through the same validator with one repair round. The write-up is stored on the analysis version; without the key, reports keep their structural form and say why the write-up is missing. Users can turn writing off under Account → Privacy.

### Backend (optional)

1. Create a Supabase project.
2. Add repository **secrets** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `AI_API_KEY` (optionally `AI_PROVIDER`, default `anthropic`; `AI_MODEL`, default `claude-opus-5`).
3. Run the **Deploy Supabase backend** workflow (Actions → Run workflow). It applies migrations and the seed, sets the function secrets, and deploys `pci-analyze`.
4. Add repository **variables** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public values) and re-run the Pages deploy.
5. Appoint the first administrator in the Supabase SQL editor: `update public.profiles set role = 'admin' where id = '<user id>';`
6. In Supabase Auth settings, add the site URL and `/account/` redirect URL.

The anon key is public by design; Row-Level Security is what protects data. The service-role key and AI key exist only as Edge Function secrets. The build refuses to bundle any `NEXT_PUBLIC_` variable that looks like a secret.

## Testing

| Suite | Scope |
|---|---|
| `tests/unit/canon` | Exactly seven active questions; twelve-question UI deprecated; vocabularies; schema has no prescriptive field |
| `tests/unit/validator` | Every §8.3 example and every §2.2 invariant is blocked; observational language passes; user quotes exempt only when real |
| `tests/unit/engine` | Decomposition, contradictions, patterns, counter-readings, integrity audit, lenses, causal hypotheses, determinism, permission gating, pipeline quarantine |
| `tests/unit/regression-corpus` | The twelve §19.2 AI evaluation categories |
| `tests/unit/content` | Publication validation, lifecycle, version history, 90-prompt bank passes the validator, courses reuse Library content, audio/text binding, entitlements |
| `tests/unit/repository` / `sync` | Write-once evidence, versioning, deletion, export, longitudinal permission, journal history; outbox retry, conflict detection, no silent loss |
| `tests/unit/relational` | On the Contrary safety, graph traceability, Cognitive Twin gating and self-correction, search scope labels |
| `tests/sql` | Migrations, RLS isolation between users, anonymous denial, write-once triggers, publication validation and lifecycle in SQL, entitlements, idempotent payments, private index deletion, repeatable seed |
| `tests/e2e` | Onboarding, Observe (direct, guided), report reopening, re-analysis, deletion, Journal, reader, CMS, Ledger, On the Contrary, Academy, relational gating, PWA install and offline, export and deletion, mobile navigation |
| `supabase/functions/_shared/analyze.test.ts` | Edge Function: clean pass, repair round, quarantine hand-off (Deno) |
