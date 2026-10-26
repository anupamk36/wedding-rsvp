import { Suspense } from "react";
import { ActionButton, Disclosure } from "@/components/forms";
import { Badge, Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { formatDate, formatTime, utcToZoned } from "@/lib/dates";
import { deleteActivityAction, saveActivityAction } from "@/server/actions/events";
import { listActivities } from "@/server/modules/events";
import { listGroups } from "@/server/modules/guests";
import { getEventContext } from "../context";
import { ActivityForm } from "./activity-form";

export default function SchedulePage({ params }: PageProps<"/events/[eventId]/schedule">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Schedule params={params} />
    </Suspense>
  );
}

async function Schedule({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { db, event, settings, canManage } = await getEventContext(eventId);
  const [acts, groups] = await Promise.all([listActivities(db, eventId), listGroups(db, eventId)]);
  const slotMode = settings.availabilityMode;
  const byDate = new Map<string, typeof acts>();
  for (const a of acts) {
    const d = utcToZoned(a.startAt, event.timezone).date;
    byDate.set(d, [...(byDate.get(d) ?? []), a]);
  }
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  return (
    <>
      <PageHeader
        title={slotMode ? "Time slots" : "Schedule"}
        description={
          slotMode
            ? "Candidate times people can mark themselves available for. Nothing is picked automatically."
            : `Each activity gets its own RSVP. Times are in ${event.timezone}.`
        }
      />
      {canManage && (
        <Disclosure summary={slotMode ? "Add a time slot" : "Add an activity"} defaultOpen={acts.length === 0} className="mb-6">
          <ActivityForm
            action={saveActivityAction.bind(null, eventId, null)}
            groups={groups}
            minDate={event.startDate}
            maxDate={event.endDate}
            submitLabel={slotMode ? "Add slot" : "Add activity"}
            slotMode={slotMode}
          />
        </Disclosure>
      )}
      {acts.length === 0 ? (
        <EmptyState title="Nothing scheduled yet" description="Add the ceremonies, meals or time slots you'd like guests to respond to." />
      ) : (
        <div className="space-y-6">
          {[...byDate.entries()].map(([date, items]) => (
            <section key={date}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{formatDate(date)}</h2>
              <ul className="space-y-3">
                {items.map((a) => {
                  const local = utcToZoned(a.startAt, event.timezone);
                  return (
                    <li key={a.id}>
                      <Card>
                        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold">{a.name}</h3>
                              {!a.attendanceRequested && <Badge>Info only</Badge>}
                              {a.eligibility === "groups" && (
                                <Badge tone="brand">{a.eligibleGroupIds.map((id) => groupName.get(id)).filter(Boolean).join(", ")}</Badge>
                              )}
                              {a.capacity != null && <Badge tone="info">Capacity {a.capacity}</Badge>}
                              {!a.allowDecline && <Badge>One answer per party</Badge>}
                            </div>
                            <p className="mt-0.5 text-sm text-muted">
                              {formatTime(a.startAt, event.timezone)}
                              {a.endAt ? ` – ${formatTime(a.endAt, event.timezone)}` : ""}
                              {a.venueName ? ` · ${a.venueName}` : event.venueName ? ` · ${event.venueName}` : ""}
                            </p>
                            {a.description && <p className="mt-2 max-w-2xl text-sm">{a.description}</p>}
                          </div>
                          {canManage && (
                            <ActionButton
                              action={deleteActivityAction.bind(null, a.id)}
                              variant="ghost"
                              confirm={`Delete ${a.name}? Responses for it will be removed.`}
                            >
                              Delete
                            </ActionButton>
                          )}
                        </div>
                        {canManage && (
                          <details className="border-t border-border">
                            <summary className="cursor-pointer px-5 py-2 text-sm text-brand">Edit</summary>
                            <div className="px-5 pb-5">
                              <ActivityForm
                                action={saveActivityAction.bind(null, eventId, a.id)}
                                groups={groups}
                                minDate={event.startDate}
                                maxDate={event.endDate}
                                submitLabel="Save changes"
                                slotMode={slotMode}
                                defaults={{
                                  ...a,
                                  date: local.date,
                                  startTime: local.time,
                                  endTime: a.endAt ? utcToZoned(a.endAt, event.timezone).time : null,
                                }}
                              />
                            </div>
                          </details>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
