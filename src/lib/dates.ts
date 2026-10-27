// Date helpers shared by server and client. Calendar dates are plain
// "YYYY-MM-DD" strings; instants are Date objects / ISO strings in UTC.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (to exclusive). */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Each calendar date in the half-open range [from, to). */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
}

function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Convert a wall-clock date and time in `timeZone` to a UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const naive = new Date(`${date}T${time}:00Z`);
  // Two passes handle DST transitions where the offset differs at the target time.
  let guess = new Date(naive.getTime() - offsetMinutes(naive, timeZone) * 60_000);
  guess = new Date(naive.getTime() - offsetMinutes(guess, timeZone) * 60_000);
  return guess;
}

/** Wall-clock date and time of an instant in `timeZone`. */
export function utcToZoned(instant: Date | string, timeZone: string): { date: string; time: string } {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    ...opts,
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * "Fri 20 – Sun 22 Nov 2026" (no repeated month or year). Options drop the
 * weekday or year, or spell the month out.
 */
export function formatDateRange(
  start: string,
  end: string,
  { month = "short", weekday = true, year = true }: { month?: "short" | "long"; weekday?: boolean; year?: boolean } = {},
): string {
  const part = (d: string, o: Intl.DateTimeFormatOptions) => formatDate(d, { weekday: undefined, day: undefined, month: undefined, year: undefined, ...o });
  const wd = (d: string) => (weekday ? `${part(d, { weekday: "short" })} ` : "");
  const day = (d: string) => String(Number(d.slice(8, 10)));
  const full = (d: string, withYear = year) => `${wd(d)}${day(d)} ${part(d, { month })}${withYear ? ` ${d.slice(0, 4)}` : ""}`;
  if (start === end) return full(start);
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${full(start, true)} – ${full(end, true)}`;
  const from = start.slice(0, 7) === end.slice(0, 7) ? `${wd(start)}${day(start)}` : full(start, false);
  return `${from} – ${full(end)}`;
}

export function formatDateTime(
  instant: Date | string,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    ...opts,
  }).format(typeof instant === "string" ? new Date(instant) : instant);
}

export function formatTime(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone }).format(
    typeof instant === "string" ? new Date(instant) : instant,
  );
}

export const COMMON_TIME_ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];
