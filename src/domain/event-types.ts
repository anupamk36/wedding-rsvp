// Presentation metadata per event type (labels, icon paths, colours).
// Shared by the dashboard, landing page and templates.
import type { EventType } from "./settings";

export interface EventTypeMeta {
  label: string;
  plural: string;
  /** SVG path data for a 24×24 outline icon. */
  icon: string;
  /** Badge / icon tile colours (light and dark). */
  badge: string;
  /** Progress bar fill. */
  bar: string;
}

export const EVENT_TYPE_META: Record<EventType | "poll", EventTypeMeta> = {
  wedding: {
    label: "Wedding",
    plural: "Weddings",
    icon: "M3.5 15a4.5 4.5 0 1 0 9 0 4.5 4.5 0 0 0-9 0M11.5 9a4.5 4.5 0 1 0 9 0 4.5 4.5 0 0 0-9 0",
    badge: "bg-[#f5e3e8] text-[#5e1530] dark:bg-[#3a1d25] dark:text-[#f0a9b9]",
    bar: "bg-[#7c1d3e] dark:bg-[#e0798f]",
  },
  birthday: {
    label: "Birthday",
    plural: "Birthdays",
    icon: "M4 20h16M5 20v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M12 12V8M12 8c-1-1-1-2 0-3 1 1 1 2 0 3M5 16c2 1.5 3 1.5 5 0s3-1.5 5 0 3 1.5 4 .5",
    badge: "bg-[#fdf0dc] text-[#6b2f08] dark:bg-[#3a2a12] dark:text-[#f8cc8f]",
    bar: "bg-[#92400e] dark:bg-[#f5b55f]",
  },
  trip: {
    label: "Trip",
    plural: "Trips",
    icon: "M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10zM10 11a2 2 0 1 0 4 0 2 2 0 0 0-4 0",
    badge: "bg-[#e1f5ec] text-[#0b4a38] dark:bg-[#123327] dark:text-[#8fe2c0]",
    bar: "bg-[#046c4e] dark:bg-[#5fd3a5]",
  },
  sports: {
    label: "Sports meetup",
    plural: "Sports",
    icon: "M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0M12 8l3.5 2.5-1.3 4h-4.4l-1.3-4z",
    badge: "bg-[#e2f1fb] text-[#0a4466] dark:bg-[#132c3d] dark:text-[#a4d6f5]",
    bar: "bg-[#075985] dark:bg-[#7cc4f0]",
  },
  poll: {
    label: "Availability poll",
    plural: "Polls",
    icon: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
    badge: "bg-[#e2f1fb] text-[#0a4466] dark:bg-[#132c3d] dark:text-[#a4d6f5]",
    bar: "bg-[#075985] dark:bg-[#7cc4f0]",
  },
  dinner: {
    label: "Dinner",
    plural: "Dinners",
    icon: "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 7h3v11",
    badge: "bg-[#efe8dd] text-[#3e3431] dark:bg-[#2b2522] dark:text-[#d8cec4]",
    bar: "bg-[#334155] dark:bg-[#b4c0d0]",
  },
  custom: {
    label: "Event",
    plural: "Other",
    icon: "M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4",
    badge: "bg-[#e6ecf7] text-[#1f3f78] dark:bg-[#18233d] dark:text-[#a9c3ff]",
    bar: "bg-[#2f5597] dark:bg-[#8fb2ff]",
  },
};

/** Availability-mode events read as polls regardless of their template. */
export function eventTypeKey(eventType: EventType, availabilityMode: boolean): keyof typeof EVENT_TYPE_META {
  return availabilityMode && eventType !== "sports" ? "poll" : eventType;
}
