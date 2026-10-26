import { z } from "zod";

export const EVENT_TYPES = ["wedding", "birthday", "trip", "sports", "dinner", "custom"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: "Multi-day wedding",
  birthday: "Birthday party",
  trip: "Weekend trip",
  sports: "Sports meetup",
  dinner: "Dinner or house party",
  custom: "Custom event",
};

export const DEFAULT_DIETARY_OPTIONS = [
  "vegetarian",
  "vegan",
  "jain",
  "eggetarian",
  "gluten_free",
  "nut_allergy",
  "dairy_free",
  "halal",
];

export const ACCENTS = ["rose", "amber", "emerald", "sky", "violet", "slate"] as const;

export const featuresSchema = z.object({
  plusOnes: z.boolean().default(false),
  accommodation: z.boolean().default(false),
  meals: z.boolean().default(false),
  dietary: z.boolean().default(true),
  transport: z.boolean().default(false),
  accessibility: z.boolean().default(false),
});
export type Features = z.infer<typeof featuresSchema>;

export const eventSettingsSchema = z.object({
  allowMaybe: z.boolean().default(true),
  /** Weight applied to "maybe" answers in the optional expected-attendance forecast. */
  tentativeWeight: z.number().min(0).max(1).default(0.5),
  showForecast: z.boolean().default(false),
  allowGuestEdits: z.boolean().default(true),
  /** What happens to guest changes after the RSVP deadline. */
  latePolicy: z.enum(["reject", "accept_flag"]).default("accept_flag"),
  features: featuresSchema.prefault({}),
  dietaryOptions: z.array(z.string().min(1).max(40)).max(30).default(DEFAULT_DIETARY_OPTIONS),
  /** Activities are candidate time slots and guests mark availability (date polls, sports). */
  availabilityMode: z.boolean().default(false),
  minParticipants: z.number().int().positive().nullable().default(null),
  notifyHostOnResponse: z.boolean().default(true),
  sendGuestConfirmation: z.boolean().default(true),
  theme: z
    .object({
      accent: z.enum(ACCENTS).default("rose"),
      coverImageUrl: z.url({ protocol: /^https$/ }).nullable().default(null),
    })
    .prefault({}),
});
export type EventSettings = z.infer<typeof eventSettingsSchema>;

/** Parse persisted settings, falling back to defaults for anything malformed. */
export function parseSettings(raw: unknown): EventSettings {
  const result = eventSettingsSchema.safeParse(raw ?? {});
  return result.success ? result.data : eventSettingsSchema.parse({});
}

export function dietaryLabel(tag: string): string {
  return tag.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export const ATTENDANCE_LABELS = {
  standard: { attending: "Attending", maybe: "Maybe", not_attending: "Not attending" },
  availability: { attending: "Available", maybe: "If needed", not_attending: "Unavailable" },
} as const;
