import { z } from "zod";
import { hostRoute, readJson } from "@/server/http/api";
import { importGuests } from "@/server/modules/guests";

type P = { eventId: string };

/** Body: { text } — CSV with a header row, or one "Name, email, phone" per line. */
export const POST = hostRoute<P>(async ({ req, db, user, params }) => {
  const { text } = z.object({ text: z.string().max(2_000_000) }).parse(await readJson(req));
  return { results: await importGuests(db, user.id, params.eventId, text) };
});
