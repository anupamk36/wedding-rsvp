import { hostRoute, readJson } from "@/server/http/api";
import { requireEventAccess } from "@/server/modules/access";
import { archiveEvent, updateEvent, updateEventSettings, type EventInput } from "@/server/modules/events";

type P = { eventId: string };

export const GET = hostRoute<P>(async ({ db, user, params }) => {
  const { event, role } = await requireEventAccess(db, user.id, params.eventId, "view");
  return { event, role };
});

/** Body: event fields, and/or `settings` (partial settings patch). */
export const PATCH = hostRoute<P>(async ({ req, db, user, params }) => {
  const body = (await readJson(req)) as Partial<EventInput> & { settings?: unknown };
  const { settings, ...fields } = body;
  if (Object.keys(fields).length) {
    const { event } = await requireEventAccess(db, user.id, params.eventId, "admin");
    await updateEvent(db, user.id, params.eventId, { ...eventToInput(event), ...fields } as EventInput);
  }
  if (settings !== undefined) await updateEventSettings(db, user.id, params.eventId, settings);
  return { event: (await requireEventAccess(db, user.id, params.eventId, "view")).event };
});

/** Archives the event. Permanent deletion is only available from the settings page. */
export const DELETE = hostRoute<P>(async ({ db, user, params }) => {
  await archiveEvent(db, user.id, params.eventId, true);
  return { ok: true, archived: true };
});

function eventToInput(e: Awaited<ReturnType<typeof requireEventAccess>>["event"]): EventInput {
  return {
    name: e.name,
    description: e.description,
    hostDisplayName: e.hostDisplayName,
    eventType: e.eventType,
    timezone: e.timezone,
    startDate: e.startDate,
    endDate: e.endDate,
    venueName: e.venueName,
    venueAddress: e.venueAddress,
    rsvpDeadlineLocal: null,
    visibility: e.visibility,
  };
}
