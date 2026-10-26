# Deployment and operations

Gatherly is a standard Next.js 16 app with a PostgreSQL 15+ database. The primary packaging is the Docker image built from `Dockerfile` (see [Docker](#docker) below). It also runs on any Node.js 22+ host, including Vercel.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string. Use the provider's **pooled** URL on serverless hosts. |
| `DATABASE_SSL` | no | `true` to enable TLS without CA verification (some managed providers) |
| `APP_URL` | yes | Public origin, e.g. `https://rsvp.example.com`. Used in invitation links and emails. |
| `APP_SECRET` | yes | ≥ 32 random characters (`openssl rand -base64 48`). Encrypts stored invitation links. Keep it stable. If you rotate it, existing links still work for guests, but hosts must click **New link** before they can copy them again. |
| `EMAIL_PROVIDER` | no | `console` (default) or `resend` |
| `RESEND_API_KEY`, `EMAIL_FROM` | if Resend | `EMAIL_FROM` must be on a domain verified with the provider |
| `CRON_SECRET` | yes, for email | Protects `/api/jobs/notifications` |

In production the server refuses to start (`src/instrumentation.ts`) unless `DATABASE_URL`, `APP_URL` and an `APP_SECRET` of 32 or more characters are set. PGlite is for development only.

`APP_URL` decides two things:
- **Link address:** invitation links and emails use it. Set it to the address guests will actually open; `localhost` only works on the server machine itself.
- **Cookie security:** when it starts with `https://`, session cookies are `Secure` and use the `__Host-` prefix. A plain-`http` `APP_URL` (local Docker, LAN testing) uses a non-Secure cookie. Production must use `https://`.

## Release steps

```bash
npm ci
npm run db:migrate      # run once per release, before the new version takes traffic
npm run build
npm start               # or the platform's start command
```

Migrations in `drizzle/` only add to the schema. Commit them with the schema change (`npm run db:generate`). CI fails if `schema.ts` and `drizzle/` disagree.

### Vercel

1. Add a PostgreSQL database, for example Neon from the Vercel Marketplace, which sets `DATABASE_URL`. Set the remaining variables with `vercel env add`.
2. Set the build command to `npm run db:migrate && npm run build`, or run the migration from CI before deploying.
3. Schedule the notification worker. Vercel Cron calls `GET` with `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set:

   ```ts
   // vercel.ts
   import type { VercelConfig } from "@vercel/config/v1";
   export const config: VercelConfig = { crons: [{ path: "/api/jobs/notifications", schedule: "*/5 * * * *" }] };
   ```

   Emails are also sent right after a host clicks **Email selected**, through `after()`. The cron job sends whatever is still queued and retries failures.

## Docker

`Dockerfile` has two targets:

| Target | Image | Contents |
|---|---|---|
| `runner` | `gatherly-app` (~340 MB) | Next.js standalone server only. Runs as `node` (uid 1000) with a health check on `/api/health`, listening on `PORT`/`HOSTNAME` (3000 / 0.0.0.0). |
| `tools` | `gatherly-tools` | Full dependencies + source, for `npm run db:migrate`, `db:seed`, the notification worker, tests and the dev server |

`docker-compose.yml` runs `db` → `migrate` (one-shot) → `app` + `worker`. Each `docker compose up -d --build --wait` is a release: migrations apply before the new app starts. Configuration comes from `.env` (see `.env.example`).

```bash
docker compose up -d --build --wait     # release / start
docker compose logs -f app worker       # logs
docker compose run --rm migrate npm run db:seed
docker compose down                     # stop; `down -v` also deletes the database volume
```

### Production on a single host

1. Set `APP_URL=https://your-domain`, a strong `POSTGRES_PASSWORD`, `APP_SECRET`, `CRON_SECRET` and the email variables in `.env`.
2. Put a TLS-terminating reverse proxy in front of `app:3000` (Caddy, nginx, Traefik or a cloud load balancer). Have the proxy send `Strict-Transport-Security`; the image can't add HSTS itself because Next.js fixes headers at build time.
3. Don't publish the Postgres port beyond localhost (the compose file binds it to `127.0.0.1`). If the proxy runs as a container on the same network, remove the `app` port mapping too.
4. Back up the `pgdata` volume as described below.

**If you put the app behind a hostname that browsers resolve**, don't call it `app` or anything ending in `.app` unless you serve it over HTTPS. Chrome's HSTS preload list covers the whole `.app` TLD, so it forces HTTPS for those names. The test overlay uses the network alias `web` for this reason.

### Managed container platforms (Render, Fly.io, ECS, Cloud Run, Kubernetes)

- **App:** build and push the `runner` target (`docker build --target runner -t <registry>/gatherly-app .`).
- **Migrations:** run `docker build --target tools` with `npm run db:migrate` as a release or pre-deploy job.
- **Email worker:** run the notification worker as a scheduled job, either `npm run jobs:notifications` on the tools image or a call to `POST /api/jobs/notifications` with `Authorization: Bearer $CRON_SECRET`.
- **Health checks:** use `/api/health`.

### Testing in Docker

`npm run docker:test` (`scripts/docker-test.sh`) starts an isolated compose project, `gatherly-test`, whose database lives in tmpfs. It runs the Vitest suite against PostgreSQL, then Playwright (`mcr.microsoft.com/playwright:v1.64.1-noble`) against the production image, and tears everything down afterwards. CI runs the same script.

## Notifications

Jobs live in `notification_jobs` and each has a unique `idempotency_key`, so retries and double clicks never send twice. The worker claims jobs with `FOR UPDATE SKIP LOCKED` and retries failures with exponential backoff, up to 5 attempts. After that the job is marked `failed` and `last_error` holds the reason; failures appear on the event's Invitations page. Jobs that are stuck in `processing` for more than 10 minutes are released.

## Backups and recovery

- **Managed PostgreSQL:** turn on point-in-time recovery (most providers keep 7 days or more) and daily snapshots.
- **Self-hosted / Docker:** run nightly logical backups, and keep copies off the machine.

  ```bash
  docker compose exec -T db pg_dump --format=custom --no-owner -U gatherly gatherly > gatherly-$(date +%F).dump
  # outside Docker:
  pg_dump --format=custom --no-owner "$DATABASE_URL" > gatherly-$(date +%F).dump
  ```

- **Restore (Docker):** `docker compose exec -T db pg_restore --clean --if-exists --no-owner -U gatherly -d gatherly < gatherly-YYYY-MM-DD.dump`, then `docker compose up -d --wait`.
- **Restore (elsewhere)** into an empty database, then point `DATABASE_URL` at it:

  ```bash
  createdb gatherly_restore
  pg_restore --no-owner --dbname=postgres://…/gatherly_restore gatherly-YYYY-MM-DD.dump
  npm run db:migrate   # no-op if the dump is current
  ```

- Back up `APP_SECRET` together with the database. Without it, hosts can't copy the stored links again (guests' links keep working).
- Test a restore at least once before the event season.

## Data retention

Deleting an event from **Settings → Danger zone** permanently removes all of its guests, responses, logistics and audit entries (cascading foreign keys). Archiving hides an event and turns off its links, and can be undone. A suggested policy is to archive events 30 days after they end and delete them after 12 months; this is not automated yet. Sessions expire after 30 days. Rate-limit rows and sent notification jobs can be pruned at any time.

## Production checklist

- [ ] HTTPS only. `APP_URL` uses `https://`.
- [ ] `APP_SECRET` and `CRON_SECRET` are generated randomly and stored in the platform's secret manager.
- [ ] Database backups and PITR are on, and a restore has been tested.
- [ ] The email sending domain is verified (SPF/DKIM) if using Resend.
- [ ] The notification cron is scheduled.
- [ ] A TLS reverse proxy is in front of the container and sends HSTS (Docker deployments).
- [ ] `POSTGRES_PASSWORD` is changed from the default.
- [ ] Error tracking is in place. Unhandled errors are logged as `[api]` / `[action]` / `[notifications]`, without request bodies.
- [ ] Platform WAF or rate limiting is in front of `/i/*` and `/api/public/*`, in addition to the built-in per-IP limits.
