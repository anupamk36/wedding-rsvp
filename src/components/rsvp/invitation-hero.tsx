import { formatDate, formatDateTime, formatTime, utcToZoned } from "@/lib/dates";
import type { RsvpView } from "./types";

export function InvitationHero({
  event,
  activities,
  greeting,
}: {
  event: RsvpView["event"];
  activities: RsvpView["activities"];
  greeting?: string;
}) {
  const tz = event.timezone;
  const dates =
    event.startDate === event.endDate
      ? formatDate(event.startDate, { weekday: "long" })
      : `${formatDate(event.startDate, { year: undefined })} – ${formatDate(event.endDate)}`;
  const byDate = new Map<string, RsvpView["activities"]>();
  for (const a of activities) {
    const d = utcToZoned(a.startAt, tz).date;
    byDate.set(d, [...(byDate.get(d) ?? []), a]);
  }
  const cover = event.settings.theme.coverImageUrl;

  return (
    <header className="overflow-hidden rounded-2xl border border-border bg-surface">
      {cover && (
        // Host-provided HTTPS image; plain <img> avoids configuring remote image domains.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="h-44 w-full object-cover sm:h-56" referrerPolicy="no-referrer" />
      )}
      <div className="px-5 py-7 text-center sm:px-8">
        {greeting && <p className="text-sm font-medium text-brand">{greeting}</p>}
        <p className="mt-1 text-sm text-muted">{event.hostDisplayName ? `${event.hostDisplayName} invite you to` : "You're invited to"}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{event.name}</h1>
        <p className="mt-3 text-sm">
          {dates}
          {event.venueName ? ` · ${event.venueName}` : ""}
        </p>
        {event.venueAddress && <p className="text-sm text-muted">{event.venueAddress}</p>}
        {event.description && <p className="mx-auto mt-4 max-w-prose whitespace-pre-line text-sm">{event.description}</p>}
        {event.rsvpDeadline && (
          <p className="mt-4 inline-block rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand">
            Please respond by {formatDateTime(event.rsvpDeadline, tz, { weekday: undefined })}
          </p>
        )}
      </div>
      {activities.length > 0 && (
        <div className="border-t border-border px-5 py-5 sm:px-8">
          <h2 className="mb-3 text-sm font-semibold">{event.settings.availabilityMode ? "Options" : "Schedule"}</h2>
          <ol className="space-y-4">
            {[...byDate.entries()].map(([date, items]) => (
              <li key={date}>
                <div className="text-xs font-medium uppercase tracking-wide text-muted">{formatDate(date, { year: undefined })}</div>
                <ul className="mt-1 space-y-1.5">
                  {items.map((a) => (
                    <li key={a.id} className="flex flex-col text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-x-3">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-muted">
                        {formatTime(a.startAt, tz)}
                        {a.venueName ? ` · ${a.venueName}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">Times shown in {tz}.</p>
        </div>
      )}
    </header>
  );
}
