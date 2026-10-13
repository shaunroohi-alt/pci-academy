# Music and Arts (working name)

Website and back office for a piano business with two public sections and one staff area:

1. **Piano technician services** (`/piano-services`): Regular Tuning, Tuning + Regulation, Full Package, and **Quote Me Up**, a flat $30 on-site diagnostic visit that ends in a written offer. Customers request appointments at `/piano-services/book`. The same section carries **We buy your piano** (`/piano-services/sell`).
2. **Piano marketplace** (`/pianos`): pianos we bought and had checked, listed at the buy price plus a configurable markup. Buyers register interest in a specific piano or in general ("piano wanted"). Staff match sellers to buyers and record each **deal** with its margin.
3. **Music lessons for kids** (`/lessons`): Classical Piano, Pop Piano, Music Theory, Songwriting & Composition, with lesson packages (trial, 4 × 30, 4 × 45, 4 × 60, 8 × 45 per month). Parents enquire at `/lessons/enroll`.

The staff area at `/admin` (password protected) shows every appointment, seller submission, buyer, deal and lesson enquiry, lets staff change statuses and add notes, price and publish pianos, create deals, and edit all prices and the markup percentage. Prices that have not been decided yet are left blank and show as "to be announced" on the site.

## Stack

Next.js 16 (App Router, server actions), React 19, Tailwind CSS 4, PostgreSQL via `pg`, Zod for validation, Playwright for end-to-end tests. No ORM: the schema lives in plain SQL under `db/migrations/` and is applied automatically when the server starts (and by `pnpm db:migrate`).

## Run locally

```bash
cd music-and-arts
pnpm install
cp .env.example .env        # point DATABASE_URL at a Postgres database
pnpm db:migrate             # creates the tables and seeds the catalogue
pnpm dev                    # http://localhost:3000
```

Set `ADMIN_PASSWORD` in `.env` to use `/admin`.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
ADMIN_PASSWORD=e2e-secret pnpm test:e2e   # needs DATABASE_URL and a built app
```

The end-to-end suite submits every public form, logs in to the admin, prices and publishes a piano, verifies it on the public page, records buyer interest, creates a deal and edits a price. Set `PW_CHROMIUM_PATH` to use a preinstalled Chromium instead of downloading one.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (required) |
| `DATABASE_SSL` | `true` to connect over TLS without verifying the certificate (public database proxies) |
| `ADMIN_PASSWORD` | Password for `/admin` (required for the staff area) |
| `ADMIN_SESSION_SECRET` | Optional secret for signing the admin cookie; defaults to the password |
| `NEXT_PUBLIC_SITE_NAME` | Business name shown everywhere. The name is a working name and will change, so change it here. |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL used in metadata |
| `AUTO_MIGRATE` | `false` to skip running migrations at server start |

## Deployment

Deployed on Railway: a `web` service built from this directory (root directory `/music-and-arts`) plus a Railway Postgres service, with `DATABASE_URL` referenced as `${{Postgres.DATABASE_URL}}`. Pushing to the connected branch redeploys. Migrations run on boot, guarded by a Postgres advisory lock so multiple replicas are safe.

## Data model

| Table | Holds |
|---|---|
| `services` | The four technician services, prices in cents (`NULL` = to be announced) |
| `appointments` | Booking requests with status `requested → confirmed → completed / cancelled` |
| `piano_listings` | Seller submissions; status `new → reviewing → offer_made → listed → sold / declined`; `buy_price_cents` and `list_price_cents` set by staff |
| `buyer_interests` | Buyers, linked to a listing or general; status `new → contacted → matched → closed` |
| `deals` | Listing + buyer + buy price + markup % + sale price; status `proposed → agreed → paid → delivered / cancelled` |
| `programs`, `lesson_packages` | The tutoring catalogue, prices in cents |
| `lesson_inquiries` | Enrolment enquiries; status `new → contacted → trial_booked → enrolled / closed` |
| `settings` | `marketplace_markup_percent` (default 15), service area note, contact details |

## Still to decide (business inputs)

- Prices for Regular Tuning, Tuning + Regulation, Full Package, and every lesson package. Enter them in `/admin/settings`.
- The final business name, contact email, phone and service area.
- Whether to send email notifications on new submissions (there is no email provider wired up yet; everything lands in `/admin`).
- Whether to take payment online (no payments are collected; the $30 Quote Me Up fee is paid at the visit).
- Photo uploads for sellers: today sellers paste photo links. A file upload needs object storage.
