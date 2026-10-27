# Gatherly

Gatherly collects structured RSVPs and turns them into a plan. Hosts set up an event made of activities (ceremonies, meals, time slots). Each household or guest gets a private link, and everyone answers per activity, per person. The host dashboard then shows live headcounts, room-nights, meal counts and pickups.

It is built for multi-day Indian weddings first, but the same model also handles birthdays, trips, dinners and sports availability polls.

- **Guests** need no account or app. One person can answer for a whole household while every person is still counted individually. Guests can edit their answers until the deadline.
- **Hosts** see attendance for each activity (confirmed, maybe, declined and no answer are kept apart), a night-by-night accommodation view, meal counts with dietary breakdowns, transport requests, change history, late-change flags and CSV exports.
- **Co-organizers** can be added as organizers (manage) or viewers (read-only).

**Live:** https://wedding-rsvp-pi-inky.vercel.app, deployed on Vercel with Neon Postgres in Singapore. Every push to `main` deploys; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#vercel-current-production).

## Quick start (Docker)

Requirements: Docker with Compose v2.24 or newer.

```bash
cp .env.example .env            # then set APP_SECRET: openssl rand -base64 48
npm run docker:up               # = docker compose up -d --build --wait
npm run docker:seed             # optional: demo host + sample wedding
open http://localhost:3000
```

This runs four services:

| Service | Image | What it does |
|---|---|---|
| `db` | `postgres:17-alpine` | Database. Data is kept in the `pgdata` volume. Port 5432 is bound to 127.0.0.1 only. |
| `migrate` | `gatherly-tools` | Applies migrations, then exits. `app` and `worker` wait for it. |
| `app` | `gatherly-app` | Production web server (Next.js standalone, non-root, with a health check) on port 3000 |
| `worker` | `gatherly-tools` | Sends queued emails every minute |

For development with hot reload, run `npm run docker:dev` instead of `docker:up`. It mounts the source into the container.

The demo login is `demo@gatherly.test` / `demo-password-123`. Everything it creates is labelled `[Demo]`.

**Sharing invitation links with real guests.** Links are built from `APP_URL`. With the default `http://localhost:3000` they only open on your own computer. Set `APP_URL` to an address guests can reach, then run `npm run docker:up` again. Existing links pick up the new address automatically.
- Same Wi-Fi: use your machine's LAN address, e.g. `APP_URL=http://192.168.1.67:3000`.
- Anywhere: use your HTTPS domain or a tunnel.

### Without Docker

Node.js 22+ (24 recommended): `npm install && npm run dev`. Without `DATABASE_URL`, the app uses **PGlite**, an embedded PostgreSQL in `.data/pglite`. You can also point `DATABASE_URL` at the compose `db` service: `postgres://gatherly:gatherly@localhost:5432/gatherly`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development server, production build, production server |
| `npm run docker:up` / `docker:down` / `docker:logs` | Start, stop, or follow the logs of the Docker stack (`docker compose down -v` also deletes the database) |
| `npm run docker:dev` | Hot-reloading dev server in Docker |
| `npm run docker:seed` | Seed the Docker database with the demo event |
| `npm run docker:test` | The full suite in an isolated compose project: integration tests on PostgreSQL, then Playwright against the production image |
| `npm run check` | Lint, typecheck and run unit + integration tests |
| `npm test` | Vitest unit and integration tests (in-memory PGlite; set `TEST_DATABASE_URL` to use PostgreSQL) |
| `npm run test:e2e` | Playwright end-to-end tests (needs `npm run build`, `DATABASE_URL` and `APP_SECRET`) |
| `npm run db:generate` | Generate a SQL migration after changing `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Create the demo host and event |
| `npm run db:reset` | Drop and recreate the local database (refuses non-local URLs) |
| `npm run jobs:notifications` | Send queued emails once (for cron) |
| `npx tsx scripts/bench.ts 500` | Latency check on a 2,000-guest event (development databases only) |

## Project layout

```
src/
  app/                 Next.js App Router: pages, Server Actions wiring, REST route handlers (app/api)
  components/          UI primitives, forms, and the guest RSVP flow (components/rsvp)
  domain/              Pure logic: settings schema, event templates, attendance/stay/meal calculations
  lib/dates.ts         Timezone-safe date helpers shared by client and server
  server/
    db/                Drizzle schema and database connection (PostgreSQL or PGlite)
    modules/           Business logic: identity, access, events, guests, invitations, rsvp, logistics,
                       reporting, exports, notifications, audit, rate-limit
    actions/           Server Actions (thin wrappers around modules)
    http/              Shared handler code for the REST API
    adapters/email.ts  Email provider adapter (console / Resend)
drizzle/               SQL migrations
tests/                 unit/, integration/ (Vitest), e2e/ (Playwright)
docs/                  Architecture, API, deployment, limitations
```

## Documentation

- [Architecture and data model](docs/ARCHITECTURE.md)
- [REST API](docs/API.md)
- [Deployment, operations, backups](docs/DEPLOYMENT.md)
- [Known limitations and roadmap](docs/LIMITATIONS.md)
