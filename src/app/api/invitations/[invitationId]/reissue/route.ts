import { hostRoute } from "@/server/http/api";
import { reissueInvitation } from "@/server/modules/invitations";

export const POST = hostRoute<{ invitationId: string }>(async ({ db, user, params }) => {
  const { url } = await reissueInvitation(db, user.id, params.invitationId);
  return { url };
});
