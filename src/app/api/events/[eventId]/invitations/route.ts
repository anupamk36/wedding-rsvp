import { hostRoute, readJson } from "@/server/http/api";
import { createInvitation, invitationUrl, listInvitations } from "@/server/modules/invitations";

type P = { eventId: string };

export const GET = hostRoute<P>(async ({ db, user, params }) => ({ invitations: await listInvitations(db, user.id, params.eventId) }));

/** Body: { guestId } or { householdId }, optional plusOnesAllowed. */
export const POST = hostRoute<P>(async ({ req, db, user, params }) => {
  const body = (await readJson(req)) as { guestId?: string; householdId?: string; plusOnesAllowed?: number };
  const { tokenHash: _h, tokenCiphertext, ...invitation } = await createInvitation(db, user.id, params.eventId, body);
  return Response.json({ invitation, url: invitationUrl(tokenCiphertext) }, { status: 201 });
});
