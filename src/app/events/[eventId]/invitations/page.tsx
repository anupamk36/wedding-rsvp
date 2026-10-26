import Link from "next/link";
import { Suspense } from "react";
import { ActionButton, ActionForm, Disclosure, SubmitButton } from "@/components/forms";
import { InvitationBadge, ResponseBadge } from "@/components/status";
import { Badge, Card, cx, EmptyState, Field, Input, PageHeader, PageSkeleton, Select, Stat, tableClass, TableWrap, tdClass, Textarea, thClass } from "@/components/ui";
import {
  createInvitationAction,
  emailInvitationsAction,
  inviteAllAction,
  markSentAction,
  reissueInvitationAction,
  revokeInvitationAction,
} from "@/server/actions/guests";
import { listInvitations, listUninvitedTargets } from "@/server/modules/invitations";
import { notificationStats } from "@/server/modules/notifications";
import { getEventContext } from "../context";
import { ShareLinks } from "./share-links";

export default function InvitationsPage({ params }: PageProps<"/events/[eventId]/invitations">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Invitations params={params} />
    </Suspense>
  );
}

async function Invitations({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { db, user, event, settings, canManage } = await getEventContext(eventId);
  const [rows, targets, mail] = await Promise.all([
    listInvitations(db, user.id, eventId),
    listUninvitedTargets(db, user.id, eventId),
    notificationStats(db, eventId),
  ]);
  const active = rows.filter((r) => r.invitation.status !== "revoked");
  const revoked = rows.filter((r) => r.invitation.status === "revoked");
  const uninvitedCount = targets.households.length + targets.guests.length;
  const defaultPlusOnes = settings.features.plusOnes ? 1 : 0;
  const host = event.hostDisplayName ?? "We";

  return (
    <>
      <PageHeader
        title="Invitations"
        description="Each household or guest gets a private link. Anyone with the link can respond for the people on that invitation, so share it only with them."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Invitations" value={active.length} sub={`${active.reduce((n, r) => n + r.memberCount, 0)} people`} />
        <Stat label="Shared" value={active.filter((r) => r.invitation.status !== "draft").length} sub="Copied, messaged or emailed" />
        <Stat label="Awaiting reply" value={active.filter((r) => r.invitation.responseStatus === "pending").length} />
        <Stat
          label="Emails"
          value={mail.sent ?? 0}
          sub={`${mail.pending ?? 0} queued${mail.failed ? ` · ${mail.failed} failed` : ""}`}
          tone={mail.failed ? "warning" : undefined}
        />
      </div>

      {canManage && (
        <div className="mb-6 grid gap-3">
          {uninvitedCount > 0 && (
            <Card className="p-5">
              <ActionForm action={inviteAllAction.bind(null, eventId)} className="flex flex-wrap items-end gap-4 space-y-0">
                <div className="min-w-60 flex-1">
                  <h2 className="font-semibold">
                    {uninvitedCount} {uninvitedCount === 1 ? "party hasn't" : "parties haven't"} been invited
                  </h2>
                  <p className="text-sm text-muted">
                    Creates one link per household ({targets.households.length}) and per individual guest ({targets.guests.length}).
                  </p>
                </div>
                <Field label="Plus-ones per invitation" htmlFor="po-all">
                  <Input id="po-all" name="plusOnesAllowed" type="number" min={0} max={20} defaultValue={defaultPlusOnes} className="w-28" />
                </Field>
                <SubmitButton pendingText="Creating…">Create invitations</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {uninvitedCount > 0 && (
            <Disclosure summary="Create a single invitation">
              <ActionForm action={createInvitationAction.bind(null, eventId)} className="grid gap-4 space-y-0 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <Field label="Invite" htmlFor="target">
                  <Select id="target" name="target" required>
                    {targets.households.length > 0 && (
                      <optgroup label="Households">
                        {targets.households.map((h) => (
                          <option key={h.id} value={`household:${h.id}`}>
                            {h.name} ({h.members})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {targets.guests.length > 0 && (
                      <optgroup label="Individuals">
                        {targets.guests.map((g) => (
                          <option key={g.id} value={`guest:${g.id}`}>
                            {g.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                </Field>
                <Field label="Plus-ones" htmlFor="po-one">
                  <Input id="po-one" name="plusOnesAllowed" type="number" min={0} max={20} defaultValue={defaultPlusOnes} className="w-24" />
                </Field>
                <SubmitButton>Create</SubmitButton>
              </ActionForm>
            </Disclosure>
          )}
        </div>
      )}

      {active.length === 0 ? (
        <EmptyState
          title="No invitations yet"
          description={uninvitedCount ? "Create invitation links for the guests on your list." : "Add guests first, then create their invitation links here."}
          action={
            uninvitedCount === 0 ? (
              <Link href={`/events/${eventId}/guests`} className="text-sm font-medium text-brand">
                Go to guests →
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <TableWrap>
            <table className={tableClass}>
              <thead className="border-b border-border">
                <tr>
                  {canManage && <th className={cx(thClass, "w-8")}><span className="sr-only">Select for email</span></th>}
                  <th className={thClass}>Invitation</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Share</th>
                  {canManage && <th className={thClass}><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.map((r) => (
                  <tr key={r.invitation.id}>
                    {canManage && (
                      <td className={tdClass}>
                        <input
                          type="checkbox"
                          form="email-invitations"
                          name="invitationIds"
                          value={r.invitation.id}
                          disabled={!r.primaryEmail}
                          aria-label={`Select ${r.label} for email`}
                          className="size-4 accent-[var(--brand)]"
                        />
                      </td>
                    )}
                    <td className={tdClass}>
                      <Link href={`/events/${eventId}/responses/${r.invitation.id}`} className="font-medium hover:underline">
                        {r.label}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted">
                        {r.memberCount} {r.memberCount === 1 ? "person" : "people"} · {r.activityCount} activities
                        {r.invitation.plusOnesAllowed > 0 && ` · up to ${r.invitation.plusOnesAllowed} plus-one${r.invitation.plusOnesAllowed > 1 ? "s" : ""}`}
                        {r.invitation.activityScope === "custom" && " · custom activities"}
                      </div>
                      {r.primaryEmail && <div className="max-w-56 truncate text-xs text-muted">{r.primaryEmail}</div>}
                    </td>
                    <td className={tdClass}>
                      <div className="flex flex-wrap gap-1">
                        <InvitationBadge status={r.invitation.status} />
                        <ResponseBadge status={r.invitation.responseStatus} />
                        {r.invitation.hasLateChanges && <Badge tone="warning">Late change</Badge>}
                      </div>
                    </td>
                    <td className={tdClass}>
                      {r.url && canManage ? (
                        <ShareLinks
                          url={r.url}
                          phone={r.primaryPhone}
                          message={`Hi ${r.label}! ${host} would love for you to join us for ${event.name}. Please RSVP here:`}
                          markSent={markSentAction.bind(null, eventId, [r.invitation.id])}
                        />
                      ) : !r.url && canManage ? (
                        <span className="text-xs text-warning">Link unavailable — use “New link”.</span>
                      ) : (
                        <span className="text-xs text-muted">Organizers can share links</span>
                      )}
                    </td>
                    {canManage && (
                      <td className={cx(tdClass, "text-right")}>
                        <div className="flex justify-end gap-1">
                          <ActionButton
                            action={reissueInvitationAction.bind(null, r.invitation.id)}
                            variant="ghost"
                            confirm="Create a new link? The old link stops working immediately; responses are kept."
                          >
                            New link
                          </ActionButton>
                          <ActionButton
                            action={revokeInvitationAction.bind(null, r.invitation.id)}
                            variant="ghost"
                            confirm={`Revoke the invitation for ${r.label}? The link stops working and their answers no longer count.`}
                          >
                            Revoke
                          </ActionButton>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {canManage && (
            <div className="border-t border-border p-5">
              <h2 className="font-semibold">Send by email</h2>
              <p className="mb-3 text-sm text-muted">
                Tick invitations above (only those with an email address), add an optional note, and we&rsquo;ll email each their personal link.
              </p>
              <ActionForm id="email-invitations" action={emailInvitationsAction.bind(null, eventId)} className="space-y-3">
                <Textarea
                  name="message"
                  rows={3}
                  maxLength={1000}
                  aria-label="Message"
                  defaultValue={`${host} would love for you to join us for ${event.name}.`}
                />
                <div className="flex justify-end">
                  <SubmitButton pendingText="Queuing…">Email selected</SubmitButton>
                </div>
              </ActionForm>
            </div>
          )}
        </Card>
      )}

      {revoked.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-muted">Revoked</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {revoked.map((r) => (
              <li key={r.invitation.id} className="flex justify-between px-5 py-2.5">
                <span>{r.label}</span>
                <span className="text-muted">Link disabled</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
