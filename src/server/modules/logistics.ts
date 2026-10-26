import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { isIsoDate } from "@/lib/dates";
import type { DbExecutor } from "../db/connect";
import {
  accommodationAssignments,
  accommodationRequests,
  activities,
  customQuestions,
  guests,
  mealActivityLinks,
  mealDefinitions,
  mealOverrides,
  transportRequests,
} from "../db/schema";
import { invalid, notFound } from "../lib/errors";
import { requireEventAccess } from "./access";
import { audit } from "./audit";

const isoDate = z.string().refine(isIsoDate, "Use a valid date.");
const timeOpt = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time.")
  .nullish()
  .or(z.literal("").transform(() => null));

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

export const mealInputSchema = z.object({
  name: z.string().trim().min(1, "Name the meal.").max(80),
  serviceDate: isoDate,
  serviceTime: timeOpt,
  basis: z.enum(["activity", "overnight", "manual"]),
  activityIds: z.array(z.uuid()).default([]),
  guestCanOptOut: z.boolean().default(false),
});

async function checkMeal(db: DbExecutor, event: { id: string; startDate: string; endDate: string }, input: unknown) {
  const data = mealInputSchema.parse(input);
  if (data.serviceDate < event.startDate || data.serviceDate > event.endDate) {
    throw invalid("The meal date must be within the event dates.");
  }
  if (data.basis === "activity" && !data.activityIds.length) throw invalid("Link at least one activity, or choose another counting rule.");
  if (data.activityIds.length) {
    const found = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.eventId, event.id), inArray(activities.id, data.activityIds)));
    if (found.length !== new Set(data.activityIds).size) throw invalid("Unknown activity.");
  }
  return data;
}

export async function createMeal(db: DbExecutor, userId: string, eventId: string, input: unknown) {
  const { event } = await requireEventAccess(db, userId, eventId, "manage");
  const data = await checkMeal(db, event, input);
  return db.transaction(async (tx) => {
    const [meal] = await tx
      .insert(mealDefinitions)
      .values({ eventId, name: data.name, serviceDate: data.serviceDate, serviceTime: data.serviceTime ?? null, basis: data.basis, guestCanOptOut: data.guestCanOptOut })
      .returning();
    if (data.basis === "activity" && data.activityIds.length) {
      await tx.insert(mealActivityLinks).values([...new Set(data.activityIds)].map((activityId) => ({ mealId: meal.id, activityId })));
    }
    await audit(tx, { kind: "user", userId }, { eventId, action: "meal.created", entityType: "meal", entityId: meal.id, after: { name: meal.name } });
    return meal;
  });
}

async function loadMeal(db: DbExecutor, userId: string, mealId: string) {
  const [meal] = await db.select().from(mealDefinitions).where(eq(mealDefinitions.id, mealId));
  if (!meal) throw notFound("Meal");
  const access = await requireEventAccess(db, userId, meal.eventId, "manage");
  return { meal, ...access };
}

export async function updateMeal(db: DbExecutor, userId: string, mealId: string, input: unknown) {
  const { meal, event } = await loadMeal(db, userId, mealId);
  const data = await checkMeal(db, event, input);
  await db.transaction(async (tx) => {
    await tx
      .update(mealDefinitions)
      .set({ name: data.name, serviceDate: data.serviceDate, serviceTime: data.serviceTime ?? null, basis: data.basis, guestCanOptOut: data.guestCanOptOut })
      .where(eq(mealDefinitions.id, mealId));
    await tx.delete(mealActivityLinks).where(eq(mealActivityLinks.mealId, mealId));
    if (data.basis === "activity" && data.activityIds.length) {
      await tx.insert(mealActivityLinks).values([...new Set(data.activityIds)].map((activityId) => ({ mealId, activityId })));
    }
    if (!data.guestCanOptOut) {
      await tx.delete(mealOverrides).where(and(eq(mealOverrides.mealId, mealId), eq(mealOverrides.setByHost, false)));
    }
    await audit(tx, { kind: "user", userId }, { eventId: meal.eventId, action: "meal.updated", entityType: "meal", entityId: mealId });
  });
}

export async function deleteMeal(db: DbExecutor, userId: string, mealId: string) {
  const { meal } = await loadMeal(db, userId, mealId);
  await db.delete(mealDefinitions).where(eq(mealDefinitions.id, mealId));
  await audit(db, { kind: "user", userId }, { eventId: meal.eventId, action: "meal.deleted", entityType: "meal", entityId: mealId, before: { name: meal.name } });
}

/** Host override for one guest: include, exclude, or clear (back to the meal's rule). */
export async function setMealOverride(
  db: DbExecutor,
  userId: string,
  mealId: string,
  input: { guestId: string; override: "opted_in" | "opted_out" | null; notes?: string | null },
) {
  const { meal } = await loadMeal(db, userId, mealId);
  const [g] = await db.select({ id: guests.id }).from(guests).where(and(eq(guests.id, input.guestId), eq(guests.eventId, meal.eventId)));
  if (!g) throw notFound("Guest");
  if (input.override === null) {
    await db.delete(mealOverrides).where(and(eq(mealOverrides.mealId, mealId), eq(mealOverrides.guestId, input.guestId)));
  } else {
    await db
      .insert(mealOverrides)
      .values({ eventId: meal.eventId, mealId, guestId: input.guestId, override: input.override, notes: input.notes ?? null, setByHost: true })
      .onConflictDoUpdate({
        target: [mealOverrides.mealId, mealOverrides.guestId],
        set: { override: input.override, notes: input.notes ?? null, setByHost: true, updatedAt: new Date() },
      });
  }
}

// ---------------------------------------------------------------------------
// Accommodation assignments (host-managed, never automatic bookings)
// ---------------------------------------------------------------------------

export const assignmentInputSchema = z
  .object({
    requestId: z.uuid(),
    propertyName: z.string().trim().min(1, "Enter the property.").max(160),
    roomReference: z
      .string()
      .trim()
      .max(80)
      .nullish()
      .transform((v) => v || null),
    checkInDate: isoDate,
    checkOutDate: isoDate,
    status: z.enum(["held", "confirmed"]).default("held"),
  })
  .refine((v) => v.checkOutDate > v.checkInDate, { message: "Check-out must be after check-in.", path: ["checkOutDate"] });

export async function createAssignment(db: DbExecutor, userId: string, eventId: string, input: unknown) {
  await requireEventAccess(db, userId, eventId, "manage");
  const data = assignmentInputSchema.parse(input);
  const [req] = await db
    .select()
    .from(accommodationRequests)
    .where(and(eq(accommodationRequests.id, data.requestId), eq(accommodationRequests.eventId, eventId)));
  if (!req) throw notFound("Accommodation request");
  const [row] = await db
    .insert(accommodationAssignments)
    .values({ ...data, eventId, requestId: req.id, invitationId: req.invitationId })
    .returning();
  await db.update(accommodationRequests).set({ changedAfterAssignment: false }).where(eq(accommodationRequests.id, req.id));
  await audit(db, { kind: "user", userId }, { eventId, action: "accommodation.assigned", entityType: "accommodation_assignment", entityId: row.id, after: { status: row.status } });
  return row;
}

export async function setAssignmentStatus(db: DbExecutor, userId: string, assignmentId: string, status: "held" | "confirmed" | "cancelled") {
  const [a] = await db.select().from(accommodationAssignments).where(eq(accommodationAssignments.id, assignmentId));
  if (!a) throw notFound("Assignment");
  await requireEventAccess(db, userId, a.eventId, "manage");
  await db.update(accommodationAssignments).set({ status }).where(eq(accommodationAssignments.id, assignmentId));
  if (a.requestId && status !== "cancelled") {
    await db.update(accommodationRequests).set({ changedAfterAssignment: false }).where(eq(accommodationRequests.id, a.requestId));
  }
  await audit(db, { kind: "user", userId }, { eventId: a.eventId, action: `accommodation.${status}`, entityType: "accommodation_assignment", entityId: assignmentId });
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export async function setTransportStatus(
  db: DbExecutor,
  userId: string,
  requestId: string,
  input: { status: "requested" | "assigned"; assignmentNote?: string | null },
) {
  const [r] = await db.select().from(transportRequests).where(eq(transportRequests.id, requestId));
  if (!r) throw notFound("Transport request");
  await requireEventAccess(db, userId, r.eventId, "manage");
  if (r.status === "cancelled") throw invalid("This request was cancelled by the guest.");
  await db
    .update(transportRequests)
    .set({ status: input.status, assignmentNote: input.assignmentNote?.trim().slice(0, 300) || null })
    .where(eq(transportRequests.id, requestId));
  await audit(db, { kind: "user", userId }, { eventId: r.eventId, action: `transport.${input.status}`, entityType: "transport_request", entityId: requestId });
}

// ---------------------------------------------------------------------------
// Custom questions
// ---------------------------------------------------------------------------

export const questionInputSchema = z
  .object({
    questionText: z.string().trim().min(1, "Write the question.").max(300),
    questionType: z.enum(["short_text", "long_text", "single_choice", "multi_choice", "boolean", "number"]),
    options: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    isRequired: z.boolean().default(false),
    activityId: z.uuid().nullish().or(z.literal("").transform(() => null)),
  })
  .refine((v) => !["single_choice", "multi_choice"].includes(v.questionType) || v.options.length >= 2, {
    message: "Add at least two options.",
    path: ["options"],
  });

export async function createQuestion(db: DbExecutor, userId: string, eventId: string, input: unknown) {
  await requireEventAccess(db, userId, eventId, "manage");
  const data = questionInputSchema.parse(input);
  if (data.activityId) {
    const [a] = await db.select({ id: activities.id }).from(activities).where(and(eq(activities.id, data.activityId), eq(activities.eventId, eventId)));
    if (!a) throw invalid("Unknown activity.");
  }
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${customQuestions.sortOrder}), -1)::int` })
    .from(customQuestions)
    .where(eq(customQuestions.eventId, eventId));
  const [q] = await db
    .insert(customQuestions)
    .values({
      eventId,
      questionText: data.questionText,
      questionType: data.questionType,
      options: ["single_choice", "multi_choice"].includes(data.questionType) ? data.options : null,
      isRequired: data.isRequired,
      activityId: data.activityId ?? null,
      sortOrder: maxOrder + 1,
    })
    .returning();
  await audit(db, { kind: "user", userId }, { eventId, action: "question.created", entityType: "custom_question", entityId: q.id });
  return q;
}

export async function deleteQuestion(db: DbExecutor, userId: string, questionId: string) {
  const [q] = await db.select().from(customQuestions).where(eq(customQuestions.id, questionId));
  if (!q) throw notFound("Question");
  await requireEventAccess(db, userId, q.eventId, "manage");
  await db.delete(customQuestions).where(eq(customQuestions.id, questionId));
  await audit(db, { kind: "user", userId }, { eventId: q.eventId, action: "question.deleted", entityType: "custom_question", entityId: questionId });
}

export async function listQuestions(db: DbExecutor, eventId: string) {
  return db.select().from(customQuestions).where(eq(customQuestions.eventId, eventId)).orderBy(customQuestions.sortOrder);
}
