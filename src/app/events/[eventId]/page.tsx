import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/forms";
import { Badge, ButtonLink, Card, CardHeader, cx, EmptyState, PageHeader, PageSkeleton, Stat, tableClass, TableWrap, tdClass, thClass } from "@/components/ui";
import { attendanceLabel } from "@/components/status";
import { formatDate, formatDateTime } from "@/lib/dates";
import { setEventStatusAction } from "@/server/actions/events";
import { getAccommodationReport, getEventSummary, getMealReport, getTransportReport } from "@/server/modules/reporting";
import type { ChangeEntry } from "@/server/modules/rsvp";
import { getEventContext } from "./context";

export default function OverviewPage({ params }: PageProps<"/events/[eventId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

function describeChange(c: ChangeEntry, availability: boolean): string {
  if (c.type === "attendance") {
    const to = c.to ? attendanceLabel(c.to, availability).toLowerCase() : "no answer";
    return c.from ? `${c.guest}: ${c.activity} → ${to}` : `${c.guest}: ${to} for ${c.activity}`;
  }
  if (c.type === "plus_one") return `${c.guest} ${c.change === "added" ? "added as a guest" : "removed"}`;
  return c.summary;
}

async function Overview({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const ctx = await getEventContext(eventId);
  const { db, user, event, settings, canManage, isOwner } = ctx;
  const s = await getEventSummary(db, user.id, eventId);
  const base = `/events/${eventId}`;
  const f = settings.features;
  const [acc, meals, transport] = await Promise.all([
    f.accommodation ? getAccommodationReport(db, user.id, eventId) : null,
    f.meals ? getMealReport(db, user.id, eventId) : null,
    f.transport ? getTransportReport(db, user.id, eventId) : null,
  ]);
  const availability = settings.availabilityMode;
  const steps = [
    { done: s.checklist.activities, label: availability ? "Add candidate time slots" : "Add activities to the schedule", href: `${base}/schedule` },
    { done: s.checklist.guests, label: "Add guests and households", href: `${base}/guests` },
    { done: s.checklist.invitations, label: "Create invitation links", href: `${base}/invitations` },
    { done: s.checklist.shared, label: "Share or send the invitations", href: `${base}/invitations` },
    { done: s.checklist.responses, label: "Watch responses arrive", href: `${base}/responses` },
  ];
  const showChecklist = steps.some((x) => !x.done);
  const dates = event.startDate === event.endDate ? formatDate(event.startDate) : `${formatDate(event.startDate, { year: undefined })} – ${formatDate(event.endDate)}`;

  return (
    <>
      <PageHeader
        title={event.name}
        description={`${dates}${event.venueName ? ` · ${event.venueName}` : ""}${
          event.rsvpDeadline ? ` · RSVP by ${formatDateTime(event.rsvpDeadline, event.timezone)}` : ""
        }`}
        actions={
          <>
            <ButtonLink href={`${base}/preview`} variant="secondary">
              Preview invitation
            </ButtonLink>
            {isOwner && !event.archivedAt && (
              <ActionButton
                size="md"
                variant={event.status === "published" ? "secondary" : "primary"}
                action={setEventStatusAction.bind(null, eventId, event.status === "published" ? "draft" : "published")}
              >
                {event.status === "published" ? "Mark as draft" : "Mark as live"}
              </ActionButton>
            )}
          </>
        }
      />

      {showChecklist && canManage && (
        <Card className="mb-6 p-5">
          <h2 className="font-semibold">Get set up</h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((step, i) => (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className={cx(
                    "flex h-full items-start gap-2 rounded-lg border p-3 text-sm",
                    step.done ? "border-border bg-surface-2 text-muted" : "border-border-strong hover:border-brand",
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      step.done ? "bg-success text-white" : "bg-brand-soft text-brand",
                    )}
                  >
                    {step.done ? "✓" : i + 1}
                  </span>
                  <span>
                    {step.label}
                    <span className="sr-only">{step.done ? " (done)" : ""}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Invited people" value={s.totals.invitedPeople} sub={s.totals.notInvited ? `${s.totals.notInvited} on the list without an invitation` : `${s.totals.invitations} invitations`} href={`${base}/guests`} />
        <Stat label="Responded" value={s.totals.respondedPeople} sub={`${s.totals.invitationsResponded} of ${s.totals.invitations} invitations`} tone="success" href={`${base}/responses?response=submitted`} />
        <Stat label="Awaiting reply" value={s.totals.pendingPeople} sub={`${s.totals.invitationsPending} invitations pending`} href={`${base}/responses?response=pending`} />
        <Stat
          label="Late changes"
          value={s.totals.lateChanges}
          sub={s.totals.lateChanges ? "Need your review" : "None to review"}
          tone={s.totals.lateChanges ? "warning" : undefined}
          href={`${base}/responses?late=1`}
        />
      </div>

      {availability && s.slots.length > 0 && (
        <Card className="mt-6" role="region" aria-label="Availability by slot">
          <CardHeader
            title="Availability by slot"
            description={
              settings.minParticipants
                ? `Ranked by availability. Slots need at least ${settings.minParticipants} available participants.`
                : "Ranked by availability. Nothing is chosen automatically."
            }
          />
          <ul className="divide-y divide-border">
            {s.slots.map((slot) => {
              const a = s.activities.find((x) => x.id === slot.activityId)!;
              const pct = Math.round(slot.availableShare * 100);
              return (
                <li key={slot.activityId} className="px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">{a.name}</span>
                      <span className="ml-2 text-sm text-muted">{formatDateTime(a.startAt, event.timezone)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm tabular">
                      <span className="font-semibold text-success">{slot.available} available</span>
                      <span className="text-warning">{slot.ifNeeded} if needed</span>
                      <span className="text-muted">{slot.unanswered} no answer</span>
                      {slot.meetsMinimum != null && <Badge tone={slot.meetsMinimum ? "success" : "neutral"}>{slot.meetsMinimum ? "Enough players" : "Below minimum"}</Badge>}
                    </div>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${pct}% of invited participants available`}>
                    <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader
          title={availability ? "Responses by slot" : "Attendance by activity"}
          description={
            s.lastUpdated
              ? `Updated live from responses · last change ${formatDateTime(s.lastUpdated, event.timezone)}. Select a number to see who.`
              : "Counts appear as guests respond. Select a number to see who."
          }
          actions={
            canManage ? (
              <ButtonLink href={`${base}/schedule`} variant="secondary" size="sm">
                Edit schedule
              </ButtonLink>
            ) : undefined
          }
        />
        {s.activities.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No activities yet" description="Add the functions or time slots guests should respond to." action={canManage ? <ButtonLink href={`${base}/schedule`}>Add activities</ButtonLink> : undefined} />
          </div>
        ) : (
          <TableWrap>
            <table className={tableClass}>
              <thead className="border-b border-border">
                <tr>
                  <th className={thClass}>Date</th>
                  <th className={thClass}>Activity</th>
                  <th className={cx(thClass, "text-right")}>{availability ? "Available" : "Confirmed"}</th>
                  <th className={cx(thClass, "text-right")}>{availability ? "If needed" : "Maybe"}</th>
                  <th className={cx(thClass, "text-right")}>{availability ? "Unavailable" : "Declined"}</th>
                  <th className={cx(thClass, "text-right")}>No answer</th>
                  {settings.showForecast && <th className={cx(thClass, "text-right")}>Forecast</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular">
                {s.activities.map((a) => {
                  const link = (status: string, n: number, cls: string) => (
                    <Link href={`${base}/responses?activityId=${a.id}&status=${status}`} className={cx("rounded px-1 hover:underline", cls)}>
                      {n}
                    </Link>
                  );
                  return (
                    <tr key={a.id}>
                      <td className={cx(tdClass, "whitespace-nowrap text-muted")}>{formatDate(a.date, { year: undefined })}</td>
                      <td className={tdClass}>
                        <span className="font-medium">{a.name}</span>
                        {a.capacity != null && (
                          <span className={cx("ml-2 text-xs", a.confirmed >= a.capacity ? "text-danger" : "text-muted")}>
                            {a.confirmed}/{a.capacity} places
                          </span>
                        )}
                      </td>
                      <td className={cx(tdClass, "text-right font-semibold")}>{link("attending", a.confirmed, "text-success")}</td>
                      <td className={cx(tdClass, "text-right")}>{link("maybe", a.tentative, "text-warning")}</td>
                      <td className={cx(tdClass, "text-right")}>{link("not_attending", a.declined, "text-muted")}</td>
                      <td className={cx(tdClass, "text-right")}>{link("unanswered", a.unanswered, "text-info")}</td>
                      {settings.showForecast && (
                        <td className={cx(tdClass, "text-right text-muted")} title={`Confirmed + ${Math.round(settings.tentativeWeight * 100)}% of maybes`}>
                          ~{a.expected}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
        {settings.showForecast && (
          <p className="border-t border-border px-5 py-2 text-xs text-muted">
            Forecast = confirmed + {Math.round(settings.tentativeWeight * 100)}% of maybes. It is an estimate, not a confirmed count.
          </p>
        )}
      </Card>

      {(acc || meals || transport) && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {acc && (
            <Stat
              label="Accommodation"
              value={`${acc.totals.roomNights} room-nights`}
              sub={`${acc.totals.guestNights} guest-nights · ${acc.awaiting} awaiting a room${acc.totals.requestsWithoutRoomCount ? ` · ${acc.totals.requestsWithoutRoomCount} without room count` : ""}`}
              href={`${base}/accommodation`}
            />
          )}
          {meals && (
            <Stat
              label="Meals"
              value={meals.meals.length ? `${meals.meals.reduce((n, m) => n + m.confirmed, 0)} servings` : "No meals"}
              sub={meals.meals.length ? `Across ${meals.meals.length} meals · ${meals.meals.reduce((n, m) => n + m.tentative, 0)} tentative` : "Add meals to estimate catering"}
              href={`${base}/meals`}
            />
          )}
          {transport && (
            <Stat
              label="Transport"
              value={`${transport.totals.passengers} passengers`}
              sub={`${transport.totals.requests} requests · ${transport.totals.unassigned} unassigned`}
              href={`${base}/transport`}
            />
          )}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title="Recent changes" />
        {s.recent.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No responses yet. New replies and changes will appear here.</p>
        ) : (
          <ul className="divide-y divide-border">
            {s.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <Link href={`${base}/responses/${r.invitationId}`} className="font-medium hover:underline">
                    {r.label}
                  </Link>
                  <span className="ml-2 text-sm text-muted">
                    {r.kind === "submitted" ? "responded" : r.kind === "withdrawn" ? "withdrew" : r.kind === "host_edit" ? "edited by host" : "updated"}
                  </span>
                  {r.isLate && <Badge tone="warning" className="ml-2">After deadline</Badge>}
                  {r.changes.length > 0 && (
                    <ul className="mt-1 text-sm text-muted">
                      {r.changes.slice(0, 4).map((c, i) => (
                        <li key={i}>{describeChange(c, availability)}</li>
                      ))}
                      {r.changes.length > 4 && <li>and {r.changes.length - 4} more</li>}
                    </ul>
                  )}
                </div>
                <time className="text-xs text-muted" dateTime={r.submittedAt.toISOString()}>
                  {formatDateTime(r.submittedAt, event.timezone)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
