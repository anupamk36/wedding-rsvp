# Known limitations and roadmap

## What was verified, and how

- 54 unit and integration tests (Vitest) cover the calculations, dates/timezones, CSV handling, edit policy, the full wedding journey, privacy between households, plus-one limits, revocation, late policy, version conflicts, concurrent submissions, capacity, imports, group eligibility, notifications (idempotency and retry), role-based access and exports. They were run against both PGlite and PostgreSQL 17.
- 4 Playwright end-to-end tests ran against a production build backed by PostgreSQL 17:
  - the full host → household RSVP → change → revoke journey, with axe accessibility checks on the guest and host pages
  - cross-event and signed-out access
  - a sports availability poll
  - a mobile viewport RSVP with a plus-one
- `scripts/bench.ts` on a local PostgreSQL with 2,000 guests, 500 households and 6 activities measured (at the service level, on a laptop):
  - RSVP submission: p95 ~12 ms
  - guest view: ~5 ms
  - dashboard summary: ~51 ms
  - meal report: ~57 ms

  These numbers are not measured in production and exclude network and hosting overhead.
- **Docker** (Docker 29, Compose v5):
  - The full stack builds and starts healthy. The migrate → app/worker ordering, seeding, and the hot-reloading `dev` service all work.
  - `npm run docker:test` passes: 54 integration tests on PostgreSQL 17 in a container, and 4 Playwright tests against the production image (5 consecutive runs with retries off).
- **Not verified:**
  - real email delivery through Resend (only the console provider and a test double were exercised)
  - deployment to any hosting platform or behind a TLS proxy
  - the GitHub Actions workflow (written but not yet run)

## Current limitations

- **Email is the only built-in channel.** WhatsApp sharing is manual: a prefilled `wa.me` link the host taps. There is no WhatsApp Business API integration and no delivery receipts (`delivered`/`failed` invitation states are reserved for that).
- **Reminders are manual.** Hosts can filter guests awaiting a reply and email them again, but there are no scheduled reminders.
- **Collaborators must already have an account.** There are no pending email invites for co-organizers.
- **No password reset email or account deletion flow yet.** Changing a password signs out all sessions (`changePassword` exists in `identity`, but has no UI).
- **One language (English) and the `en-IN` date format.**
- **The custom questions UI supports add and delete only, not reorder.** Answers are stored per invitation rather than per person.
- **Group eligibility applies per invitation.** If anyone in a household is in an eligible group, the whole household can answer that activity. Use a custom activity scope on the invitation to narrow it.
- **Aggregates are computed on read.** This is fast at the tested sizes. Events with tens of thousands of guests would need cached projections.
- **Operations collaborators** (for example caterers with restricted, shared reports) are not implemented. Share the CSV exports instead.
- **Organizations** tables exist, but there is no UI; events belong to individual users.
- **The cover image is a host-supplied HTTPS URL.** Guests' browsers load it directly from that host, and there is no upload or storage.
- **Retention is manual** (archive/delete). There is no scheduled purge.

## Roadmap (PRD phases 2–3)

1. Password reset and email verification, plus collaborator invitations by email.
2. Scheduled reminders that respect the RSVP deadline and an opt-out, with delivery status.
3. WhatsApp Business messaging through an approved provider (behind the existing notification adapter).
4. QR check-in using the existing per-guest identities.
5. Room inventory and capacity per property, and transport vehicle manifests with seat counts.
6. Per-person custom questions, question reordering, and conditional logic.
7. Multiple languages (Hindi first) and per-event locale.
8. Seating charts, budgets and vendor integrations; sports team balancing.
