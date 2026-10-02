# Website handoff → implementation trace

Where every page and rule of the website handoff (`content/handoff/`, 30 September 2026) is implemented. The handoff is the only source of truth for the public site; where the trace says "no route", the item is deliberately absent and nothing in the app builds it. File names are given where they are certain; otherwise the route alone.

Routes: public site `/`, `/art-of-being/`, `/library/`, `/method/`, `/academy/`, `/practitioners/`, `/boundary/`, `/enter/`; reader `/library/art-of-being/<chapter-slug>/` and `/library/<slug>/`; member tools `/observe/`, `/journal/`, `/contrary/`, `/account/`, `/admin/`.

## 01-SITE-BRIEF.md

| Handoff item | Implemented at |
|---|---|
| "Give this folder to the website builder as the only source of truth" | `content/handoff/` (committed verbatim); `content/site.ts` carries its names, nav, chapters, articles, operations and closing lines as code; `docs/BLUEPRINT_TRACEABILITY.md` records what was retired to comply |
| A public site for PCI and *The Art of Being*; a library and an entry | `/` (Home), `/art-of-being/`, `/library/`, `/method/`, `/academy/`, `/practitioners/`, `/boundary/`, `/enter/`; `app/sitemap.ts` lists exactly these plus the published texts |
| Not a coaching app, course platform or wellness product; no fake diagnostic, type result, streak or "what to do tonight" flow | No route builds any of these. Retired routes `/today/`, `/ledger/`, `/relate/`, `/community/`, `/services/`, `/search/`, `/onboarding/` and the Academy courses are deleted, not hidden (`docs/BLUEPRINT_TRACEABILITY.md`) |
| Member area — only Observe, Journal, On the Contrary, Library | `/observe/`, `/journal/`, `/contrary/`, `/library/`; `content/site.ts` → `MEMBER_TOOLS`; listed by name on `/enter/` |
| Observe — paste material, run seven operations, report, stop | `/observe/`; engine in `lib/pci/` (`pipeline.ts`, `report.ts`, `validator.ts`); report view `components/pci/report-view.tsx` |
| Journal — private write and archive; analysis optional, same loop | `/journal/`; repository `lib/db/repository.ts` |
| On the Contrary — scenario in, configuration out, reflect, stop | `/contrary/`; `lib/pci/contrary.ts` |
| Library — the twelve chapters and five articles | `/library/`, `/library/art-of-being/<chapter-slug>/`, `/library/<slug>/`; texts from `content/manuscript/` via `content/seeds/`; reader `components/library/reader.tsx` |
| Questions only after the member explicitly asks; from the material just given plus the live corpus; no assigned direction | `lib/pci/questions.ts`, `components/pci/ask-questions.tsx` — rendered on request only in Observe, Journal and On the Contrary; every candidate passes `lib/pci/validator.ts` |
| One sentence: "PCI makes structure visible, then stops. Direction stays with the person." | `/` and `/method/` |
| Voice: observational, no pep talk, no "you should", no "tonight", no types, no healing promise, no streak | Page copy taken from `02-PAGES-AND-COPY.md` without rewriting (all public routes); engine-authored text is screened by `lib/pci/validator.ts` |
| Closing line "PCI observes. PCI reports. Then PCI stops." | `content/site.ts` → `SITE.close`; `/` close, footer on every page (`components/site/site-footer.tsx`) |
| Footer on every page: "Education, not therapy. Not medical, clinical, or crisis care." | `content/site.ts` → `SITE.disclaimer` / `SITE.footerDisclaimer`; `components/site/site-footer.tsx` via `components/app-shell.tsx` |
| Live content only: seven operations; twelve chapters (Author's Voice rewrite); five companion articles incl. YOUR "BUSINESS" EVOLVES AROUND OTHERS; sub-chapters Other People's Material, Coherence in Business | `content/site.ts` → `OPERATIONS`, `CHAPTERS`, `ARTICLES`, `SUB_CHAPTERS`; manuscript files `content/manuscript/art-of-being/`, `content/manuscript/companion/`, `content/manuscript/library/`; `pnpm content:check` fails CI if the seeds drift |
| Retired: sixteen-chapter edition, twelve Academy principles as method, booklets, Reading types, guided practices attached to a result | None published. The fifteen framework texts (`content/seeds/framework.ts`) are unpublished and excluded from `/library/` and from `app/sitemap.ts`; no course, booklet, type or practice route exists |
| Pages 1–8 | See 02 below |
| Brand: PCI · Psycho-Creative Intelligence · *The Art of Being* · "Perform who you are." | `content/site.ts` → `SITE`; `app/layout.tsx` metadata; `app/manifest.ts` |
| Palette ivory / ink / muted / gold / rule | `content/site.ts` → `PALETTE`; `app/globals.css` |
| Type: literary serif for titles (EB Garamond), plain grotesque for labels | `app/fonts/eb-garamond-latin-*.woff2`, `app/globals.css` |
| No stock smiles, no glow, no badges, no progress rings | No imagery of that kind is shipped; no progress or badge component exists in `components/` |

## 02-PAGES-AND-COPY.md

| Page / element | Implemented at |
|---|---|
| Home — kicker, title, lead, body, three lines, primary link "Read the book", secondary "The method", close | `/` (`app/page.tsx`); intro `components/site/page-intro.tsx` |
| The Art of Being — "Twelve chapters. Not a program."; chapter list, title and one line only; no chapters 13–16 | `/art-of-being/`; `content/site.ts` → `CHAPTERS` (twelve entries, fixed); `components/site/chapter-card.tsx`, `components/site/book-index.tsx` |
| Library — lead; five articles; two sub-chapters filed under Individualism; each library page ends "This text may be read. It is not a duty." | `/library/`; `content/site.ts` → `ARTICLES`, `SUB_CHAPTERS`, `SITE.libraryEnding`; `components/site/article-card.tsx`; ending rendered by the reader at `/library/art-of-being/<chapter-slug>/` and `/library/<slug>/` |
| Method — "Seven operations. Then stop."; the seven rows; "Then stop."; question layer only after interest | `/method/`; `content/site.ts` → `OPERATIONS`; `components/site/operation-row.tsx` |
| Academy — "Not a course that completes you."; what is here / what is not here | `/academy/` (copy only; no course, catalog, lesson or progress route) |
| For practitioners — title, lead, body, occupational test | `/practitioners/` |
| Boundary — "What this is not", five items, three sentences, "the wrong room" | `/boundary/`; `content/site.ts` → `BOUNDARY_LIST`; `components/site/boundary-list.tsx` |
| Enter — title, lead, three tools named only, empty state, "The member room is not open. The library is." when login is not built | `/enter/`; `content/site.ts` → `ENTER`, `MEMBER_TOOLS`; sign-in lives at `/account/` |
| Global nav: Art of Being · Library · Method · Academy · Practitioners · Boundary; Enter as a quiet link | `content/site.ts` → `NAV`, `ENTER`; `components/app-shell.tsx` |
| Global footer: PCI · The Art of Being / Education, not therapy. / PCI observes. PCI reports. Then PCI stops. | `components/site/site-footer.tsx` |

## 03-DESIGN.md

| Rule | Implemented at |
|---|---|
| Palette (paper, ink, muted, gold, rule, dark field); gold as rule and kicker, not a fill; no gold-on-gold buttons | `content/site.ts` → `PALETTE`; `app/globals.css`; `components/ui/button.tsx` |
| Titles EB Garamond; labels a plain grotesque, small, tracked open; body serif 18–20px, generous line height; no all-caps paragraphs; small-caps kickers | `app/fonts/`, `app/globals.css`; `components/site/page-intro.tsx` |
| Wide margins, one reading column; chapter pages feel like a book | reader `components/library/reader.tsx` at `/library/art-of-being/<chapter-slug>/` and `/library/<slug>/` |
| No hero video, no testimonial carousel, no invented quotes | Not built (no component) |
| No progress bars, badges, levels, "day 4 of 30" | Not built; the Academy course progress and the Today dashboard were removed (`docs/BLUEPRINT_TRACEABILITY.md`) |
| Image law: stone, ivory, paper, a single object; no wellness gradient, prayer hands, brain diagrams | No stock imagery shipped; `public/icon.svg`, `public/icons/` only |
| Motion: almost none; a rule drawing in; no word-by-word type animation | `app/globals.css` |
| Components to build: chapter card, article card, operation row, boundary list, footer lockup | `components/site/chapter-card.tsx`, `article-card.tsx`, `operation-row.tsx`, `boundary-list.tsx`, `site-footer.tsx` |
| Components not to build: quiz, type result, mood ring, streak, "your practice for tonight", advising AI chat, transformation pricing table | None exists in `components/`; the engine schema (`lib/pci/schema.ts`) has no field a recommendation could occupy, and `lib/pci/validator.ts` quarantines prescriptive output |

## 04-DO-NOT.md

| Do not | Where it is enforced |
|---|---|
| A thirteenth to sixteenth chapter as current text | `content/site.ts` → `CHAPTERS` has twelve; `content/manuscript/art-of-being/` has twelve files; `pnpm content:check` |
| The twelve Academy principles as the method | `/method/` shows the seven operations only; framework texts unpublished |
| Booklets as products | No route, no product type published (`ContentType 'booklet'` exists in `lib/content/types.ts` but no item uses it publicly) |
| Reading types as results; "Discover your type" | No route or component; the report schema has no type or personality field (`lib/pci/schema.ts`, `tests/unit/canon`) |
| Guided practices, challenges, 30-day programs | Academy courses removed; no practice route |
| Streaks, points, levels, compliance | Today dashboard removed; no counter or badge component |
| "What you should do tonight" | `lib/pci/validator.ts` blocks prescriptive phrasing in engine output; no such copy on any route |
| Automatic follow-up questions | `lib/pci/questions.ts` runs only from the explicit request in `components/pci/ask-questions.tsx`; the 90-prompt journal bank was removed |
| Client-facing coaching homework; "AI supervision" | `/practitioners/` copy states the limit; no client, supervision or homework route |
| Healing, trauma-processing or clinical claims; income or career promises | Copy from the handoff only; footer disclaimer on every page; validator rules in `lib/pci/validator.ts` |
| Fake testimonials; stock photography | None shipped |
| A chatbot that completes the user's life | No chat surface; Observe returns one observational report and stops (`lib/pci/pipeline.ts`) |
| Allowed ending: "PCI observes. PCI reports. Then PCI stops." | `content/site.ts` → `SITE.close`; footer and Home |
| Interest rule: questions stay off until the person asks; from what they wrote and the live chapters; never ending in an assigned action | `lib/pci/questions.ts` (sources: the material's decomposition and the published corpus; every candidate must end in "?" and pass the validator), `components/pci/ask-questions.tsx` |

## Canon notes (`canon-*.md`)

| Note | Implemented at |
|---|---|
| Publication note — sources and dates of chapters 1–12, articles A–E | `content/manuscript/` headers; `content/seeds/art-of-being.ts` (`SOURCE`, dates) |
| Seven operations — full wording | `lib/pci/canon.ts` (engine); `/method/` shows the handoff's short wording from `content/site.ts` |
| Boundary — visibility ≠ obligation, Analyze → Reflect → Stop, questions only after interest, coaching cannot write into engine output | `/boundary/`; `lib/pci/validator.ts`; `lib/pci/questions.ts`; no coaching surface exists |

## Domain and discovery

| Item | Implemented at |
|---|---|
| Site URL `https://pci.academy` | `content/site.ts` → `SITE.url`; `public/CNAME`; `.github/workflows/deploy.yml` (base path and `NEXT_PUBLIC_APP_URL` from the CNAME file) |
| Public pages and texts indexable; member and admin rooms not | `app/robots.ts` (disallow `/admin/`, `/account/`), `app/sitemap.ts` (public routes and published chapters, sub-chapters and articles only) |
