import { Suspense } from "react";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Badge, buttonClass, Card, CardHeader, cx, EmptyState, Field, Input, PageHeader, PageSkeleton, Select, Stat, tableClass, TableWrap, tdClass, thClass } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { createAssignmentAction, setAssignmentStatusAction } from "@/server/actions/logistics";
import { getAccommodationReport } from "@/server/modules/reporting";
import { getEventContext } from "../context";

export default function AccommodationPage({ params }: PageProps<"/events/[eventId]/accommodation">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Accommodation params={params} />
    </Suspense>
  );
}

const short = (d: string) => formatDate(d, { year: undefined, weekday: undefined });

async function Accommodation({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { db, user, canManage } = await getEventContext(eventId);
  const r = await getAccommodationReport(db, user.id, eventId);
  const active = r.items.filter((i) => i.active);
  const other = r.items.filter((i) => !i.active);
  const dates = [...new Set([...Object.keys(r.totals.arrivals), ...Object.keys(r.totals.departures), ...r.totals.nights.map((n) => n.date)])].sort();

  return (
    <>
      <PageHeader
        title="Accommodation"
        description="Stay requests from guests. Requests become arrangements only when you assign and confirm a room — nothing is booked automatically."
        actions={
          <a href={`/api/events/${eventId}/export?kind=accommodation`} className={buttonClass("secondary")} download>
            Export CSV
          </a>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Room-nights requested"
          value={r.totals.roomNights}
          sub={r.totals.requestsWithoutRoomCount ? `+ ${r.totals.requestsWithoutRoomCount} request(s) without a room count` : "One room for one night"}
        />
        <Stat label="Guest-nights" value={r.totals.guestNights} sub={`${r.totals.distinctGuests} people staying`} />
        <Stat label="Awaiting a room" value={r.awaiting} tone={r.awaiting ? "warning" : undefined} />
        <Stat label="Confirmed room-nights" value={r.assignedRoomNights} tone="success" sub="From confirmed assignments" />
      </div>

      {dates.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Night by night" description="Nights are counted from check-in up to, not including, check-out." />
          <TableWrap>
            <table className={tableClass}>
              <thead className="border-b border-border">
                <tr>
                  <th className={thClass}>Date</th>
                  <th className={cx(thClass, "text-right")}>Arriving</th>
                  <th className={cx(thClass, "text-right")}>Departing</th>
                  <th className={cx(thClass, "text-right")}>Guests that night</th>
                  <th className={cx(thClass, "text-right")}>Rooms that night</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular">
                {dates.map((d) => {
                  const night = r.totals.nights.find((n) => n.date === d);
                  return (
                    <tr key={d}>
                      <td className={tdClass}>{formatDate(d, { year: undefined })}</td>
                      <td className={cx(tdClass, "text-right")}>{r.totals.arrivals[d] ?? 0}</td>
                      <td className={cx(tdClass, "text-right")}>{r.totals.departures[d] ?? 0}</td>
                      <td className={cx(tdClass, "text-right font-semibold")}>{night?.guests ?? 0}</td>
                      <td className={cx(tdClass, "text-right")}>
                        {night ? night.rooms : 0}
                        {night?.roomsUnknown && <span className="text-warning" title="Some requests didn't give a room count"> +?</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}

      {active.length === 0 ? (
        <EmptyState title="No stay requests yet" description="When guests ask for accommodation in their RSVP, the requests show up here." />
      ) : (
        <div className="space-y-3">
          {active.map((i) => (
            <Card key={i.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold">{i.label}</h3>
                  <p className="text-sm">
                    {short(i.arrivalDate)} → {short(i.departureDate)} · {i.nights} night{i.nights > 1 ? "s" : ""} · {i.people.length}{" "}
                    {i.people.length === 1 ? "person" : "people"} · {i.roomCountRequested ? `${i.roomCountRequested} room(s)` : "rooms not specified"}
                  </p>
                  <p className="text-sm text-muted">{i.people.map((p) => p.name).join(", ")}</p>
                  {i.roomSharingPreference && <p className="mt-1 text-sm">“{i.roomSharingPreference}”</p>}
                  {i.people.some((p) => p.accessibilityNeeds) && (
                    <p className="mt-1 text-sm text-info">Accessibility: {i.people.filter((p) => p.accessibilityNeeds).map((p) => `${p.name} — ${p.accessibilityNeeds}`).join("; ")}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {i.issues.map((issue) => (
                    <Badge key={issue} tone={issue.startsWith("Awaiting") ? "info" : "warning"}>
                      {issue}
                    </Badge>
                  ))}
                </div>
              </div>
              {i.assignments.length > 0 && (
                <ul className="mt-3 divide-y divide-border rounded-lg border border-border text-sm">
                  {i.assignments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span>
                        <span className="font-medium">{a.propertyName}</span>
                        {a.roomReference ? ` · ${a.roomReference}` : ""} · {short(a.checkInDate)} → {short(a.checkOutDate)}{" "}
                        <Badge tone={a.status === "confirmed" ? "success" : "neutral"}>{a.status === "confirmed" ? "Confirmed" : "Held"}</Badge>
                      </span>
                      {canManage && (
                        <span className="flex gap-1">
                          {a.status !== "confirmed" && <ActionButton action={setAssignmentStatusAction.bind(null, a.id, "confirmed")}>Confirm</ActionButton>}
                          <ActionButton action={setAssignmentStatusAction.bind(null, a.id, "cancelled")} variant="ghost" confirm="Cancel this room assignment?">
                            Cancel
                          </ActionButton>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canManage && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-brand">Assign a room</summary>
                  <ActionForm action={createAssignmentAction.bind(null, eventId)} resetOnSuccess className="mt-3 grid gap-3 space-y-0 sm:grid-cols-6 sm:items-end">
                    <input type="hidden" name="requestId" value={i.id} />
                    <Field label="Property" htmlFor={`p-${i.id}`} className="sm:col-span-2">
                      <Input id={`p-${i.id}`} name="propertyName" required maxLength={160} placeholder="Hotel name" />
                    </Field>
                    <Field label="Room" htmlFor={`r-${i.id}`}>
                      <Input id={`r-${i.id}`} name="roomReference" maxLength={80} placeholder="e.g. 204" />
                    </Field>
                    <Field label="Check-in" htmlFor={`ci-${i.id}`}>
                      <Input id={`ci-${i.id}`} name="checkInDate" type="date" required defaultValue={i.arrivalDate} />
                    </Field>
                    <Field label="Check-out" htmlFor={`co-${i.id}`}>
                      <Input id={`co-${i.id}`} name="checkOutDate" type="date" required defaultValue={i.departureDate} />
                    </Field>
                    <Field label="Status" htmlFor={`s-${i.id}`}>
                      <Select id={`s-${i.id}`} name="status" defaultValue="held">
                        <option value="held">Held</option>
                        <option value="confirmed">Confirmed</option>
                      </Select>
                    </Field>
                    <div className="sm:col-span-6 flex justify-end">
                      <SubmitButton variant="secondary">Save assignment</SubmitButton>
                    </div>
                  </ActionForm>
                </details>
              )}
            </Card>
          ))}
        </div>
      )}

      {other.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-muted">Cancelled requests</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {other.map((i) => (
              <li key={i.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5">
                <span>
                  {i.label} · {short(i.arrivalDate)} → {short(i.departureDate)}
                </span>
                {i.issues.length > 0 && <Badge tone="warning">{i.issues[0]}</Badge>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
