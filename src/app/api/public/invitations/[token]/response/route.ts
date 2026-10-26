import { publicRoute, readJson } from "@/server/http/api";
import { LIMITS } from "@/server/modules/rate-limit";
import { getRsvpView, submitResponse } from "@/server/modules/rsvp";
import { resolveOrThrow } from "@/server/http/public";

type P = { token: string };

export const GET = publicRoute<P>(LIMITS.publicRead, async ({ db, params, ip }) => ({
  response: await getRsvpView(db, await resolveOrThrow(db, params.token, ip)),
}));

/** Create or replace the response. Send `expectedVersion` from the last read; stale versions get 409. */
export const PUT = publicRoute<P>(LIMITS.publicWrite, async ({ req, db, params, ip }) => {
  const { invitation } = await resolveOrThrow(db, params.token, ip);
  return submitResponse(db, {
    invitationId: invitation.id,
    actor: { kind: "invitation", invitationId: invitation.id },
    payload: await readJson(req),
  });
});

/** Withdraw the response. Body: { expectedVersion }. */
export const DELETE = publicRoute<P>(LIMITS.publicWrite, async ({ req, db, params, ip }) => {
  const { invitation } = await resolveOrThrow(db, params.token, ip);
  return submitResponse(db, {
    invitationId: invitation.id,
    actor: { kind: "invitation", invitationId: invitation.id },
    payload: await readJson(req),
    mode: "withdraw",
  });
});
