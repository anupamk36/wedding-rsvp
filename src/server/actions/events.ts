"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "../db/client";
import { requireUser } from "../auth/session";
import * as events from "../modules/events";
import { bool, num, optStr, runAction, str, strs, type ActionState } from "./run";

function eventFields(fd: FormData) {
  return {
    name: str(fd, "name"),
    description: optStr(fd, "description"),
    hostDisplayName: optStr(fd, "hostDisplayName"),
    eventType: (str(fd, "eventType") || "custom") as events.EventInput["eventType"],
    timezone: str(fd, "timezone") || "Asia/Kolkata",
    startDate: str(fd, "startDate"),
    endDate: str(fd, "endDate") || str(fd, "startDate"),
    venueName: optStr(fd, "venueName"),
    venueAddress: optStr(fd, "venueAddress"),
    rsvpDeadlineLocal: optStr(fd, "rsvpDeadlineLocal"),
    visibility: (str(fd, "visibility") || "private") as "private" | "link",
  };
}

export async function createEventAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const state = await runAction(async () => {
    const user = await requireUser();
    const event = await events.createEvent(await getDb(), user.id, { ...eventFields(fd), useTemplate: fd.get("useTemplate") !== "off" });
    id = event.id;
  });
  if (state.ok) redirect(`/events/${id}`);
  return state;
}

export async function updateEventAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await events.updateEvent(await getDb(), user.id, eventId, eventFields(fd));
    refresh();
    return { ok: true, message: "Event details saved." };
  });
}

export async function updateSettingsAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const dietaryOptions = str(fd, "dietaryOptions")
      .split(",")
      .map((s) => s.trim().toLowerCase().replace(/\s+/g, "_"))
      .filter(Boolean);
    const weight = num(fd, "tentativeWeight");
    await events.updateEventSettings(await getDb(), user.id, eventId, {
      allowMaybe: bool(fd, "allowMaybe"),
      allowGuestEdits: bool(fd, "allowGuestEdits"),
      latePolicy: str(fd, "latePolicy") || "accept_flag",
      showForecast: bool(fd, "showForecast"),
      tentativeWeight: weight == null ? 0.5 : weight / 100,
      availabilityMode: bool(fd, "availabilityMode"),
      minParticipants: num(fd, "minParticipants"),
      notifyHostOnResponse: bool(fd, "notifyHostOnResponse"),
      sendGuestConfirmation: bool(fd, "sendGuestConfirmation"),
      dietaryOptions,
      features: {
        plusOnes: bool(fd, "f_plusOnes"),
        accommodation: bool(fd, "f_accommodation"),
        meals: bool(fd, "f_meals"),
        dietary: bool(fd, "f_dietary"),
        transport: bool(fd, "f_transport"),
        accessibility: bool(fd, "f_accessibility"),
      },
      theme: { accent: str(fd, "accent") || "rose", coverImageUrl: optStr(fd, "coverImageUrl") },
    });
    refresh();
    return { ok: true, message: "Settings saved." };
  });
}

export async function setEventStatusAction(eventId: string, status: "draft" | "published") {
  const user = await requireUser();
  await events.setEventStatus(await getDb(), user.id, eventId, status);
  refresh();
}

export async function archiveEventAction(eventId: string, archive: boolean) {
  const user = await requireUser();
  await events.archiveEvent(await getDb(), user.id, eventId, archive);
  if (archive) redirect("/dashboard");
  refresh();
}

export async function deleteEventAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const user = await requireUser();
    await events.deleteEvent(await getDb(), user.id, eventId, str(fd, "confirmName"));
  });
  if (state.ok) redirect("/dashboard");
  return state;
}

export async function duplicateEventAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const state = await runAction(async () => {
    const user = await requireUser();
    id = (await events.duplicateEvent(await getDb(), user.id, eventId, optStr(fd, "startDate") ?? undefined)).id;
  });
  if (state.ok) redirect(`/events/${id}`);
  return state;
}

export async function addCollaboratorAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await events.addCollaborator(await getDb(), user.id, eventId, {
      email: str(fd, "email"),
      role: (str(fd, "role") || "viewer") as "organizer" | "viewer",
    });
    refresh();
    return { ok: true, message: "Collaborator added." };
  });
}

export async function removeCollaboratorAction(eventId: string, memberUserId: string) {
  const user = await requireUser();
  await events.removeCollaborator(await getDb(), user.id, eventId, memberUserId);
  refresh();
}

// Activities ----------------------------------------------------------------

function activityFields(fd: FormData): events.ActivityInput {
  return {
    name: str(fd, "name"),
    description: optStr(fd, "description"),
    date: str(fd, "date"),
    startTime: str(fd, "startTime"),
    endTime: optStr(fd, "endTime"),
    venueName: optStr(fd, "venueName"),
    venueAddress: optStr(fd, "venueAddress"),
    attendanceRequested: fd.has("attendanceRequested") ? bool(fd, "attendanceRequested") : true,
    allowDecline: fd.has("allowDecline") ? bool(fd, "allowDecline") : true,
    capacity: num(fd, "capacity"),
    eligibility: (str(fd, "eligibility") || "all") as "all" | "groups",
    eligibleGroupIds: strs(fd, "eligibleGroupIds"),
  };
}

export async function saveActivityAction(eventId: string, activityId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const db = await getDb();
    if (activityId) await events.updateActivity(db, user.id, activityId, activityFields(fd));
    else await events.createActivity(db, user.id, eventId, activityFields(fd));
    refresh();
    return { ok: true, message: activityId ? "Activity updated." : "Activity added." };
  });
}

export async function deleteActivityAction(activityId: string) {
  const user = await requireUser();
  await events.deleteActivity(await getDb(), user.id, activityId);
  refresh();
}
