# Blueprint traceability

Every release in *PCI Web App — Consolidated Blueprint & Implementation Roadmap* (canon 2026.09.25), mapped to where it is implemented, how it is verified, and its honest status — and, since the website handoff, what was retired and why.

## Website handoff, 2026-09-30 — what changed

The website handoff (`content/handoff/`: `01-SITE-BRIEF.md`, `02-PAGES-AND-COPY.md`, `03-DESIGN.md`, `04-DO-NOT.md`, the canon notes and `site-config.json`) was **adopted as the only source of truth for the public site**. Its brief is explicit: the site is a library and an entry; it is not a coaching app, not a course platform, and not a wellness product; if a member area exists, the only allowed tools are Observe, Journal, On the Contrary and Library; and questions appear only after the member explicitly asks for them. Where the blueprint's roadmap and the handoff conflict, the handoff wins. The route-by-route trace is `docs/SITE_HANDOFF_TRACE.md`.

**Public site built from the handoff:** `/` (Home), `/art-of-being/`, `/library/`, `/method/`, `/academy/`, `/practitioners/`, `/boundary/`, `/enter/`; the reader at `/library/art-of-being/<chapter-slug>/` and `/library/<slug>/`; `robots.txt` and `sitemap.xml` for `https://pci.academy`. **Member tools kept:** `/observe/`, `/journal/`, `/contrary/`, `/library/`, with `/account/` and `/admin/` (CMS). **Content live:** the twelve chapters of *The Art of Being* (Author's Voice rewrite), two sub-chapters under Individualism, five companion articles.

**Retired surfaces** — each named with the handoff rule it violates (all from `01-SITE-BRIEF.md` "Retired" and "If the builder can also make a member area", and `04-DO-NOT.md`):

| Retired surface | Was | Handoff rule it violates |
|---|---|---|
| Today dashboard (`/today/`) | Daily landing with prompt of the day, recent reports, entry points | Not one of the four allowed member tools; a dashboard that serves a prompt is an **automatic question** and a daily cadence (**streaks, points, levels, compliance**; "day 4 of 30") |
| Ledger (`/ledger/`) | Unrestricted entries, tags, archive, search, links | Not one of the four allowed member tools (Journal is the private write-and-archive) |
| Relate — Pattern Adoption viewer, contradiction map, Cognitive Twin UI (`/relate/`) | Archive-wide patterns, relationship records, a self-correcting theory of the person | Not one of the four allowed tools; a standing model of the person is a **type / identity label** ("Reading types as results"), and the viewer **prescribes** which patterns to adopt |
| Community (`/community/`) | Gatherings, seminars, registration | "Gatherings and one-to-one work, if they exist, are a separate context" — not a site surface; a **course platform / programme** shape |
| Services (`/services/`) | Booking requests, history, cancellation | Same rule: a separate context that "does not write into an observation"; **client-facing coaching** |
| Search page (`/search/`) | Keyword search over public and private scopes | Not one of the four allowed tools; the Library is "readable, not assigned" |
| Onboarding (`/onboarding/`) | Three-screen flow ending in "Enter PCI" | A **guided practice / programme** entry; the handoff's Enter page is "a private page for writing and looking", nothing to complete |
| Academy courses (catalog, lessons, modules, video, progress) | One derived course, lesson pages with journal prompt and informational progress | "Not a course that completes you"; **guided practices, challenges, or 30-day programs**; **progress**; lesson prompts are **automatic questions** and **homework attached to a report** |
| 90 journal prompts (`content/seeds/journal-prompts.ts`) | Categorised prompt bank shown in Journal and on Today | **Automatic follow-up questions**: "questions stay off until the person asks"; they were also written for the build, never canon |
| Framework texts (15) published in the Library | Blueprint transcriptions as Library articles | "Live content only" (seven operations, twelve chapters, five articles, two sub-chapters); the twelve Academy principles may not be the method of the site. Kept as engine reference, **unpublished** |

**Kept.** Engine and library code was kept wherever a retired surface sat on top of it: `lib/pci/` (including `temporal.ts`, `observer.ts`, `lenses.ts`, `causal.ts`), `lib/relational/` (graph, patterns, twin as code with no UI), `lib/search/`, `lib/content/`, the repository, sync, RLS and the Edge Function. The rows below that name a retired surface keep their place with Status **Removed per website handoff**; rows for kept code keep their original status.

**Status key** — **Done**: implemented and verified by tests. **Built, unverified live**: implemented and tested against stand-ins (PGlite Postgres, a fake Supabase client, a fake model) but not yet run against a live Supabase project or AI API, because none is connected. **Content-blocked**: the software is complete; the missing piece is material only the PCI Academy can supply. **Not done**: deliberately not built, with the reason. **Removed per website handoff**: built for the blueprint, then retired on 2026-09-30 for the handoff rule named above; code may remain as library code with no route.

## R0 — Canon + Infrastructure

| Scope | Where | Verified by | Status |
|---|---|---|---|
| Seven operations, questions, report structure, epistemic classes, STOP boundary | `lib/pci/canon.ts` | `tests/unit/canon.test.ts` | Done |
| Next.js, TypeScript, Tailwind, shadcn-style UI, Supabase | `web/` | build, lint, typecheck | Done |
| Authentication | Supabase Auth (email link, password) — `app/account/auth-panel.tsx` | — | Built, unverified live |
| Row-Level Security, migrations | `supabase/migrations/*` | `tests/sql/rls.test.ts` (real Postgres via PGlite), `pnpm db:migrate` | Done |
| Environment validation | `lib/env.ts` (refuses secret-looking `NEXT_PUBLIC_` values) | build | Done |
| CI/CD | `.github/workflows/web-ci.yml`, `deploy.yml`, `supabase-deploy.yml`; custom domain from `public/CNAME` | — | Done; domain DNS and Pages setting are the owner's (`docs/HANDOFF.md` §3) |
| Monitoring | Client error log (message + route only, never material) to device and `client_errors` table; Edge Function logs counts and rule names only | — | Partial — no external alerting service chosen |
| Canon registry with seven statuses | `lib/pci/canon.ts`, CMS canon selector | canon tests | Done |
| Core content and observation schemas | `lib/pci/schema.ts`, `lib/content/types.ts` | canon, engine tests | Done |
| AI provider abstraction and PCI system contract | `lib/ai/provider.ts`, `lib/pci/contract.ts`, `supabase/functions/_shared/model.ts` | provider-schema tests, Deno tests | Done |
| Publication validation (title-only chapters cannot publish) | `lib/content/validation.ts` and `public.content_is_publishable()` | content tests, SQL tests, e2e CMS test | Done |
| Seeds: definitions, seven questions, epistemic classes, Pattern Adoption, On the Contrary, chapter registry | `content/seeds/*`, `supabase/seed.sql` | seed SQL test (applies twice) | Done — the framework texts are seeded but **unpublished** per website handoff ("live content only") |

**R0 release gate.** Clone → install → migrate → seed → run works (`README.md`); RLS and ownership are defined and tested; the provider can change without redefining PCI (local ↔ remote, adapter interface); canonical tests pass.

## R1 — Core PCI MVP

| Scope | Where | Verified by | Status |
|---|---|---|---|
| Authentication and account controls | `app/account` | e2e (local mode) | Done locally; auth built, unverified live |
| Three-screen onboarding | was `app/onboarding` | — | **Removed per website handoff** (guided programme entry; Enter is "a private page for writing and looking") |
| Observe — Guided and Direct modes, seven questions | `app/observe` | e2e | Done |
| Internal decomposition, contradiction, context, epistemic and integrity layers | `lib/pci/*` | engine + regression corpus | Done |
| Immutable raw input and analysis versioning | `lib/db/repository.ts`, write-once triggers | repository, SQL, e2e re-analysis | Done |
| Saved reports and deletion | report page | e2e | Done |
| Basic Daily Journal, ≥ 30 prompts | `app/journal`; was 90 prompts | e2e | Journal Done; the prompt bank **Removed per website handoff** (automatic questions). Questions exist only on request: `lib/pci/questions.ts` |
| Today dashboard (no streaks, scores or badges) | was `app/today` | — | **Removed per website handoff** (not an allowed member tool; daily prompt = automatic question) |
| Basic Library of complete approved content only | `app/library` | content tests, e2e | Done |
| Responsive, accessible UI | all | e2e mobile project; keyboard focus styles, labels, skip link | Done — no formal accessibility audit yet |
| Production privacy and security controls | RLS, export, deletion, redaction | SQL, repository, e2e | Done |

**MVP release criteria.** All seven operations represented ✔ · reports separate evidence / interpretation / inference / hypothesis / symbolic / philosophical / unknown ✔ · no recommendation, treatment, diagnosis, permanent identity conclusion or moral ranking generated as valid output ✔ (validator + quarantine) · save, reopen, delete ✔ · exactly seven questions, twelve-question UI inactive ✔ · users cannot retrieve another user's records ✔ (SQL) · published items complete and versioned ✔ · staging, backups, rollback: **needs the Supabase project** (Supabase provides backups; rollback of the static site is re-deploying an earlier commit).

**Closed pilot (2–4 weeks):** Not done — a human process that starts after merge.

## R2 — Journal + Ledger + Complete Library

| Scope | Where | Verified by | Status |
|---|---|---|---|
| 90+ categorised prompts | was `content/seeds/journal-prompts.ts` | — | **Removed per website handoff** (automatic follow-up questions; 89 were provisional, never canon) |
| Edit history, follow-ups, search, related entries | `app/journal` | repository, e2e | Done (related entries need longitudinal permission) |
| Ledger: unrestricted entries, tags, archive, search, links | was `app/ledger` | — | **Removed per website handoff** (not one of the four allowed member tools) |
| Complete approved *Art of Being* with navigation and versioning | `content/manuscript/` → `pnpm content:sync` → reader | content tests (verbatim, order, drift), SQL seed test, e2e (chapters, sub-chapters and companion articles render) | Done for the twelve chapters, two sub-chapters and five companion articles (Author's Voice rewrite); front and back matter are not part of the handoff's live content |
| Reader: bookmarks, highlights, notes, glossary links, fullscreen, dark mode, warm paper | `components/library/reader.tsx` | e2e | Done; each library page ends "This text may be read. It is not a duty." |
| CMS workflow Draft → Review → Approved → Published → Revised → Superseded | `lib/content/lifecycle.ts`, `app/admin`, SQL triggers | content tests, SQL tests, e2e | Done |
| Keyword search, public and private scopes | `lib/search`; was `app/search` | relational tests | Search page **Removed per website handoff** (not an allowed tool); `lib/search` kept as library code |

## R3 — On the Contrary + Academy + Audio

| Scope | Where | Verified by | Status |
|---|---|---|---|
| Six-step session flow; save and resume; links to sources | `app/contrary` | e2e | Done |
| Tested against forced positivity, victim-blaming, harm erasure, prescription | `lib/pci/contrary.ts`, validator rules | relational tests, e2e | Done |
| Course catalog, detail, module/lesson navigation | was `app/academy/[course]`; `/academy/` is now the handoff's copy page | — | **Removed per website handoff** ("not a course that completes you"; guided practices / programmes) |
| Video player and transcript | was the lesson page | — | **Removed per website handoff** (course platform) |
| Related reading from canonical Library | was lessons → framework articles | — | **Removed per website handoff** (courses removed; framework texts unpublished) |
| Journal prompt and optional analysis; informational progress | was the lesson page | — | **Removed per website handoff** (automatic question; homework attached to a report; progress) |
| Shared content identity for text and audio; audio bound to text version | `lib/audio/narration.ts`, `audio_assets`, `current_audio` view | content tests | Done |
| Narration, playback position, speed | Reader Listen mode (device voice reads the current text) | manual | Done with device speech; **content-blocked** for recorded narration masters |
| Background playback | Browser speech synthesis continues in background tabs on desktop; mobile browsers may pause it | — | Partial — true background audio needs recorded narration files |

## R4 — Relational Intelligence

| Scope | Where | Verified by | Status |
|---|---|---|---|
| Temporal classifications (all nine) | `lib/pci/temporal.ts`, `lib/relational/graph.ts` | engine, relational tests | Done (engine code) |
| Relationship records with source evidence and explicit edge types (all thirteen) | `lib/relational/graph.ts`; was `app/relate` | relational tests (traceability) | Graph code Done; Relate UI **Removed per website handoff** (not an allowed tool) |
| Pattern Adoption viewer (recurrence, context, confidence, activation, absence, revision) | was Relate → Patterns | — | **Removed per website handoff** (prescribes patterns to adopt; identity labelling) |
| Contradiction mapping with unresolved / revised status | was Relate → Contradictions; contradictions remain inside each report | relational tests | Archive-wide view **Removed per website handoff**; per-report contradiction detection Done |
| Observer / Observed analysis | `lib/pci/observer.ts` | engine tests | Done |
| Semantic search after deletion and scope controls are proven | `user_embeddings` (pgvector), RLS, deletion triggers, `match_private()` | SQL tests (isolation, deletion removes vectors) | **Infrastructure only** — no embedding model is wired, and the local hashed vectors are lexical, so calling them semantic would be false |
| Explicit controls to enable/disable longitudinal comparison | Account (was also onboarding and Relate) | repository, e2e | Done in Account |

The engine behind R4 on the local path is lexical: "related" means shared wording plus shared decomposition structure, and the interface says so.

## R5 — PWA + Membership + Production Expansion

| Scope | Where | Verified by | Status |
|---|---|---|---|
| Installable shell | `app/manifest.ts`, icons, `public/sw.js` | e2e | Done |
| Offline reader and Journal | service worker precache + IndexedDB | e2e (goes offline, reads and writes) | Done (Ledger removed) |
| Queued synchronisation, conflict detection, explicit sync status | `lib/db/sync.ts`, header status, Account | sync tests (fake Supabase) | Built, unverified live |
| Online-only AI analysis | remote provider refuses offline; local engine is not AI and works offline | — | Done |
| Plan → Entitlements → Feature Access; server-side enforcement | `lib/entitlements.ts`, `has_entitlement()`, Edge Function check | SQL tests | Done — v1 ships one open plan, no paywall |
| Secure, idempotent payment webhooks | `payment_events` + `record_payment_event()` (service role only) | SQL tests (replay, member denied) | **Not done** — no payment provider has been chosen, so no webhook is wired |
| Community: gatherings, seminars, moderated discussion, registration | was `app/community`, CMS | — | **Removed per website handoff** (gatherings are "a separate context"; not a site surface) |
| Services: information, booking requests, history, cancellation | was `app/services`, CMS | — | **Removed per website handoff** (separate context; client-facing coaching) |
| Custom domain `pci.academy` | `public/CNAME`, `deploy.yml`, `app/robots.ts`, `app/sitemap.ts` | sitemap output checked; DNS pending | Done in the repository; DNS and Pages setting are the owner's (`docs/HANDOFF.md` §3) |

## R6 — Advanced PCI Depth Intelligence

| Scope | Where | Verified by | Status |
|---|---|---|---|
| Multi-lens analysis with isolation, convergence, divergence, orthogonality, epistemic asymmetry | `lib/pci/lenses.ts`, integrity audit (lens contamination) | engine tests | Done |
| Causal intelligence (sequence → candidate → evidence → alternatives → disconfirming → confidence) | `lib/pci/causal.ts` | engine tests (always speculative, never High Support) | Done |
| Cognitive Twin: opt-in, gated on longitudinal data, every element linked to supporting and contradicting material | `lib/relational/twin.ts`; was Relate → Twin | relational tests | Twin code kept; UI **Removed per website handoff** (a standing model of the person is a type / identity label) |
| Self-correcting theory: support / narrow / contradict / dissolve, versions preserved | twin versions (write-once) | relational tests | Done (engine code, no surface) |

The blueprint cautions that depth intelligence without history produces speculation; the Twin is withheld below 12 sources over 21 days — and, since the handoff, has no surface at all.

## Five release gates (§19.3)

| Gate | Evidence |
|---|---|
| Canon | Canon tests; twelve-question architecture registered as deprecated and inactive |
| Functional | End-to-end tests across the public pages and the member tools, normal and error paths |
| Epistemic | Validator, integrity audit, 12-category regression corpus, quarantine tests; questions on request pass the validator |
| Security | SQL/RLS suite, write-once triggers, secret-safe environment, redacted logging, export and deletion; `robots.txt` keeps `/admin/` and `/account/` out of indexes |
| Operational | CI on every PR builds the same base path as production; gated Pages deploy; repeatable migrations and seed. **Outstanding:** DNS and the Pages custom-domain setting (owner), a staging Supabase project, backup restore drill, and alerting |
