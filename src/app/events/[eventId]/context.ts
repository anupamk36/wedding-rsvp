import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { parseSettings } from "@/domain/settings";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/lib/errors";
import { requireEventAccess, roleAllows } from "@/server/modules/access";

/** Event + role for the signed-in user, shared by the layout and page in one request. */
export const getEventContext = cache(async (eventId: string) => {
  const user = await requireUser();
  const db = await getDb();
  try {
    const { event, role } = await requireEventAccess(db, user.id, eventId, "view");
    return {
      db,
      user,
      event,
      role,
      settings: parseSettings(event.settings),
      canManage: roleAllows(role, "manage") && !event.archivedAt,
      isOwner: role === "owner",
    };
  } catch (e) {
    if (e instanceof AppError && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  }
});

export type EventContext = Awaited<ReturnType<typeof getEventContext>>;
