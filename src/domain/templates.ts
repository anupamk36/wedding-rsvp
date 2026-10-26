import { addDays, daysBetween } from "@/lib/dates";
import type { EventSettings, EventType } from "./settings";

export interface TemplateActivity {
  name: string;
  dayOffset: number;
  time: string;
  durationMinutes: number;
  description?: string;
}

export interface TemplateMeal {
  name: string;
  dayOffset: number;
  time: string;
  basis: "activity" | "overnight" | "manual";
  linkActivities: string[];
}

export interface EventTemplate {
  type: EventType;
  description: string;
  defaultDays: number;
  settings: Partial<Omit<EventSettings, "features" | "theme">> & {
    features?: Partial<EventSettings["features"]>;
  };
  activities: TemplateActivity[];
  meals: TemplateMeal[];
  groups: string[];
}

export const TEMPLATES: Record<EventType, EventTemplate> = {
  wedding: {
    type: "wedding",
    description: "Several ceremonies over a few days, with families, stays and meals.",
    defaultDays: 3,
    settings: {
      features: { plusOnes: false, accommodation: true, meals: true, dietary: true, transport: true, accessibility: true },
    },
    activities: [
      { name: "Welcome dinner", dayOffset: 0, time: "19:00", durationMinutes: 180 },
      { name: "Haldi", dayOffset: 1, time: "10:00", durationMinutes: 150 },
      { name: "Mehendi", dayOffset: 1, time: "14:00", durationMinutes: 180 },
      { name: "Sangeet", dayOffset: 1, time: "19:00", durationMinutes: 240 },
      { name: "Wedding ceremony", dayOffset: 2, time: "11:00", durationMinutes: 180 },
      { name: "Reception", dayOffset: 2, time: "19:00", durationMinutes: 240 },
    ],
    meals: [
      { name: "Dinner", dayOffset: 0, time: "20:00", basis: "activity", linkActivities: ["Welcome dinner"] },
      { name: "Breakfast", dayOffset: 1, time: "08:00", basis: "overnight", linkActivities: [] },
      { name: "Lunch", dayOffset: 1, time: "13:00", basis: "activity", linkActivities: ["Haldi", "Mehendi"] },
      { name: "Dinner", dayOffset: 1, time: "20:30", basis: "activity", linkActivities: ["Sangeet"] },
      { name: "Breakfast", dayOffset: 2, time: "08:00", basis: "overnight", linkActivities: [] },
      { name: "Lunch", dayOffset: 2, time: "13:30", basis: "activity", linkActivities: ["Wedding ceremony"] },
      { name: "Dinner", dayOffset: 2, time: "20:30", basis: "activity", linkActivities: ["Reception"] },
    ],
    groups: ["Bride's family", "Groom's family", "Friends", "Colleagues", "Out-of-town guests"],
  },
  birthday: {
    type: "birthday",
    description: "One party with plus-ones, kids and food preferences.",
    defaultDays: 1,
    settings: { features: { plusOnes: true, meals: true, dietary: true } },
    activities: [{ name: "Birthday party", dayOffset: 0, time: "17:00", durationMinutes: 240 }],
    meals: [{ name: "Dinner", dayOffset: 0, time: "19:30", basis: "activity", linkActivities: ["Birthday party"] }],
    groups: ["Family", "Friends", "Kids"],
  },
  trip: {
    type: "trip",
    description: "A getaway with travel dates, stays and shared plans.",
    defaultDays: 3,
    settings: { features: { accommodation: true, transport: true, dietary: true } },
    activities: [
      { name: "Arrival & check-in", dayOffset: 0, time: "15:00", durationMinutes: 180 },
      { name: "Day out", dayOffset: 1, time: "09:00", durationMinutes: 480 },
      { name: "Farewell brunch", dayOffset: 2, time: "10:30", durationMinutes: 120 },
    ],
    meals: [],
    groups: [],
  },
  sports: {
    type: "sports",
    description: "Collect availability across candidate slots and see who can play.",
    defaultDays: 2,
    settings: {
      availabilityMode: true,
      minParticipants: 10,
      features: { dietary: false },
    },
    activities: [
      { name: "Morning slot", dayOffset: 0, time: "07:00", durationMinutes: 120 },
      { name: "Evening slot", dayOffset: 0, time: "17:00", durationMinutes: 120 },
      { name: "Next morning slot", dayOffset: 1, time: "07:00", durationMinutes: 120 },
    ],
    meals: [],
    groups: [],
  },
  dinner: {
    type: "dinner",
    description: "A single gathering with headcount and dietary needs.",
    defaultDays: 1,
    settings: { features: { plusOnes: true, dietary: true } },
    activities: [{ name: "Dinner", dayOffset: 0, time: "19:30", durationMinutes: 180 }],
    meals: [],
    groups: [],
  },
  custom: {
    type: "custom",
    description: "Start from scratch and add your own activities.",
    defaultDays: 1,
    settings: {},
    activities: [],
    meals: [],
    groups: [],
  },
};

/** Clamp template day offsets so every activity lands inside the event's dates. */
export function resolveTemplateDate(startDate: string, endDate: string, dayOffset: number): string {
  const span = Math.max(0, daysBetween(startDate, endDate));
  return addDays(startDate, Math.min(dayOffset, span));
}
