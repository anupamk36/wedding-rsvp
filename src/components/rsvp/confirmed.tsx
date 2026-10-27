"use client";

import { formatDate, formatDateTime, utcToZoned } from "@/lib/dates";
import { buildIcs } from "@/lib/ics";
import { Eyebrow } from "../ui";
import { bigButton, Notice } from "./controls";
import { blankActivities, listNames, shortLabel, type Labels } from "./logic";
import { Summary } from "./summary";
import { attKey, type FlowState, type RsvpView } from "./types";

function attendingActivities(view: RsvpView, state: FlowState) {
  return view.activities.filter((a) => a.attendanceRequested && state.people.some((p) => state.attendance[attKey(p.key, a.id)] === "attending"));
}

/** Downloads an .ics with the activities the party said yes to. The personal link is left out on purpose. */
function downloadCalendar(view: RsvpView, state: FlowState) {
  const acts = attendingActivities(view, state);
  const ics = buildIcs(
    view.event.name,
    acts.map((a) => ({
      uid: `${a.id}@gatherly`,
      title: acts.length > 1 ? `${a.name} · ${view.event.name}` : view.event.name === a.name ? a.name : `${a.name} · ${view.event.name}`,
      start: a.startAt,
      end: a.endAt,
      location: [a.venueName ?? view.event.venueName, a.venueAddress ?? (a.venueName ? null : view.event.venueAddress)].filter(Boolean).join(", ") || null,
      description: view.event.hostDisplayName ? `Hosted by ${view.event.hostDisplayName}` : null,
    })),
  );
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${view.event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event"}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Confirmed({
  view,
  state,
  labels,
  justSaved,
  canEdit,
  onChange,
  onWithdraw,
  submitting,
}: {
  view: RsvpView;
  state: FlowState;
  labels: Labels;
  justSaved: boolean;
  canEdit: boolean;
  onChange: () => void;
  onWithdraw: () => void;
  submitting: boolean;
}) {
  const f = view.event.settings.features;
  const tz = view.event.timezone;
  const host = view.event.hostDisplayName ?? "The hosts";
  const attending = attendingActivities(view, state);
  const blanks = blankActivities(view, state.people, state.attendance);
  const deadline = view.event.rsvpDeadline ? formatDate(utcToZoned(view.event.rsvpDeadline, tz).date, { weekday: "long", year: undefined }) : null;
  const rooms = state.needsStay ? state.stays.reduce((n, s) => n + (s.roomCount ?? 0), 0) : 0;
  const stays = state.needsStay ? state.stays.length : 0;
  const pickups = state.needsTransport ? state.transport.length : 0;
  const tiles = [
    { value: attending.length, label: view.event.settings.availabilityMode ? (attending.length === 1 ? "option" : "options") : attending.length === 1 ? "event" : "events", cls: "bg-success-soft text-success-ink" },
    ...(f.accommodation
      ? [rooms ? { value: rooms, label: rooms === 1 ? "room" : "rooms", cls: "bg-brand-soft text-brand-ink" } : { value: stays, label: stays === 1 ? "stay" : "stays", cls: "bg-brand-soft text-brand-ink" }]
      : []),
    ...(f.transport ? [{ value: pickups, label: pickups === 1 ? "pickup" : "pickups", cls: "bg-warning-soft text-warning-ink" }] : []),
  ];

  return (
    <div className="overflow-hidden border-border sm:rounded-[20px] sm:border">
      <div role={justSaved ? "status" : undefined} className="relative overflow-hidden bg-ink-deep px-7 pt-11 pb-9 text-center text-[#fbf6ee]">
        {[
          ["w-[300px] h-[300px]", "border-marigold/45"],
          ["w-[250px] h-[250px]", "border-marigold/25"],
        ].map(([size, color]) => (
          <div key={size} aria-hidden="true" className={`pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-full border-[1.5px] border-b-0 ${size} ${color}`} />
        ))}
        <div className="relative flex flex-col items-center">
          <span aria-hidden="true" className="flex size-[60px] items-center justify-center rounded-full bg-marigold text-[#3d1a00]">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <h1 className="mt-5 font-display text-[34px] leading-[1.1] font-medium italic">
            Thank you,
            <br />
            {shortLabel(view.invitation.label, state.people.length)}
          </h1>
          <p className="mt-3 text-[15px] leading-snug text-[#fbf6ee]/85">
            {justSaved ? `Your response is saved. ${host} will see it right away.` : `Your response is with ${host === "The hosts" ? "the hosts" : host}.`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 bg-bg px-5 pt-5 pb-6 sm:bg-surface">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <Eyebrow as="h2">What you told us</Eyebrow>
          <div className="grid gap-2.5 text-center" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
            {tiles.map((t) => (
              <div key={t.label} className={`rounded-xl px-1 py-3 ${t.cls}`}>
                <div className="font-display text-[28px] leading-none font-semibold">{t.value}</div>
                <div className="mt-1 text-[12.5px] font-semibold">{t.label}</div>
              </div>
            ))}
          </div>
          {blanks.length > 0 && (
            <p className="text-[14px] leading-snug text-muted">
              {listNames(blanks.map((a) => a.name))} {blanks.length === 1 ? "is" : "are"} still blank.
              {canEdit ? ` Change ${blanks.length === 1 ? "it" : "them"} any time${deadline ? ` before ${deadline}` : ""}.` : ""}
            </p>
          )}
        </section>

        <p className="flex items-start gap-3 px-1 text-[14px] leading-snug text-muted">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px shrink-0">
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
          </svg>
          Keep this link to come back{canEdit ? " and change your answers" : ""}. It&rsquo;s personal, so please don&rsquo;t forward it.
        </p>

        <div className="mt-1 flex flex-col gap-2.5">
          {attending.length > 0 && (
            <button type="button" onClick={() => downloadCalendar(view, state)} className={`${bigButton} h-[54px] bg-brand text-brand-contrast hover:bg-brand-hover`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              {attending.length === 1 ? "Add to my calendar" : `Add ${attending.length} events to my calendar`}
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={onChange} className={`${bigButton} h-[54px] border-[1.5px] border-border-strong bg-surface text-text hover:bg-surface-2`}>
              Change my response
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={onWithdraw} disabled={submitting} className="h-12 text-[14px] font-semibold text-muted underline underline-offset-4 hover:text-text disabled:opacity-50">
              Withdraw my response
            </button>
          )}
        </div>

        <details className="group rounded-2xl border border-border bg-surface">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 font-semibold [&::-webkit-details-marker]:hidden">
            See all your answers
            <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="border-t border-border p-3">
            <Summary view={view} state={state} labels={labels} />
          </div>
        </details>

        {!canEdit && <Notice tone="warning">Your answers can&rsquo;t be changed online any more. Please contact the hosts if your plans change.</Notice>}
        {view.invitation.lastRespondedAt && <p className="text-center text-[13px] text-muted">Last updated {formatDateTime(view.invitation.lastRespondedAt, tz)}</p>}
      </div>
    </div>
  );
}
