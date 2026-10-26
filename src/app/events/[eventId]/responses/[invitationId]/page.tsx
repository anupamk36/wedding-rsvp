import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { AttendanceBadge, InvitationBadge, ResponseBadge, attendanceLabel } from "@/components/status";
import { Badge, ButtonLink, Card, CardHeader, Checkbox, cx, Field, Input, PageHeader, PageSkeleton, Select, tableClass, TableWrap, tdClass, thClass } from "@/components/ui";
import { dietaryLabel } from "@/domain/settings";
import { formatDate, formatDateTime } from "@/lib/dates";
import { clearLateFlagAction, updateInvitationAction } from "@/server/actions/guests";
import { AppError } from "@/server/lib/errors";
import { listActivities } from "@/server/modules/events";
import { getResponseForHost, type ChangeEntry } from "@/server/modules/rsvp";
import { getEventContext } from "../../context";

export default function ResponseDetailPage({ params }: PageProps<"/events/[eventId]/responses/[invitationId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}

const KIND: Record<string, string> = { submitted: "Responded", updated: "Updated", withdrawn: "Withdrew", host_edit: "Edited by host" };

function changeText(c: ChangeEntry, availability: boolean) {
  if (c.type === "attendance") {
    const f = c.from ? attendanceLabel(c.from, availability) : "No answer";
    const t = c.to ? attendanceLabel(c.to, availability) : "No answer";
    return `${c.guest} · ${c.activity}: ${f} → ${t}`;
  }
  if (c.type === "plus_one") return `${c.guest} ${c.change === "added" ? "added" : "removed"}`;
  return c.summary;
}

async function Detail({ params }: { params: Promise<{ eventId: string; invitationId: string }> }) {
  const { eventId, invitationId } = await params;
  const { db, user, event, settings, canManage } = await getEventContext(eventId);
  const data = await getResponseForHost(db, user.id, invitationId).catch((e) => {
    if (e instanceof AppError && e.code === "not_found") notFound();
    throw e;
  });
  if (data.invitation.eventId !== eventId) notFound();
  const { view, history, invitation, contacts } = data;
  const allActivities = canManage ? await listActivities(db, eventId) : [];
  const tz = event.timezone;
  const askable = view.activities.filter((a) => a.attendanceRequested);
  const status = (guestId: string, activityId: string) => view.attendance.find((a) => a.guestId === guestId && a.activityId === activityId)?.status ?? "unanswered";
  const nameOf = (id: string) => view.people.find((p) => p.id === id)?.name ?? "Guest";
  const availability = settings.availabilityMode;
  const permitted = new Set(view.activities.map((a) => a.id));

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/events/${eventId}/responses`} className="text-muted hover:text-text">
          ← Responses
        </Link>
      </p>
      <PageHeader
        title={view.invitation.label}
        description={`${view.people.length} ${view.people.length === 1 ? "person" : "people"} · version ${invitation.responseVersion}${
          invitation.lastRespondedAt ? ` · last response ${formatDateTime(invitation.lastRespondedAt, tz)}` : ""
        }`}
        actions={
          canManage && invitation.status !== "revoked" ? (
            <>
              {invitation.hasLateChanges && (
                <ActionButton action={clearLateFlagAction.bind(null, invitationId)} size="md">
                  Mark late change reviewed
                </ActionButton>
              )}
              <ButtonLink href={`/events/${eventId}/responses/${invitationId}/edit`}>Edit response</ButtonLink>
            </>
          ) : undefined
        }
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <InvitationBadge status={invitation.status} />
        <ResponseBadge status={invitation.responseStatus} />
        {invitation.hasLateChanges && <Badge tone="warning">Changed after the deadline</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Attendance" />
            {askable.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">This invitation has no activities to respond to.</p>
            ) : (
              <TableWrap>
                <table className={tableClass}>
                  <thead className="border-b border-border">
                    <tr>
                      <th className={thClass}>Person</th>
                      {askable.map((a) => (
                        <th key={a.id} className={thClass}>
                          {a.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {view.people.map((p) => (
                      <tr key={p.id}>
                        <td className={cx(tdClass, "font-medium")}>
                          {p.name}
                          {p.isPlusOne && <Badge className="ml-1.5">+1</Badge>}
                          {(p.dietary.length > 0 || p.dietaryNotes) && (
                            <div className="text-xs font-normal text-muted">{[...p.dietary.map(dietaryLabel), p.dietaryNotes].filter(Boolean).join(", ")}</div>
                          )}
                          {p.accessibilityNeeds && <div className="text-xs font-normal text-muted">Access: {p.accessibilityNeeds}</div>}
                        </td>
                        {askable.map((a) => (
                          <td key={a.id} className={tdClass}>
                            <AttendanceBadge status={status(p.id, a.id)} availability={availability} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>

          {(view.accommodation.length > 0 || view.transport.length > 0 || view.notes || Object.keys(view.answers).length > 0) && (
            <Card>
              <CardHeader title="Logistics & notes" />
              <div className="space-y-4 px-5 py-4 text-sm">
                {view.accommodation.map((s) => (
                  <div key={s.id}>
                    <div className="font-medium">
                      Stay {formatDate(s.arrivalDate, { year: undefined })} → {formatDate(s.departureDate, { year: undefined })}
                      {s.confirmed ? <Badge tone="success" className="ml-2">Room confirmed</Badge> : <Badge tone="info" className="ml-2">Requested</Badge>}
                    </div>
                    <div className="text-muted">
                      {s.guestIds.map(nameOf).join(", ")} · {s.roomCount ? `${s.roomCount} room(s)` : "room count not given"}
                      {s.roomSharing ? ` · ${s.roomSharing}` : ""}
                    </div>
                  </div>
                ))}
                {view.transport.map((t) => (
                  <div key={t.id}>
                    <div className="font-medium">
                      {t.direction === "arrival" ? "Pickup" : t.direction === "departure" ? "Drop-off" : "Local transport"} · {formatDate(t.travelDate, { year: undefined })}
                      {t.travelTime ? ` ${t.travelTime}` : ""}
                    </div>
                    <div className="text-muted">
                      {t.location} · {t.guestIds.map(nameOf).join(", ")}
                      {t.notes ? ` · ${t.notes}` : ""}
                    </div>
                  </div>
                ))}
                {view.questions
                  .filter((q) => view.answers[q.id] !== undefined)
                  .map((q) => {
                    const v = view.answers[q.id];
                    return (
                      <div key={q.id}>
                        <div className="text-muted">{q.questionText}</div>
                        <div>{Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</div>
                      </div>
                    );
                  })}
                {view.notes && (
                  <div>
                    <div className="text-muted">Note from the guest</div>
                    <p className="whitespace-pre-line">{view.notes}</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="History" description="Every submission is kept, so you can see what changed and when." />
            {history.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No responses yet.</p>
            ) : (
              <ol className="divide-y divide-border">
                {history.map((h) => (
                  <li key={h.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{KIND[h.kind] ?? h.kind}</span>
                      <span className="text-muted">v{h.version} · {formatDateTime(h.submittedAt, tz)}</span>
                      {h.hostName && <span className="text-muted">by {h.hostName}</span>}
                      {h.isLate && <Badge tone="warning">After deadline</Badge>}
                    </div>
                    {h.changes.length > 0 ? (
                      <ul className="mt-1 list-inside list-disc text-muted">
                        {h.changes.map((c, i) => (
                          <li key={i}>{changeText(c, availability)}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-muted">No attendance changes.</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Contact" />
            <ul className="divide-y divide-border text-sm">
              {contacts.map((c) => (
                <li key={c.id} className="px-5 py-2.5">
                  <div className="font-medium">{c.name}</div>
                  {c.email && <div className="truncate text-muted">{c.email}</div>}
                  {c.phone && <div className="text-muted">{c.phone}</div>}
                </li>
              ))}
            </ul>
          </Card>
          {canManage && invitation.status !== "revoked" && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Invitation settings</h2>
              <ActionForm action={updateInvitationAction.bind(null, invitationId)}>
                <Field label="Additional guests allowed" htmlFor="po">
                  <Input id="po" name="plusOnesAllowed" type="number" min={0} max={20} defaultValue={invitation.plusOnesAllowed} />
                </Field>
                <Field label="Activities" htmlFor="scope" hint="Automatic follows each activity's guest groups.">
                  <Select id="scope" name="activityScope" defaultValue={invitation.activityScope}>
                    <option value="auto">Automatic (from groups)</option>
                    <option value="custom">Choose manually</option>
                  </Select>
                </Field>
                <fieldset className="space-y-2">
                  <legend className="text-xs text-muted">Used when “Choose manually” is selected</legend>
                  {allActivities.map((a) => (
                    <Checkbox key={a.id} name="activityIds" value={a.id} label={a.name} defaultChecked={permitted.has(a.id)} />
                  ))}
                </fieldset>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
