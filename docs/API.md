# REST API

All endpoints use JSON. Host endpoints authenticate with the session cookie set at sign-in. Requests that change data must be same-origin. Errors look like this:

```json
{ "error": { "code": "validation_error | unauthenticated | forbidden | not_found | conflict | rate_limited | rsvp_closed | internal_error", "message": "…", "details": … } }
```

Roles: **view** = owner, organizer or viewer. **manage** = owner or organizer. **admin** = owner. If you are not a member of an event, its endpoints return `404`.

## Events and activities

| Method & path | Role | Notes |
|---|---|---|
| `GET /api/events` | signed in | Events you belong to, with guest and response counts |
| `POST /api/events` | signed in | `{ name, eventType, timezone, startDate, endDate, venueName?, venueAddress?, rsvpDeadlineLocal?: "YYYY-MM-DDTHH:mm", useTemplate?: true }` |
| `GET /api/events/:eventId` | view | `{ event, role }` |
| `PATCH /api/events/:eventId` | admin | Any event fields, and/or `settings` (a partial patch, e.g. `{ "settings": { "features": { "transport": true } } }`) |
| `DELETE /api/events/:eventId` | admin | Archives the event. Permanent deletion is only available in the UI and requires typing the name. |
| `GET /api/events/:eventId/activities` | view | |
| `POST /api/events/:eventId/activities` | manage | `{ name, date, startTime, endTime?, venueName?, capacity?, attendanceRequested?, allowDecline?, eligibility: "all" \| "groups", eligibleGroupIds? }` (times are in the event timezone) |
| `PATCH /api/activities/:activityId` | manage | Same body as create |
| `DELETE /api/activities/:activityId` | manage | |

## Guests and invitations

| Method & path | Role | Notes |
|---|---|---|
| `GET /api/events/:eventId/guests?q&groupId&householdId&invited=yes\|no&response&cursor&limit` | view | `{ items, nextCursor }` (keyset pagination) |
| `POST /api/events/:eventId/guests` | manage | `{ name, email?, phone?, householdId?, relationship?, notes?, groupIds? }`. Duplicate email or phone in the same event returns `409`. |
| `POST /api/events/:eventId/guests/import` | manage | `{ text }`: CSV with a header (`name,email,phone,household,groups,relationship,notes`) or one `Name, email, phone` per line. Returns per-row `created \| merged \| error`. |
| `PATCH /api/guests/:guestId` / `DELETE` | manage | |
| `GET /api/events/:eventId/invitations` | view | Each item includes `url` (the personal link) |
| `POST /api/events/:eventId/invitations` | manage | `{ guestId }` or `{ householdId }`, plus optional `plusOnesAllowed`. Returns `409` if someone in it is already covered by another invitation. |
| `POST /api/invitations/:id/revoke` | manage | The link stops working, and the invitation's answers stop counting |
| `POST /api/invitations/:id/reissue` | manage | New link. Answers are kept and the old link stops working. |
| `GET /api/invitations/:id/response` | view | Response read model + history |
| `PUT /api/invitations/:id/response` | manage | Host edit (bypasses the deadline). Same body as the guest `PUT`. |

## Guest RSVP (token in the path)

These endpoints are rate-limited per IP. Unknown, revoked and expired tokens all return the same `404`.

| Method & path | Notes |
|---|---|
| `GET /api/public/invitations/:token` | Event details, invitation summary, and the activities this invitation may answer |
| `GET /api/public/invitations/:token/response` | The full current response for the people this invitation covers |
| `PUT /api/public/invitations/:token/response` | Creates or replaces the response (see the body below) |
| `DELETE /api/public/invitations/:token/response` | Withdraws the response. Body: `{ expectedVersion }`. |

```jsonc
{
  "expectedVersion": 0,                      // invitation.responseVersion from the last read; a stale value returns 409
  "people": [                                // existing people by id, new plus-ones as "new:<anything>"
    { "key": "<guestId>", "dietary": ["vegetarian"], "dietaryNotes": null, "accessibilityNeeds": null },
    { "key": "new:1", "name": "Ravi" }
  ],
  "attendance": [{ "personKey": "<guestId|new:1>", "activityId": "<uuid>", "status": "attending|maybe|not_attending" }],
  "accommodation": [{ "id": "<existing?>", "arrivalDate": "2026-11-21", "departureDate": "2026-11-24", "personKeys": ["…"], "roomCount": 1, "roomSharing": null, "notes": null }],
  "transport": [{ "direction": "arrival|departure|local", "travelDate": "2026-11-21", "travelTime": "14:20", "location": "BOM T2", "personKeys": ["…"], "notes": "AI 864" }],
  "mealOptOuts": [{ "personKey": "…", "mealId": "<uuid>" }],
  "answers": [{ "questionId": "<uuid>", "value": "…" }],
  "notes": "optional message to the hosts"
}
```

The response is `{ version, responseStatus, isLate, changes }`. People or activity pairs that are left out are stored as unanswered. Accommodation or transport requests that are missing from the list are cancelled (the record is kept).

## Reports

| Method & path | Role | Notes |
|---|---|---|
| `GET /api/events/:eventId/summary` | view | Totals, per-activity counts (confirmed/maybe/declined/unanswered/expected), availability slots, recent changes |
| `GET /api/events/:eventId/attendance?activityId&status&groupId&response&q` | view | The person-level rows behind every count (`status` also accepts `unanswered`) |
| `GET /api/events/:eventId/logistics/accommodation` | view | Requests, issues, totals: `guestNights`, `roomNights`, night-by-night figures, arrivals and departures |
| `GET /api/events/:eventId/logistics/meals` | view | Per meal: confirmed, tentative, dietary counts, special requests |
| `GET /api/events/:eventId/logistics/transport` | view | Requests, passengers per day, unassigned count |
| `GET /api/events/:eventId/export?kind=guests\|accommodation\|meals\|transport` | manage | Streamed CSV (UTF-8 with BOM, for Excel) |

## Operations

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/health` | none | Checks the database connection |
| `GET\|POST /api/jobs/notifications` | `Authorization: Bearer $CRON_SECRET` | Sends due notification jobs and returns `{ sent, failed }` |
