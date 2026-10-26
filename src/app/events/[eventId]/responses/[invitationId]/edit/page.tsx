import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RsvpFlow } from "@/components/rsvp/rsvp-flow";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { AppError } from "@/server/lib/errors";
import { getResponseForHost } from "@/server/modules/rsvp";
import { getEventContext } from "../../../context";

export default function EditResponsePage({ params }: PageProps<"/events/[eventId]/responses/[invitationId]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Edit params={params} />
    </Suspense>
  );
}

async function Edit({ params }: { params: Promise<{ eventId: string; invitationId: string }> }) {
  const { eventId, invitationId } = await params;
  const { db, user, canManage } = await getEventContext(eventId);
  if (!canManage) notFound();
  const { view, invitation } = await getResponseForHost(db, user.id, invitationId).catch((e) => {
    if (e instanceof AppError && e.code === "not_found") notFound();
    throw e;
  });
  if (invitation.eventId !== eventId || invitation.status === "revoked") notFound();
  const back = `/events/${eventId}/responses/${invitationId}`;
  return (
    <div className="max-w-2xl">
      <p className="mb-2 text-sm">
        <Link href={back} className="text-muted hover:text-text">
          ← {view.invitation.label}
        </Link>
      </p>
      <PageHeader
        title={`Edit response for ${view.invitation.label}`}
        description="Use this for phone or in-person RSVPs and exceptional changes. Deadlines don't apply to hosts, and the change is recorded in the history."
      />
      <RsvpFlow key={view.invitation.responseVersion} view={view} endpoint={`/api/invitations/${invitationId}/response`} mode="host" doneHref={back} />
    </div>
  );
}
