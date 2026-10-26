import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionButton } from "@/components/forms";
import { Badge, Card, PageHeader, PageSkeleton } from "@/components/ui";
import { dietaryLabel } from "@/domain/settings";
import { deleteGuestAction, saveGuestAction } from "@/server/actions/guests";
import { AppError } from "@/server/lib/errors";
import { getGuest, listGroups, listHouseholds } from "@/server/modules/guests";
import { getEventContext } from "../../context";
import { GuestForm } from "../guest-forms";

export default function GuestPage({ params }: PageProps<"/events/[eventId]/guests/[guestId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <GuestDetail params={params} />
    </Suspense>
  );
}

async function GuestDetail({ params }: { params: Promise<{ eventId: string; guestId: string }> }) {
  const { eventId, guestId } = await params;
  const { db, user, canManage } = await getEventContext(eventId);
  const guest = await getGuest(db, user.id, eventId, guestId).catch((e) => {
    if (e instanceof AppError && e.code === "not_found") notFound();
    throw e;
  });
  const [groups, households] = await Promise.all([listGroups(db, eventId), listHouseholds(db, eventId)]);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/events/${eventId}/guests`} className="text-muted hover:text-text">
          ← Guests
        </Link>
      </p>
      <PageHeader
        title={guest.name}
        description={guest.plusOneOfInvitationId ? "Added as a plus-one by the guest who invited them." : undefined}
        actions={
          canManage ? (
            <ActionButton
              action={deleteGuestAction.bind(null, eventId, guestId)}
              variant="danger"
              size="md"
              confirm={`Remove ${guest.name} from the guest list? Their responses will be deleted.`}
            >
              Remove guest
            </ActionButton>
          ) : undefined
        }
      />
      {(guest.dietary.length > 0 || guest.dietaryNotes || guest.accessibilityNeeds) && (
        <Card className="mb-6 p-5 text-sm">
          <h2 className="mb-2 font-semibold">From their RSVP</h2>
          {guest.dietary.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {guest.dietary.map((d) => (
                <Badge key={d} tone="success">
                  {dietaryLabel(d)}
                </Badge>
              ))}
            </div>
          )}
          {guest.dietaryNotes && <p className="mt-2">Food notes: {guest.dietaryNotes}</p>}
          {guest.accessibilityNeeds && <p className="mt-2">Accessibility: {guest.accessibilityNeeds}</p>}
        </Card>
      )}
      <Card className="p-5">
        {canManage ? (
          <GuestForm
            action={saveGuestAction.bind(null, eventId, guestId)}
            defaults={guest}
            groups={groups}
            households={households}
            submitLabel="Save changes"
            isPlusOne={!!guest.plusOneOfInvitationId}
          />
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Email</dt>
              <dd>{guest.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Phone</dt>
              <dd>{guest.phone ?? "—"}</dd>
            </div>
          </dl>
        )}
      </Card>
    </>
  );
}
