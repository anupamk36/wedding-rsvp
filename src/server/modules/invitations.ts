import { and, asc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { queryRows, type DbExecutor } from "../db/connect";
import {
  activities,
  events,
  guests,
  households,
  invitationActivityPermissions,
  invitations,
} from "../db/schema";
import { decrypt, encrypt, generateToken, sha256 } from "../lib/crypto";
import { conflict, invalid, isUniqueViolation, notFound } from "../lib/errors";
import { requireEventAccess } from "./access";
import { audit } from "./audit";
import { appUrlOrLocal } from "../lib/app-url";

export type InvitationRow = typeof invitations.$inferSelect;

/**
 * Rows of (invitation_id, guest_id) for everyone an invitation covers: the
 * invited guest or household members, plus plus-ones added through it.
 */
export function invitationScopeSql(eventId: string, { activeOnly = true } = {}): SQL {
  const active = activeOnly ? sql`and i.status <> 'revoked'` : sql``;
  return sql`(
    select i.id as invitation_id, g.id as guest_id
      from invitations i join guests g on g.id = i.guest_id
     where i.event_id = ${eventId} ${active}
    union
    select i.id, g.id
      from invitations i join guests g on g.household_id = i.household_id and g.plus_one_of_invitation_id is null
     where i.event_id = ${eventId} and i.household_id is not null ${active}
    union
    select i.id, g.id
      from invitations i join guests g on g.plus_one_of_invitation_id = i.id
     where i.event_id = ${eventId} ${active}
  )`;
}

/** Recompute activity permissions for every invitation in "auto" scope. */
export async function syncAutoPermissions(db: DbExecutor, eventId: string): Promise<void> {
  await db.execute(sql`
    delete from invitation_activity_permissions p
     using invitations i
     where p.invitation_id = i.id and i.event_id = ${eventId} and i.activity_scope = 'auto'`);
  await db.execute(sql`
    insert into invitation_activity_permissions (invitation_id, activity_id)
    select distinct s.invitation_id, a.id
      from ${invitationScopeSql(eventId, { activeOnly: false })} s
      join invitations i on i.id = s.invitation_id and i.activity_scope = 'auto'
      join activities a on a.event_id = ${eventId}
     where a.eligibility = 'all'
        or exists (
          select 1 from activity_eligible_groups eg
            join guest_group_memberships m on m.guest_group_id = eg.guest_group_id
           where eg.activity_id = a.id and m.guest_id = s.guest_id)
    on conflict do nothing`);
}

export async function scopeGuestIds(db: DbExecutor, invitation: Pick<InvitationRow, "id" | "guestId" | "householdId">) {
  const rows = await db
    .select({ id: guests.id })
    .from(guests)
    .where(
      sql`${guests.plusOneOfInvitationId} = ${invitation.id}
        or ${invitation.guestId ? sql`${guests.id} = ${invitation.guestId}` : sql`false`}
        or ${invitation.householdId ? sql`(${guests.householdId} = ${invitation.householdId} and ${guests.plusOneOfInvitationId} is null)` : sql`false`}`,
    );
  return rows.map((r) => r.id);
}

function newToken() {
  const token = generateToken();
  return { token, tokenHash: sha256(token), tokenCiphertext: encrypt(token) };
}

export function invitationUrl(tokenCiphertext: string): string {
  return `${appUrlOrLocal()}/i/${decrypt(tokenCiphertext)}`;
}

/** Like invitationUrl, but null when the stored token can't be decrypted (e.g. APP_SECRET changed). */
export function tryInvitationUrl(tokenCiphertext: string): string | null {
  try {
    return invitationUrl(tokenCiphertext);
  } catch {
    return null;
  }
}

export const invitationTargetSchema = z.union([
  z.object({ guestId: z.uuid() }),
  z.object({ householdId: z.uuid() }),
]);

/** Guests that are already covered by an active invitation, for conflict checks. */
async function coveredGuestIds(db: DbExecutor, eventId: string): Promise<Set<string>> {
  const rows = await queryRows<{ guest_id: string }>(db, sql`select guest_id from ${invitationScopeSql(eventId)} s`);
  return new Set(rows.map((r) => r.guest_id));
}

export async function createInvitation(
  db: DbExecutor,
  userId: string,
  eventId: string,
  input: { guestId?: string; householdId?: string; plusOnesAllowed?: number },
) {
  await requireEventAccess(db, userId, eventId, "manage");
  const target = invitationTargetSchema.parse(
    input.householdId ? { householdId: input.householdId } : { guestId: input.guestId },
  );
  const plusOnesAllowed = z.number().int().min(0).max(20).parse(input.plusOnesAllowed ?? 0);

  return db.transaction(async (tx) => {
    let memberIds: string[];
    if ("guestId" in target) {
      const [g] = await tx.select().from(guests).where(and(eq(guests.id, target.guestId), eq(guests.eventId, eventId)));
      if (!g) throw notFound("Guest");
      if (g.plusOneOfInvitationId) throw invalid("Plus-ones are managed through the invitation that added them.");
      memberIds = [g.id];
    } else {
      const [h] = await tx
        .select()
        .from(households)
        .where(and(eq(households.id, target.householdId), eq(households.eventId, eventId)));
      if (!h) throw notFound("Household");
      const members = await tx
        .select({ id: guests.id })
        .from(guests)
        .where(and(eq(guests.householdId, h.id), isNull(guests.plusOneOfInvitationId)));
      if (!members.length) throw invalid("Add at least one person to this household first.");
      memberIds = members.map((m) => m.id);
    }
    const covered = await coveredGuestIds(tx, eventId);
    if (memberIds.some((id) => covered.has(id))) {
      throw conflict("Someone in this invitation is already covered by another active invitation.");
    }
    const t = newToken();
    try {
      const [inv] = await tx
        .insert(invitations)
        .values({
          eventId,
          guestId: "guestId" in target ? target.guestId : null,
          householdId: "householdId" in target ? target.householdId : null,
          tokenHash: t.tokenHash,
          tokenCiphertext: t.tokenCiphertext,
          plusOnesAllowed,
        })
        .returning();
      await syncAutoPermissions(tx, eventId);
      await audit(tx, { kind: "user", userId }, {
        eventId,
        action: "invitation.created",
        entityType: "invitation",
        entityId: inv.id,
        after: target,
      });
      return inv;
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("An active invitation already exists for this guest or household.");
      throw e;
    }
  });
}

/** Creates one invitation per household and per guest not in a household, for everyone not yet invited. */
export async function inviteAllUninvited(
  db: DbExecutor,
  userId: string,
  eventId: string,
  { plusOnesAllowed = 0 }: { plusOnesAllowed?: number } = {},
): Promise<number> {
  await requireEventAccess(db, userId, eventId, "manage");
  return db.transaction(async (tx) => {
    const covered = await coveredGuestIds(tx, eventId);
    const all = await tx
      .select({ id: guests.id, householdId: guests.householdId })
      .from(guests)
      .where(and(eq(guests.eventId, eventId), isNull(guests.plusOneOfInvitationId)));
    const householdIds = new Set<string>();
    const singles: string[] = [];
    for (const g of all) {
      if (covered.has(g.id)) continue;
      if (g.householdId) householdIds.add(g.householdId);
      else singles.push(g.id);
    }
    // Skip households where any member is already individually covered.
    for (const g of all) if (g.householdId && covered.has(g.id)) householdIds.delete(g.householdId);

    const values = [
      ...[...householdIds].map((householdId) => ({ householdId, guestId: null })),
      ...singles.map((guestId) => ({ guestId, householdId: null })),
    ].map((target) => ({ eventId, ...target, ...newToken(), plusOnesAllowed }));
    if (!values.length) return 0;
    await tx.insert(invitations).values(values);
    await syncAutoPermissions(tx, eventId);
    await audit(tx, { kind: "user", userId }, {
      eventId,
      action: "invitation.bulk_created",
      entityType: "invitation",
      after: { count: values.length },
    });
    return values.length;
  });
}

async function loadInvitation(db: DbExecutor, userId: string, invitationId: string) {
  const [inv] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
  if (!inv) throw notFound("Invitation");
  const access = await requireEventAccess(db, userId, inv.eventId, "manage");
  return { inv, ...access };
}

export async function revokeInvitation(db: DbExecutor, userId: string, invitationId: string) {
  const { inv } = await loadInvitation(db, userId, invitationId);
  if (inv.status === "revoked") return inv;
  const [row] = await db
    .update(invitations)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(invitations.id, invitationId))
    .returning();
  await audit(db, { kind: "user", userId }, {
    eventId: inv.eventId,
    action: "invitation.revoked",
    entityType: "invitation",
    entityId: invitationId,
  });
  return row;
}

/** Rotates the link. Responses are kept; the old link stops working immediately. */
export async function reissueInvitation(db: DbExecutor, userId: string, invitationId: string) {
  const { inv } = await loadInvitation(db, userId, invitationId);
  if (inv.status === "revoked") throw invalid("Create a new invitation instead of reissuing a revoked one.");
  const t = newToken();
  const [row] = await db
    .update(invitations)
    .set({ tokenHash: t.tokenHash, tokenCiphertext: t.tokenCiphertext })
    .where(eq(invitations.id, invitationId))
    .returning();
  await audit(db, { kind: "user", userId }, {
    eventId: inv.eventId,
    action: "invitation.reissued",
    entityType: "invitation",
    entityId: invitationId,
  });
  return { invitation: row, url: invitationUrl(row.tokenCiphertext) };
}

export async function markInvitationsSent(db: DbExecutor, userId: string, eventId: string, invitationIds: string[]) {
  await requireEventAccess(db, userId, eventId, "manage");
  if (!invitationIds.length) return;
  await db
    .update(invitations)
    .set({ status: "sent", sentAt: new Date() })
    .where(
      and(
        eq(invitations.eventId, eventId),
        inArray(invitations.id, invitationIds),
        inArray(invitations.status, ["draft", "failed"]),
      ),
    );
}

export const invitationUpdateSchema = z.object({
  plusOnesAllowed: z.coerce.number().int().min(0).max(20).optional(),
  activityScope: z.enum(["auto", "custom"]).optional(),
  activityIds: z.array(z.uuid()).optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export async function updateInvitation(db: DbExecutor, userId: string, invitationId: string, input: unknown) {
  const { inv } = await loadInvitation(db, userId, invitationId);
  const data = invitationUpdateSchema.parse(input);
  return db.transaction(async (tx) => {
    if (data.plusOnesAllowed !== undefined) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(guests)
        .where(eq(guests.plusOneOfInvitationId, invitationId));
      if (n > data.plusOnesAllowed) {
        throw invalid(`This invitation already has ${n} plus-one(s). Remove them before lowering the limit.`);
      }
    }
    await tx
      .update(invitations)
      .set({
        plusOnesAllowed: data.plusOnesAllowed,
        activityScope: data.activityScope,
        expiresAt: data.expiresAt,
      })
      .where(eq(invitations.id, invitationId));
    if (data.activityScope === "custom") {
      const ids = data.activityIds ?? [];
      const valid = ids.length
        ? await tx
            .select({ id: activities.id })
            .from(activities)
            .where(and(eq(activities.eventId, inv.eventId), inArray(activities.id, ids)))
        : [];
      if (valid.length !== new Set(ids).size) throw invalid("Unknown activity.");
      await tx.delete(invitationActivityPermissions).where(eq(invitationActivityPermissions.invitationId, invitationId));
      if (valid.length) {
        await tx.insert(invitationActivityPermissions).values(valid.map((v) => ({ invitationId, activityId: v.id })));
      }
    } else if (data.activityScope === "auto") {
      await syncAutoPermissions(tx, inv.eventId);
    }
    await audit(tx, { kind: "user", userId }, {
      eventId: inv.eventId,
      action: "invitation.updated",
      entityType: "invitation",
      entityId: invitationId,
      after: data,
    });
  });
}

export async function listInvitations(db: DbExecutor, userId: string, eventId: string) {
  await requireEventAccess(db, userId, eventId, "view");
  const rows = await db
    .select({
      invitation: invitations,
      guestName: guests.name,
      guestEmail: guests.email,
      guestPhone: guests.phone,
      householdName: households.name,
      memberCount: sql<number>`(select count(*)::int from ${invitationScopeSql(eventId, { activeOnly: false })} s where s.invitation_id = ${invitations.id})`,
      activityCount: sql<number>`(select count(*)::int from invitation_activity_permissions p where p.invitation_id = ${invitations.id})`,
      primaryEmail: sql<string | null>`coalesce(${guests.email}, (select g2.email from guests g2 where g2.household_id = ${invitations.householdId} and g2.email is not null order by (g2.id = ${households.primaryGuestId}) desc, g2.created_at limit 1))`,
      primaryPhone: sql<string | null>`coalesce(${guests.phone}, (select g2.phone from guests g2 where g2.household_id = ${invitations.householdId} and g2.phone is not null order by (g2.id = ${households.primaryGuestId}) desc, g2.created_at limit 1))`,
    })
    .from(invitations)
    .leftJoin(guests, eq(guests.id, invitations.guestId))
    .leftJoin(households, eq(households.id, invitations.householdId))
    .where(eq(invitations.eventId, eventId))
    .orderBy(asc(sql`coalesce(${households.name}, ${guests.name})`));
  return rows.map(({ invitation: { tokenHash: _h, tokenCiphertext, ...invitation }, ...r }) => ({
    ...r,
    invitation,
    label: r.householdName ?? r.guestName ?? "Invitation",
    url: invitation.status === "revoked" ? null : tryInvitationUrl(tokenCiphertext),
  }));
}

// ---------------------------------------------------------------------------
// Public token resolution
// ---------------------------------------------------------------------------

export type ResolvedInvitation = {
  invitation: InvitationRow;
  event: typeof events.$inferSelect;
};

/** Returns null for unknown, revoked or expired links, or archived events (no distinction is exposed). */
export async function resolveInvitationToken(db: DbExecutor, token: string): Promise<ResolvedInvitation | null> {
  if (!token || token.length < 32 || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const [row] = await db
    .select({ invitation: invitations, event: events })
    .from(invitations)
    .innerJoin(events, eq(events.id, invitations.eventId))
    .where(and(eq(invitations.tokenHash, sha256(token)), ne(invitations.status, "revoked"), isNull(events.archivedAt)))
    .limit(1);
  if (!row) return null;
  if (row.invitation.expiresAt && row.invitation.expiresAt < new Date()) return null;
  return row;
}

/** Households and individual guests (outside households) not yet covered by an active invitation. */
export async function listUninvitedTargets(db: DbExecutor, userId: string, eventId: string) {
  await requireEventAccess(db, userId, eventId, "view");
  const covered = await coveredGuestIds(db, eventId);
  const all = await db
    .select({ id: guests.id, name: guests.name, householdId: guests.householdId, householdName: households.name })
    .from(guests)
    .leftJoin(households, eq(households.id, guests.householdId))
    .where(and(eq(guests.eventId, eventId), isNull(guests.plusOneOfInvitationId)))
    .orderBy(asc(guests.name));
  const blockedHouseholds = new Set(all.filter((g) => g.householdId && covered.has(g.id)).map((g) => g.householdId!));
  const householdTargets = new Map<string, { id: string; name: string; members: number }>();
  const guestTargets: { id: string; name: string }[] = [];
  for (const g of all) {
    if (covered.has(g.id)) continue;
    if (g.householdId) {
      if (blockedHouseholds.has(g.householdId)) continue;
      const h = householdTargets.get(g.householdId) ?? { id: g.householdId, name: g.householdName ?? "Household", members: 0 };
      h.members++;
      householdTargets.set(g.householdId, h);
    } else {
      guestTargets.push({ id: g.id, name: g.name });
    }
  }
  return { households: [...householdTargets.values()].sort((a, b) => a.name.localeCompare(b.name)), guests: guestTargets };
}
