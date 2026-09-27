# Blueprint traceability

Every release in *PCI Web App — Consolidated Blueprint & Implementation Roadmap* (canon 2026.09.25), mapped to where it is implemented, how it is verified, and its honest status.

**Status key** — **Done**: implemented and verified by tests. **Built, unverified live**: implemented and tested against stand-ins (PGlite Postgres, a fake Supabase client, a fake model) but not yet run against a live Supabase project or AI API, because none is connected. **Content-blocked**: the software is complete; the missing piece is material only the PCI Academy can supply. **Not done**: deliberately not built, with the reason.

## R0 — Canon + Infrastructure

| Scope | Where | Verified by | Status |
|---|---|---|---|
| Seven operations, questions, report structure, epistemic classes, STOP boundary | `lib/pci/canon.ts` | `tests/unit/canon.test.ts` | Done |
| Next.js, TypeScript, Tailwind, shadcn-style UI, Supabase | `web/` | build, lint, typecheck | Done |
| Authentication | Supabase Auth (email link, password) — `app/account/auth-panel.tsx` | — | Built, unverified live |
| Row-Level Security, migrations | `supabase/migrations/*` | `tests/sql/rls.test.ts` (real Postgres via PGlite), `pnpm db:migrate` | Done |
| Environment validation | `lib/env.ts` (refuses secret-looking `NEXT_PUBLIC_` values) | build | Done |
| CI/CD | `.github/workflows/web-ci.yml`, `deploy.yml`, `supabase-deploy.yml` | — | Done (first CI run happens on the PR) |
| Monitoring | Client error log (message + route only, never material) to device and `client_errors` table; Edge Function logs counts and rule names only | — | Partial — no external alerting service chosen |
| Canon registry with seven statuses | `lib/pci/canon.ts`, CMS canon selector | canon tests | Done |
| Core content and observation schemas | `lib/pci/schema.ts`, `lib/content/types.ts` | canon, engine tests | Done |
| AI provider abstraction and PCI system contract | `lib/ai/provider.ts`, `lib/pci/contract.ts`, `supabase/functions/_shared/model.ts` | provider-schema tests, Deno tests | Done |
| Publication validation (title-only chapters cannot publish) | `lib/content/validation.ts` and `public.content_is_publishable()` | content tests, SQL tests, e2e CMS test | Done |
| Seeds: definitions, seven questions, epistemic classes, Pattern Adoption, On the Contrary, chapter registry | `content/seeds/*`, `supabase/seed.sql` | seed SQL test (applies twice) | Done |

**R0 release gate.** Clone → install → migrate → seed → run works (`README.md`); RLS and ownership are defined and tested; the provider can change without redefining PCI (local ↔ remote, adapter interface); canonical tests pass.

## R1 — Core PCI MVP

| Scope | Where | Verified by | Status |
|---|---|---|---|
| Authentication and account controls | `app/account` | e2e (local mode) | Done locally; auth built, unverified live |
| Three-screen onboarding | `app/onboarding` | e2e | Done |
| Observe — Guided and Direct modes, seven questions | `app/observe` | e2e | Done |
| Internal decomposition, contradiction, context, epistemic and integrity layers | `lib/pci/*` | engine + regression corpus | Done |
| Immutable raw input and analysis versioning | `lib/db/repository.ts`, write-once triggers | repository, SQL, e2e re-analysis | Done |
| Saved reports and deletion | report page | e2e | Done |
| Basic Daily Journal, ≥ 30 prompts | `app/journal`, 90 prompts | e2e, content tests | Done |
| Today dashboard (no streaks, scores or badges) | `app/today` | e2e asserts none present | Done |
| Basic Library of complete approved content only | `app/library` | content tests, e2e | Done |
| Responsive, accessible UI | all | e2e mobile project; keyboard focus styles, labels, skip link | Done — no formal accessibility audit yet |
| Production privacy and security controls | RLS, export, deletion, redaction | SQL, repository, e2e | Done |

**MVP release criteria.** All seven operations represented ✔ · reports separate evidence / interpretation / inference / hypothesis / symbolic / philosophical / unknown ✔ · no recommendation, treatment, diagnosis, permanent identity conclusion or moral ranking generated as valid output ✔ (validator + quarantine) · save, reopen, delete ✔ · exactly seven questions, twelve-question UI inactive ✔ · users cannot retrieve another user's records ✔ (SQL) · published items complete and versioned ✔ · staging, backups, rollback: **needs the Supabase project** (Supabase provides backups; rollback of the static site is re-deploying an earlier commit).

**Closed pilot (2–4 weeks):** Not done — a human process that starts after merge.

## R2 — Journal + Ledger + Complete Library

| Scope | Where | Verified by | Status |
|---|---|---|---|
| 90+ categorised prompts | `content/seeds/journal-prompts.ts` | content tests (count, validator) | Done — 89 are **provisional**, awaiting canon review |
| Edit history, follow-ups, search, related entries | `app/journal` | repository, e2e | Done (related entries need longitudinal permission) |
| Ledger: unrestricted entries, tags, archive, search, links | `app/ledger` | e2e | Done |
| Complete approved *Art of Being* with navigation and versioning | `content/manuscript/` → `pnpm content:sync` → reader | content tests (verbatim, order, drift), SQL seed test, e2e (chapters and companion articles render; unsupplied matter hidden) | Done for the 12 chapters and 4 companion articles; introduction, book glossary, appendix and references **content-blocked** |
| Reader: bookmarks, highlights, notes, glossary links, fullscreen, dark mode, warm paper | `components/library/reader.tsx` | e2e | Done |
| CMS workflow Draft → Review → Approved → Published → Revised → Superseded | `lib/content/lifecycle.ts`, `app/admin`, SQL triggers | content tests, SQL tests, e2e | Done |
| Keyword search, public and private scopes | `lib/search`, `app/search` | relational tests, e2e | Done |

## R3 — On the Contrary + Academy + Audio

| Scope | Where | Verified by | Status |
|---|---|---|---|
| Six-step session flow; save and resume; links to sources | `app/contrary` | e2e | Done |
| Tested against forced positivity, victim-blaming, harm erasure, prescription | `lib/pci/contrary.ts`, validator rules | relational tests, e2e | Done |
| Course catalog, detail, module/lesson navigation | `app/academy` | e2e | Done — one course (**derived**, needs review) |
| Video player and transcript | lesson page (rendered only when a video exists; DB requires a transcript for any video) | — | Built; **content-blocked** (no course video yet) |
| Related reading from canonical Library | lessons reference framework articles | content tests | Done |
| Journal prompt and optional analysis; informational progress | lesson page | e2e | Done |
| Shared content identity for text and audio; audio bound to text version | `lib/audio/narration.ts`, `audio_assets`, `current_audio` view | content tests | Done |
| Narration, playback position, speed | Reader Listen mode (device voice reads the current text) | manual | Done with device speech; **content-blocked** for recorded narration masters |
| Background playback | Browser speech synthesis continues in background tabs on desktop; mobile browsers may pause it | — | Partial — true background audio needs recorded narration files |

## R4 — Relational Intelligence

| Scope | Where | Verified by | Status |
|---|---|---|---|
| Temporal classifications (all nine) | `lib/pci/temporal.ts`, `lib/relational/graph.ts` | engine, relational tests | Done |
| Relationship records with source evidence and explicit edge types (all thirteen) | `lib/relational/graph.ts`, `app/relate` | relational tests (traceability) | Done |
| Pattern Adoption viewer (recurrence, context, confidence, activation, absence, revision) | Relate → Patterns | relational tests, e2e | Done |
| Contradiction mapping with unresolved / revised status | Relate → Contradictions | relational tests, e2e | Done |
| Observer / Observed analysis | `lib/pci/observer.ts` | engine tests | Done |
| Semantic search after deletion and scope controls are proven | `user_embeddings` (pgvector), RLS, deletion triggers, `match_private()` | SQL tests (isolation, deletion removes vectors) | **Infrastructure only** — the UI uses keyword search. No embedding model is wired, and the local hashed vectors are lexical, so calling them semantic would be false. |
| Explicit controls to enable/disable longitudinal comparison | Account, onboarding, Relate | repository, e2e | Done |

The engine behind R4 on the local path is lexical: "related" means shared wording plus shared decomposition structure, and the interface says so.

## R5 — PWA + Membership + Production Expansion

| Scope | Where | Verified by | Status |
|---|---|---|---|
| Installable shell | `app/manifest.ts`, icons, `public/sw.js` | e2e | Done |
| Offline reader, Journal, Ledger | service worker precache + IndexedDB | e2e (goes offline, reads and writes) | Done |
| Queued synchronisation, conflict detection, explicit sync status | `lib/db/sync.ts`, header status, Account | sync tests (fake Supabase) | Built, unverified live |
| Online-only AI analysis | remote provider refuses offline; local engine is not AI and works offline | — | Done |
| Plan → Entitlements → Feature Access; server-side enforcement | `lib/entitlements.ts`, `has_entitlement()`, Edge Function check | SQL tests | Done — v1 ships one open plan, no paywall |
| Secure, idempotent payment webhooks | `payment_events` + `record_payment_event()` (service role only) | SQL tests (replay, member denied) | **Not done** — no payment provider has been chosen, so no webhook is wired |
| Community: gatherings, seminars, moderated discussion, registration | `app/community`, CMS | — | Done for listings and registration; **moderated discussion threads not built** |
| Services: information, booking requests, history, cancellation | `app/services`, CMS | — | Done for requests; payment and calendar scheduling **not built** |

## R6 — Advanced PCI Depth Intelligence

| Scope | Where | Verified by | Status |
|---|---|---|---|
| Multi-lens analysis with isolation, convergence, divergence, orthogonality, epistemic asymmetry | `lib/pci/lenses.ts`, integrity audit (lens contamination) | engine tests | Done |
| Causal intelligence (sequence → candidate → evidence → alternatives → disconfirming → confidence) | `lib/pci/causal.ts` | engine tests (always speculative, never High Support) | Done |
| Cognitive Twin: opt-in, gated on longitudinal data, every element linked to supporting and contradicting material | `lib/relational/twin.ts`, Relate → Twin | relational tests, e2e (withheld without history) | Done |
| Self-correcting theory: support / narrow / contradict / dissolve, versions preserved | twin versions (write-once) | relational tests | Done |

The blueprint cautions that depth intelligence without history produces speculation; the Twin is withheld below 12 sources over 21 days.

## Five release gates (§19.3)

| Gate | Evidence |
|---|---|
| Canon | Canon tests; twelve-question architecture registered as deprecated and inactive |
| Functional | 20 end-to-end tests across normal and error paths |
| Epistemic | Validator, integrity audit, 12-category regression corpus, quarantine tests, prompt-bank validation |
| Security | SQL/RLS suite, write-once triggers, secret-safe environment, redacted logging, export and deletion |
| Operational | CI on every PR; gated Pages deploy; repeatable migrations and seed. **Outstanding:** a staging Supabase project, backup restore drill, and alerting |
