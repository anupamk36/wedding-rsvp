import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, buttonClass, Card, CardHeader, cx, EmptyState, Input, PageHeader, PageSkeleton, Stat, tableClass, TableWrap, tdClass, thClass } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { setTransportStatusAction } from "@/server/actions/logistics";
import { getTransportReport } from "@/server/modules/reporting";
import { getEventContext } from "../context";

export default function TransportPage({ params }: PageProps<"/events/[eventId]/transport">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Transport params={params} />
    </Suspense>
  );
}

const DIRECTION = { arrival: "Pickup", departure: "Drop-off", local: "Local" } as const;

async function Transport({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { db, user, canManage } = await getEventContext(eventId);
  const r = await getTransportReport(db, user.id, eventId);
  const active = r.items.filter((i) => i.status !== "cancelled");

  return (
    <>
      <PageHeader
        title="Transport"
        description="Pickups and drop-offs guests asked for. Accommodation doesn't imply transport — only explicit requests appear here."
        actions={
          <a href={`/api/events/${eventId}/export?kind=transport`} className={buttonClass("secondary")} download>
            Export manifest
          </a>
        }
      />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Requests" value={r.totals.requests} />
        <Stat label="Passengers" value={r.totals.passengers} />
        <Stat label="Unassigned" value={r.totals.unassigned} tone={r.totals.unassigned ? "warning" : undefined} />
      </div>
      {r.byDate.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Passengers by day" />
          <TableWrap>
            <table className={tableClass}>
              <thead className="border-b border-border">
                <tr>
                  <th className={thClass}>Date</th>
                  <th className={cx(thClass, "text-right")}>Pickups</th>
                  <th className={cx(thClass, "text-right")}>Drop-offs</th>
                  <th className={cx(thClass, "text-right")}>Local</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular">
                {r.byDate.map((d) => (
                  <tr key={d.date}>
                    <td className={tdClass}>{formatDate(d.date, { year: undefined })}</td>
                    <td className={cx(tdClass, "text-right")}>{d.arrival}</td>
                    <td className={cx(tdClass, "text-right")}>{d.departure}</td>
                    <td className={cx(tdClass, "text-right")}>{d.local}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
      {active.length === 0 ? (
        <EmptyState title="No transport requests" description="Requests from guests' RSVPs will appear here." />
      ) : (
        <Card>
          <TableWrap>
            <table className={tableClass}>
              <thead className="border-b border-border">
                <tr>
                  <th className={thClass}>When</th>
                  <th className={thClass}>Party</th>
                  <th className={thClass}>Where</th>
                  <th className={thClass}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.map((i) => (
                  <tr key={i.id}>
                    <td className={cx(tdClass, "whitespace-nowrap")}>
                      <Badge tone="brand">{DIRECTION[i.direction]}</Badge>
                      <div className="mt-1">
                        {formatDate(i.travelDate, { year: undefined })}
                        {i.travelTime ? ` · ${i.travelTime}` : ""}
                      </div>
                    </td>
                    <td className={tdClass}>
                      <div className="font-medium">{i.label}</div>
                      <div className="text-xs text-muted">
                        {i.passengerCount} · {i.passengers.map((p) => p.name).join(", ")}
                      </div>
                    </td>
                    <td className={tdClass}>
                      <div>{i.location}</div>
                      {i.notes && <div className="text-xs text-muted">{i.notes}</div>}
                    </td>
                    <td className={tdClass}>
                      {canManage ? (
                        <ActionForm action={setTransportStatusAction.bind(null, i.id)} className="flex min-w-56 gap-2 space-y-0">
                          <input type="hidden" name="status" value={i.status === "assigned" ? "requested" : "assigned"} />
                          <Input name="assignmentNote" aria-label="Vehicle or driver" placeholder="Vehicle / driver" defaultValue={i.assignmentNote ?? ""} maxLength={300} />
                          <SubmitButton size="sm" variant={i.status === "assigned" ? "ghost" : "secondary"}>
                            {i.status === "assigned" ? "Unassign" : "Assign"}
                          </SubmitButton>
                        </ActionForm>
                      ) : (
                        <Badge tone={i.status === "assigned" ? "success" : "warning"}>{i.status === "assigned" ? i.assignmentNote || "Assigned" : "Unassigned"}</Badge>
                      )}
                      {canManage && i.status === "assigned" && <Badge tone="success" className="mt-1">Assigned</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
