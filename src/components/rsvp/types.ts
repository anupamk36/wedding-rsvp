// Client-side mirror of the RSVP view returned by the server (dates as ISO strings).
import type { RsvpView } from "@/server/modules/rsvp";

export type { RsvpView };
export type Status = "attending" | "not_attending" | "maybe";

export interface PersonState {
  key: string;
  name: string;
  isPlusOne: boolean;
  isNew: boolean;
  relationship: string | null;
  dietary: string[];
  dietaryNotes: string;
  accessibilityNeeds: string;
}

export interface StayState {
  id?: string;
  arrivalDate: string;
  departureDate: string;
  personKeys: string[];
  roomCount: number | null;
  roomSharing: string;
  notes: string;
  confirmed?: boolean;
}

export interface TransportState {
  id?: string;
  direction: "arrival" | "departure" | "local";
  travelDate: string;
  travelTime: string;
  location: string;
  personKeys: string[];
  notes: string;
}

export interface FlowState {
  people: PersonState[];
  attendance: Record<string, Status>;
  needsStay: boolean;
  stays: StayState[];
  needsTransport: boolean;
  transport: TransportState[];
  mealOptOuts: string[];
  answers: Record<string, unknown>;
  notes: string;
}

export const attKey = (personKey: string, activityId: string) => `${personKey}|${activityId}`;
