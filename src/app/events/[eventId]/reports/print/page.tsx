import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/dates";
import { dietaryLabel } from "@/domain/settings";
import { getAccommodationReport, getEventSummary, getMealReport, getTransportReport } from "@/server/modules/reporting";
import { getEventContext } from "../../context";
import { PrintButton } from "./print-button";

export default function PrintPage({ params }: PageProps<"/events/[eventId]/reports/print">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PrintSummary params={params} />
    </Suspense>
  );
}

const th = "border-b border-border py-1.5 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-muted";
const td = "border-b border-border py-1.5 pr-3 tabular";

async function PrintSummary({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { db, user, event, settings } = await getEventContext(eventId);
  const f = settings.features;
  const [s, acc, meals, tr] = await Promise.all([
    getEventSummary(db, user.id, eventId),
    f.accommodation ? getAccommodationReport(db, user.id, eventId) : null,
    f.meals ? getMealReport(db, user.id, eventId) : null,
    f.transport ? getTransportReport(db, user.id, eventId) : null,
  ]);
  return (
    <article className="mx-auto max-w-3xl rounded-xl bg-surface p-6 print:max-w-none print:p-0 print:shadow-none">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">{event.name}</h1>
          <p className="text-sm text-muted">
            Planning summary · generated {formatDateTime(new Date(), event.timezone)} · {s.totals.invitedPeople} invited, {s.totals.respondedPeople} responded,{" "}
            {s.totals.pendingPeople} awaiting reply
          </p>
        </div>
        <PrintButton />
      </div>

      <h2 className="mb-2 font-semibold">Attendance</h2>
      <table className="mb-6 w-full text-sm">
        <thead>
          <tr>
            <th className={th}>Date</th>
            <th className={th}>Activity</th>
            <th className={th}>Confirmed</th>
            <th className={th}>Maybe</th>
            <th className={th}>Declined</th>
            <th className={th}>No answer</th>
          </tr>
        </thead>
        <tbody>
          {s.activities.map((a) => (
            <tr key={a.id}>
              <td className={td}>{formatDate(a.date, { year: undefined })}</td>
              <td className={td}>{a.name}</td>
              <td className={`${td} font-semibold`}>{a.confirmed}</td>
              <td className={td}>{a.tentative}</td>
              <td className={td}>{a.declined}</td>
              <td className={td}>{a.unanswered}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {meals && meals.meals.length > 0 && (
        <>
          <h2 className="mb-2 font-semibold">Meals</h2>
          <table className="mb-6 w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Meal</th>
                <th className={th}>Confirmed</th>
                <th className={th}>Tentative</th>
                <th className={th}>Dietary</th>
              </tr>
            </thead>
            <tbody>
              {meals.meals.map((m) => (
                <tr key={m.id}>
                  <td className={td}>
                    {m.name}, {formatDate(m.serviceDate, { year: undefined })}
                  </td>
                  <td className={`${td} font-semibold`}>{m.confirmed}</td>
                  <td className={td}>{m.tentative}</td>
                  <td className={td}>
                    {Object.entries(m.dietary)
                      .map(([k, v]) => `${dietaryLabel(k)} ${v}`)
                      .join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {acc && (
        <>
          <h2 className="mb-2 font-semibold">Accommodation</h2>
          <p className="mb-2 text-sm">
            {acc.totals.roomNights} room-nights and {acc.totals.guestNights} guest-nights requested
            {acc.totals.requestsWithoutRoomCount ? ` (${acc.totals.requestsWithoutRoomCount} request(s) without a room count)` : ""}; {acc.awaiting} awaiting a room.
          </p>
          <table className="mb-6 w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Night of</th>
                <th className={th}>Guests</th>
                <th className={th}>Rooms</th>
              </tr>
            </thead>
            <tbody>
              {acc.totals.nights.map((n) => (
                <tr key={n.date}>
                  <td className={td}>{formatDate(n.date, { year: undefined })}</td>
                  <td className={td}>{n.guests}</td>
                  <td className={td}>
                    {n.rooms}
                    {n.roomsUnknown ? " +?" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tr && tr.byDate.length > 0 && (
        <>
          <h2 className="mb-2 font-semibold">Transport</h2>
          <table className="mb-6 w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Pickups</th>
                <th className={th}>Drop-offs</th>
                <th className={th}>Local</th>
              </tr>
            </thead>
            <tbody>
              {tr.byDate.map((d) => (
                <tr key={d.date}>
                  <td className={td}>{formatDate(d.date, { year: undefined })}</td>
                  <td className={td}>{d.arrival}</td>
                  <td className={td}>{d.departure}</td>
                  <td className={td}>{d.local}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="text-xs text-muted">Confirmed counts include only people who answered yes. Tentative and unanswered guests are listed separately.</p>
    </article>
  );
}
