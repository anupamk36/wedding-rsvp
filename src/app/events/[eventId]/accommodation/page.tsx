import Link from "next/link";
import { Suspense } from "react";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Badge, buttonClass, Card, cx, EmptyState, Eyebrow, Field, Input, PageHeader, PageSkeleton, Select, tableClass, TableWrap, tdClass, thClass } from "@/components/ui";
import { formatDate, formatDateRange } from "@/lib/dates";
import { createAssignmentAction, setAssignmentStatusAction } from "@/server/actions/logistics";
import { getAccommodationReport } from "@/server/modules/reporting";
import { getEventContext } from "../context";

export default function AccommodationPage({ params, searchParams }: PageProps<"/events/[eventId]/accommodation">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Accommodation params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const short = (d: string) => formatDate(d, { year: undefined, weekday: undefined });
const dayLabel = (d: string) => formatDate(d, { year: undefined, month: undefined });

type Report = Awaited<ReturnType<typeof getAccommodationReport>>;
type Item = Report["items"][number];

const FILTERS = {
  all: { label: "All", test: () => true },
  awaiting: { label: "Awaiting a room", test: (i: Item) => i.assignments.length === 0 },
  nocount: { label: "No room count", test: (i: Item) => i.roomCountRequested == null },
  confirmed: { label: "Confirmed", test: (i: Item) => i.assignments.some((a) => a.status === "confirmed") },
} as const;
type Filter = keyof typeof FILTERS;

function status(i: Item): { label: string; cls: string } {
  if (i.assignments.some((a) => a.status === "confirmed")) return { label: "Confirmed", cls: "bg-success-soft text-success-ink" };
  if (i.assignments.length) return { label: "Room held", cls: "bg-info-soft text-info-ink" };
  if (i.roomCountRequested == null) return { label: "No room count", cls: "bg-brand-soft text-brand-ink" };
  return { label: "Awaiting a room", cls: "bg-warning-soft text-warning-ink" };
}

/** Issues the status pill doesn't already say. */
const extraIssues = (i: Item) => i.issues.filter((x) => x !== "Room count not specified" && x !== "Awaiting room assignment");

async function Accommodation({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { eventId } = await params;
  const show = (await searchParams).show;
  const filter: Filter = typeof show === "string" && show in FILTERS ? (show as Filter) : "all";
  const { db, user, canManage } = await getEventContext(eventId);
  const r = await getAccommodationReport(db, user.id, eventId);
  const active = r.items.filter((i) => i.active);
  const other = r.items.filter((i) => !i.active);
  const shown = active.filter(FILTERS[filter].test);
  const nights = [...r.totals.nights].sort((a, b) => a.date.localeCompare(b.date));
  const maxRooms = Math.max(1, ...nights.map((n) => n.rooms));
  const peak = nights.reduce<(typeof nights)[number] | null>((best, n) => (!best || n.rooms > best.rooms ? n : best), null);
  const dates = [...new Set([...Object.keys(r.totals.arrivals), ...Object.keys(r.totals.departures), ...nights.map((n) => n.date)])].sort();
  const base = `/events/${eventId}/accommodation`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accommodation"
        description="Room-nights are counted from what guests asked for. Nothing is booked until you assign and confirm a room."
        actions={
          <a href={`/api/events/${eventId}/export?kind=accommodation`} className={buttonClass("secondary")} download>
            Export CSV
          </a>
        }
      />

      {nights.length > 0 && (
        <Card className="flex flex-col gap-[18px] p-5 sm:p-[22px]" role="region" aria-labelledby="nights-h">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <Eyebrow as="h2">
              <span id="nights-h">Rooms needed, night by night</span>
            </Eyebrow>
            <span className="text-sm text-muted">
              <strong className="font-display text-[22px] font-semibold text-text">{r.totals.roomNights}</strong> room-nights · {r.totals.guestNights} guest-nights
              {r.totals.requestsWithoutRoomCount > 0 && ` · plus ${r.totals.requestsWithoutRoomCount} without a room count`}
            </span>
          </div>
          <ol className="grid auto-cols-[minmax(64px,1fr)] grid-flow-col items-end gap-4 overflow-x-auto pb-1">
            {nights.map((n) => (
              <li key={n.date} className="flex flex-col gap-2">
                <div className="flex h-[190px] flex-col justify-end border-b-2 border-border-strong">
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-display text-[26px] leading-none font-semibold tabular">
                      {n.rooms}
                      {n.roomsUnknown && (
                        <span className="text-base text-warning-ink" title="Some requests didn't give a room count">
                          +?
                        </span>
                      )}
                      <span className="sr-only"> rooms</span>
                    </span>
                    <div className="w-full max-w-[120px] rounded-t-[10px] bg-brand" style={{ height: `${Math.max(4, Math.round((n.rooms / maxRooms) * 120))}px` }} />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-0.5 text-center">
                  <span className="text-[14.5px] font-bold">{dayLabel(n.date)}</span>
                  <span className="text-[12.5px] text-muted">{n.guests} guests</span>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-[13.5px] text-muted">
            Rooms per night, {formatDateRange(nights[0]!.date, nights[nights.length - 1]!.date, { weekday: false, year: false })}.
            {peak && nights.some((n) => n.rooms < peak.rooms) ? ` Busiest night is ${formatDate(peak.date, { weekday: "long", day: undefined, month: undefined, year: undefined })} ${short(peak.date)}.` : ""} Nights
            count from check-in up to, not including, check-out. {r.totals.distinctGuests} people staying · {r.assignedRoomNights} room-nights confirmed.
          </p>
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-brand [&::-webkit-details-marker]:hidden">
              Arrivals and departures by day
              <span aria-hidden className="transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="mt-2 overflow-hidden rounded-xl border border-border">
              <TableWrap>
                <table className={tableClass}>
                  <thead>
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
                      const night = nights.find((n) => n.date === d);
                      return (
                        <tr key={d}>
                          <td className={tdClass}>{formatDate(d, { year: undefined })}</td>
                          <td className={cx(tdClass, "text-right")}>{r.totals.arrivals[d] ?? 0}</td>
                          <td className={cx(tdClass, "text-right")}>{r.totals.departures[d] ?? 0}</td>
                          <td className={cx(tdClass, "text-right font-semibold")}>{night?.guests ?? 0}</td>
                          <td className={cx(tdClass, "text-right")}>
                            {night ? night.rooms : 0}
                            {night?.roomsUnknown && <span className="text-warning-ink"> +?</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </details>
        </Card>
      )}

      {active.length === 0 ? (
        <EmptyState title="No stay requests yet" description="When guests ask for accommodation in their RSVP, the requests show up here." />
      ) : (
        <Card className="overflow-hidden" role="region" aria-labelledby="req-h">
          <div className="flex flex-col gap-4 p-5 sm:p-[22px]">
            <Eyebrow as="h2">
              <span id="req-h">Stay requests</span>
            </Eyebrow>
            <div role="group" aria-label="Filter stay requests" className="flex flex-wrap gap-2">
              {(Object.keys(FILTERS) as Filter[]).map((key) => {
                const on = key === filter;
                return (
                  <Link
                    key={key}
                    href={key === "all" ? base : `${base}?show=${key}`}
                    aria-current={on ? "true" : undefined}
                    scroll={false}
                    className={cx(
                      "inline-flex h-11 items-center gap-1.5 rounded-full border-[1.5px] px-4 text-sm font-semibold",
                      on ? "border-brand bg-brand text-brand-contrast" : "border-border-strong bg-surface text-text hover:border-brand",
                    )}
                  >
                    {FILTERS[key].label}
                    <span className={cx("tabular", on ? "opacity-85" : "text-muted")}>{active.filter(FILTERS[key].test).length}</span>
                  </Link>
                );
              })}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="border-t border-border px-5 py-6 text-sm text-muted sm:px-[22px]">No stay requests match this filter.</p>
          ) : (
            <div className="overflow-x-auto border-t border-border">
              <table className={cx(tableClass, "min-w-[640px]")}>
                <thead>
                  <tr>
                    <th scope="col" className={thClass}>Guest</th>
                    <th scope="col" className={thClass}>People</th>
                    <th scope="col" className={thClass}>Stay</th>
                    <th scope="col" className={thClass}>Rooms</th>
                    <th scope="col" className={thClass}>Status</th>
                  </tr>
                </thead>
                {shown.map((i) => (
                  <RequestRows key={i.id} item={i} eventId={eventId} canManage={canManage} />
                ))}
              </table>
            </div>
          )}
        </Card>
      )}

      {other.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">Cancelled requests</h2>
          <ul className="divide-y divide-border rounded-[18px] border border-border bg-surface text-sm">
            {other.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                <span>
                  {i.label} · {short(i.arrivalDate)} → {short(i.departureDate)}
                </span>
                {i.issues.length > 0 && <Badge tone="warning">{i.issues[0]}</Badge>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RequestRows({ item: i, eventId, canManage }: { item: Item; eventId: string; canManage: boolean }) {
  const st = status(i);
  const issues = extraIssues(i);
  const access = i.people.filter((p) => p.accessibilityNeeds);
  return (
    <tbody className="border-t border-border">
      <tr>
        <td className={cx(tdClass, "pb-1.5")}>
          <span className="font-bold">{i.label}</span>
        </td>
        <td className={cx(tdClass, "pb-1.5 tabular")}>{i.people.length}</td>
        <td className={cx(tdClass, "pb-1.5 whitespace-nowrap")}>
          {formatDateRange(i.arrivalDate, i.departureDate, { year: false })}
          <span className="text-muted"> · {i.nights} night{i.nights > 1 ? "s" : ""}</span>
        </td>
        <td className={cx(tdClass, "pb-1.5 tabular")}>{i.roomCountRequested ?? <span className="text-muted">Not given</span>}</td>
        <td className={cx(tdClass, "pb-1.5")}>
          <span className={cx("inline-flex h-[26px] items-center rounded-full px-2.5 text-[12.5px] font-bold whitespace-nowrap", st.cls)}>{st.label}</span>
        </td>
      </tr>
      <tr>
        <td colSpan={5} className="px-4 pb-3.5">
          <div className="flex flex-col gap-2 text-[13.5px]">
            <p className="text-muted">{i.people.map((p) => p.name).join(", ")}</p>
            {i.roomSharingPreference && <p>“{i.roomSharingPreference}”</p>}
            {access.length > 0 && <p className="text-info-ink">Access needs: {access.map((p) => `${p.name} — ${p.accessibilityNeeds}`).join("; ")}</p>}
            {issues.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {issues.map((issue) => (
                  <Badge key={issue} tone="warning">
                    {issue}
                  </Badge>
                ))}
              </div>
            )}
            {i.assignments.length > 0 && (
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface-2/50">
                {i.assignments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span className="font-semibold">{a.propertyName}</span>
                      {a.roomReference ? `· ${a.roomReference}` : ""} · {short(a.checkInDate)} → {short(a.checkOutDate)}
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
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand">Assign a room</summary>
                <ActionForm action={createAssignmentAction.bind(null, eventId)} resetOnSuccess className="mt-2 grid gap-3 space-y-0 sm:grid-cols-6 sm:items-end">
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
                  <div className="flex justify-end sm:col-span-6">
                    <SubmitButton variant="secondary">Save assignment</SubmitButton>
                  </div>
                </ActionForm>
              </details>
            )}
          </div>
        </td>
      </tr>
    </tbody>
  );
}
