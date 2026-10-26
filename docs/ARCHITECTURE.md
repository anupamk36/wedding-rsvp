# Architecture

Gatherly is a **modular monolith**: one Next.js 16 application (App Router, React 19, TypeScript) on top of PostgreSQL, with Drizzle as the ORM and migration tool. Splitting it into services would only add consistency problems. Responses, attendance and logistics have to change together in one transaction, and the dashboards read the same normalized tables.

```
Browser (host UI, guest RSVP)
   │  Server Components (reads) · Server Actions (host mutations) · REST /api (guest RSVP, integrations)
   ▼
src/server/modules/*   ← every business rule and authorization check lives here
   │
   ▼
PostgreSQL (source of truth)  ── aggregates computed on read by src/domain/calculations.ts
   │
   └─ notification_jobs ──► worker (after(), cron endpoint or script) ──► email adapter
```

There is a single business layer. Pages, Server Actions and REST route handlers are thin transports that call the same module functions, and each of those functions checks authorization itself. Nothing relies on the UI hiding a button.

## Modules (`src/server/modules`)

| Module | Responsibility |
|---|---|
| `identity` | Sign-up, login (Argon2id), database sessions (SHA-256 of the token stored; raw token only in an `httpOnly` cookie) |
| `access` | `requireEventAccess(user, event, view \| manage \| admin)`. Returns 404 rather than 403 to non-members so event IDs can't be probed. |
| `events` | Events, templates, settings, collaborators, activities, duplication, archive/delete |
| `guests` | Guests, households, groups, CSV/paste import with deduplication and per-row errors, cursor pagination |
| `invitations` | Token issue/rotate/revoke, the scope of who each invitation covers, automatic activity permissions |
| `rsvp` | Guest read model and the transactional `submitResponse` (versioning, scope, capacity, deadline policy, logistics, history) |
| `logistics` | Meals and counting rules, host meal overrides, room assignments, transport status, custom questions |
| `reporting` | Summary, activity matrix, attendee drill-down, accommodation/meal/transport reports |
| `exports` | Streaming CSV (keyset-paginated, protected against formula injection) |
| `notifications` | Idempotent job queue, `SKIP LOCKED` worker, retries with backoff |
| `audit` | Append-only log of host and guest actions (IDs and counts, not contact details) |
| `rate-limit` | Fixed-window counters in PostgreSQL, so limits hold across instances. Keys are hashed. |

## Key domain rules

- **Attendance is stored per person per activity** (`activity_attendance`, unique on `(activity_id, guest_id)`). A missing row means *unanswered*, never *declined*.
- **Each person is counted once.** Partial unique indexes allow at most one active invitation per guest and per household, and the service rejects any invitation that would cover someone a second time. Every count is computed over distinct guest IDs, and only for guests whose active invitation is permitted to answer that activity. Revoking an invitation therefore removes its answers from the totals without deleting them.
- **Invitation scope** = the invited guest, or the members of the invited household, plus the plus-ones added through that invitation (`invitationScopeSql`). Anyone with the link can edit the people in scope and nobody else.
- **Activity permissions** (`invitation_activity_permissions`) are recomputed by set-based SQL whenever groups, memberships or activity eligibility change (`syncAutoPermissions`). A host can switch a single invitation to a custom list of activities.
- **Accommodation** stays are half-open intervals (arrival inclusive, departure exclusive). Guest-nights count distinct (guest, night) pairs. Room-nights are rooms × nights, and requests without a room count are reported separately. Requests (from guests) are kept apart from assignments (by hosts; `held` → `confirmed`). If a guest changes a request after a room has been assigned, the request is flagged.
- **Meals** are counted by rule: `activity` counts attendees of any linked activity once each, `overnight` counts people staying the night before, and `manual` counts only explicit opt-ins. Guest opt-outs and host overrides are applied afterwards. Dietary tags can be combined, so someone can count as both vegetarian and gluten-free.
- **Forecast** (optional) = confirmed + maybe × weight. It is always labelled as an estimate, and unanswered guests are never weighted.
- **Availability mode** reuses activities as candidate slots and relabels the statuses as available, if needed and unavailable. Slots are ranked, but no winner is picked automatically.

## RSVP submission (`submitResponse`)

Everything below runs in one transaction:

1. `SELECT … FOR UPDATE` on the invitation, then compare `expectedVersion` with `response_version` (a mismatch returns **409**, so two edits never silently overwrite each other).
2. Recheck that the invitation is not revoked and the event is not archived, then apply the deadline policy (`reject`, or `accept_flag`, which sets `has_late_changes`). Hosts bypass the deadline.
3. Resolve people: existing scope members by ID, plus new plus-ones (`new:*` keys) up to `plus_ones_allowed`. Plus-ones that were removed are deleted.
4. Validate attendance against the permitted activities, `allowMaybe`, and party-wide answers when `allowDecline = false`. Lock any capacity-limited activity row and count seats held by other parties.
5. Replace attendance, apply accommodation/transport changes (cancelled requests are kept for the record), meal opt-outs, custom answers and dietary or accessibility details.
6. Insert a `response_submissions` row with the version, a snapshot and a human-readable diff. Bump the invitation version and status, write the audit entry, and enqueue notifications using idempotency keys.

Emails are sent after the transaction commits, so a failing email provider can never roll back a saved RSVP.

## Data model

The tables follow PRD §10, with these refinements:

| PRD | Implementation | Why |
|---|---|---|
| `household_members` table | `guests.household_id` + `guests.relationship` | A guest belongs to at most one household within an event, so an extra join table added nothing |
| `event_attendees` | `guests` (plus-ones are guests with `plus_one_of_invitation_id`) | One stable identity per person per event |
| `logistics_requests` (generic JSON) | Typed `accommodation_requests` / `transport_requests` with guest join tables, `meal_definitions` + `meal_activity_links` + `meal_overrides` | These are queried most often, so typed columns were chosen, as PRD §10 suggests |
| `meal_requirements` | Derived at read time from rules + `meal_overrides` | Counts can't drift out of sync with attendance |
| Invitation token hash only | `token_hash` (SHA-256, for lookup) **and** `token_ciphertext` (AES-256-GCM, for hosts) | Hosts need to copy links again to share them on WhatsApp. A database leak alone does not expose usable links without `APP_SECRET`. |
| — | `event_members` | Event-level roles (owner/organizer/viewer). `organizations` tables exist for future use. |
| — | `rate_limits`, `sessions` | Infrastructure tables |

Identifiers are UUIDs. Timestamps are `timestamptz` (UTC). Calendar dates (`start_date`, stays, meals) are SQL `date` stored as `YYYY-MM-DD` strings in the event's timezone. Activity times are entered in the event timezone and converted with `zonedToUtc`, which handles daylight-saving changes.

## Rendering model

Next.js 16 runs with **Cache Components** and **partial prefetching**. Pages render a static shell, and anything that reads the request (session cookie, params, database) streams in behind `<Suspense>`. The session helper calls `connection()`, so session checks only run at request time. No authenticated data is cached across users. After a Server Action changes data, it calls `refresh()`.

`src/proxy.ts` only checks whether a session cookie is present, so it can redirect signed-out visitors early. The real authorization check happens in the modules.

## Security summary

- Argon2id passwords, with constant-time handling when the email is unknown. Sessions are database-backed and stored hashed, in an `httpOnly` `SameSite=Lax` cookie (`__Host-` prefixed in production). Login and sign-up are rate-limited by IP and by email.
- Invitation tokens are 256-bit, sent with `Referrer-Policy: no-referrer`, marked `noindex` and `no-store`. Failed token lookups get a stricter rate limit.
- CSRF: Server Actions have Next.js's built-in origin check. REST routes that change data reject cross-site requests by checking `Origin` and `Sec-Fetch-Site`.
- Every query is scoped by event. Event IDs are checked against membership, and child IDs (activity, guest, group) are re-checked against the event.
- Zod validates every input. Errors returned to clients never contain stack traces. CSV exports neutralize formulas and are restricted to owners and organizers.
- Security headers include HSTS (when built with an `https://` `APP_URL`; in Docker the TLS proxy sends it), `nosniff`, `frame-ancestors` via `X-Frame-Options: DENY`, and a Permissions-Policy.
