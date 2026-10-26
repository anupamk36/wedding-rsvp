import { Suspense } from "react";
import { InvitationHero } from "@/components/rsvp/invitation-hero";
import { ButtonLink, PageHeader, PageSkeleton } from "@/components/ui";
import { listActivities } from "@/server/modules/events";
import { getEventContext } from "../context";

export default function PreviewPage({ params }: PageProps<"/events/[eventId]/preview">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Preview params={params} />
    </Suspense>
  );
}

async function Preview({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { db, event, settings } = await getEventContext(eventId);
  const acts = await listActivities(db, eventId);
  return (
    <>
      <PageHeader
        title="Invitation preview"
        description="What a guest invited to every activity sees before responding. Guests limited to certain groups only see their activities."
        actions={
          <ButtonLink href={`/events/${eventId}/settings`} variant="secondary">
            Change theme
          </ButtonLink>
        }
      />
      <div className={`accent-${settings.theme.accent} mx-auto max-w-2xl`}>
        <InvitationHero
          greeting="Dear Guest"
          event={{
            id: event.id,
            name: event.name,
            description: event.description,
            hostDisplayName: event.hostDisplayName,
            eventType: event.eventType,
            timezone: event.timezone,
            startDate: event.startDate,
            endDate: event.endDate,
            venueName: event.venueName,
            venueAddress: event.venueAddress,
            rsvpDeadline: event.rsvpDeadline?.toISOString() ?? null,
            settings,
          }}
          activities={acts.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            startAt: a.startAt.toISOString(),
            endAt: a.endAt?.toISOString() ?? null,
            venueName: a.venueName,
            venueAddress: a.venueAddress,
            attendanceRequested: a.attendanceRequested,
            allowDecline: a.allowDecline,
            isFull: false,
          }))}
        />
        <div className="mt-4 rounded-xl border border-dashed border-border-strong p-5 text-center text-sm text-muted">
          Guests continue to a step-by-step RSVP: their party, each activity, details{settings.features.accommodation || settings.features.transport ? ", stay & travel" : ""}, then a
          review.
        </div>
      </div>
    </>
  );
}
