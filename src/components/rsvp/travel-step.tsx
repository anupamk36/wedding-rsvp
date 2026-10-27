"use client";

import { nightsInStay } from "@/domain/calculations";
import { addDays, formatDate, utcToZoned } from "@/lib/dates";
import { Badge, Button, Chip, cx, Field, Input } from "../ui";
import { Notice, Stepper, Switch } from "./controls";
import { chipNames } from "./logic";
import type { FlowState, PersonState, RsvpView, StayState, TransportState } from "./types";

type Update = (fn: (d: FlowState) => FlowState) => void;

function safeNights(arrival: string, departure: string): number | null {
  try {
    return arrival && departure ? nightsInStay(arrival, departure) : null;
  } catch {
    return null;
  }
}

/** Live summary of a stay request: rooms × nights. Requested, not booked. */
export function roomNightNote(stay: StayState): { tone: "success" | "info"; text: React.ReactNode } | null {
  const nights = safeNights(stay.arrivalDate, stay.departureDate);
  if (nights == null) return null;
  const people = stay.personKeys.length;
  const n = `${nights} night${nights === 1 ? "" : "s"}`;
  const who = `${people} ${people === 1 ? "person" : "people"}`;
  if (stay.roomCount == null) return { tone: "info", text: <>{n} for {who}. Add a room count so the hosts can plan rooms.</> };
  const rooms = `${stay.roomCount} room${stay.roomCount === 1 ? "" : "s"}`;
  return {
    tone: "success",
    text: (
      <>
        <strong>
          {stay.roomCount * nights} room-night{stay.roomCount * nights === 1 ? "" : "s"}
        </strong>{" "}
        · {n}, {rooms}, {who}
      </>
    ),
  };
}

function PeopleChips({ people, selected, onChange, label, id }: { people: PersonState[]; selected: string[]; onChange: (keys: string[]) => void; label: string; id: string }) {
  const names = chipNames(people);
  return (
    <div className="flex flex-col gap-2">
      <span id={id} className="text-[13.5px] font-semibold">
        {label}
      </span>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        {people.map((p) => {
          const on = selected.includes(p.key);
          return (
            <Chip key={p.key} on={on} onClick={() => onChange(on ? selected.filter((k) => k !== p.key) : [...selected, p.key])}>
              {names.get(p.key)}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

function SectionHead({ id, title, icon, tint, checked, onChange }: { id: string; title: string; icon: React.ReactNode; tint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className={cx("flex size-10 items-center justify-center rounded-xl", tint)}>
          {icon}
        </span>
        <h2 id={id} className="font-display text-xl font-semibold">
          {title}
        </h2>
      </div>
      <Switch checked={checked} onChange={onChange} labelledBy={id} />
    </div>
  );
}

export function TravelStep({
  view,
  state,
  update,
  attendingKeys,
}: {
  view: RsvpView;
  state: FlowState;
  update: Update;
  attendingKeys: Set<string>;
}) {
  const f = view.event.settings.features;
  const { startDate, endDate } = view.event;
  const minDate = addDays(startDate, -7);
  const maxDate = addDays(endDate, 7);
  const attending = state.people.filter((p) => attendingKeys.has(p.key));
  const party = state.people.length > 1;
  const tz = view.event.timezone;
  const firstLocal = view.activities[0] ? utcToZoned(view.activities[0].startAt, tz).date : startDate;
  const defaultStay = (): StayState => ({
    arrivalDate: startDate,
    departureDate: addDays(endDate, 1),
    personKeys: attending.map((p) => p.key),
    roomCount: null,
    roomSharing: "",
    notes: "",
  });
  const defaultTransport = (): TransportState => ({
    direction: "arrival",
    travelDate: startDate,
    travelTime: "",
    location: "",
    personKeys: attending.map((p) => p.key),
    notes: "",
  });
  const setStay = (i: number, patch: Partial<StayState>) => update((d) => ({ ...d, stays: d.stays.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const setTr = (i: number, patch: Partial<TransportState>) => update((d) => ({ ...d, transport: d.transport.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const intro =
    f.accommodation && f.transport
      ? "Tell us if you need a room or a pickup. Both are optional, and the hosts confirm details later."
      : f.accommodation
        ? "Tell us if you need somewhere to stay. It's a request; the hosts confirm rooms later."
        : "Tell us if you need a pickup or drop-off. The hosts confirm details later.";

  return (
    <section aria-labelledby="travel-h" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 id="travel-h" className="font-display text-[28px] leading-tight font-semibold">
          {f.accommodation && f.transport ? "Stay and travel" : f.accommodation ? "Somewhere to stay" : "Getting there"}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted">{intro}</p>
      </div>

      {f.accommodation && (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
          <SectionHead
            id="stay-h"
            title={party ? "We need a place to stay" : "I need a place to stay"}
            tint="bg-brand-soft text-brand"
            checked={state.needsStay}
            onChange={(v) => update((d) => ({ ...d, needsStay: v, stays: v && d.stays.length === 0 ? [defaultStay()] : d.stays }))}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 18v-9M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" />
                <circle cx="7" cy="11" r="1.5" />
              </svg>
            }
          />
          {state.needsStay && (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <p className="text-[13px] text-muted">
                Check-out is the morning you leave. For example, in {formatDate(firstLocal, { weekday: undefined, year: undefined })} and out{" "}
                {formatDate(addDays(firstLocal, 2), { weekday: undefined, year: undefined })} is 2 nights.
              </p>
              {state.stays.map((st, i) => {
                const note = roomNightNote(st);
                return (
                  <div key={st.id ?? i} className={cx("flex flex-col gap-4", i > 0 && "border-t border-border pt-4")}>
                    {st.confirmed && <Badge tone="success">Room confirmed by the hosts. Changes go to them for review.</Badge>}
                    <div className="grid grid-cols-2 gap-2.5">
                      <Field label="Check-in" htmlFor={`in-${i}`}>
                        <Input id={`in-${i}`} type="date" min={minDate} max={maxDate} value={st.arrivalDate} onChange={(e) => setStay(i, { arrivalDate: e.target.value })} />
                      </Field>
                      <Field label="Check-out" htmlFor={`out-${i}`}>
                        <Input id={`out-${i}`} type="date" min={st.arrivalDate || minDate} max={maxDate} value={st.departureDate} onChange={(e) => setStay(i, { departureDate: e.target.value })} />
                      </Field>
                    </div>
                    <PeopleChips id={`stay-who-${i}`} label={party ? "Who is staying?" : "Staying"} people={state.people} selected={st.personKeys} onChange={(keys) => setStay(i, { personKeys: keys })} />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <span id={`rooms-${i}`} className="text-[13.5px] font-semibold">
                          Rooms
                        </span>
                        <span className="text-[13px] text-muted">Tell the hosts how many rooms you need</span>
                      </div>
                      <Stepper value={st.roomCount} onChange={(v) => setStay(i, { roomCount: v })} labelledBy={`rooms-${i}`} unitLess="One fewer room" unitMore="One more room" max={20} />
                    </div>
                    {note && (
                      <p aria-live="polite" className={cx("rounded-xl px-3.5 py-3 text-[14px] leading-snug", note.tone === "success" ? "bg-success-soft text-success-ink" : "bg-info-soft text-info-ink")}>
                        {note.text}
                      </p>
                    )}
                    <Field label="Room sharing or other requests" htmlFor={`share-${i}`}>
                      <Input id={`share-${i}`} maxLength={300} placeholder="e.g. parents in one room, ground floor please" value={st.roomSharing} onChange={(e) => setStay(i, { roomSharing: e.target.value })} />
                    </Field>
                    {state.stays.length > 1 && (
                      <Button variant="link" className="self-start" onClick={() => update((d) => ({ ...d, stays: d.stays.filter((_, j) => j !== i) }))}>
                        Remove this stay
                      </Button>
                    )}
                  </div>
                );
              })}
              {state.stays.length < 10 && (
                <Button variant="secondary" size="sm" className="self-start" onClick={() => update((d) => ({ ...d, stays: [...d.stays, defaultStay()] }))}>
                  + Add a stay with different dates
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {f.transport && (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
          <SectionHead
            id="tr-h"
            title={party ? "We need a pickup" : "I need a pickup"}
            tint="bg-warning-soft text-warning"
            checked={state.needsTransport}
            onChange={(v) => update((d) => ({ ...d, needsTransport: v, transport: v && d.transport.length === 0 ? [defaultTransport()] : d.transport }))}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 16V9l2-4h10l2 4v7M3 16h18v3H3zM7 12h.01M17 12h.01" />
              </svg>
            }
          />
          {state.needsTransport && (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              {state.transport.map((t, i) => (
                <div key={t.id ?? i} className={cx("flex flex-col gap-4", i > 0 && "border-t border-border pt-4")}>
                  <TripDirection value={t.direction} index={i} onChange={(direction) => setTr(i, { direction })} />
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="Date" htmlFor={`td-${i}`}>
                      <Input id={`td-${i}`} type="date" min={minDate} max={maxDate} value={t.travelDate} onChange={(e) => setTr(i, { travelDate: e.target.value })} />
                    </Field>
                    <Field label={t.direction === "departure" ? "Leaving at" : "Arriving at"} htmlFor={`tt-${i}`}>
                      <Input id={`tt-${i}`} type="time" value={t.travelTime} onChange={(e) => setTr(i, { travelTime: e.target.value })} />
                    </Field>
                  </div>
                  <Field label={t.direction === "departure" ? "Drop-off at" : "Pickup from"} htmlFor={`loc-${i}`} hint="Airport, station or address.">
                    <Input id={`loc-${i}`} maxLength={300} value={t.location} onChange={(e) => setTr(i, { location: e.target.value })} />
                  </Field>
                  <PeopleChips id={`tr-who-${i}`} label={party ? "Who is travelling?" : "Travelling"} people={state.people} selected={t.personKeys} onChange={(keys) => setTr(i, { personKeys: keys })} />
                  <Field label="Notes" htmlFor={`tn-${i}`}>
                    <Input id={`tn-${i}`} maxLength={1000} placeholder="Flight or train number, arrival time" value={t.notes} onChange={(e) => setTr(i, { notes: e.target.value })} />
                  </Field>
                  {state.transport.length > 1 && (
                    <Button variant="link" className="self-start" onClick={() => update((d) => ({ ...d, transport: d.transport.filter((_, j) => j !== i) }))}>
                      Remove this trip
                    </Button>
                  )}
                </div>
              ))}
              {state.transport.length < 10 && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={() => update((d) => ({ ...d, transport: [...d.transport, { ...defaultTransport(), direction: "departure", travelDate: endDate }] }))}
                >
                  + Add another trip
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {!state.needsStay && !state.needsTransport && <Notice tone="info">Nothing needed? Just continue.</Notice>}
    </section>
  );
}

function TripDirection({ value, index, onChange }: { value: TransportState["direction"]; index: number; onChange: (v: TransportState["direction"]) => void }) {
  // Same segmented look as the answer picker, but a neutral selection colour.
  return (
    <div role="radiogroup" aria-label="Trip" className="flex gap-1.5">
      {(
        [
          ["arrival", "Arrival"],
          ["departure", "Departure"],
          ["local", "Between venues"],
        ] as const
      ).map(([v, l]) => (
        <label key={v} className="relative min-w-0 flex-1">
          <input type="radio" name={`dir-${index}`} value={v} checked={value === v} onChange={() => onChange(v)} className="peer sr-only" />
          <span
            className={cx(
              "flex h-11 cursor-pointer items-center justify-center gap-1 rounded-[10px] border-[1.5px] px-1 text-center text-[13.5px] font-semibold leading-tight",
              "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
              value === v ? "border-brand bg-brand text-brand-contrast" : "border-border-strong bg-surface text-muted hover:border-brand",
            )}
          >
            {value === v && <span aria-hidden="true">✓</span>}
            {l}
          </span>
        </label>
      ))}
    </div>
  );
}

