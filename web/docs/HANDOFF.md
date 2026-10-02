# Handoff — what is yours to decide or supply

The software is built so that none of the following needs an engineer. Each item is a canon, content, domain or business decision that belongs to the PCI Academy. The public site follows the website handoff in `content/handoff/` as its only source of truth; its implementation trace is `docs/SITE_HANDOFF_TRACE.md`.

## 1. Content — what is live

- **The Art of Being — live.** The twelve core chapters (Author's Voice rewrite, 27 September 2026), the two sub-chapters filed under Individualism (*Other People's Material*, *Coherence in Business*) and the five PCI Companion Articles (A–D from the rewrite; E, *YOUR "BUSINESS" EVOLVES AROUND OTHERS*, 29 September 2026) are in the Library, taken verbatim from the manuscript files in `content/manuscript/`. To revise a text, edit its markdown file and run `pnpm content:sync` (CI fails if the generated seeds drift from the files), or revise it through *Admin*, which keeps version history.
- **The previous manuscript edition is retired.** The sixteen-chapter reading order, the twelve Academy principles as method, booklets, Reading types and prescribed practices are not published anywhere on the site, and the earlier companion-article set has been replaced by the five above. Nothing from an older PCI file is used where it conflicts with `content/handoff/`.
- **Front and back matter** (introduction, glossary, appendix, references) are not part of the handoff's live content and are not shown. If they are ever supplied, they stay registered as drafts until complete text is entered (§5.2: a title without a body fails publication).
- **Recorded narration** (optional). Until then, Listen uses the device voice reading the current text, so it cannot drift from the published version.

## 2. Canon review (§1.4 — nothing is promoted silently)

| Item | Current status | Why |
|---|---|---|
| *The Art of Being*, chapters 1–12, two sub-chapters, five Companion Articles | Canonical | The author's manuscript (Author's Voice rewrite), carried verbatim. Chapter numbering follows the handoff's twelve-chapter list; AAA, To Sing Is to Breathe, Being Is Becoming and The Neutral Gateway are companion articles, not chapters |
| Glossary (44 terms) | Canonical or derived | *Derived* where a definition was assembled from the blueprint's description rather than stated. Shown only inside the reader as term definitions |
| Framework articles (15) | Canonical, **unpublished** | Transcribed from the blueprint; kept as engine reference. The handoff's "live content only" rule keeps them out of the Library and the sitemap |

### Manuscript formatting to check

Carried exactly as supplied; worth a look by the author:

- Chapter 9: the word "and" between the chapter's two propositions is marked as a section heading (`## and`), so it renders as one.
- Chapter 10: the first heading, "Processing", sits directly under the title, so the chapter opens with a section called *Processing* rather than a subtitle.
- Chapters 1, 2, 7 and 10 have no italic subtitle; the reader shows a scope note as their lede instead.

## 3. Domain: DNS and Pages custom-domain settings are the owner's to complete

The repository is ready for **pci.academy**: `web/public/CNAME` names the domain, the deploy workflow builds for the domain root because of it, and `robots.txt` and `sitemap.xml` point at `https://pci.academy`. The two remaining steps need the GoDaddy account and repository admin rights, which the engineering session does not have. Full detail, record by record: `web/README.md` → *Custom domain (pci.academy on GoDaddy)*.

- [ ] **GoDaddy DNS** for `pci.academy`: delete the parked `A @` record, the default `CNAME www → @`, and any domain forwarding. Add `A @` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; `AAAA @` → `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`; `CNAME www` → `shaunroohi-alt.github.io`.
- [ ] **Verify the domain** (recommended): GitHub profile *Settings → Pages → Add a domain* → `pci.academy`; add the `TXT` record `_github-pages-challenge-shaunroohi-alt` with the value GitHub shows; click *Verify*.
- [ ] **Repository Settings → Pages → Custom domain** = `pci.academy`, save. GitHub ignores the committed `CNAME` file for Actions deployments, so this setting is required and must match the file.
- [ ] After the DNS check passes, tick **Enforce HTTPS**.
- [ ] Re-run *Deploy to GitHub Pages* (Actions → Run workflow) if the last deploy predates the setting.
- [ ] Check: `dig +short pci.academy` returns the four `185.199.x.153` addresses; `https://pci.academy/` loads; `https://pci.academy/robots.txt` names the sitemap.
- [ ] If the Supabase backend is in use, add `https://pci.academy` and `https://pci.academy/account/` to Supabase Auth's site and redirect URLs.

## 4. Decisions for launch

- **The live site.** Merging to `main` deploys this web app to GitHub Pages, at `https://pci.academy` once the domain steps above are done (and at `https://shaunroohi-alt.github.io/pci-academy/` only if `web/public/CNAME` is removed). The iOS app is unaffected: Capacitor bundles its own build of `app/` into the native shell, so nothing about it depends on Pages.
- **Backend.** Local-first mode needs nothing. For accounts, sync across devices, the shared CMS and AI analysis, follow *Backend* in `README.md`.
- **AI provider.** The service defaults to Claude (`claude-opus-5`) with structured output, adaptive thinking and server-side refusal fallback. Material sent to it leaves the device; the app says so wherever the choice is made. The local engine remains available and is the default.
- **Payments.** v1 is open access. Choosing a provider (and plans) is a business decision; the entitlement model and idempotent payment-event table are ready for it. Any pricing page must not promise transformation (`04-DO-NOT.md`).
- **Monitoring.** Errors are recorded without user material. Choose an alerting service if you want notifications.
- **Closed pilot** (§13). Two to four weeks with the team, advisors, early users and reviewers, per the blueprint.

## 5. Known limits, stated plainly

- The **local engine is lexical**. It separates material by its wording and structure — reliably for the patterns it knows (feeling-words that describe another's conduct, absolutes, identity language, stated intentions against actions, requests for advice or diagnosis), and it will misread material that expresses these in unusual ways. Every finding shows the words that produced it, so misreadings are visible rather than hidden. Questions on request come from the same lexical reading plus the published corpus.
- The **Supabase path** (auth, sync, CMS writes, the Edge Function) is implemented and tested against a real Postgres engine, a fake Supabase client and a fake model. It has not yet run against a live project or a live AI API, because none was connected during the build.
- **Semantic search** is infrastructure only; there is no search page, and the reader's lookups are keyword-based.
