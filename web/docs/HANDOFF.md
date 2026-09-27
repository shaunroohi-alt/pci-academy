# Handoff — what is yours to decide or supply

The software is built so that none of the following needs an engineer. Each item is a canon, content or business decision the blueprint assigns to the PCI Academy.

## 1. Content that must come from the PCI Academy

- **The Art of Being — published.** The twelve core chapters and four PCI Companion Articles are in the Library, taken verbatim from the author's manuscript files in `content/manuscript/`. To revise a text, edit its markdown file and run `pnpm content:sync` (CI fails if the generated seeds drift from the files), or revise it through *Admin*, which keeps version history.
- **Still to supply:** the book's introduction, glossary, appendix and references. They are registered as drafts with no text and stay out of the Library until complete text is entered (§5.2: a title without a body fails publication; the database refuses anything under 400 characters or containing placeholder text).
- **Recorded narration** (optional). Until then, Listen uses the device voice reading the current text, so it cannot drift from the published version.
- **Course video.** The lesson page shows a player (with required transcript) only when a video exists.

## 2. Canon review (§1.4 — nothing is promoted silently)

| Item | Current status | Why |
|---|---|---|
| Framework articles (15) | Canonical | Transcribed from the blueprint; each records its source section |
| Glossary (44 terms) | Canonical or derived | *Derived* where a definition was assembled from the blueprint's description rather than stated |
| Journal prompt 1 | Canonical | The blueprint's own example |
| Journal prompts 2–90 | **Provisional** | Written for this build. They pass the constitutional validator, but they are not PCI Academy material until you approve or replace them |
| *The Art of Being*, chapters 1–12, and four Companion Articles | Canonical | The author's manuscript (canon "2026 current"), carried verbatim. Chapter numbering follows the manuscript, not the blueprint's §5.2 list: AAA, To Sing Is to Breathe, Being Is Becoming and The Neutral Gateway are companion articles rather than chapters 2, 3, 12 and 16 |
| *PCI Foundations* course | **Derived** | Its short orientations and exercises were written for this build around the canonical texts |

### Manuscript formatting to check

Carried exactly as supplied; worth a look by the author:

- Chapter 9: the word "and" between the chapter's two propositions is marked as a section heading (`## and`), so it renders as one.
- Chapter 10: the first heading, "Processing", sits directly under the title, so the chapter opens with a section called *Processing* rather than a subtitle.
- Chapters 1, 2, 7 and 10 have no italic subtitle; the reader shows the blueprint's scope note as their lede instead.

## 3. Decisions for launch

- **Replace the live site?** Merging to `main` deploys this web app to GitHub Pages in place of the `app/` Vite build that is served there now. The iOS app is unaffected: Capacitor bundles its own build of `app/` into the native shell, so nothing about it depends on Pages.
- **Backend.** Local-first mode needs nothing. For accounts, sync across devices, the shared CMS and AI analysis, follow *Backend* in `README.md`.
- **AI provider.** The service defaults to Claude (`claude-opus-5`) with structured output, adaptive thinking and server-side refusal fallback. Material sent to it leaves the device; the app says so wherever the choice is made. The local engine remains available and is the default.
- **Payments.** v1 is open access. Choosing a provider (and plans) is a business decision; the entitlement model and idempotent payment-event table are ready for it.
- **Monitoring.** Errors are recorded without user material. Choose an alerting service if you want notifications.
- **Closed pilot** (§13). Two to four weeks with the team, advisors, early users and reviewers, per the blueprint.

## 4. Known limits, stated plainly

- The **local engine is lexical**. It separates material by its wording and structure — reliably for the patterns it knows (feeling-words that describe another's conduct, absolutes, identity language, stated intentions against actions, requests for advice or diagnosis), and it will misread material that expresses these in unusual ways. Every finding shows the words that produced it, so misreadings are visible rather than hidden.
- The **Supabase path** (auth, sync, CMS writes, the Edge Function) is implemented and tested against a real Postgres engine, a fake Supabase client and a fake model. It has not yet run against a live project or a live AI API, because none was connected during the build.
- **Semantic search** is infrastructure only; search in the app is keyword search.
