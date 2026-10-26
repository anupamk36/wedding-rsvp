import { hostRoute, readJson } from "@/server/http/api";
import { getResponseForHost, hostSubmitResponse } from "@/server/modules/rsvp";

type P = { invitationId: string };

export const GET = hostRoute<P>(async ({ db, user, params }) => {
  const { view, history } = await getResponseForHost(db, user.id, params.invitationId);
  return { response: view, history };
});

/** Host edit; bypasses the guest deadline and edit policy. Same body as the guest PUT. */
export const PUT = hostRoute<P>(async ({ req, db, user, params }) =>
  hostSubmitResponse(db, user.id, params.invitationId, await readJson(req)),
);
