# Gatherly redesign: handoff

13 screens live in `screens/*.dc.html`. Each is a standalone HTML file. Open it in a browser to see it (the `<script src="./support.js">` line is a design-tool dependency and will 404; ignore it). **Treat the screens as visual spec, not code to copy.** Rebuild them in the existing Next.js + Tailwind components.

All names, dates and numbers in the screens are invented mock data.

## Rules for the build

- Keep behaviour, data model, server actions, REST API and tests unchanged unless a section below says otherwise.
- Keep dark mode. The screens are light only; derive dark values from the existing `:root` dark block in `src/app/globals.css`.
- Keep `.accent-*` per-event theming. The design reuses your amber, emerald and sky accents.
- Keep accessibility: real `<button>`/`<label>`/`<input>`, `aria-pressed` on pickers, 44px touch targets, selected states never rely on colour alone (a check glyph is added). Playwright axe checks must still pass.
- Do not ship the mock text. Every string must come from event data.

## Screen to code map

| Screen file | Replaces / lives in |
|---|---|
| `Landing.dc.html` | `src/app/page.tsx` |
| `Host-Events.dc.html` | `src/app/dashboard/page.tsx` |
| `Host-Overview.dc.html` | `src/app/events/[eventId]/page.tsx`, `layout.tsx`, `nav-links.tsx` |
| `Host-Accommodation.dc.html` | `src/app/events/[eventId]/accommodation/page.tsx` |
| `Main.dc.html` (wedding invitation), `Event-Trip`, `Event-Birthday`, `Poll-Sports` | `src/app/i/[token]/page.tsx` + `src/components/rsvp/invitation-hero.tsx` |
| `Guest-2-Events` | `rsvp-flow.tsx`: `ActivityCard`, `StatusPicker`, party chips |
| `Guest-3-Details` | `rsvp-flow.tsx`: `DetailsStep` |
| `Guest-4-Stay-Travel` | `rsvp-flow.tsx`: `TravelStep` |
| `Guest-5-Review` | `rsvp-flow.tsx`: `Summary` and the review step |
| `Guest-6-Confirmed` | `rsvp-flow.tsx`: the `!editing` / responded branch |

The `Event-*` and `Poll-Sports` screens show the same flow for other event types. The wedding screens are just the worked example.

## Design tokens

Light mode. Existing token to new value:

| Role | Now (`globals.css`) | Design |
|---|---|---|
| `--bg` | `#faf8f5` | `#FBF6EE` |
| `--surface` | `#ffffff` | `#FFFEFB` |
| `--surface-2` | `#f4f1ec` | `#F6EFE3` |
| `--border` | `#e7e1d8` | `#E8DFD2` |
| `--border-strong` | `#d6cec2` | `#D3C6B4` |
| `--text` | `#1f1a17` | `#241A1D` |
| `--muted` | `#6b635b` | `#5A4D4B` (darker, passes 4.5:1 on all grounds) |
| `--brand` | `#8b1e3f` | `#7C1D3E` |
| `--brand-soft` | `#f9e8ed` | `#F5E3E8` |
| `--success` / soft | `#17703a` / `#e6f4ea` | `#1B6B43` / `#E1F1E7` |
| `--warning` / soft | `#a35a06` / `#fdf2df` | `#8A4F00` / `#FBEACB` |
| `--info` / soft | `#1d4ed8` / `#e8eefc` | `#2F5597` / `#E6ECF7` |
| new `--marigold` | none | `#E8A33A` (decoration and the "maybe" bar fill only, never text) |
| new `--ink-deep` | none | `#5E1530` (cover backgrounds, nav wordmark) |

Event accents already in `globals.css` (`rose, amber, emerald, sky, violet, slate`) are kept. Screens use emerald `#046C4E`, amber `#92400E`, sky `#075985`.

Attendance colours, used consistently everywhere:
- Confirmed / Attending / Available: success green, solid fill when selected.
- Maybe / If needed: warning amber.
- Not attending / Unavailable: near-black `#3A2E30` when selected, grey `#8C7F7B` in bars.
- No answer: info blue-grey (`#E6ECF7`), always shown as "No answer", never as a decline.

Type: Fraunces (headings, numerals) + DM Sans (body, UI). Today the app loads Inter; switch the `next/font` import in the root layout and the `--font-sans` variable. Heading sizes: h1 28 to 36, card titles 19 to 22, body 15 to 16, captions 12.5 to 13.5. Radii: cards 16 to 18, buttons 12 to 14, pills 999. Page gutters 16 to 20 on phone, 24 to 40 on desktop.

## What is visual only

Everything in the guest flow except the items listed under "New behaviour" is a restyle of existing components with the same props and state. Same for the host overview table, stats, accommodation table and the landing page.

## New behaviour (needs real work)

1. **Per-activity "Answer person by person" toggle** (`Guest-2-Events`). Today `ActivityCard` decides `together` from `allowDecline` and party size. The design makes it user-controlled: a single "everyone" picker by default, expandable to per-person rows, and the "everyone" picker shows no selection when answers are mixed. The stored data is unchanged (still one answer per person per activity). Keep `allowDecline` behaviour as the default for the toggle.
2. **Live room-night summary** while filling in a stay (`Guest-4`): rooms x nights, shown as a green note. Pure client calculation; reuse `src/domain/calculations.ts` if it already exposes the maths.
3. **Blank-answer prompt on review** (`Guest-5`): list unanswered events with an "Answer now" link back to that step. Derived from existing `unansweredCount`.
4. **Add to calendar** on the confirmation screen (`Guest-6`): generate an `.ics` for the activities the household said "attending" to. This does not exist today.
5. **Needs your attention strip** (`Host-Overview`): three cards derived from data the page already loads: `s.totals.lateChanges`, `s.totals.invitationsPending`, `acc.totals.requestsWithoutRoomCount`. Hide any card at zero.
6. **Still to reply panel** (`Host-Overview`): a list of pending invitations with a per-row WhatsApp button (the prefilled `wa.me` link from `share-links.tsx`) and an "Email all" button wired to the existing re-send/remind flow. Cap the list at about 4 with a "See all" link to `/responses?response=pending`.
7. **Dashboard event cards** (`Host-Events`): each card needs reply progress and two or three type-specific facts. Check whether `dashboard/page.tsx` already has a summary query; if not, add one cheap aggregate rather than calling the full event summary per card.
8. **Event type on cards and landing templates**: derive from `eventType`; icon per type is in the landing source.
9. **Attendance bars** replace the numeric table on the overview. Keep the table's counts as text under each bar and keep every number a link to `/responses?activityId=...&status=...`. Add `role="img"` with an aria-label on each bar.

## Layout notes

- Guest flow is mobile first at 390px, single column, sticky bottom action bar (the existing `sticky bottom-0` bar, restyled).
- Progress is a 4-segment bar with labels: Events, Food, Stay & travel, Review. The existing steps are `party`, `activities`, `details`, `travel`, `review`; the design shows the party as chips at the top of the Events step. Keep the existing step logic. If `showParty` is true you may keep the separate party step or fold it in; folding is preferred.
- Host screens are fluid: sidebar 248px, content `flex: 999 1 560px`, stacks on phone.
- Invitation covers are event-type suggestions: the wedding uses a dark accent block with arch outlines, the trip a left-aligned accent block, the birthday a large numeral, the sports poll a pitch-line motif. In code, drive the cover from the accent plus the optional `coverImageUrl`, and treat these motifs as optional per-type decoration.

## Suggested order of work

1. Tokens + fonts in `globals.css` and the root layout.
2. `ui.tsx` primitives (Button, Card, Badge, Stat, inputs) to the new radii, colours and 44px targets.
3. Guest flow (`invitation-hero.tsx`, then `rsvp-flow.tsx` step by step), then run the Playwright mobile RSVP test.
4. Host overview, accommodation, dashboard.
5. Landing page.
