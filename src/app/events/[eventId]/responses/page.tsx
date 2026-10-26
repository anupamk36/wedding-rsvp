import Link from "next/link";
import { Suspense } from "react";
import { AttendanceBadge, attendanceLabel, ResponseBadge } from "@/components/status";
import { Badge, Button, ButtonLink, Card, cx, EmptyState, Field, Input, PageHeader, PageSkeleton, Select, tableClass, TableWrap, tdClass, thClass } from "@/components/ui";
import { dietaryLabel } from "@/domain/settings";
import { listGroups } from "@/server/modules/guests";
import { getAttendeeList, type DrilldownFilter } from "@/server/modules/reporting";
import { getEventContext } from "../context";

export default function ResponsesPage({ params, searchParams }: PageProps<"/events/[eventId]/responses">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Responses params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const STATUSES = ["attending", "maybe", "not_attending", "unanswered"] as const;
const RESPONSES = ["pending", "submitted", "updated", "withdrawn"] as const;

async function Responses({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventId } = await params;
  const sp = await searchParams;
  const { db, user, settings } = await getEventContext(eventId);
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);
  const filter: DrilldownFilter = {
    activityId: one(sp.activityId),
    status: pick(one(sp.status), STATUSES),
    groupId: one(sp.groupId),
    response: pick(one(sp.response), RESPONSES),
    q: one(sp.q),
  };
  const late = one(sp.late) === "1";
  // "Responded" covers both first answers and later updates.
  const respondedOnly = filter.response === "submitted";
  const [data, groups] = await Promise.all([
    getAttendeeList(db, user.id, eventId, { ...filter, response: respondedOnly ? undefined : filter.response }),
    listGroups(db, eventId),
  ]);
  const rows = data.rows.filter(
    (r) =>
      (!late || r.invitation.hasLateChanges) &&
      (!respondedOnly || r.invitation.responseStatus === "submitted" || r.invitation.responseStatus === "updated"),
  );
  const availability = settings.availabilityMode;
  const activityName = filter.activityId ? data.activities.find((a) => a.id === filter.activityId)?.name : undefined;
  const base = `/events/${eventId}/responses`;
  const exportable = filter.activityId || filter.status || filter.groupId || filter.response || filter.q || late;

  return (
    <>
      <PageHeader
        title="Responses"
        description={
          activityName
            ? `${rows.length} ${rows.length === 1 ? "person" : "people"}${filter.status ? ` · ${attendanceLabel(filter.status, availability).toLowerCase()}` : ""} for ${activityName}.`
            : `Every invited person and their answer for each activity. ${rows.length} shown.`
        }
        actions={
          <ButtonLink href={`/events/${eventId}/reports`} variant="secondary">
            Export
          </ButtonLink>
        }
      />
      <Card>
        <form action={base} className="flex flex-wrap items-end gap-2 border-b border-border p-4">
          <Field label="Search" htmlFor="q" className="min-w-36 flex-1">
            <Input id="q" name="q" type="search" defaultValue={filter.q} placeholder="Name or household" />
          </Field>
          <Field label="Activity" htmlFor="activityId">
            <Select id="activityId" name="activityId" defaultValue={filter.activityId ?? ""}>
              <option value="">Any</option>
              {data.activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Answer" htmlFor="status">
            <Select id="status" name="status" defaultValue={filter.status ?? ""}>
              <option value="">Any</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {attendanceLabel(s, availability)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Group" htmlFor="groupId">
            <Select id="groupId" name="groupId" defaultValue={filter.groupId ?? ""}>
              <option value="">Any</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Invitation" htmlFor="response">
            <Select id="response" name="response" defaultValue={filter.response ?? ""}>
              <option value="">Any</option>
              <option value="pending">Awaiting reply</option>
              <option value="submitted">Responded</option>
                            <option value="withdrawn">Withdrawn</option>
            </Select>
          </Field>
          {late && <input type="hidden" name="late" value="1" />}
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {exportable && (
            <ButtonLink href={base} variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>
        {late && (
          <div className="border-b border-border bg-warning-soft px-4 py-2 text-sm text-warning">
            Showing invitations changed after the RSVP deadline. Open one to review and mark it as reviewed.
          </div>
        )}
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nobody matches" description="Try a different filter, or check back as responses arrive." />
          </div>
        ) : (
          <TableWrap>
            <table className={tableClass}>
              <thead className="border-b border-border">
                <tr>
                  <th className={cx(thClass, "sticky left-0 bg-surface")}>Person</th>
                  <th className={thClass}>Invitation</th>
                  {data.activities.map((a) => (
                    <th key={a.id} className={cx(thClass, a.id === filter.activityId && "text-brand")}>
                      {a.name}
                    </th>
                  ))}
                  {settings.features.dietary && <th className={thClass}>Dietary</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={cx(tdClass, "sticky left-0 bg-surface font-medium")}>
                      {r.name}
                      {r.plusOne && <Badge className="ml-1.5">+1</Badge>}
                    </td>
                    <td className={tdClass}>
                      <Link href={`${base}/${r.invitation.id}`} className="hover:underline">
                        {r.invitation.label}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <ResponseBadge status={r.invitation.responseStatus} />
                        {r.invitation.hasLateChanges && <Badge tone="warning">Late</Badge>}
                      </div>
                    </td>
                    {data.activities.map((a) => (
                      <td key={a.id} className={tdClass}>
                        <AttendanceBadge status={r.statuses[a.id]} availability={availability} />
                      </td>
                    ))}
                    {settings.features.dietary && <td className={cx(tdClass, "text-muted")}>{r.dietary.map(dietaryLabel).join(", ")}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
