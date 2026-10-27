"use client";

import { useState } from "react";
import { formatDate, formatDateTime, formatTime } from "@/lib/dates";
import { Badge, Button, cx, Input } from "../ui";
import { Avatar, Notice, StatusPicker } from "./controls";
import { activityResult, chipNames, groupByLocalDate, isMixed, personName, sharedAnswer, type Labels } from "./logic";
import { attKey, type FlowState, type PersonState, type RsvpView, type Status } from "./types";

type Update = (fn: (d: FlowState) => FlowState) => void;

export function EventsStep({
  view,
  state,
  update,
  labels,
}: {
  view: RsvpView;
  state: FlowState;
  update: Update;
  labels: Labels;
}) {
  const s = view.event.settings;
  const availability = s.availabilityMode;
  const tz = view.event.timezone;
  const askable = view.activities.filter((a) => a.attendanceRequested);
  const party = state.people.length > 1;
  // Activities with differing answers open person by person; the rest start with one answer for everyone.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(askable.map((a) => [a.id, a.allowDecline && isMixed(a.id, state.people, state.attendance)])),
  );
  const showParty = party || view.invitation.plusOnesAllowed > 0;

  const setStatus = (personKey: string, activityId: string, status: Status) =>
    update((d) => ({ ...d, attendance: { ...d.attendance, [attKey(personKey, activityId)]: status } }));
  const setAll = (activityId: string, status: Status) =>
    update((d) => ({ ...d, attendance: { ...d.attendance, ...Object.fromEntries(d.people.map((p) => [attKey(p.key, activityId), status])) } }));

  const heading = availability ? "When can you make it?" : party ? "Who's coming to what?" : "Which events can you make?";
  const intro = availability
    ? "Mark every option that could work. Blank is not a no."
    : party
      ? "Answer once for everyone, or open an event to answer person by person."
      : "Choose an answer for each.";

  return (
    <section aria-labelledby="events-h" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 id="events-h" className="font-display text-[28px] leading-tight font-semibold">
          {heading}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted">
          {intro}
          {s.allowMaybe && !availability ? " Not sure yet? Pick maybe and change it later." : ""}
        </p>
      </div>

      {showParty && <PartyChips view={view} state={state} update={update} />}

      {askable.length === 0 && <p className="text-[15px] text-muted">There&rsquo;s nothing to respond to yet.</p>}

      {groupByLocalDate(askable, tz).map(([date, items]) => (
        <section key={date} className="flex flex-col gap-3">
          <h2 className="mt-2 text-xs font-bold tracking-[0.1em] text-brand uppercase">
            {formatDate(date, { weekday: "long", day: "numeric", month: "short", year: undefined })}
          </h2>
          {items.map((a) => (
            <ActivityCard
              key={a.id}
              activity={a}
              tz={tz}
              eventVenue={view.event.venueName}
              people={state.people}
              attendance={state.attendance}
              labels={labels}
              allowMaybe={s.allowMaybe}
              expanded={!!expanded[a.id]}
              onToggle={() => setExpanded((e) => ({ ...e, [a.id]: !e[a.id] }))}
              setStatus={setStatus}
              setAll={(st) => setAll(a.id, st)}
            />
          ))}
        </section>
      ))}

      {view.activities.some((a) => !a.attendanceRequested) && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-[14px]">
          <div className="font-semibold">Also on the schedule</div>
          <ul className="mt-1 text-muted">
            {view.activities
              .filter((a) => !a.attendanceRequested)
              .map((a) => (
                <li key={a.id}>
                  {a.name} · {formatDateTime(a.startAt, tz)}
                </li>
              ))}
          </ul>
        </div>
      )}

      {askable.length > 0 && (
        <Notice tone="info">
          Anything left blank reaches the hosts as <strong>no answer</strong>, not as a decline.
        </Notice>
      )}
    </section>
  );
}

function PartyChips({ view, state, update }: { view: RsvpView; state: FlowState; update: Update }) {
  const plusOnes = state.people.filter((p) => p.isPlusOne);
  const canAdd = plusOnes.length < view.invitation.plusOnesAllowed;
  const names = chipNames(state.people);
  const setPerson = (key: string, patch: Partial<PersonState>) =>
    update((d) => ({ ...d, people: d.people.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
  const remove = (key: string) =>
    update((d) => ({
      ...d,
      people: d.people.filter((x) => x.key !== key),
      attendance: Object.fromEntries(Object.entries(d.attendance).filter(([k]) => !k.startsWith(`${key}|`))),
    }));

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Your party" className="flex flex-wrap items-center gap-2">
        {state.people
          .filter((p) => !p.isPlusOne)
          .map((p) => (
            <li key={p.key} className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-soft pr-3 pl-1 text-[13.5px] font-semibold text-brand-ink">
              <Avatar name={p.name} size="sm" />
              {names.get(p.key)}
            </li>
          ))}
        {view.invitation.plusOnesAllowed > 0 && (
          <li>
            <button
              type="button"
              disabled={!canAdd}
              onClick={() =>
                update((d) => ({
                  ...d,
                  people: [
                    ...d.people,
                    { key: `new:${Date.now()}`, name: "", isPlusOne: true, isNew: true, relationship: null, dietary: [], dietaryNotes: "", accessibilityNeeds: "" },
                  ],
                }))
              }
              className="inline-flex h-11 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-border-strong px-3.5 text-[13.5px] font-semibold text-muted hover:border-brand hover:text-brand disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add a guest
            </button>
          </li>
        )}
      </ul>
      {plusOnes.map((p) => (
        <div key={p.key} className="flex items-center gap-2">
          <Avatar name={p.name || "+"} />
          <Input
            aria-label="Guest name"
            value={p.name}
            placeholder="Their name"
            maxLength={160}
            onChange={(e) => setPerson(p.key, { name: e.target.value })}
          />
          <Button variant="ghost" size="sm" onClick={() => remove(p.key)}>
            Remove
          </Button>
        </div>
      ))}
      {view.invitation.plusOnesAllowed > 0 && (
        <p className="text-[13px] text-muted">
          You can bring up to {view.invitation.plusOnesAllowed} additional guest{view.invitation.plusOnesAllowed === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}

function ActivityCard({
  activity: a,
  tz,
  eventVenue,
  people,
  attendance,
  labels,
  allowMaybe,
  expanded,
  onToggle,
  setStatus,
  setAll,
}: {
  activity: RsvpView["activities"][number];
  tz: string;
  eventVenue: string | null;
  people: PersonState[];
  attendance: Record<string, Status>;
  labels: Labels;
  allowMaybe: boolean;
  expanded: boolean;
  onToggle: () => void;
  setStatus: (personKey: string, activityId: string, s: Status) => void;
  setAll: (s: Status) => void;
}) {
  const options: Status[] = allowMaybe ? ["attending", "maybe", "not_attending"] : ["attending", "not_attending"];
  const party = people.length > 1;
  const canSplit = party && a.allowDecline;
  const shared = sharedAnswer(a.id, people, attendance);
  const result = activityResult(a.id, people, attendance, labels);
  const summary = result.answered ? result.text : "Not answered yet";

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-xl font-semibold">{a.name}</h3>
        <span className="shrink-0 text-sm text-muted">
          {formatTime(a.startAt, tz)}
          {a.endAt ? ` – ${formatTime(a.endAt, tz)}` : ""}
        </span>
      </div>
      {((a.venueName && a.venueName !== eventVenue) || a.description || a.isFull) && (
        <div className="-mt-1 flex flex-col gap-1 text-[14px]">
          {a.venueName && a.venueName !== eventVenue && <span className="text-muted">{a.venueName}</span>}
          {a.description && <span>{a.description}</span>}
          {a.isFull && (
            <span>
              <Badge tone="warning">Full</Badge>
            </span>
          )}
        </div>
      )}
      {party && <p className={cx("-mt-1 text-[13.5px] font-medium", result.answered ? "text-muted" : "text-info-ink")}>{summary}</p>}

      <StatusPicker
        name={`${a.id}-all`}
        label={party ? `${a.name} – everyone` : a.name}
        value={shared ?? undefined}
        options={options}
        labels={labels}
        disabledAttending={a.isFull && shared !== "attending"}
        onChange={setAll}
      />

      {canSplit && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="-mx-1 flex h-11 items-center gap-1.5 self-start px-1 text-[14px] font-semibold text-brand hover:underline underline-offset-4"
        >
          {expanded ? "Same answer for everyone" : "Answer person by person"}
        </button>
      )}
      {party && !a.allowDecline && <p className="text-[13px] text-muted">One answer for everyone in your party.</p>}

      {canSplit && expanded && (
        <div className="flex flex-col gap-3.5 border-t border-border pt-3.5">
          {people.map((p) => (
            <div key={p.key} className="flex flex-col gap-2">
              <span className="text-[14px] font-semibold">{personName(p)}</span>
              <StatusPicker
                name={`${a.id}-${p.key}`}
                label={`${a.name} – ${personName(p)}`}
                value={attendance[attKey(p.key, a.id)]}
                options={options}
                labels={labels}
                disabledAttending={a.isFull && attendance[attKey(p.key, a.id)] !== "attending"}
                onChange={(st) => setStatus(p.key, a.id, st)}
              />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
