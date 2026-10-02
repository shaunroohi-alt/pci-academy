# PCI Academy

Software for PCI Academy: the public site for Psycho-Creative Intelligence (PCI) and the book *The Art of Being*, served at **https://pci.academy**, with a private member room that runs the PCI Engine. PCI is an observational method. It separates what happened from what was decided about it, reports what can be seen, and then stops. It gives no advice, diagnosis, type, practice or verdict on who someone is.

> PCI observes. PCI reports. Then PCI stops.

| Directory | What it is |
|---|---|
| [`web/`](web/README.md) | **The PCI Web App.** The public site built from the website handoff — Home, The Art of Being (twelve chapters), Library (chapters, two sub-chapters, five companion articles, each readable in full), Method (seven operations), Academy, For practitioners, Boundary, Enter — and the member tools Observe, Journal, On the Contrary and Library, plus Account and the CMS. Questions in the member tools appear only after the member asks for them. Behind it: a Supabase backend and the Edge Function that runs the PCI Engine, both optional (the app runs local-first without them). GitHub Pages serves this at pci.academy. |
| [`web/content/handoff/`](web/content/handoff/) | **The website handoff** — the only source of truth for the public site: `01-SITE-BRIEF.md`, `02-PAGES-AND-COPY.md`, `03-DESIGN.md`, `04-DO-NOT.md`, the canon notes (`canon-*.md`) and `site-config.json`. Where each rule is implemented: [`web/docs/SITE_HANDOFF_TRACE.md`](web/docs/SITE_HANDOFF_TRACE.md). |
| [`app/`](app/) | The earlier Vite web app, wrapped as the native iOS app with Capacitor. See [`IOS_SUBMISSION.md`](IOS_SUBMISSION.md). |
| `project/`, `chats/` | The Claude Design handoff bundle (HTML prototypes and the design conversation) that `app/` was built from. Kept for reference. |

## Start here

- Run the web app: [`web/README.md`](web/README.md). Run `pnpm install && pnpm dev` in `web/`. No backend needed.
- What is built, what was retired per the website handoff, and why: [`web/docs/BLUEPRINT_TRACEABILITY.md`](web/docs/BLUEPRINT_TRACEABILITY.md)
- Content and decisions that only PCI Academy can supply, including the **domain checklist**: [`web/docs/HANDOFF.md`](web/docs/HANDOFF.md)

## Domain

The site is built for **pci.academy** (the domain is committed in `web/public/CNAME`, which the deploy workflow reads to build for the domain root). Going live needs two things only the owner can do: the GoDaddy DNS records and the GitHub *Settings → Pages → Custom domain* setting. The exact records and order are in [`web/README.md` → Custom domain](web/README.md#custom-domain-pciacademy-on-godaddy). `wrangler.jsonc` describes an optional Cloudflare Worker that can host the same build; GitHub Pages is the primary path.

## Workflows

| Workflow | Trigger | Does |
|---|---|---|
| `web-ci.yml` | Pull requests and pushes touching `web/` | Lint, typecheck, unit + SQL/RLS tests, migrations, seed drift check, Edge Function check and tests, build (same base path as production), end-to-end tests |
| `deploy.yml` | Push to `main` | Release gate, then builds for pci.academy (or `/pci-academy/` if `web/public/CNAME` is removed) and deploys `web/out` to GitHub Pages |
| `supabase-deploy.yml` | Manual | Applies migrations and seed, sets Edge Function secrets, deploys `pci-analyze` |
