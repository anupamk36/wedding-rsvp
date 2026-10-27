// Pure helpers for the guest flow: answer summaries, names, grouping.
import { utcToZoned } from "@/lib/dates";
import { attKey, type PersonState, type RsvpView, type Status } from "./types";

export type Labels = Record<Status, string>;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "+";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "The Sharma family" → "Sharma family"; "Ishaan Gupta" → "Ishaan". */
export function shortLabel(label: string, peopleCount: number): string {
  if (/^the\s/i.test(label)) return label.replace(/^the\s+/i, "");
  return peopleCount > 1 ? label : firstName(label);
}

export function personName(p: PersonState): string {
  return p.name.trim() || "Additional guest";
}

/** Short chip labels: first names, falling back to full names where first names collide. */
export function chipNames(people: PersonState[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const p of people) counts.set(firstName(personName(p)), (counts.get(firstName(personName(p))) ?? 0) + 1);
  return new Map(people.map((p) => [p.key, (counts.get(firstName(personName(p))) ?? 0) > 1 ? personName(p) : firstName(personName(p))]));
}

export function answersFor(activityId: string, people: PersonState[], attendance: Record<string, Status>) {
  return people.map((p) => attendance[attKey(p.key, activityId)] as Status | undefined);
}

/** The shared answer when everyone answered the same, otherwise null. */
export function sharedAnswer(activityId: string, people: PersonState[], attendance: Record<string, Status>): Status | null {
  const values = answersFor(activityId, people, attendance);
  if (!values.length || values.some((v) => !v)) return null;
  return values.every((v) => v === values[0]) ? values[0]! : null;
}

export function isMixed(activityId: string, people: PersonState[], attendance: Record<string, Status>): boolean {
  const answered = answersFor(activityId, people, attendance).filter(Boolean);
  return new Set(answered).size > 1 || (answered.length > 0 && answered.length < people.length);
}

export function isComplete(activityId: string, people: PersonState[], attendance: Record<string, Status>): boolean {
  return answersFor(activityId, people, attendance).every(Boolean);
}

export type ResultTone = "success" | "warning" | "neutral" | "info";

/** One-line result for an activity, e.g. "All 4 attending" or "2 attending · 1 maybe · 1 blank". */
export function activityResult(
  activityId: string,
  people: PersonState[],
  attendance: Record<string, Status>,
  labels: Labels,
): { text: string; tone: ResultTone; answered: boolean } {
  const values = answersFor(activityId, people, attendance);
  const n = people.length;
  const answered = values.filter(Boolean) as Status[];
  if (!answered.length) return { text: "No answer", tone: "info", answered: false };
  const shared = sharedAnswer(activityId, people, attendance);
  if (shared) {
    const word = labels[shared];
    const tone: ResultTone = shared === "attending" ? "success" : shared === "maybe" ? "warning" : "neutral";
    return { text: n > 1 ? `All ${n} ${word.toLowerCase()}` : word, tone, answered: true };
  }
  const order: Status[] = ["attending", "maybe", "not_attending"];
  const parts = order
    .map((s) => [s, answered.filter((v) => v === s).length] as const)
    .filter(([, c]) => c > 0)
    .map(([s, c]) => `${c} ${labels[s].toLowerCase()}`);
  const blank = n - answered.length;
  if (blank) parts.push(`${blank} blank`);
  return { text: parts.join(" · "), tone: "warning", answered: true };
}

/** Askable activities with at least one blank answer. */
export function blankActivities(view: RsvpView, people: PersonState[], attendance: Record<string, Status>) {
  return view.activities.filter((a) => a.attendanceRequested && !isComplete(a.id, people, attendance));
}

export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function groupByLocalDate<T extends { startAt: string }>(items: T[], timeZone: string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const d = utcToZoned(item.startAt, timeZone).date;
    map.set(d, [...(map.get(d) ?? []), item]);
  }
  return [...map.entries()];
}
