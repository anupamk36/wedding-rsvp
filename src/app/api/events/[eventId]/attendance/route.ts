import { z } from "zod";
import { hostRoute } from "@/server/http/api";
import { getAttendeeList } from "@/server/modules/reporting";

const query = z.object({
  activityId: z.uuid().optional(),
  status: z.enum(["attending", "not_attending", "maybe", "unanswered"]).optional(),
  groupId: z.uuid().optional(),
  response: z.enum(["pending", "submitted", "updated", "withdrawn"]).optional(),
  q: z.string().max(100).optional(),
});

/** Attendee-level rows behind every dashboard count. */
export const GET = hostRoute<{ eventId: string }>(async ({ req, db, user, params }) =>
  getAttendeeList(db, user.id, params.eventId, query.parse(Object.fromEntries(req.nextUrl.searchParams))),
);
