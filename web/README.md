# PCI Web App

The public site for Psycho-Creative Intelligence (PCI) and the book *The Art of Being*, with a private member room. The site is a library and an entry: it is not a coaching app, not a course platform, and not a wellness product. The public pages follow the website handoff in [`content/handoff/`](content/handoff/) as their only source of truth; the member tools run the PCI Engine, which receives material, separates it, compares it where evidence permits, distinguishes evidence from interpretation, surfaces patterns and contradictions, produces an observational report — and stops.

> PCI observes. PCI reports. Then PCI stops.

- **Website handoff** (brief, page copy, design, do-not list, canon notes): [`content/handoff/`](content/handoff/) — mapped to routes in [`docs/SITE_HANDOFF_TRACE.md`](docs/SITE_HANDOFF_TRACE.md)
- **Blueprint traceability** (what is built, where, how it is verified, and what was retired): [`docs/BLUEPRINT_TRACEABILITY.md`](docs/BLUEPRINT_TRACEABILITY.md)
- **Handoff** (decisions and content that belong to the canon owner, including the domain): [`docs/HANDOFF.md`](docs/HANDOFF.md)

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
| `pnpm build` | Static export to `out/` plus service-worker precache manifest. Built for the domain root (pci.academy) unless `BASE_PATH` is set |
| `pnpm start` | Serve `out/` exactly as GitHub Pages would (set `BASE_PATH` to test a sub-path build) |
| `pnpm lint` / `pnpm typecheck` | ESLint (Next + React Compiler rules) / TypeScript |
| `pnpm test` | Unit, AI regression corpus, repository/sync, and SQL/RLS tests (Vitest + PGlite) |
| `pnpm test:e2e` | Playwright end-to-end tests against the static build in `out/`, served under the same base path it was built with (`pnpm build && pnpm test:e2e` for the production root build; `BASE_PATH=/pci-academy/` on both commands to test the github.io sub-path) |
| `pnpm db:migrate` | Apply `supabase/migrations` to a throwaway Postgres twice (applies and repeats cleanly) |
| `pnpm content:sync` / `content:check` | Regenerate / verify the book and companion-article seeds from the manuscript files in `content/manuscript/` |
| `pnpm db:seed` | Regenerate `supabase/seed.sql` from `content/seeds` |
| `pnpm edge:sync` / `edge:check` | Copy / verify the engine modules shared with the Edge Function |
| `pnpm gate` | The production build gate: lint · typecheck · test · manuscript check · edge check · build (§10.6) |

## Architecture

```
web/
  app/                    Routes (Next.js App Router, static export)
    /  art-of-being  library  method  academy  practitioners  boundary  enter
                          The public site (website handoff)
    library/art-of-being/<chapter>  library/<slug>
                          The reader: twelve chapters, two sub-chapters, five articles
    observe  journal  contrary  account  admin
                          Member tools (Observe, Journal, On the Contrary), Account, CMS
    robots.ts  sitemap.ts  manifest.ts
                          robots.txt (disallows /admin/ and /account/), sitemap.xml
                          of the public pages and published texts, PWA manifest
  public/CNAME            The custom domain (pci.academy); drives the build's base path
  components/             App shell, UI primitives, report view, reader
  lib/
    pci/                  The PCI Engine — canon registry, schema, decomposition,
                          comparison, temporal, patterns, contradictions, observer,
                          epistemic, lenses, causal, integrity audit, report,
                          constitutional validator, pipeline, contract
    ai/                   Provider abstraction (§8.1): local engine, remote service
    db/                   Repository (domain rules), IndexedDB store, Supabase sync
    content/              Catalog, publication validation, CMS lifecycle, markdown
    relational/           Archive-wide graph and pattern code (engine only; no UI)
    entitlements.ts  env.ts
  content/handoff/        The website handoff: site brief, page copy, design,
                          do-not list, canon notes, site-config.json — source of
                          truth for the public site
  content/site.ts         The handoff's names, nav, chapter and article lists as code
  content/manuscript/     The Art of Being (twelve chapters, two sub-chapters) and
                          the five PCI Companion Articles, as the author's markdown
  content/seeds/          Book and article registry (built from the manuscript),
                          glossary, framework texts (unpublished)
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
- **Questions only on request** (handoff interest rule). The member tools never ask follow-up questions on their own; a member asks for them, and they come from the material just given and the live chapters, and end in no assigned action.

### Where data lives

| Mode | Storage | Isolation |
|---|---|---|
| Local (no backend configured) | IndexedDB in the browser | The device |
| Account (Supabase configured, signed in) | IndexedDB working copy + Supabase Postgres via an outbox | Row-Level Security on every private table; composite key `(user_id, id)` |

The sync engine queues every write, retries failures, and detects conflicts (a document changed elsewhere since this device last saw it). Conflicts are surfaced in Account, never overwritten silently.

Longitudinal comparison — the engine reading earlier material — is **off by default** and only runs with explicit permission. Training reuse is off and nothing in the app reads it as on.

## Deployment

### Static site (GitHub Pages)

`.github/workflows/deploy.yml` runs the release gate and deploys `web/out` to GitHub Pages on every push to `main`. The base path comes from one committed file:

- **`web/public/CNAME` names the custom domain** (`pci.academy`). When it exists and is non-empty, the workflow builds for the domain root (`BASE_PATH=''`) and sets `NEXT_PUBLIC_APP_URL=https://pci.academy` (the repository variable `NEXT_PUBLIC_APP_URL`, if set, overrides the URL). No repository variable is needed.
- Delete or empty the file and the site builds for `/<repository-name>/` on github.io again.

`web-ci.yml` resolves the base path the same way, so CI builds and tests exactly what production builds.

To test the production build locally: `pnpm build && pnpm start`, then open http://localhost:4173/. To test a github.io-style sub-path: `BASE_PATH=/pci-academy/ pnpm build && BASE_PATH=/pci-academy/ pnpm start`.

### Custom domain (pci.academy on GoDaddy)

GitHub Pages serves custom domains with free HTTPS. The repository side is done (the `CNAME` file, the workflows, `robots.txt` and `sitemap.xml` on `https://pci.academy`). What remains is DNS and one GitHub setting, both of which only the domain owner / repository admin can do. Order matters: DNS first, then the Pages setting, then HTTPS.

1. **GoDaddy → My Products → pci.academy → DNS.** Delete the parked `A @` record GoDaddy created, the default `CNAME www → @` record, and any **Forwarding** rule on the domain (forwarding and Pages cannot both answer for the apex). Then add:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | A | `@` | `185.199.108.153` | 1 hour |
   | A | `@` | `185.199.109.153` | 1 hour |
   | A | `@` | `185.199.110.153` | 1 hour |
   | A | `@` | `185.199.111.153` | 1 hour |
   | AAAA | `@` | `2606:50c0:8000::153` | 1 hour |
   | AAAA | `@` | `2606:50c0:8001::153` | 1 hour |
   | AAAA | `@` | `2606:50c0:8002::153` | 1 hour |
   | AAAA | `@` | `2606:50c0:8003::153` | 1 hour |
   | CNAME | `www` | `shaunroohi-alt.github.io` | 1 hour |

   Leave the `NS` and `SOA` records alone.
2. **Verify the domain** so nobody else can claim it on Pages (recommended): GitHub → your profile *Settings → Pages → Add a domain* → `pci.academy`. GitHub shows a `TXT` record named `_github-pages-challenge-shaunroohi-alt` with a one-off value; add it in GoDaddy (Type `TXT`, Name `_github-pages-challenge-shaunroohi-alt`, Value as shown) and click *Verify*.
3. **Repository Settings → Pages → Custom domain:** enter `pci.academy` and save. GitHub ignores the `CNAME` file for Actions deployments, so this setting is what makes Pages answer for the domain; it must match the file. Once the DNS check passes (minutes to a few hours), tick **Enforce HTTPS**. `www.pci.academy` then redirects to `pci.academy`.
4. **Re-run *Deploy to GitHub Pages*** (Actions → Deploy to GitHub Pages → Run workflow) if the last deploy happened before the setting was saved; the build itself already targets the domain root.
5. If the Supabase backend is in use, add `https://pci.academy` and `https://pci.academy/account/` to Supabase Auth's site and redirect URLs.

**What the `CNAME` file does.** `web/public/CNAME` is copied into `out/` by the static export. GitHub reads a `CNAME` file only for branch-based Pages deployments, not for the Actions deployment this repository uses — for us it is the committed statement of the domain that the workflows read to choose the base path and site URL, that humans read, and that the Cloudflare Worker serves as-is.

**Cloudflare Worker (optional secondary host).** `wrangler.jsonc` at the repository root builds `web/` for the domain root and serves `web/out` as static assets, so the same build can be hosted on Cloudflare instead if Pages is ever unsuitable. Point the domain at exactly one host at a time; GitHub Pages plus GoDaddy DNS is the primary path.

**Check.**

```bash
dig +short pci.academy          # the four 185.199.x.153 addresses
dig +short AAAA pci.academy     # the four 2606:50c0:800x::153 addresses
dig +short www.pci.academy      # shaunroohi-alt.github.io.
dig +short TXT _github-pages-challenge-shaunroohi-alt.pci.academy
curl -sI https://pci.academy/ | head -1          # HTTP/2 200
curl -s https://pci.academy/robots.txt           # Disallow: /admin/ and /account/, Sitemap: https://pci.academy/sitemap.xml
```

### Backend (optional)

1. Create a Supabase project.
2. Add repository **secrets** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `AI_API_KEY` (optionally `AI_PROVIDER`, default `anthropic`; `AI_MODEL`, default `claude-opus-5`).
3. Run the **Deploy Supabase backend** workflow (Actions → Run workflow). It applies migrations and the seed, sets the function secrets, and deploys `pci-analyze`.
4. Add repository **variables** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public values) and re-run the Pages deploy.
5. Appoint the first administrator in the Supabase SQL editor: `update public.profiles set role = 'admin' where id = '<user id>';`
6. In Supabase Auth settings, add the site URL (`https://pci.academy`) and `/account/` redirect URL.

The anon key is public by design; Row-Level Security is what protects data. The service-role key and AI key exist only as Edge Function secrets. The build refuses to bundle any `NEXT_PUBLIC_` variable that looks like a secret.

## Testing

| Suite | Scope |
|---|---|
| `tests/unit/canon` | Exactly seven active questions; twelve-question UI deprecated; vocabularies; schema has no prescriptive field |
| `tests/unit/validator` | Every §8.3 example and every §2.2 invariant is blocked; observational language passes; user quotes exempt only when real |
| `tests/unit/engine` | Decomposition, contradictions, patterns, counter-readings, integrity audit, lenses, causal hypotheses, determinism, permission gating, pipeline quarantine |
| `tests/unit/regression-corpus` | The twelve §19.2 AI evaluation categories |
| `tests/unit/content` | Publication validation, lifecycle, version history, manuscript seeds (twelve chapters, two sub-chapters, five articles) verbatim and in order, audio/text binding, entitlements |
| `tests/unit/repository` / `sync` | Write-once evidence, versioning, deletion, export, longitudinal permission, journal history; outbox retry, conflict detection, no silent loss |
| `tests/unit/relational` | On the Contrary safety, graph traceability (engine code; no UI) |
| `tests/sql` | Migrations, RLS isolation between users, anonymous denial, write-once triggers, publication validation and lifecycle in SQL, entitlements, idempotent payments, private index deletion, repeatable seed |
| `tests/e2e` | The public pages (Home, The Art of Being, Library, Method, Academy, Practitioners, Boundary, Enter) against the handoff copy; Observe (report, reopening, re-analysis, deletion); Journal; questions only on request; reader; CMS; On the Contrary; PWA install and offline; export and deletion; mobile navigation |
| `supabase/functions/_shared/analyze.test.ts` | Edge Function: clean pass, repair round, quarantine hand-off (Deno) |
