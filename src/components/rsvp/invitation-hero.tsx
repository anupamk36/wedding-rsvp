import { formatDate, formatDateRange, formatTime, utcToZoned } from "@/lib/dates";
import { cx } from "../ui";
import { groupByLocalDate } from "./logic";
import type { RsvpView } from "./types";

type CoverKind = "arch" | "numeral" | "pitch" | "block";

function coverKind(event: RsvpView["event"]): CoverKind {
  if (event.settings.theme.coverImageUrl) return "block";
  if (event.settings.availabilityMode) return "pitch";
  if (event.eventType === "wedding") return "arch";
  if (event.eventType === "birthday" || event.eventType === "dinner") return "numeral";
  return "block";
}

/** "The Sharma & Iyer families" invite; "Nisha" invites. */
function pluralHost(name: string): boolean {
  return /&|\+|\band\b|families|parents|friends|team|\bus\b|,/i.test(name);
}

const cream = "text-[#fbf6ee]";
const creamMuted = "text-[#fbf6ee]/85";

/** Decorative motifs; purely visual. */
function Motif({ kind, numeral }: { kind: CoverKind; numeral: string }) {
  if (kind === "arch") {
    return (
      <>
        {[
          ["w-[340px] h-[380px]", "border-marigold/55"],
          ["w-[300px] h-[344px]", "border-marigold/35"],
          ["w-[260px] h-[308px]", "border-marigold/20"],
        ].map(([size, color]) => (
          <div
            key={size}
            aria-hidden="true"
            className={cx("pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-full border-[1.5px] border-b-0", size, color)}
          />
        ))}
      </>
    );
  }
  if (kind === "pitch") {
    return (
      <>
        <div aria-hidden="true" className="pointer-events-none absolute -top-[70px] -right-[70px] size-[220px] rounded-full border-[1.5px] border-white/25" />
        <div aria-hidden="true" className="pointer-events-none absolute -top-[70px] right-[30px] h-[220px] w-[1.5px] bg-white/15" />
      </>
    );
  }
  if (kind === "numeral") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-9 -right-1.5 font-display text-[200px] leading-none font-bold tracking-tighter text-brand/15 select-none"
      >
        {numeral}
      </div>
    );
  }
  return null;
}

export function InvitationHero({
  event,
  activities,
  greeting,
}: {
  event: RsvpView["event"];
  activities: RsvpView["activities"];
  /** Chip text, e.g. "For the Sharma family · 4 people". */
  greeting?: string;
}) {
  const tz = event.timezone;
  const kind = coverKind(event);
  const dark = kind !== "numeral";
  const cover = event.settings.theme.coverImageUrl;
  const centered = kind === "arch";
  const hostLine = event.hostDisplayName
    ? kind === "pitch"
      ? `Hosted by ${event.hostDisplayName}`
      : `${event.hostDisplayName} ${pluralHost(event.hostDisplayName) ? "invite" : "invites"} you to`
    : kind === "pitch"
      ? "You're invited to mark your availability"
      : "You're invited to";
  const days = groupByLocalDate(activities, tz);
  const deadline = event.rsvpDeadline ? utcToZoned(event.rsvpDeadline, tz).date : null;

  return (
    <div className="overflow-hidden border-border bg-surface sm:rounded-[20px] sm:border">
      <header
        className={cx(
          "relative overflow-hidden px-6 pt-10 pb-8 sm:px-8",
          dark ? cx("bg-ink-deep", cream) : "border-b border-border bg-brand-soft text-text",
          centered && "text-center",
        )}
        style={cover ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.65)), url("${cover}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        <Motif kind={kind} numeral={String(Number(event.startDate.slice(8, 10)))} />
        <div className={cx("relative flex flex-col gap-2.5", centered && "items-center")}>
          {greeting && (
            <span
              className={cx(
                "inline-flex min-h-7 items-center self-start rounded-full px-3 py-1 text-[13px] font-semibold",
                centered && "self-center",
                kind === "arch" ? "bg-warning-soft text-ink-deep" : kind === "numeral" ? "bg-brand text-brand-contrast" : "bg-brand-soft text-ink-deep",
              )}
            >
              {greeting}
            </span>
          )}
          <p className={cx("text-sm", kind === "numeral" ? "mt-14 text-muted" : cx("mt-4", dark ? creamMuted : "text-muted"))}>{hostLine}</p>
          <h1
            className={cx(
              "font-display leading-[1.05] tracking-tight",
              kind === "arch" ? "text-[40px] font-medium italic sm:text-[46px]" : kind === "numeral" ? "max-w-[280px] text-[36px] font-semibold" : "text-[38px] font-medium sm:text-[44px]",
            )}
          >
            {event.name}
          </h1>
          <p className="mt-2 text-[15px] font-semibold tracking-wide">{formatDateRange(event.startDate, event.endDate, { month: "long" })}</p>
          {event.venueName && <p className={cx("text-sm", dark ? creamMuted : "text-muted")}>{event.venueName}</p>}
          {event.venueAddress && <p className={cx("text-[13px]", dark ? creamMuted : "text-muted")}>{event.venueAddress}</p>}
        </div>
      </header>

      {deadline && (
        <div className="flex items-center gap-2.5 bg-warning-soft px-6 py-3.5 text-sm font-medium text-warning-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span>
            Please reply by <strong className="font-bold">{formatDate(deadline, { weekday: "long", day: "numeric", month: "long", year: undefined })}</strong>.
            {event.settings.allowGuestEdits ? " You can change your answers until then." : ""}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-5 px-6 pt-6 pb-6 sm:px-8">
        {event.description && <p className="whitespace-pre-line text-[15px] leading-relaxed">{event.description}</p>}
        {activities.length > 0 && (
          <>
            <h2 className="font-display text-[22px] font-semibold">{event.settings.availabilityMode ? "The options" : "Schedule"}</h2>
            <ol className="flex flex-col gap-5">
              {days.map(([date, items]) => (
                <li key={date} className="grid grid-cols-[56px_1fr] gap-x-4">
                  <div className="flex flex-col items-center pt-0.5 leading-none">
                    <span className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">{formatDate(date, { weekday: "short", day: undefined, month: undefined, year: undefined })}</span>
                    <span className="mt-1 font-display text-[30px] font-semibold text-brand">{Number(date.slice(8, 10))}</span>
                    <span className="mt-0.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{formatDate(date, { weekday: undefined, day: undefined, month: "short", year: undefined })}</span>
                  </div>
                  <ul className="flex flex-col gap-2.5">
                    {items.map((a) => (
                      <li key={a.id} className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5">
                        <span className="min-w-0">
                          <span className="font-semibold">{a.name}</span>
                          {a.venueName && a.venueName !== event.venueName && <span className="block text-[13px] text-muted">{a.venueName}</span>}
                        </span>
                        <span className="shrink-0 text-sm text-muted">{formatTime(a.startAt, tz)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            <p className="text-[13px] text-muted">Times shown in {tz}.</p>
          </>
        )}
      </div>
    </div>
  );
}
