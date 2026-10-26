import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const eventTypeEnum = pgEnum("event_type", [
  "wedding",
  "birthday",
  "trip",
  "sports",
  "dinner",
  "custom",
]);
export const eventStatusEnum = pgEnum("event_status", ["draft", "published", "archived"]);
export const eventVisibilityEnum = pgEnum("event_visibility", ["private", "link"]);
export const eventRoleEnum = pgEnum("event_role", ["owner", "organizer", "viewer"]);
export const orgRoleEnum = pgEnum("org_role", ["owner", "admin", "member"]);
export const activityEligibilityEnum = pgEnum("activity_eligibility", ["all", "groups"]);
export const invitationStatusEnum = pgEnum("invitation_status", [
  "draft",
  "sent",
  "delivered",
  "failed",
  "revoked",
]);
export const responseStatusEnum = pgEnum("response_status", [
  "pending",
  "submitted",
  "updated",
  "withdrawn",
]);
export const activityScopeEnum = pgEnum("activity_scope", ["auto", "custom"]);
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "attending",
  "not_attending",
  "maybe",
]);
export const submissionKindEnum = pgEnum("submission_kind", [
  "submitted",
  "updated",
  "withdrawn",
  "host_edit",
]);
export const requestStatusEnum = pgEnum("request_status", ["requested", "cancelled"]);
export const assignmentStatusEnum = pgEnum("assignment_status", ["held", "confirmed", "cancelled"]);
export const mealBasisEnum = pgEnum("meal_basis", ["activity", "overnight", "manual"]);
export const mealOverrideEnum = pgEnum("meal_override", ["opted_in", "opted_out"]);
export const transportDirectionEnum = pgEnum("transport_direction", [
  "arrival",
  "departure",
  "local",
]);
export const transportStatusEnum = pgEnum("transport_status", [
  "requested",
  "assigned",
  "cancelled",
]);
export const questionTypeEnum = pgEnum("question_type", [
  "short_text",
  "long_text",
  "single_choice",
  "multi_choice",
  "boolean",
  "number",
]);
export const jobStatusEnum = pgEnum("job_status", ["pending", "processing", "sent", "failed"]);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the session token; the raw token only lives in the cookie.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("org_memberships_uq").on(t.organizationId, t.userId)],
);

// ---------------------------------------------------------------------------
// Events & activities
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    hostDisplayName: text("host_display_name"),
    eventType: eventTypeEnum("event_type").notNull().default("custom"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    // Calendar dates in the event's timezone.
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    rsvpDeadline: timestamp("rsvp_deadline", { withTimezone: true }),
    status: eventStatusEnum("status").notNull().default("draft"),
    visibility: eventVisibilityEnum("visibility").notNull().default("private"),
    settings: jsonb("settings").notNull().default({}),
    ...timestamps,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("events_owner_idx").on(t.ownerUserId),
    check("events_dates_ck", sql`${t.endDate} >= ${t.startDate}`),
  ],
);

export const eventMembers = pgTable(
  "event_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: eventRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("event_members_uq").on(t.eventId, t.userId),
    index("event_members_user_idx").on(t.userId),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    // When false the activity is shown on the schedule but guests are not asked about it.
    attendanceRequested: boolean("attendance_requested").notNull().default(true),
    allowDecline: boolean("allow_decline").notNull().default(true),
    capacity: integer("capacity"),
    eligibility: activityEligibilityEnum("eligibility").notNull().default("all"),
    configuration: jsonb("configuration").notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("activities_event_idx").on(t.eventId, t.sortOrder),
    check("activities_time_ck", sql`${t.endAt} is null or ${t.endAt} > ${t.startAt}`),
    check("activities_capacity_ck", sql`${t.capacity} is null or ${t.capacity} > 0`),
  ],
);

export const activityEligibleGroups = pgTable(
  "activity_eligible_groups",
  {
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    guestGroupId: uuid("guest_group_id")
      .notNull()
      .references(() => guestGroups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.activityId, t.guestGroupId] })],
);

// ---------------------------------------------------------------------------
// Guests, households & groups
// ---------------------------------------------------------------------------

export const guestGroups = pgTable(
  "guest_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("guest_groups_name_uq").on(t.eventId, sql`lower(${t.name})`)],
);

export const households = pgTable(
  "households",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    primaryGuestId: uuid("primary_guest_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("households_event_idx").on(t.eventId)],
);

export const guests = pgTable(
  "guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    // A guest belongs to at most one household within an event.
    householdId: uuid("household_id").references(() => households.id, { onDelete: "set null" }),
    relationship: text("relationship"),
    // Set when the guest was added as a plus-one through an invitation's RSVP.
    plusOneOfInvitationId: uuid("plus_one_of_invitation_id").references(
      (): AnyPgColumn => invitations.id,
      { onDelete: "cascade" },
    ),
    dietary: text("dietary").array().notNull().default(sql`'{}'::text[]`),
    dietaryNotes: text("dietary_notes"),
    accessibilityNeeds: text("accessibility_needs"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("guests_event_name_idx").on(t.eventId, t.name, t.id),
    index("guests_household_idx").on(t.householdId),
    index("guests_plus_one_idx").on(t.plusOneOfInvitationId),
    uniqueIndex("guests_event_email_uq")
      .on(t.eventId, sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
    uniqueIndex("guests_event_phone_uq")
      .on(t.eventId, t.phone)
      .where(sql`${t.phone} is not null`),
  ],
);

export const guestGroupMemberships = pgTable(
  "guest_group_memberships",
  {
    guestGroupId: uuid("guest_group_id")
      .notNull()
      .references(() => guestGroups.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.guestGroupId, t.guestId] }),
    index("ggm_guest_idx").on(t.guestId),
  ],
);

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id").references(() => guests.id, { onDelete: "cascade" }),
    householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }),
    // SHA-256 of the bearer token, used for lookup.
    tokenHash: text("token_hash").notNull(),
    // AES-GCM encrypted token so hosts can copy the link again later.
    tokenCiphertext: text("token_ciphertext").notNull(),
    status: invitationStatusEnum("status").notNull().default("draft"),
    responseStatus: responseStatusEnum("response_status").notNull().default("pending"),
    responseVersion: integer("response_version").notNull().default(0),
    activityScope: activityScopeEnum("activity_scope").notNull().default("auto"),
    plusOnesAllowed: integer("plus_ones_allowed").notNull().default(0),
    hasLateChanges: boolean("has_late_changes").notNull().default(false),
    respondentNotes: text("respondent_notes"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastRespondedAt: timestamp("last_responded_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invitations_token_hash_uq").on(t.tokenHash),
    index("invitations_event_idx").on(t.eventId, t.responseStatus),
    // Only one active invitation may cover a given guest or household.
    uniqueIndex("invitations_active_guest_uq")
      .on(t.guestId)
      .where(sql`${t.guestId} is not null and ${t.status} <> 'revoked'`),
    uniqueIndex("invitations_active_household_uq")
      .on(t.householdId)
      .where(sql`${t.householdId} is not null and ${t.status} <> 'revoked'`),
    check(
      "invitations_target_ck",
      sql`(${t.guestId} is null) <> (${t.householdId} is null)`,
    ),
    check("invitations_plus_ones_ck", sql`${t.plusOnesAllowed} >= 0 and ${t.plusOnesAllowed} <= 20`),
  ],
);

export const invitationActivityPermissions = pgTable(
  "invitation_activity_permissions",
  {
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.invitationId, t.activityId] }),
    index("iap_activity_idx").on(t.activityId),
  ],
);

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const responseSubmissions = pgTable(
  "response_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    kind: submissionKindEnum("kind").notNull(),
    submittedByUserId: uuid("submitted_by_user_id").references(() => users.id),
    isLate: boolean("is_late").notNull().default(false),
    // Normalised copy of what was submitted (history), and a human-readable diff.
    snapshot: jsonb("snapshot").notNull(),
    changes: jsonb("changes").notNull().default([]),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("response_submissions_version_uq").on(t.invitationId, t.version),
    index("response_submissions_event_idx").on(t.eventId, t.submittedAt),
  ],
);

export const activityAttendance = pgTable(
  "activity_attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum("status").notNull(),
    responseSubmissionId: uuid("response_submission_id").references(() => responseSubmissions.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("activity_attendance_uq").on(t.activityId, t.guestId),
    index("activity_attendance_event_idx").on(t.eventId, t.activityId, t.status),
    index("activity_attendance_guest_idx").on(t.guestId),
  ],
);

// ---------------------------------------------------------------------------
// Logistics
// ---------------------------------------------------------------------------

export const accommodationRequests = pgTable(
  "accommodation_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    // Half-open interval: arrival inclusive, departure exclusive.
    arrivalDate: date("arrival_date", { mode: "string" }).notNull(),
    departureDate: date("departure_date", { mode: "string" }).notNull(),
    roomCountRequested: integer("room_count_requested"),
    roomSharingPreference: text("room_sharing_preference"),
    notes: text("notes"),
    status: requestStatusEnum("status").notNull().default("requested"),
    changedAfterAssignment: boolean("changed_after_assignment").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("accommodation_requests_event_idx").on(t.eventId, t.status),
    index("accommodation_requests_invitation_idx").on(t.invitationId),
    check("accommodation_dates_ck", sql`${t.departureDate} > ${t.arrivalDate}`),
    check(
      "accommodation_rooms_ck",
      sql`${t.roomCountRequested} is null or ${t.roomCountRequested} > 0`,
    ),
  ],
);

export const accommodationRequestGuests = pgTable(
  "accommodation_request_guests",
  {
    requestId: uuid("request_id")
      .notNull()
      .references(() => accommodationRequests.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.guestId] })],
);

export const accommodationAssignments = pgTable(
  "accommodation_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").references(() => accommodationRequests.id, {
      onDelete: "set null",
    }),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    propertyName: text("property_name").notNull(),
    roomReference: text("room_reference"),
    checkInDate: date("check_in_date", { mode: "string" }).notNull(),
    checkOutDate: date("check_out_date", { mode: "string" }).notNull(),
    status: assignmentStatusEnum("status").notNull().default("held"),
    ...timestamps,
  },
  (t) => [
    index("accommodation_assignments_event_idx").on(t.eventId),
    check("assignment_dates_ck", sql`${t.checkOutDate} > ${t.checkInDate}`),
  ],
);

export const mealDefinitions = pgTable(
  "meal_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    serviceDate: date("service_date", { mode: "string" }).notNull(),
    serviceTime: time("service_time"),
    // activity: attendees of linked activities eat; overnight: guests staying the
    // previous night eat (e.g. hotel breakfast); manual: only explicit opt-ins.
    basis: mealBasisEnum("basis").notNull().default("activity"),
    guestCanOptOut: boolean("guest_can_opt_out").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    configuration: jsonb("configuration").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("meal_definitions_event_idx").on(t.eventId, t.serviceDate)],
);

export const mealActivityLinks = pgTable(
  "meal_activity_links",
  {
    mealId: uuid("meal_id")
      .notNull()
      .references(() => mealDefinitions.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.mealId, t.activityId] })],
);

export const mealOverrides = pgTable(
  "meal_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    mealId: uuid("meal_id")
      .notNull()
      .references(() => mealDefinitions.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    override: mealOverrideEnum("override").notNull(),
    notes: text("notes"),
    setByHost: boolean("set_by_host").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("meal_overrides_uq").on(t.mealId, t.guestId)],
);

export const transportRequests = pgTable(
  "transport_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    direction: transportDirectionEnum("direction").notNull(),
    travelDate: date("travel_date", { mode: "string" }).notNull(),
    travelTime: time("travel_time"),
    location: text("location").notNull(),
    notes: text("notes"),
    status: transportStatusEnum("status").notNull().default("requested"),
    assignmentNote: text("assignment_note"),
    ...timestamps,
  },
  (t) => [index("transport_requests_event_idx").on(t.eventId, t.travelDate)],
);

export const transportRequestGuests = pgTable(
  "transport_request_guests",
  {
    requestId: uuid("request_id")
      .notNull()
      .references(() => transportRequests.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.guestId] })],
);

// ---------------------------------------------------------------------------
// Custom questions
// ---------------------------------------------------------------------------

export const customQuestions = pgTable(
  "custom_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    // When set, the question is only shown if someone in the party attends this activity.
    activityId: uuid("activity_id").references(() => activities.id, { onDelete: "cascade" }),
    questionText: text("question_text").notNull(),
    questionType: questionTypeEnum("question_type").notNull(),
    options: jsonb("options").$type<string[]>(),
    isRequired: boolean("is_required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("custom_questions_event_idx").on(t.eventId, t.sortOrder)],
);

export const customAnswers = pgTable(
  "custom_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => customQuestions.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    responseSubmissionId: uuid("response_submission_id").references(() => responseSubmissions.id, {
      onDelete: "set null",
    }),
    answer: jsonb("answer").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("custom_answers_uq").on(t.questionId, t.invitationId)],
);

// ---------------------------------------------------------------------------
// Notifications, audit, rate limiting
// ---------------------------------------------------------------------------

export const notificationJobs = pgTable(
  "notification_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    channel: text("channel").notNull().default("email"),
    recipient: text("recipient").notNull(),
    templateKey: text("template_key").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: jobStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notification_jobs_idem_uq").on(t.idempotencyKey),
    index("notification_jobs_due_idx").on(t.status, t.scheduledAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorInvitationId: uuid("actor_invitation_id").references(() => invitations.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_event_idx").on(t.eventId, t.createdAt)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
