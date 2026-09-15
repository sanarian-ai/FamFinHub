# Family Finance Hub

Personal expense tracking, categorization, and insights for Sangeeth & Ria — replacing the
"Expense Tracking" Google Sheet. Full background/decisions: see the project's
`expense-tracker-plan.md` doc (Phases 1–5).

## Stack

Next.js 14.2.35 (App Router) · TypeScript · Tailwind CSS 3.4 · Prisma 6.19 · Recharts.
Deliberately pinned to these versions rather than the newest majors (see "Why these versions"
below) for stability while this is actively being built out.

Local dev uses SQLite (`prisma/dev.db`, gitignored). Production is meant to run on
**Vercel + Supabase Postgres** (per the plan doc's Phase 3 architecture decision) — swapping
the datasource is a small, well-defined step (below), not a rewrite.

## Getting started (local dev)

```bash
npm install
cp .env.example .env   # then fill in INGEST_API_KEY with your own secret
npx prisma generate
npx prisma db push               # creates prisma/dev.db from prisma/schema.prisma
python3 prisma/seed-data/build_seed_json.py   # re-run only if the source sheet changes
node prisma/seed-data/seed.js                 # loads the real historical data + mines category_rules
npm run dev
```

Then open http://localhost:3000 (or whatever port you pass to `next dev -p <port>`).

The seed script is **idempotent** — it clears and reloads all tables from
`prisma/seed-data/*.json` every time, so it's safe to re-run. `build_seed_json.py` re-derives
those JSON files from `/tmp/expense.xlsx` (the exported Google Sheet) — you only need to re-run
it if the source sheet changes; it is not part of the app's runtime.

## What's built (Phase 5)

| Screen | Route | Notes |
|---|---|---|
| Dashboard | `/` | Hero stats, needs-review banner, 12-month trend, nature breakdown, top movers, account split |
| Ledger | `/ledger` | Filters, inline + bulk categorization, pagination (13,655 active-account rows across 183 pages by default) |
| Review Queue | `/review` | 175 real needs_review rows grouped into 37 recurring patterns; "always categorize like this" creates a standing rule |
| Insights & Trends | `/insights` | YoY, category trend explorer, seasonality, account view, anomaly detection, CSV export |
| Mapping Admin | `/mapping`, `/mapping/rules`, `/mapping/accounts` | Nature→Type→Category tree with live counts, rules editor + test-string tool, accounts list |

Plus `POST /api/ingest` — the external contract for the future Claude-orchestrated Gmail
import (see plan doc section 8.6/8.7). Protected by a static `x-api-key` header checked against
`INGEST_API_KEY`. Not yet wired to an actual scheduled task — that's the next build step, once
Ria's email-forwarding is set up and the app is deployed somewhere the scheduled task can reach.

All data on every screen is the real migrated history (16,368 transactions, 2013–2026) —
nothing is mocked.

## Auth

Google OAuth (NextAuth v4), identity-only — no Gmail scope requested; that's entirely separate
from the Claude-orchestrated Gmail import, which never touches a browser session. Every page and
the CSV export are gated by `src/middleware.ts`; `/api/ingest` is deliberately excluded from that
gate since the scheduled import task calls it with no browser/cookie, and keeps using its own
static `x-api-key` check instead.

Sign-in is restricted to a hardcoded allowlist (`ALLOWED_EMAILS`, comma-separated) — not open
sign-up. An empty/unset allowlist fails closed (locks everyone out), not open.

**Setup** (both local dev and production need this):
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application.
2. Authorized redirect URI: `<your-url>/api/auth/callback/google` (add both
   `http://localhost:3000/api/auth/callback/google` for local dev and your real production URL).
3. Copy the client ID/secret into `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
4. Generate `NEXTAUTH_SECRET`: `openssl rand -base64 32`.
5. Set `NEXTAUTH_URL` to the app's own base URL (`http://localhost:3000` locally, the real
   deployed URL in production — Vercel env var).
6. Set `ALLOWED_EMAILS` to the Google accounts allowed to sign in.

## Known gaps / next steps (not yet built)

- **Split-transaction** (one line across multiple categories): explicitly deferred out of the
  Ledger screen's first pass.
- **The actual Gmail-orchestrated import task**: `/api/ingest` exists and is tested, but the
  Claude scheduled task that calls it (reading Gmail, parsing ICICI/SBI transaction emails,
  running LLM fallback categorization) hasn't been built yet — that plus the SBI email-format
  audit and Ria's forwarding setup are the carried-over Phase 3/5 risks.
- **Deployment**: still needs a Vercel account + a Supabase project (see below) — this has only
  run locally against SQLite so far.
- A few screens noted their own smaller simplifications in the build — see the plan doc's
  Phase 5 section for the full list per screen.

## Deploying: swapping SQLite → Supabase Postgres

1. Create a Supabase project, grab its Postgres connection string (use the *pooled* connection
   string for serverless — Vercel functions are short-lived).
2. In `prisma/schema.prisma`, change:
   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
3. Set `DATABASE_URL` in Vercel's project env vars to the Supabase pooled connection string.
   Set `INGEST_API_KEY` to a real secret (not the `dev-local-...` placeholder).
4. `npx prisma generate && npx prisma db push` against the new `DATABASE_URL` (or
   `npx prisma migrate deploy` if you'd rather track real migrations from here on — recommended
   once this is a production database you care about not losing).
5. Re-run the two seed steps (`build_seed_json.py` then `seed.js`) once, pointed at the
   production `DATABASE_URL`, to load the real historical data into Supabase. **This seed script
   is destructive (it clears tables first)** — only run it against Supabase once, on an empty
   database; don't re-run it after the app has live Gmail-imported data in it.
6. `vercel deploy` (or connect the repo in the Vercel dashboard for git-push deploys).

## Why these versions (not the latest)

`create-next-app@latest` scaffolded Next.js 16 + Tailwind v4 initially. Both introduce
breaking conventions from what's well-documented and battle-tested (Next 16's async
`searchParams`/`params`, new layout typing; Tailwind v4's CSS-first config). Given this is a
personal app meant to be reliably maintainable — including by future AI-assisted sessions —
everything was deliberately pinned back to Next 14.2.35 / React 18.3.1 / Tailwind 3.4.14,
versions with stable, well-known APIs. Nothing in this app's requirements needs the newer
majors. Prisma is similarly pinned to 6.19.3 rather than the 8.0 release line, which has moved
to a substantially different CLI/config model.
