import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { ActionButton } from "@/components/forms";
import { Badge, ButtonLink, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { EVENT_TYPE_LABELS } from "@/domain/settings";
import { formatDate } from "@/lib/dates";
import { archiveEventAction } from "@/server/actions/events";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listEventsForUser } from "@/server/modules/events";

export const metadata: Metadata = { title: "Your events" };

export default function DashboardPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <Suspense fallback={<PageSkeleton />}>
          <EventList />
        </Suspense>
      </main>
    </>
  );
}

function dateRange(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatDate(start, { year: undefined })} – ${formatDate(end)}`;
}

async function EventList() {
  const user = await requireUser();
  const db = await getDb();
  const [active, archived] = await Promise.all([listEventsForUser(db, user.id), listEventsForUser(db, user.id, { archived: true })]);

  return (
    <>
      <PageHeader
        title={`Hi ${user.name.split(" ")[0]}`}
        description="Your events and how responses are coming along."
        actions={<ButtonLink href="/events/new">New event</ButtonLink>}
      />
      {active.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Create your first event from a template — a multi-day wedding, a birthday, a trip or a game — then add guests and share the links."
          action={<ButtonLink href="/events/new">Create an event</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {active.map((e) => {
            const pct = e.invitationCount ? Math.round((e.respondedCount / e.invitationCount) * 100) : 0;
            return (
              <li key={e.id}>
                <Link
                  href={`/events/${e.id}`}
                  className="block rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{e.name}</h2>
                      <p className="mt-0.5 text-sm text-muted">{dateRange(e.startDate, e.endDate)}</p>
                    </div>
                    <Badge tone={e.status === "published" ? "success" : "neutral"}>{e.status === "published" ? "Live" : "Draft"}</Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    {EVENT_TYPE_LABELS[e.eventType]}
                    {e.venueName ? ` · ${e.venueName}` : ""}
                    {e.role !== "owner" ? ` · ${e.role}` : ""}
                  </p>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-muted">
                      <span>
                        {e.guestCount} guest{e.guestCount === 1 ? "" : "s"} · {e.respondedCount}/{e.invitationCount} invitations answered
                      </span>
                      <span className="tabular">{pct}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" role="presentation">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {archived.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-muted">Archived</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {archived.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.name}</div>
                  <div className="text-xs text-muted">{dateRange(e.startDate, e.endDate)}</div>
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
