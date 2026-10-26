import { Suspense } from "react";
import { buttonClass, ButtonLink, Card, CardHeader, PageHeader, PageSkeleton } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { listAudit } from "@/server/modules/audit";
import { getEventContext } from "../context";

export default function ReportsPage({ params }: PageProps<"/events/[eventId]/reports">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Reports params={params} />
    </Suspense>
  );
}

const AUDIT_LABEL: Record<string, string> = {
  "event.created": "Created the event",
  "event.updated": "Edited event details",
  "event.settings_updated": "Changed settings",
  "event.published": "Marked the event live",
  "event.draft": "Marked the event as draft",
  "activity.created": "Added an activity",
  "activity.updated": "Edited an activity",
  "activity.deleted": "Deleted an activity",
  "guest.created": "Added a guest",
  "guest.updated": "Edited a guest",
  "guest.deleted": "Removed a guest",
  "guest.imported": "Imported guests",
  "household.created": "Created a household",
  "invitation.created": "Created an invitation",
  "invitation.bulk_created": "Created invitations",
  "invitation.revoked": "Revoked an invitation",
  "invitation.reissued": "Replaced an invitation link",
  "response.submitted": "Guest responded",
  "response.updated": "Guest updated their response",
  "response.withdrawn": "Guest withdrew",
  "response.host_edit": "Edited a response",
  "response.late_reviewed": "Reviewed a late change",
  "export.downloaded": "Downloaded an export",
  "collaborator.added": "Added a collaborator",
  "collaborator.removed": "Removed a collaborator",
};

async function Reports({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { db, event, settings, canManage } = await getEventContext(eventId);
  const f = settings.features;
  const exports = [
    { kind: "guests", title: "Guest list & responses", body: "One row per person with contact details, household, groups and their answer for every activity." },
    ...(f.accommodation ? [{ kind: "accommodation", title: "Accommodation", body: "Stay requests with nights, room-nights, guest-nights, assignments and open issues." }] : []),
    ...(f.meals ? [{ kind: "meals", title: "Meals", body: "Servings per meal with tentative counts and dietary breakdown — ready for the caterer." }] : []),
    ...(f.transport ? [{ kind: "transport", title: "Transport manifest", body: "Pickups and drop-offs by date with passenger names and locations." }] : []),
  ];
  const audit = canManage ? await listAudit(db, eventId, 40) : [];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Exports reflect live data at the moment you download them. They contain personal information — share them only with people who need it."
        actions={
          <ButtonLink href={`/events/${eventId}/reports/print`} variant="secondary">
            Printable summary
          </ButtonLink>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {exports.map((e) => (
          <Card key={e.kind} className="flex flex-col p-5">
            <h2 className="font-semibold">{e.title}</h2>
            <p className="mt-1 flex-1 text-sm text-muted">{e.body}</p>
            <div className="mt-4">
              {canManage ? (
                <a href={`/api/events/${eventId}/export?kind=${e.kind}`} className={buttonClass("secondary", "sm")} download>
                  Download CSV
                </a>
              ) : (
                <p className="text-xs text-muted">Only owners and organizers can download exports.</p>
              )}
            </div>
          </Card>
        ))}
      </div>
      {canManage && (
        <Card className="mt-8">
          <CardHeader title="Activity log" description="Recent changes to this event by hosts and guests." />
          <ul className="divide-y divide-border text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5">
                <span>
                  <span className="font-medium">{a.actorName ?? (a.actorInvitationId ? "A guest" : "System")}</span>{" "}
                  <span className="text-muted">{(AUDIT_LABEL[a.action] ?? a.action).toLowerCase()}</span>
                </span>
                <time className="text-xs text-muted" dateTime={a.createdAt.toISOString()}>
                  {formatDateTime(a.createdAt, event.timezone)}
                </time>
              </li>
            ))}
            {audit.length === 0 && <li className="px-5 py-3 text-muted">Nothing yet.</li>}
          </ul>
        </Card>
      )}
    </>
  );
}
