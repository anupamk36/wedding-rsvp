import { hostRoute, readJson } from "@/server/http/api";
import { deleteGuest, updateGuest, type GuestInput } from "@/server/modules/guests";

type P = { guestId: string };

export const PATCH = hostRoute<P>(async ({ req, db, user, params }) => ({
  guest: await updateGuest(db, user.id, params.guestId, (await readJson(req)) as GuestInput),
}));

export const DELETE = hostRoute<P>(async ({ db, user, params }) => {
  await deleteGuest(db, user.id, params.guestId);
  return { ok: true };
});
