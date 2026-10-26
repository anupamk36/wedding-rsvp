CREATE TYPE "public"."activity_eligibility" AS ENUM('all', 'groups');--> statement-breakpoint
CREATE TYPE "public"."activity_scope" AS ENUM('auto', 'custom');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('held', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('attending', 'not_attending', 'maybe');--> statement-breakpoint
CREATE TYPE "public"."event_role" AS ENUM('owner', 'organizer', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('wedding', 'birthday', 'trip', 'sports', 'dinner', 'custom');--> statement-breakpoint
CREATE TYPE "public"."event_visibility" AS ENUM('private', 'link');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('draft', 'sent', 'delivered', 'failed', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'processing', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."meal_basis" AS ENUM('activity', 'overnight', 'manual');--> statement-breakpoint
CREATE TYPE "public"."meal_override" AS ENUM('opted_in', 'opted_out');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('short_text', 'long_text', 'single_choice', 'multi_choice', 'boolean', 'number');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('requested', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."response_status" AS ENUM('pending', 'submitted', 'updated', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."submission_kind" AS ENUM('submitted', 'updated', 'withdrawn', 'host_edit');--> statement-breakpoint
CREATE TYPE "public"."transport_direction" AS ENUM('arrival', 'departure', 'local');--> statement-breakpoint
CREATE TYPE "public"."transport_status" AS ENUM('requested', 'assigned', 'cancelled');--> statement-breakpoint
CREATE TABLE "accommodation_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"request_id" uuid,
	"invitation_id" uuid NOT NULL,
	"property_name" text NOT NULL,
	"room_reference" text,
	"check_in_date" date NOT NULL,
	"check_out_date" date NOT NULL,
	"status" "assignment_status" DEFAULT 'held' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_dates_ck" CHECK ("accommodation_assignments"."check_out_date" > "accommodation_assignments"."check_in_date")
);
--> statement-breakpoint
CREATE TABLE "accommodation_request_guests" (
	"request_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	CONSTRAINT "accommodation_request_guests_request_id_guest_id_pk" PRIMARY KEY("request_id","guest_id")
);
--> statement-breakpoint
CREATE TABLE "accommodation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"arrival_date" date NOT NULL,
	"departure_date" date NOT NULL,
	"room_count_requested" integer,
	"room_sharing_preference" text,
	"notes" text,
	"status" "request_status" DEFAULT 'requested' NOT NULL,
	"changed_after_assignment" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accommodation_dates_ck" CHECK ("accommodation_requests"."departure_date" > "accommodation_requests"."arrival_date"),
	CONSTRAINT "accommodation_rooms_ck" CHECK ("accommodation_requests"."room_count_requested" is null or "accommodation_requests"."room_count_requested" > 0)
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"venue_name" text,
	"venue_address" text,
	"attendance_requested" boolean DEFAULT true NOT NULL,
	"allow_decline" boolean DEFAULT true NOT NULL,
	"capacity" integer,
	"eligibility" "activity_eligibility" DEFAULT 'all' NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_time_ck" CHECK ("activities"."end_at" is null or "activities"."end_at" > "activities"."start_at"),
	CONSTRAINT "activities_capacity_ck" CHECK ("activities"."capacity" is null or "activities"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "activity_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"response_submission_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_eligible_groups" (
	"activity_id" uuid NOT NULL,
	"guest_group_id" uuid NOT NULL,
	CONSTRAINT "activity_eligible_groups_activity_id_guest_group_id_pk" PRIMARY KEY("activity_id","guest_group_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"actor_user_id" uuid,
	"actor_invitation_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"response_submission_id" uuid,
	"answer" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"activity_id" uuid,
	"question_text" text NOT NULL,
	"question_type" "question_type" NOT NULL,
	"options" jsonb,
	"is_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "event_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"host_display_name" text,
	"event_type" "event_type" DEFAULT 'custom' NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"venue_name" text,
	"venue_address" text,
	"rsvp_deadline" timestamp with time zone,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"visibility" "event_visibility" DEFAULT 'private' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "events_dates_ck" CHECK ("events"."end_date" >= "events"."start_date")
);
--> statement-breakpoint
CREATE TABLE "guest_group_memberships" (
	"guest_group_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	CONSTRAINT "guest_group_memberships_guest_group_id_guest_id_pk" PRIMARY KEY("guest_group_id","guest_id")
);
--> statement-breakpoint
CREATE TABLE "guest_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"household_id" uuid,
	"relationship" text,
	"plus_one_of_invitation_id" uuid,
	"dietary" text[] DEFAULT '{}'::text[] NOT NULL,
	"dietary_notes" text,
	"accessibility_needs" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"primary_guest_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation_activity_permissions" (
	"invitation_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	CONSTRAINT "invitation_activity_permissions_invitation_id_activity_id_pk" PRIMARY KEY("invitation_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"guest_id" uuid,
	"household_id" uuid,
	"token_hash" text NOT NULL,
	"token_ciphertext" text NOT NULL,
	"status" "invitation_status" DEFAULT 'draft' NOT NULL,
	"response_status" "response_status" DEFAULT 'pending' NOT NULL,
	"response_version" integer DEFAULT 0 NOT NULL,
	"activity_scope" "activity_scope" DEFAULT 'auto' NOT NULL,
	"plus_ones_allowed" integer DEFAULT 0 NOT NULL,
	"has_late_changes" boolean DEFAULT false NOT NULL,
	"respondent_notes" text,
	"sent_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"last_responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_target_ck" CHECK (("invitations"."guest_id" is null) <> ("invitations"."household_id" is null)),
	CONSTRAINT "invitations_plus_ones_ck" CHECK ("invitations"."plus_ones_allowed" >= 0 and "invitations"."plus_ones_allowed" <= 20)
);
--> statement-breakpoint
CREATE TABLE "meal_activity_links" (
	"meal_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	CONSTRAINT "meal_activity_links_meal_id_activity_id_pk" PRIMARY KEY("meal_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "meal_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"service_date" date NOT NULL,
	"service_time" time,
	"basis" "meal_basis" DEFAULT 'activity' NOT NULL,
	"guest_can_opt_out" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"meal_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"override" "meal_override" NOT NULL,
	"notes" text,
	"set_by_host" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"idempotency_key" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"recipient" text NOT NULL,
	"template_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" "submission_kind" NOT NULL,
	"submitted_by_user_id" uuid,
	"is_late" boolean DEFAULT false NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_request_guests" (
	"request_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	CONSTRAINT "transport_request_guests_request_id_guest_id_pk" PRIMARY KEY("request_id","guest_id")
);
--> statement-breakpoint
CREATE TABLE "transport_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"direction" "transport_direction" NOT NULL,
	"travel_date" date NOT NULL,
	"travel_time" time,
	"location" text NOT NULL,
	"notes" text,
	"status" "transport_status" DEFAULT 'requested' NOT NULL,
	"assignment_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accommodation_assignments" ADD CONSTRAINT "accommodation_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodation_assignments" ADD CONSTRAINT "accommodation_assignments_request_id_accommodation_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."accommodation_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodation_assignments" ADD CONSTRAINT "accommodation_assignments_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodation_request_guests" ADD CONSTRAINT "accommodation_request_guests_request_id_accommodation_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."accommodation_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodation_request_guests" ADD CONSTRAINT "accommodation_request_guests_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodation_requests" ADD CONSTRAINT "accommodation_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodation_requests" ADD CONSTRAINT "accommodation_requests_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_attendance" ADD CONSTRAINT "activity_attendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_attendance" ADD CONSTRAINT "activity_attendance_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_attendance" ADD CONSTRAINT "activity_attendance_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_attendance" ADD CONSTRAINT "activity_attendance_response_submission_id_response_submissions_id_fk" FOREIGN KEY ("response_submission_id") REFERENCES "public"."response_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_eligible_groups" ADD CONSTRAINT "activity_eligible_groups_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_eligible_groups" ADD CONSTRAINT "activity_eligible_groups_guest_group_id_guest_groups_id_fk" FOREIGN KEY ("guest_group_id") REFERENCES "public"."guest_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_invitation_id_invitations_id_fk" FOREIGN KEY ("actor_invitation_id") REFERENCES "public"."invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_answers" ADD CONSTRAINT "custom_answers_question_id_custom_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."custom_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_answers" ADD CONSTRAINT "custom_answers_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_answers" ADD CONSTRAINT "custom_answers_response_submission_id_response_submissions_id_fk" FOREIGN KEY ("response_submission_id") REFERENCES "public"."response_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_questions" ADD CONSTRAINT "custom_questions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_questions" ADD CONSTRAINT "custom_questions_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_group_memberships" ADD CONSTRAINT "guest_group_memberships_guest_group_id_guest_groups_id_fk" FOREIGN KEY ("guest_group_id") REFERENCES "public"."guest_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_group_memberships" ADD CONSTRAINT "guest_group_memberships_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_groups" ADD CONSTRAINT "guest_groups_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_plus_one_of_invitation_id_invitations_id_fk" FOREIGN KEY ("plus_one_of_invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_activity_permissions" ADD CONSTRAINT "invitation_activity_permissions_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_activity_permissions" ADD CONSTRAINT "invitation_activity_permissions_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_activity_links" ADD CONSTRAINT "meal_activity_links_meal_id_meal_definitions_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_activity_links" ADD CONSTRAINT "meal_activity_links_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_definitions" ADD CONSTRAINT "meal_definitions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_overrides" ADD CONSTRAINT "meal_overrides_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_overrides" ADD CONSTRAINT "meal_overrides_meal_id_meal_definitions_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_overrides" ADD CONSTRAINT "meal_overrides_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_submissions" ADD CONSTRAINT "response_submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_submissions" ADD CONSTRAINT "response_submissions_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_submissions" ADD CONSTRAINT "response_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_request_guests" ADD CONSTRAINT "transport_request_guests_request_id_transport_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."transport_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_request_guests" ADD CONSTRAINT "transport_request_guests_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accommodation_assignments_event_idx" ON "accommodation_assignments" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "accommodation_requests_event_idx" ON "accommodation_requests" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "accommodation_requests_invitation_idx" ON "accommodation_requests" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "activities_event_idx" ON "activities" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_attendance_uq" ON "activity_attendance" USING btree ("activity_id","guest_id");--> statement-breakpoint
CREATE INDEX "activity_attendance_event_idx" ON "activity_attendance" USING btree ("event_id","activity_id","status");--> statement-breakpoint
CREATE INDEX "activity_attendance_guest_idx" ON "activity_attendance" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "audit_logs_event_idx" ON "audit_logs" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_answers_uq" ON "custom_answers" USING btree ("question_id","invitation_id");--> statement-breakpoint
CREATE INDEX "custom_questions_event_idx" ON "custom_questions" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "event_members_uq" ON "event_members" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "event_members_user_idx" ON "event_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "events_owner_idx" ON "events" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "ggm_guest_idx" ON "guest_group_memberships" USING btree ("guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_groups_name_uq" ON "guest_groups" USING btree ("event_id",lower("name"));--> statement-breakpoint
CREATE INDEX "guests_event_name_idx" ON "guests" USING btree ("event_id","name","id");--> statement-breakpoint
CREATE INDEX "guests_household_idx" ON "guests" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "guests_plus_one_idx" ON "guests" USING btree ("plus_one_of_invitation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guests_event_email_uq" ON "guests" USING btree ("event_id",lower("email")) WHERE "guests"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "guests_event_phone_uq" ON "guests" USING btree ("event_id","phone") WHERE "guests"."phone" is not null;--> statement-breakpoint
CREATE INDEX "households_event_idx" ON "households" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "iap_activity_idx" ON "invitation_activity_permissions" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_uq" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_event_idx" ON "invitations" USING btree ("event_id","response_status");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_active_guest_uq" ON "invitations" USING btree ("guest_id") WHERE "invitations"."guest_id" is not null and "invitations"."status" <> 'revoked';--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_active_household_uq" ON "invitations" USING btree ("household_id") WHERE "invitations"."household_id" is not null and "invitations"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "meal_definitions_event_idx" ON "meal_definitions" USING btree ("event_id","service_date");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_overrides_uq" ON "meal_overrides" USING btree ("meal_id","guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_jobs_idem_uq" ON "notification_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_jobs_due_idx" ON "notification_jobs" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "org_memberships_uq" ON "organization_memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "response_submissions_version_uq" ON "response_submissions" USING btree ("invitation_id","version");--> statement-breakpoint
CREATE INDEX "response_submissions_event_idx" ON "response_submissions" USING btree ("event_id","submitted_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transport_requests_event_idx" ON "transport_requests" USING btree ("event_id","travel_date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));