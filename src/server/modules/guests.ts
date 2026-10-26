import { and, asc, eq, gt, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import Papa from "papaparse";
import { z } from "zod";
import type { DbExecutor } from "../db/connect";
import { guestGroupMemberships, guestGroups, guests, households, invitations } from "../db/schema";
import { conflict, invalid, isUniqueViolation, notFound } from "../lib/errors";
import { requireEventAccess } from "./access";
import { audit } from "./audit";
import { invitationScopeSql, syncAutoPermissions } from "./invitations";

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d]/g, "");
  const normalized = (trimmed.startsWith("+") ? "+" : "") + digits;
  if (digits.length < 7 || digits.length > 15) throw invalid(`"${raw}" is not a valid phone number.`);
  return normalized;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const guestInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(160),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.email("Enter a valid email.").nullable()),
  phone: optionalText(40),
  householdId: z.uuid().optional().nullable().or(z.literal("").transform(() => null)),
  relationship: optionalText(80),
  notes: optionalText(2000),
  groupIds: z.array(z.uuid()).optional(),
});
export type GuestInput = z.input<typeof guestInputSchema>;

function duplicateMessage(e: unknown): string | null {
  if (isUniqueViolation(e, "guests_event_email_uq")) return "A guest with this email already exists in this event.";
  if (isUniqueViolation(e, "guests_event_phone_uq")) return "A guest with this phone number already exists in this event.";
  return null;
}

async function assertGroupsInEvent(db: DbExecutor, eventId: string, groupIds: string[]) {
  if (!groupIds.length) return;
  const found = await db
    .select({ id: guestGroups.id })
    .from(guestGroups)
    .where(and(eq(guestGroups.eventId, eventId), inArray(guestGroups.id, groupIds)));
  if (found.length !== new Set(groupIds).size) throw invalid("Unknown guest group.");
}

/**
 * Prevents a guest from being covered twice: joining a household that has its
 * own invitation while the guest also holds an individual invitation.
 */
async function assertHouseholdChangeAllowed(db: DbExecutor, eventId: string, guestId: string | null, householdId: string | null) {
  if (!householdId) return;
  const [h] = await db.select().from(households).where(and(eq(households.id, householdId), eq(households.eventId, eventId)));
  if (!h) throw invalid("Unknown household.");
  if (!guestId) return;
  const [hasIndividual] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.guestId, guestId), sql`${invitations.status} <> 'revoked'`));
  const [hasHousehold] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.householdId, householdId), sql`${invitations.status} <> 'revoked'`));
  if (hasIndividual && hasHousehold) {
    throw conflict("This guest has their own invitation and the household has one too. Revoke one of them first.");
  }
}

export async function createGuest(db: DbExecutor, userId: string, eventId: string, input: GuestInput) {
  await requireEventAccess(db, userId, eventId, "manage");
  const data = guestInputSchema.parse(input);
  const phone = normalizePhone(data.phone);
  await assertGroupsInEvent(db, eventId, data.groupIds ?? []);
  await assertHouseholdChangeAllowed(db, eventId, null, data.householdId ?? null);
  try {
    return await db.transaction(async (tx) => {
      const [guest] = await tx
        .insert(guests)
        .values({
          eventId,
          name: data.name,
          email: data.email,
          phone,
          householdId: data.householdId ?? null,
          relationship: data.relationship,
          notes: data.notes,
        })
        .returning();
      if (data.groupIds?.length) {
        await tx
          .insert(guestGroupMemberships)
          .values([...new Set(data.groupIds)].map((guestGroupId) => ({ guestGroupId, guestId: guest.id })));
      }
      if (guest.householdId || data.groupIds?.length) await syncAutoPermissions(tx, eventId);
      await audit(tx, { kind: "user", userId }, { eventId, action: "guest.created", entityType: "guest", entityId: guest.id });
      return guest;
    });
  } catch (e) {
    const msg = duplicateMessage(e);
    if (msg) throw conflict(msg);
    throw e;
  }
}

async function loadGuest(db: DbExecutor, userId: string, guestId: string) {
  const [guest] = await db.select().from(guests).where(eq(guests.id, guestId));
  if (!guest) throw notFound("Guest");
  await requireEventAccess(db, userId, guest.eventId, "manage");
  return guest;
}

export async function updateGuest(db: DbExecutor, userId: string, guestId: string, input: GuestInput) {
  const guest = await loadGuest(db, userId, guestId);
  const data = guestInputSchema.parse(input);
  const phone = normalizePhone(data.phone);
  if (guest.plusOneOfInvitationId && data.householdId) throw invalid("Plus-ones cannot be added to a household.");
  if (data.groupIds) await assertGroupsInEvent(db, guest.eventId, data.groupIds);
  if (data.householdId !== guest.householdId) {
    await assertHouseholdChangeAllowed(db, guest.eventId, guest.id, data.householdId ?? null);
  }
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .update(guests)
        .set({
          name: data.name,
          email: data.email,
          phone,
          householdId: data.householdId ?? null,
          relationship: data.relationship,
          notes: data.notes,
        })
        .where(eq(guests.id, guestId))
        .returning();
      if (data.groupIds) {
        await tx.delete(guestGroupMemberships).where(eq(guestGroupMemberships.guestId, guestId));
        if (data.groupIds.length) {
          await tx
            .insert(guestGroupMemberships)
            .values([...new Set(data.groupIds)].map((guestGroupId) => ({ guestGroupId, guestId })));
        }
      }
      await syncAutoPermissions(tx, guest.eventId);
      await audit(tx, { kind: "user", userId }, {
        eventId: guest.eventId,
        action: "guest.updated",
        entityType: "guest",
        entityId: guestId,
        before: { name: guest.name, householdId: guest.householdId },
        after: { name: row.name, householdId: row.householdId },
      });
      return row;
    });
  } catch (e) {
    const msg = duplicateMessage(e);
    if (msg) throw conflict(msg);
    throw e;
  }
}

export async function deleteGuest(db: DbExecutor, userId: string, guestId: string) {
  const guest = await loadGuest(db, userId, guestId);
  await db.transaction(async (tx) => {
    await tx.delete(guests).where(eq(guests.id, guestId));
    await audit(tx, { kind: "user", userId }, {
      eventId: guest.eventId,
      action: "guest.deleted",
      entityType: "guest",
      entityId: guestId,
    });
  });
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export const guestListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  groupId: z.uuid().optional(),
  householdId: z.uuid().optional(),
  invited: z.enum(["yes", "no"]).optional(),
  response: z.enum(["pending", "submitted", "updated", "withdrawn"]).optional(),
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function encodeCursor(name: string, id: string) {
  return Buffer.from(JSON.stringify([name, id])).toString("base64url");
}
function decodeCursor(cursor: string): [string, string] | null {
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "string" ? [v[0], v[1]] : null;
  } catch {
    return null;
  }
}

export async function listGuests(db: DbExecutor, userId: string, eventId: string, query: unknown = {}) {
  await requireEventAccess(db, userId, eventId, "view");
  const q = guestListQuerySchema.parse(query);
  const scope = invitationScopeSql(eventId);
  const conds: SQL[] = [eq(guests.eventId, eventId)];
  if (q.q) {
    const term = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(guests.name, term), ilike(guests.email, term), ilike(guests.phone, term))!);
  }
  if (q.groupId) {
    conds.push(sql`exists (select 1 from guest_group_memberships m where m.guest_id = ${guests.id} and m.guest_group_id = ${q.groupId})`);
  }
  if (q.householdId) conds.push(eq(guests.householdId, q.householdId));
  if (q.invited === "yes") conds.push(sql`exists (select 1 from ${scope} s where s.guest_id = ${guests.id})`);
  if (q.invited === "no") conds.push(sql`not exists (select 1 from ${scope} s where s.guest_id = ${guests.id})`);
  if (q.response) {
    conds.push(sql`exists (select 1 from ${scope} s join invitations i on i.id = s.invitation_id where s.guest_id = ${guests.id} and i.response_status = ${q.response})`);
  }
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;
  if (cursor) conds.push(or(gt(guests.name, cursor[0]), and(eq(guests.name, cursor[0]), gt(guests.id, cursor[1])))!);

  const rows = await db
    .select({
      guest: guests,
      householdName: households.name,
      invitationId: sql<string | null>`(select s.invitation_id from ${scope} s where s.guest_id = ${guests.id} limit 1)`,
      responseStatus: sql<string | null>`(select i.response_status::text from ${scope} s join invitations i on i.id = s.invitation_id where s.guest_id = ${guests.id} limit 1)`,
      groupIds: sql<string[]>`coalesce((select array_agg(m.guest_group_id::text) from guest_group_memberships m where m.guest_id = ${guests.id}), '{}')`,
    })
    .from(guests)
    .leftJoin(households, eq(households.id, guests.householdId))
    .where(and(...conds))
    .orderBy(asc(guests.name), asc(guests.id))
    .limit(q.limit + 1);

  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return {
    items: page,
    nextCursor: hasMore && last ? encodeCursor(last.guest.name, last.guest.id) : null,
  };
}

export async function guestCounts(db: DbExecutor, eventId: string) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      plusOnes: sql<number>`count(${guests.plusOneOfInvitationId})::int`,
    })
    .from(guests)
    .where(eq(guests.eventId, eventId));
  return row;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function listGroups(db: DbExecutor, eventId: string) {
  return db
    .select({
      id: guestGroups.id,
      name: guestGroups.name,
      description: guestGroups.description,
      memberCount: sql<number>`(select count(*)::int from guest_group_memberships m where m.guest_group_id = ${guestGroups.id})`,
    })
    .from(guestGroups)
    .where(eq(guestGroups.eventId, eventId))
    .orderBy(asc(guestGroups.name));
}

export async function createGroup(db: DbExecutor, userId: string, eventId: string, input: { name: string; description?: string | null }) {
  await requireEventAccess(db, userId, eventId, "manage");
  const name = z.string().trim().min(1, "Name the group.").max(80).parse(input.name);
  try {
    const [g] = await db
      .insert(guestGroups)
      .values({ eventId, name, description: input.description?.trim() || null })
      .returning();
    await audit(db, { kind: "user", userId }, { eventId, action: "group.created", entityType: "guest_group", entityId: g.id });
    return g;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("A group with this name already exists.");
    throw e;
  }
}

export async function deleteGroup(db: DbExecutor, userId: string, groupId: string) {
  const [g] = await db.select().from(guestGroups).where(eq(guestGroups.id, groupId));
  if (!g) throw notFound("Group");
  await requireEventAccess(db, userId, g.eventId, "manage");
  await db.transaction(async (tx) => {
    await tx.delete(guestGroups).where(eq(guestGroups.id, groupId));
    await syncAutoPermissions(tx, g.eventId);
    await audit(tx, { kind: "user", userId }, { eventId: g.eventId, action: "group.deleted", entityType: "guest_group", entityId: groupId });
  });
}

export async function setGroupMembership(
  db: DbExecutor,
  userId: string,
  eventId: string,
  input: { groupId: string; guestIds: string[]; member: boolean },
) {
  await requireEventAccess(db, userId, eventId, "manage");
  await assertGroupsInEvent(db, eventId, [input.groupId]);
  const ids = [...new Set(input.guestIds)];
  if (!ids.length) return;
  const valid = await db
    .select({ id: guests.id })
    .from(guests)
    .where(and(eq(guests.eventId, eventId), inArray(guests.id, ids)));
  if (valid.length !== ids.length) throw invalid("Unknown guest.");
  await db.transaction(async (tx) => {
    if (input.member) {
      await tx
        .insert(guestGroupMemberships)
        .values(ids.map((guestId) => ({ guestGroupId: input.groupId, guestId })))
        .onConflictDoNothing();
    } else {
      await tx
        .delete(guestGroupMemberships)
        .where(and(eq(guestGroupMemberships.guestGroupId, input.groupId), inArray(guestGroupMemberships.guestId, ids)));
    }
    await syncAutoPermissions(tx, eventId);
  });
}

// ---------------------------------------------------------------------------
// Households
// ---------------------------------------------------------------------------

export async function listHouseholds(db: DbExecutor, eventId: string) {
  return db
    .select({
      id: households.id,
      name: households.name,
      primaryGuestId: households.primaryGuestId,
      memberCount: sql<number>`(select count(*)::int from guests g where g.household_id = ${households.id})`,
    })
    .from(households)
    .where(eq(households.eventId, eventId))
    .orderBy(asc(households.name));
}

export async function createHousehold(
  db: DbExecutor,
  userId: string,
  eventId: string,
  input: { name: string; members?: GuestInput[] },
) {
  await requireEventAccess(db, userId, eventId, "manage");
  const name = z.string().trim().min(1, "Name the household.").max(160).parse(input.name);
  const members = (input.members ?? []).map((m) => guestInputSchema.parse(m));
  try {
    return await db.transaction(async (tx) => {
      const [h] = await tx.insert(households).values({ eventId, name }).returning();
      let primary: string | null = null;
      for (const m of members) {
        const [g] = await tx
          .insert(guests)
          .values({
            eventId,
            name: m.name,
            email: m.email,
            phone: normalizePhone(m.phone),
            householdId: h.id,
            relationship: m.relationship,
          })
          .returning({ id: guests.id });
        primary ??= g.id;
      }
      if (primary) await tx.update(households).set({ primaryGuestId: primary }).where(eq(households.id, h.id));
      await audit(tx, { kind: "user", userId }, {
        eventId,
        action: "household.created",
        entityType: "household",
        entityId: h.id,
        after: { members: members.length },
      });
      return h;
    });
  } catch (e) {
    const msg = duplicateMessage(e);
    if (msg) throw conflict(msg);
    throw e;
  }
}

export async function renameHousehold(db: DbExecutor, userId: string, householdId: string, input: { name: string; primaryGuestId?: string | null }) {
  const [h] = await db.select().from(households).where(eq(households.id, householdId));
  if (!h) throw notFound("Household");
  await requireEventAccess(db, userId, h.eventId, "manage");
  const name = z.string().trim().min(1).max(160).parse(input.name);
  if (input.primaryGuestId) {
    const [g] = await db
      .select({ id: guests.id })
      .from(guests)
      .where(and(eq(guests.id, input.primaryGuestId), eq(guests.householdId, householdId)));
    if (!g) throw invalid("The primary contact must be a member of the household.");
  }
  await db
    .update(households)
    .set({ name, primaryGuestId: input.primaryGuestId === undefined ? h.primaryGuestId : input.primaryGuestId })
    .where(eq(households.id, householdId));
}

export async function deleteHousehold(db: DbExecutor, userId: string, householdId: string) {
  const [h] = await db.select().from(households).where(eq(households.id, householdId));
  if (!h) throw notFound("Household");
  await requireEventAccess(db, userId, h.eventId, "manage");
  // Members stay as individual guests (household_id is set null by the FK); the household invitation is removed.
  await db.transaction(async (tx) => {
    await tx.delete(households).where(eq(households.id, householdId));
    await audit(tx, { kind: "user", userId }, { eventId: h.eventId, action: "household.deleted", entityType: "household", entityId: householdId });
  });
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportRowResult {
  row: number;
  name: string;
  status: "created" | "merged" | "error";
  message?: string;
}

const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  "full name": "name",
  guest: "name",
  email: "email",
  "e-mail": "email",
  phone: "phone",
  mobile: "phone",
  whatsapp: "phone",
  household: "household",
  family: "household",
  groups: "groups",
  group: "groups",
  relationship: "relationship",
  notes: "notes",
};

/** Parse CSV (with header) or a pasted list ("Name, email, phone" per line). */
export function parseGuestList(text: string): Record<string, string>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const firstLine = trimmed.split(/\r?\n/, 1)[0].toLowerCase();
  const hasHeader = firstLine.split(/[,\t]/).some((h) => HEADER_ALIASES[h.trim()] === "name");
  if (hasHeader) {
    const parsed = Papa.parse<Record<string, string>>(trimmed, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim().toLowerCase(),
    });
    return parsed.data;
  }
  return trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      const row: Record<string, string> = { name: parts[0] ?? "" };
      for (const p of parts.slice(1)) {
        if (p.includes("@")) row.email = p;
        else if (/\d{5,}/.test(p.replace(/[\s()-]/g, ""))) row.phone = p;
      }
      return row;
    });
}

export const MAX_IMPORT_ROWS = 2000;

export async function importGuests(db: DbExecutor, userId: string, eventId: string, text: string) {
  await requireEventAccess(db, userId, eventId, "manage");
  const rows = parseGuestList(text);
  if (rows.length > MAX_IMPORT_ROWS) throw invalid(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
  const results: ImportRowResult[] = [];

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: guests.id, email: guests.email, phone: guests.phone })
      .from(guests)
      .where(eq(guests.eventId, eventId));
    const byEmail = new Map(existing.filter((g) => g.email).map((g) => [g.email!.toLowerCase(), g.id]));
    const byPhone = new Map(existing.filter((g) => g.phone).map((g) => [g.phone!, g.id]));
    const groupCache = new Map(
      (await tx.select().from(guestGroups).where(eq(guestGroups.eventId, eventId))).map((g) => [g.name.toLowerCase(), g.id]),
    );
    const householdCache = new Map(
      (await tx.select().from(households).where(eq(households.eventId, eventId))).map((h) => [h.name.toLowerCase(), h.id]),
    );

    const groupId = async (name: string) => {
      const key = name.toLowerCase();
      if (!groupCache.has(key)) {
        const [g] = await tx.insert(guestGroups).values({ eventId, name }).returning({ id: guestGroups.id });
        groupCache.set(key, g.id);
      }
      return groupCache.get(key)!;
    };
    const householdId = async (name: string) => {
      const key = name.toLowerCase();
      if (!householdCache.has(key)) {
        const [h] = await tx.insert(households).values({ eventId, name }).returning({ id: households.id });
        householdCache.set(key, h.id);
      }
      return householdCache.get(key)!;
    };

    for (const [i, raw] of rows.entries()) {
      const rowNo = i + 1;
      const parsed = guestInputSchema.safeParse({
        name: raw.name,
        email: raw.email,
        phone: raw.phone,
        relationship: raw.relationship,
        notes: raw.notes,
      });
      if (!parsed.success) {
        results.push({ row: rowNo, name: raw.name ?? "", status: "error", message: parsed.error.issues[0].message });
        continue;
      }
      let phone: string | null;
      try {
        phone = normalizePhone(parsed.data.phone);
      } catch (e) {
        results.push({ row: rowNo, name: parsed.data.name, status: "error", message: (e as Error).message });
        continue;
      }
      const groupNames = (raw.groups ?? "")
        .split(/[;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
      const groupIds = await Promise.all(groupNames.map(groupId));

      const dupId = (parsed.data.email && byEmail.get(parsed.data.email)) || (phone && byPhone.get(phone));
      if (dupId) {
        if (groupIds.length) {
          await tx
            .insert(guestGroupMemberships)
            .values(groupIds.map((guestGroupId) => ({ guestGroupId, guestId: dupId })))
            .onConflictDoNothing();
        }
        results.push({
          row: rowNo,
          name: parsed.data.name,
          status: "merged",
          message: groupIds.length ? "Already on the list; groups were added." : "Already on the list; skipped.",
        });
        continue;
      }

      const hName = raw.household?.trim();
      const [g] = await tx
        .insert(guests)
        .values({
          eventId,
          name: parsed.data.name,
          email: parsed.data.email,
          phone,
          relationship: parsed.data.relationship,
          notes: parsed.data.notes,
          householdId: hName ? await householdId(hName.slice(0, 160)) : null,
        })
        .returning({ id: guests.id });
      if (parsed.data.email) byEmail.set(parsed.data.email, g.id);
      if (phone) byPhone.set(phone, g.id);
      if (groupIds.length) {
        await tx.insert(guestGroupMemberships).values([...new Set(groupIds)].map((guestGroupId) => ({ guestGroupId, guestId: g.id })));
      }
      results.push({ row: rowNo, name: parsed.data.name, status: "created" });
    }

    // Households created by the import get a primary contact.
    await tx.execute(sql`
      update households h set primary_guest_id = (
        select g.id from guests g where g.household_id = h.id order by g.created_at, g.id limit 1)
      where h.event_id = ${eventId} and h.primary_guest_id is null`);
    await syncAutoPermissions(tx, eventId);
    await audit(tx, { kind: "user", userId }, {
      eventId,
      action: "guest.imported",
      entityType: "guest",
      after: {
        created: results.filter((r) => r.status === "created").length,
        merged: results.filter((r) => r.status === "merged").length,
        errors: results.filter((r) => r.status === "error").length,
      },
    });
  });
  return results;
}


export async function getGuest(db: DbExecutor, userId: string, eventId: string, guestId: string) {
  await requireEventAccess(db, userId, eventId, "view");
  const [guest] = await db.select().from(guests).where(and(eq(guests.id, guestId), eq(guests.eventId, eventId)));
  if (!guest) throw notFound("Guest");
  const memberships = await db
    .select({ id: guestGroupMemberships.guestGroupId })
    .from(guestGroupMemberships)
    .where(eq(guestGroupMemberships.guestId, guestId));
  return { ...guest, groupIds: memberships.map((m) => m.id) };
}
