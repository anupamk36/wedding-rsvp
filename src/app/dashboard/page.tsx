import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { ActionButton } from "@/components/forms";
import { ButtonLink, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { EVENT_TYPE_META, eventTypeKey } from "@/domain/event-types";
import { formatDateRange, formatDateTime } from "@/lib/dates";
import { archiveEventAction } from "@/server/actions/events";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listEventsForUser } from "@/server/modules/events";
import { getDashboardCards, type DashboardCard } from "@/server/modules/reporting";
import { EventCards, type EventCardView } from "./event-cards";

export const metadata: Metadata = { title: "Your events" };

export default function DashboardPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[1160px] flex-1 flex-col gap-7 px-4 pt-8 pb-16 sm:px-6 sm:pt-10">
        <Suspense fallback={<PageSkeleton />}>
          <EventList />
        </Suspense>
      </main>
    </>
  );
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Two or three facts that matter for this kind of event; zeros are left out. */
function facts(c: DashboardCard): string[] {
  if (!c.guestCount) return ["Add guests to start"];
  const key = eventTypeKey(c.eventType, c.availabilityMode);
  const list: (string | false)[] =
    c.availabilityMode
      ? [
          !!c.bestSlot && c.bestSlot.available > 0 && `Best: ${formatDateTime(c.bestSlot.startAt, c.timezone)}, ${c.bestSlot.available} available`,
          c.minParticipants != null && `Needs ${c.minParticipants}`,
          c.pendingPeople > 0 && `${c.pendingPeople} awaiting reply`,
        ]
      : key === "wedding"
        ? [
            c.roomNights > 0 && count(c.roomNights, "room-night"),
            c.pendingPeople > 0 && `${c.pendingPeople} awaiting reply`,
            c.lateChanges > 0 && count(c.lateChanges, "late change"),
          ]
        : key === "trip"
          ? [c.rooms > 0 && count(c.rooms, "room"), c.pickups > 0 && count(c.pickups, "pickup"), c.pendingPeople > 0 && `${c.pendingPeople} awaiting reply`]
          : [
              c.attendingPeople > 0 && `${c.attendingPeople} attending`,
              c.vegetarian > 0 && `${c.vegetarian} vegetarian`,
              c.plusOnes > 0 && count(c.plusOnes, "plus-one"),
              c.lateChanges > 0 && count(c.lateChanges, "late change"),
            ];
  const out = list.filter((x): x is string => !!x).slice(0, 3);
  return out.length ? out : c.pendingPeople ? [`${c.pendingPeople} awaiting reply`] : [];
}

function toView(c: DashboardCard): EventCardView {
  const typeKey = eventTypeKey(c.eventType, c.availabilityMode);
  const pct = c.invitedPeople ? Math.round((c.respondedPeople / c.invitedPeople) * 100) : 0;
  return {
    id: c.id,
    name: c.name,
    typeKey,
    typeLabel: c.availabilityMode && c.eventType === "sports" ? "Sports poll" : EVENT_TYPE_META[typeKey].label,
    live: c.status === "published",
    when: [formatDateRange(c.startDate, c.endDate, { year: false }), c.venueName].filter(Boolean).join(" · "),
    replied: c.invitedPeople ? `${c.respondedPeople} of ${count(c.invitedPeople, "person", "people")} replied` : c.guestCount ? "No invitations yet" : "No guests added yet",
    pct,
    facts: facts(c),
  };
}

async function EventList() {
  const user = await requireUser();
  const db = await getDb();
  const [cards, archived] = await Promise.all([getDashboardCards(db, user.id), listEventsForUser(db, user.id, { archived: true })]);

  return (
    <>
      <PageHeader
        title="Your events"
        description={
          cards.length
            ? `${count(cards.length, "event")}, all in one place. Each one keeps its own guests, questions and extras.`
            : "Weddings, birthdays, trips and games, each with its own guests, questions and extras."
        }
        actions={<ButtonLink href="/events/new">New event</ButtonLink>}
      />
      {cards.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Create your first event from a template — a multi-day wedding, a birthday, a trip or a game — then add guests and share the links."
          action={<ButtonLink href="/events/new">Create an event</ButtonLink>}
        />
      ) : (
        <EventCards events={cards.map(toView)} />
      )}
      {archived.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-3 text-sm font-semibold text-muted">Archived</h2>
          <ul className="divide-y divide-border rounded-[18px] border border-border bg-surface">
            {archived.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.name}</div>
                  <div className="text-xs text-muted">{formatDateRange(e.startDate, e.endDate)}</div>
                </div>
                {e.role === "owner" && <ActionButton action={archiveEventAction.bind(null, e.id, false)}>Restore</ActionButton>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
