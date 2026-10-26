import { hostRoute } from "@/server/http/api";
import { revokeInvitation } from "@/server/modules/invitations";

export const POST = hostRoute<{ invitationId: string }>(async ({ db, user, params }) => {
  const { status, revokedAt } = await revokeInvitation(db, user.id, params.invitationId);
  return { status, revokedAt };
});
