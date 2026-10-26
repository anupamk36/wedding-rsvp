"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "../db/client";
import { requireUser } from "../auth/session";
import { requireEventAccess } from "../modules/access";
import * as g from "../modules/guests";
import * as inv from "../modules/invitations";
import { enqueueNotification, processDueNotifications } from "../modules/notifications";
import { clearLateFlag } from "../modules/rsvp";
import { num, optStr, runAction, str, strs, type ActionState } from "./run";

function guestFields(fd: FormData): g.GuestInput {
  return {
    name: str(fd, "name"),
    email: optStr(fd, "email"),
    phone: optStr(fd, "phone"),
    householdId: optStr(fd, "householdId"),
    relationship: optStr(fd, "relationship"),
    notes: optStr(fd, "notes"),
    groupIds: strs(fd, "groupIds"),
  };
}

export async function saveGuestAction(eventId: string, guestId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const db = await getDb();
    if (guestId) await g.updateGuest(db, user.id, guestId, guestFields(fd));
    else await g.createGuest(db, user.id, eventId, guestFields(fd));
    refresh();
    return { ok: true, message: guestId ? "Guest updated." : "Guest added." };
  });
}

export async function deleteGuestAction(eventId: string, guestId: string) {
  const user = await requireUser();
  await g.deleteGuest(await getDb(), user.id, guestId);
  redirect(`/events/${eventId}/guests`);
}

export async function importGuestsAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const file = fd.get("file");
    let text = str(fd, "text");
    if (file instanceof File && file.size > 0) {
      if (file.size > 2 * 1024 * 1024) return { error: "The file is larger than 2 MB." };
      text = await file.text();
    }
    if (!text.trim()) return { error: "Paste a list or choose a CSV file." };
    const results = await g.importGuests(await getDb(), user.id, eventId, text);
    refresh();
    const created = results.filter((r) => r.status === "created").length;
    return { ok: true, message: `${created} guest(s) added.`, data: results };
  });
}

export async function createGroupAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await g.createGroup(await getDb(), user.id, eventId, { name: str(fd, "name"), description: optStr(fd, "description") });
    refresh();
    return { ok: true, message: "Group created." };
  });
}

export async function deleteGroupAction(groupId: string) {
  const user = await requireUser();
  await g.deleteGroup(await getDb(), user.id, groupId);
  refresh();
}

export async function bulkGroupAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const guestIds = strs(fd, "guestIds");
    if (!guestIds.length) return { error: "Select at least one guest." };
    const groupId = str(fd, "groupId");
    if (!groupId) return { error: "Choose a group." };
    await g.setGroupMembership(await getDb(), user.id, eventId, { groupId, guestIds, member: str(fd, "op") !== "remove" });
    refresh();
    return { ok: true, message: "Groups updated." };
  });
}

export async function createHouseholdAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const names = strs(fd, "memberName");
    const emails = fd.getAll("memberEmail").map(String);
    const phones = fd.getAll("memberPhone").map(String);
    const relationships = fd.getAll("memberRelationship").map(String);
    const members = names
      .map((name, i) => ({ name, email: emails[i] || null, phone: phones[i] || null, relationship: relationships[i] || null }))
      .filter((m) => m.name.trim());
    await g.createHousehold(await getDb(), user.id, eventId, { name: str(fd, "name"), members });
    refresh();
    return { ok: true, message: "Household created." };
  });
}

export async function deleteHouseholdAction(householdId: string) {
  const user = await requireUser();
  await g.deleteHousehold(await getDb(), user.id, householdId);
  refresh();
}

// Invitations ---------------------------------------------------------------

export async function createInvitationAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const target = str(fd, "target");
    const [kind, id] = target.split(":");
    await inv.createInvitation(await getDb(), user.id, eventId, {
      guestId: kind === "guest" ? id : undefined,
      householdId: kind === "household" ? id : undefined,
      plusOnesAllowed: num(fd, "plusOnesAllowed") ?? 0,
    });
    refresh();
    return { ok: true, message: "Invitation created." };
  });
}

export async function inviteAllAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const n = await inv.inviteAllUninvited(await getDb(), user.id, eventId, { plusOnesAllowed: num(fd, "plusOnesAllowed") ?? 0 });
    refresh();
    return { ok: true, message: n ? `${n} invitation(s) created.` : "Everyone already has an invitation." };
  });
}

export async function revokeInvitationAction(invitationId: string) {
  const user = await requireUser();
  await inv.revokeInvitation(await getDb(), user.id, invitationId);
  refresh();
}

export async function reissueInvitationAction(invitationId: string) {
  const user = await requireUser();
  await inv.reissueInvitation(await getDb(), user.id, invitationId);
  refresh();
}

export async function markSentAction(eventId: string, invitationIds: string[]) {
  const user = await requireUser();
  await inv.markInvitationsSent(await getDb(), user.id, eventId, invitationIds);
  refresh();
}

export async function updateInvitationAction(invitationId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const scope = str(fd, "activityScope") as "auto" | "custom";
    await inv.updateInvitation(await getDb(), user.id, invitationId, {
      plusOnesAllowed: num(fd, "plusOnesAllowed") ?? 0,
      activityScope: scope || undefined,
      activityIds: scope === "custom" ? strs(fd, "activityIds") : undefined,
    });
    refresh();
    return { ok: true, message: "Invitation updated." };
  });
}

/** Queues invitation emails for invitations whose guests have an email address. */
export async function emailInvitationsAction(eventId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const db = await getDb();
    const { event } = await requireEventAccess(db, user.id, eventId, "manage");
    const ids = strs(fd, "invitationIds");
    if (!ids.length) return { error: "Select at least one invitation." };
    const rows = await inv.listInvitations(db, user.id, eventId);
    const selected = rows.filter((r) => ids.includes(r.invitation.id) && r.invitation.status !== "revoked");
    const message = optStr(fd, "message");
    let queued = 0;
    const skipped: string[] = [];
    for (const r of selected) {
      if (!r.primaryEmail) {
        skipped.push(r.label);
        continue;
      }
      await enqueueNotification(db, {
        eventId,
        // One send per invitation per day per message, so a double click never sends twice.
        idempotencyKey: `invitation:${r.invitation.id}:${new Date().toISOString().slice(0, 10)}:${message ?? ""}`.slice(0, 300),
        recipient: r.primaryEmail,
        templateKey: "invitation",
        payload: { eventName: event.name, invitationId: r.invitation.id, message },
      });
      queued++;
    }
    const sentIds = selected.filter((r) => r.primaryEmail).map((r) => r.invitation.id);
    await inv.markInvitationsSent(db, user.id, eventId, sentIds);
    after(() => processDueNotifications(db).catch((e) => console.error("[notifications]", e)));
    refresh();
    return {
      ok: true,
      message: `${queued} email(s) queued.${skipped.length ? ` No email address for: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""}.` : ""}`,
    };
  });
}

export async function clearLateFlagAction(invitationId: string) {
  const user = await requireUser();
  await clearLateFlag(await getDb(), user.id, invitationId);
  refresh();
}
