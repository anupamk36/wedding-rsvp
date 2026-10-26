import { and, asc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { dietaryLabel } from "@/domain/settings";
import type { DbExecutor } from "../db/connect";
import { activityAttendance, guestGroupMemberships, guestGroups, guests, households } from "../db/schema";
import { invalid } from "../lib/errors";
import { requireEventAccess } from "./access";
import { audit } from "./audit";
import { listActivities } from "./events";
import { invitationScopeSql } from "./invitations";
import { getAccommodationReport, getMealReport, getTransportReport } from "./reporting";

export const EXPORT_KINDS = ["guests", "accommodation", "meals", "transport"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/** CSV cell with quoting and spreadsheet formula-injection protection. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = Array.isArray(value) ? value.join("; ") : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvRow = (cells: unknown[]) => cells.map(csvCell).join(",") + "\r\n";

const BATCH = 500;

const STATUS_LABEL: Record<string, string> = {
  attending: "Attending",
  not_attending: "Not attending",
  maybe: "Maybe",
};

/**
 * Streams a CSV export. Guests are read in keyset-paginated batches so large
 * events are never loaded into memory at once.
 */
export async function exportCsv(db: DbExecutor, userId: string, eventId: string, kind: ExportKind): Promise<{ filename: string; stream: ReadableStream<Uint8Array> }> {
  const { event } = await requireEventAccess(db, userId, eventId, "manage");
  if (!EXPORT_KINDS.includes(kind)) throw invalid("Unknown export.");
  await audit(db, { kind: "user", userId }, { eventId, action: "export.downloaded", entityType: "event", entityId: eventId, after: { kind } });
  const enc = new TextEncoder();
  const slug = event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "event";
  const filename = `${slug}-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;

  if (kind !== "guests") {
    const lines = await smallReport(db, userId, eventId, kind);
    return {
      filename,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(enc.encode("﻿" + lines.join("")));
          controller.close();
        },
      }),
    };
  }

  const acts = (await listActivities(db, eventId)).filter((a) => a.attendanceRequested);
  const groupNames = new Map(
    (await db.select().from(guestGroups).where(eq(guestGroups.eventId, eventId))).map((g) => [g.id, g.name]),
  );
  let cursor: { name: string; id: string } | null = null;
  let headerSent = false;

  return {
    filename,
    stream: new ReadableStream({
      async pull(controller) {
        if (!headerSent) {
          headerSent = true;
          controller.enqueue(
            enc.encode(
              "﻿" +
                csvRow([
                  "Name",
                  "Email",
                  "Phone",
                  "Household",
                  "Plus-one",
                  "Groups",
                  "Invitation response",
                  "Last responded",
                  ...acts.map((a) => a.name),
                  "Dietary",
                  "Dietary notes",
                  "Accessibility",
                ]),
            ),
          );
          return;
        }
        const scope = invitationScopeSql(eventId);
        const page: { g: typeof guests.$inferSelect; householdName: string | null; responseStatus: string | null; lastRespondedAt: Date | null }[] =
          await db
            .select({
              g: guests,
              householdName: households.name,
              responseStatus: sql<string | null>`(select i.response_status::text from ${scope} s join invitations i on i.id = s.invitation_id where s.guest_id = ${guests.id} limit 1)`,
              lastRespondedAt: sql<Date | null>`(select i.last_responded_at from ${scope} s join invitations i on i.id = s.invitation_id where s.guest_id = ${guests.id} limit 1)`,
            })
            .from(guests)
            .leftJoin(households, eq(households.id, guests.householdId))
            .where(
              and(
                eq(guests.eventId, eventId),
                cursor ? or(gt(guests.name, cursor.name), and(eq(guests.name, cursor.name), gt(guests.id, cursor.id))) : undefined,
              ),
            )
            .orderBy(asc(guests.name), asc(guests.id))
            .limit(BATCH);
        if (!page.length) {
          controller.close();
          return;
        }
        const last = page[page.length - 1].g;
        cursor = { name: last.name, id: last.id };
        const ids = page.map((p) => p.g.id);
        const [att, memberships] = await Promise.all([
          db.select().from(activityAttendance).where(inArray(activityAttendance.guestId, ids)),
          db.select().from(guestGroupMemberships).where(inArray(guestGroupMemberships.guestId, ids)),
        ]);
        let chunk = "";
        for (const { g, householdName, responseStatus, lastRespondedAt } of page) {
          chunk += csvRow([
            g.name,
            g.email,
            g.phone,
            householdName,
            g.plusOneOfInvitationId ? "Yes" : "",
            memberships.filter((m) => m.guestId === g.id).map((m) => groupNames.get(m.guestGroupId) ?? ""),
            responseStatus ?? "Not invited",
            lastRespondedAt ? new Date(lastRespondedAt).toISOString() : "",
            ...acts.map((a) => {
              const s = att.find((x) => x.guestId === g.id && x.activityId === a.id)?.status;
              return s ? STATUS_LABEL[s] : responseStatus ? "No answer" : "";
            }),
            g.dietary.map(dietaryLabel),
            g.dietaryNotes,
            g.accessibilityNeeds,
          ]);
        }
        controller.enqueue(enc.encode(chunk));
      },
    }),
  };
}

async function smallReport(db: DbExecutor, userId: string, eventId: string, kind: Exclude<ExportKind, "guests">): Promise<string[]> {
  if (kind === "accommodation") {
    const r = await getAccommodationReport(db, userId, eventId);
    return [
      csvRow(["Party", "Guests", "Check-in", "Check-out", "Nights", "Rooms requested", "Guest-nights", "Room-nights", "Sharing", "Status", "Assignments", "Issues", "Notes"]),
      ...r.items.map((i) =>
        csvRow([
          i.label,
          i.people.map((p) => p.name),
          i.arrivalDate,
          i.departureDate,
          i.nights,
          i.roomCountRequested ?? "Not specified",
          i.guestNights,
          i.roomNights ?? "",
          i.roomSharingPreference,
          i.active ? "Requested" : "Cancelled",
          i.assignments.map((a) => `${a.propertyName}${a.roomReference ? ` ${a.roomReference}` : ""} (${a.status})`),
          i.issues,
          i.notes,
        ]),
      ),
    ];
  }
  if (kind === "meals") {
    const r = await getMealReport(db, userId, eventId);
    const tags = r.settings.dietaryOptions;
    return [
      csvRow(["Date", "Time", "Meal", "Counting rule", "Confirmed", "Tentative", "No restrictions", ...tags.map(dietaryLabel), "Special requests"]),
      ...r.meals.map((m) =>
        csvRow([
          m.serviceDate,
          m.serviceTime,
          m.name,
          m.basis,
          m.confirmed,
          m.tentative,
          m.noRestrictions,
          ...tags.map((t) => m.dietary[t] ?? 0),
          m.specialRequests.map((s) => `${s.name}: ${s.notes}`),
        ]),
      ),
    ];
  }
  const r = await getTransportReport(db, userId, eventId);
  return [
    csvRow(["Party", "Direction", "Date", "Time", "Location", "Passengers", "Names", "Status", "Assignment", "Notes"]),
    ...r.items.map((i) =>
      csvRow([i.label, i.direction, i.travelDate, i.travelTime, i.location, i.passengerCount, i.passengers.map((p) => p.name), i.status, i.assignmentNote, i.notes]),
    ),
  ];
}

