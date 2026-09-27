# PCI Academy

Software for PCI Academy and the PCI Engine (Psycho-Creative Intelligence), an observational framework. The engine takes in material, separates it, compares it where the evidence allows, distinguishes evidence from interpretation, surfaces patterns and contradictions, and produces an observational report. Then it stops. It gives no advice, diagnosis, or verdict on who someone is.

| Directory | What it is |
|---|---|
| [`web/`](web/README.md) | **The PCI Web App**, built from the *Consolidated Blueprint & Implementation Roadmap* (canon 2026.09.25): Observe, Journal, Ledger, On the Contrary, Library and reader (with *The Art of Being* and the PCI Companion Articles), Academy, Relate, CMS, PWA, plus a Supabase backend and the Edge Function that runs the PCI Engine. GitHub Pages serves this. |
| [`app/`](app/) | The earlier Vite web app, wrapped as the native iOS app with Capacitor. See [`IOS_SUBMISSION.md`](IOS_SUBMISSION.md). |
| `project/`, `chats/` | The Claude Design handoff bundle (HTML prototypes and the design conversation) that `app/` was built from. Kept for reference. |

## Start here

- Run the web app: [`web/README.md`](web/README.md). Run `pnpm install && pnpm dev` in `web/`. No backend needed.
- What's built against the blueprint, and what isn't: [`web/docs/BLUEPRINT_TRACEABILITY.md`](web/docs/BLUEPRINT_TRACEABILITY.md)
- Content and decisions that only PCI Academy can supply: [`web/docs/HANDOFF.md`](web/docs/HANDOFF.md)

## Workflows

| Workflow | Trigger | Does |
|---|---|---|
| `web-ci.yml` | Pull requests and pushes touching `web/` | Lint, typecheck, unit + SQL/RLS tests, migrations, seed drift check, Edge Function check and tests, build, end-to-end tests |
| `deploy.yml` | Push to `main` | Release gate, then deploys `web/out` to GitHub Pages |
| `supabase-deploy.yml` | Manual | Applies migrations and seed, sets Edge Function secrets, deploys `pci-analyze` |
