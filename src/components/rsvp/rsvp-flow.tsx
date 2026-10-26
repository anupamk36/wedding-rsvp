"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type ReactNode } from "react";
import { ATTENDANCE_LABELS, dietaryLabel } from "@/domain/settings";
import { addDays, formatDate, formatDateTime, formatTime, utcToZoned } from "@/lib/dates";
import { Badge, Button, Card, Checkbox, cx, Field, Input, inputClass, Select, Textarea } from "../ui";
import { attKey, type FlowState, type PersonState, type RsvpView, type Status, type StayState, type TransportState } from "./types";

type StepId = "party" | "activities" | "details" | "travel" | "review";

interface Props {
  view: RsvpView;
  endpoint: string;
  mode: "guest" | "host";
  /** Where the host returns after saving. */
  doneHref?: string;
  justSaved?: boolean;
}

function initialState(view: RsvpView): FlowState {
  const attendance: Record<string, Status> = {};
  for (const a of view.attendance) attendance[attKey(a.guestId, a.activityId)] = a.status;
  return {
    people: view.people.map((p) => ({
      key: p.id,
      name: p.name,
      isPlusOne: p.isPlusOne,
      isNew: false,
      relationship: p.relationship,
      dietary: p.dietary,
      dietaryNotes: p.dietaryNotes ?? "",
      accessibilityNeeds: p.accessibilityNeeds ?? "",
    })),
    attendance,
    needsStay: view.accommodation.length > 0,
    stays: view.accommodation.map((s) => ({
      id: s.id,
      arrivalDate: s.arrivalDate,
      departureDate: s.departureDate,
      personKeys: s.guestIds,
      roomCount: s.roomCount,
      roomSharing: s.roomSharing ?? "",
      notes: s.notes ?? "",
      confirmed: s.confirmed,
    })),
    needsTransport: view.transport.length > 0,
    transport: view.transport.map((t) => ({
      id: t.id,
      direction: t.direction,
      travelDate: t.travelDate,
      travelTime: t.travelTime ?? "",
      location: t.location,
      personKeys: t.guestIds,
      notes: t.notes ?? "",
    })),
    mealOptOuts: view.mealOptOuts.map((m) => attKey(m.guestId, m.mealId)),
    answers: view.answers,
    notes: view.notes ?? "",
  };
}

export function RsvpFlow({ view, endpoint, mode, doneHref, justSaved }: Props) {
  const router = useRouter();
  const [state, setState] = useState<FlowState>(() => initialState(view));
  const responded = view.invitation.responseStatus === "submitted" || view.invitation.responseStatus === "updated";
  const locked = mode === "guest" && view.invitation.lockedReason !== null;
  const [editing, setEditing] = useState(mode === "host" || (!responded && !locked));
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; stale?: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(justSaved ? "Thank you — your response has been saved." : null);

  const s = view.event.settings;
  const f = s.features;
  const availability = s.availabilityMode;
  const labels = ATTENDANCE_LABELS[availability ? "availability" : "standard"];
  const askable = view.activities.filter((a) => a.attendanceRequested);
  const tz = view.event.timezone;

  const attendingKeys = useMemo(
    () =>
      new Set(
        state.people
          .filter((p) => askable.some((a) => ["attending", "maybe"].includes(state.attendance[attKey(p.key, a.id)] ?? "")))
          .map((p) => p.key),
      ),
    [state.people, state.attendance, askable],
  );
  const attendingActivityIds = new Set(
    askable.filter((a) => state.people.some((p) => state.attendance[attKey(p.key, a.id)] === "attending")).map((a) => a.id),
  );
  const visibleQuestions = view.questions.filter((q) => !q.activityId || attendingActivityIds.has(q.activityId));
  const hasDetails = attendingKeys.size > 0 && (f.dietary || f.accessibility || view.meals.length > 0 || visibleQuestions.length > 0);
  const hasTravel = (f.accommodation || f.transport) && attendingKeys.size > 0;
  const showParty = state.people.length > 1 || view.invitation.plusOnesAllowed > 0;

  const steps: { id: StepId; label: string }[] = [
    ...(showParty ? [{ id: "party" as const, label: "Your party" }] : []),
    { id: "activities", label: availability ? "Availability" : "Events" },
    ...(hasDetails ? [{ id: "details" as const, label: "Details" }] : []),
    ...(hasTravel ? [{ id: "travel" as const, label: "Stay & travel" }] : []),
    { id: "review", label: "Review" },
  ];
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  const update = (fn: (draft: FlowState) => FlowState) => setState((prev) => fn(prev));
  const setStatus = (personKey: string, activityId: string, status: Status) =>
    update((d) => ({ ...d, attendance: { ...d.attendance, [attKey(personKey, activityId)]: status } }));

  const unansweredCount = askable.reduce(
    (n, a) => n + state.people.filter((p) => !state.attendance[attKey(p.key, a.id)]).length,
    0,
  );

  function validateStep(id: StepId): string | null {
    if (id === "party" && state.people.some((p) => p.isNew && !p.name.trim())) return "Enter a name for each additional guest.";
    if (id === "details") {
      for (const q of visibleQuestions) {
        const v = state.answers[q.id];
        const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
        if (q.isRequired && empty && mode === "guest") return `Please answer “${q.questionText}”.`;
      }
    }
    if (id === "travel") {
      if (state.needsStay) {
        for (const st of state.stays) {
          if (!st.arrivalDate || !st.departureDate) return "Choose check-in and check-out dates.";
          if (st.departureDate <= st.arrivalDate) return "Check-out must be after check-in.";
          if (!st.personKeys.length) return "Choose who needs accommodation.";
        }
      }
      if (state.needsTransport) {
        for (const t of state.transport) {
          if (!t.travelDate || !t.location.trim()) return "Add a date and location for each transport request.";
          if (!t.personKeys.length) return "Choose who needs transport.";
        }
      }
    }
    return null;
  }

  function next() {
    const problem = validateStep(step.id);
    if (problem) {
      setError({ message: problem });
      return;
    }
    setError(null);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function back() {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function payload() {
    const keys = new Set(state.people.map((p) => p.key));
    return {
      expectedVersion: view.invitation.responseVersion,
      people: state.people.map((p) => ({
        key: p.key,
        name: p.isPlusOne ? p.name.trim() : undefined,
        dietary: p.dietary,
        dietaryNotes: p.dietaryNotes || null,
        accessibilityNeeds: p.accessibilityNeeds || null,
      })),
      attendance: Object.entries(state.attendance)
        .map(([k, status]) => {
          const [personKey, activityId] = k.split("|");
          return { personKey, activityId, status };
        })
        .filter((a) => keys.has(a.personKey) && askable.some((x) => x.id === a.activityId)),
      accommodation:
        f.accommodation && state.needsStay
          ? state.stays.map((st) => ({
              id: st.id,
              arrivalDate: st.arrivalDate,
              departureDate: st.departureDate,
              personKeys: st.personKeys.filter((k) => keys.has(k)),
              roomCount: st.roomCount,
              roomSharing: st.roomSharing || null,
              notes: st.notes || null,
            }))
          : [],
      transport:
        f.transport && state.needsTransport
          ? state.transport.map((t) => ({
              id: t.id,
              direction: t.direction,
              travelDate: t.travelDate,
              travelTime: t.travelTime || null,
              location: t.location,
              personKeys: t.personKeys.filter((k) => keys.has(k)),
              notes: t.notes || null,
            }))
          : [],
      mealOptOuts: state.mealOptOuts
        .map((k) => {
          const [personKey, mealId] = k.split("|");
          return { personKey, mealId };
        })
        .filter((m) => keys.has(m.personKey)),
      answers: visibleQuestions.map((q) => ({ questionId: q.id, value: state.answers[q.id] ?? null })),
      notes: state.notes || null,
    };
  }

  async function send(method: "PUT" | "DELETE", body: unknown) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ message: data?.error?.message ?? "Something went wrong. Please try again.", stale: res.status === 409 && data?.error?.details?.currentVersion !== undefined });
        return false;
      }
      return true;
    } catch {
      setError({ message: "You seem to be offline. Your answers are still here — try again in a moment." });
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    if (await send("PUT", payload())) {
      if (mode === "host" && doneHref) {
        router.push(doneHref);
        router.refresh();
      } else {
        router.replace("?saved=1", { scroll: true });
        router.refresh();
      }
    }
  }

  async function withdraw() {
    if (!window.confirm("Withdraw your response? Your answers will be cleared and the hosts will be told you're no longer responding.")) return;
    if (await send("DELETE", { expectedVersion: view.invitation.responseVersion })) {
      setNotice("Your response has been withdrawn.");
      router.refresh();
    }
  }

  // ---------------------------------------------------------------------------
  // Read-only summary (after responding, or when locked)
  // ---------------------------------------------------------------------------
  if (!editing) {
    return (
      <div className="space-y-4">
        {notice && (
          <div role="status" className="rounded-xl bg-success-soft px-4 py-3 text-success">
            {notice}
          </div>
        )}
        {locked && (
          <div role="status" className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
            {view.invitation.lockedReason === "deadline"
              ? "The RSVP deadline has passed, so responses can no longer be changed online. Please contact the hosts if your plans change."
              : "Responses can't be edited online for this event. Please contact the hosts if your plans change."}
          </div>
        )}
        {view.invitation.responseStatus === "withdrawn" && !notice && (
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">You withdrew your response. You can respond again any time before the deadline.</div>
        )}
        {(responded || view.invitation.responseStatus === "withdrawn") && (
          <Summary view={view} state={state} labels={labels} title={responded ? "Your response" : "Your previous answers"} />
        )}
        {!locked && (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => { setEditing(true); setStepIndex(0); setNotice(null); }}>
              {responded ? "Change my response" : "Respond now"}
            </Button>
            {responded && (
              <Button variant="ghost" onClick={withdraw} disabled={submitting}>
                Withdraw response
              </Button>
            )}
          </div>
        )}
        {error && <ErrorBanner error={error} />}
        {responded && view.invitation.lastRespondedAt && (
          <p className="text-xs text-muted">Last updated {formatDateTime(view.invitation.lastRespondedAt, tz)}.</p>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Guided flow
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-5">
      <ol className="flex gap-1 overflow-x-auto text-xs" aria-label="Progress">
        {steps.map((st, i) => (
          <li key={st.id} className="flex-1">
            <div className={cx("h-1.5 rounded-full", i <= stepIndex ? "bg-brand" : "bg-surface-2")} />
            <span className={cx("mt-1 block whitespace-nowrap", i === stepIndex ? "font-medium text-text" : "text-muted")} aria-current={i === stepIndex ? "step" : undefined}>
              {st.label}
            </span>
          </li>
        ))}
      </ol>

      {mode === "guest" && view.invitation.isLate && (
        <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          The RSVP deadline has passed. You can still update your response, and the hosts will be asked to review it.
        </div>
      )}

      {step.id === "party" && (
        <PartyStep view={view} state={state} update={update} />
      )}

      {step.id === "activities" && (
        <section aria-labelledby="act-h" className="space-y-4">
          <div>
            <h2 id="act-h" className="text-lg font-semibold">
              {availability ? "When can you make it?" : state.people.length > 1 ? "Who's coming to what?" : "Which events can you attend?"}
            </h2>
            <p className="text-sm text-muted">
              {state.people.length > 1 ? "Answer for each person — everyone can choose differently." : "Choose an answer for each."}
              {s.allowMaybe && !availability ? " Not sure yet? Pick maybe and update it later." : ""}
            </p>
          </div>
          {askable.length === 0 && <p className="text-sm text-muted">There&rsquo;s nothing to respond to yet.</p>}
          {askable.map((a) => (
            <ActivityCard
              key={a.id}
              activity={a}
              tz={tz}
              people={state.people}
              attendance={state.attendance}
              labels={labels}
              allowMaybe={s.allowMaybe}
              setStatus={setStatus}
              setAll={(status) => update((d) => ({ ...d, attendance: { ...d.attendance, ...Object.fromEntries(d.people.map((p) => [attKey(p.key, a.id), status])) } }))}
            />
          ))}
          {view.activities.some((a) => !a.attendanceRequested) && (
            <div className="rounded-xl border border-border bg-surface p-4 text-sm">
              <div className="font-medium">Also on the schedule</div>
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
          {unansweredCount > 0 && (
            <p className="text-sm text-info" role="status">
              {unansweredCount} answer{unansweredCount === 1 ? "" : "s"} still blank. Blank answers are shown to the hosts as &ldquo;no answer&rdquo;, not as a decline.
            </p>
          )}
        </section>
      )}

      {step.id === "details" && (
        <DetailsStep view={view} state={state} update={update} attendingKeys={attendingKeys} questions={visibleQuestions} attendingActivityIds={attendingActivityIds} />
      )}

      {step.id === "travel" && <TravelStep view={view} state={state} update={update} attendingKeys={attendingKeys} />}

      {step.id === "review" && (
        <section aria-labelledby="rev-h" className="space-y-4">
          <h2 id="rev-h" className="text-lg font-semibold">
            Check your answers
          </h2>
          <Summary view={view} state={state} labels={labels} onEdit={(id) => setStepIndex(steps.findIndex((x) => x.id === id))} steps={steps.map((x) => x.id)} />
          <Field label="Anything else the hosts should know?" htmlFor="notes">
            <Textarea id="notes" value={state.notes} maxLength={2000} onChange={(e) => update((d) => ({ ...d, notes: e.target.value }))} />
          </Field>
        </section>
      )}

      {error && <ErrorBanner error={error} />}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {stepIndex > 0 ? (
          <Button variant="secondary" onClick={back}>
            Back
          </Button>
        ) : responded || mode === "host" ? (
          <Button variant="ghost" onClick={() => (mode === "host" && doneHref ? router.push(doneHref) : setEditing(false))}>
            Cancel
          </Button>
        ) : (
          <span />
        )}
        {step.id === "review" ? (
          <Button onClick={submit} disabled={submitting} aria-busy={submitting} className="min-w-36">
            {submitting ? "Saving…" : responded ? "Save changes" : "Send response"}
          </Button>
        ) : (
          <Button onClick={next} className="min-w-28">
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ error }: { error: { message: string; stale?: boolean } }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
      <span>{error.message}</span>
      {error.stale && (
        <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
          Reload latest
        </Button>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------

function PartyStep({ view, state, update }: { view: RsvpView; state: FlowState; update: (fn: (d: FlowState) => FlowState) => void }) {
  const plusOnes = state.people.filter((p) => p.isPlusOne);
  const canAdd = plusOnes.length < view.invitation.plusOnesAllowed;
  return (
    <section aria-labelledby="party-h" className="space-y-4">
      <div>
        <h2 id="party-h" className="text-lg font-semibold">
          Who&rsquo;s in your party?
        </h2>
        <p className="text-sm text-muted">This invitation is for the people below. You&rsquo;ll answer for each of them.</p>
      </div>
      <Card>
        <ul className="divide-y divide-border">
          {state.people.map((p) => (
            <li key={p.key} className="flex items-center justify-between gap-3 px-4 py-3">
              {p.isPlusOne ? (
                <Input
                  aria-label="Guest name"
                  value={p.name}
                  placeholder="Their name"
                  maxLength={160}
                  onChange={(e) => update((d) => ({ ...d, people: d.people.map((x) => (x.key === p.key ? { ...x, name: e.target.value } : x)) }))}
                />
              ) : (
                <div>
                  <div className="font-medium">{p.name}</div>
                  {p.relationship && <div className="text-xs text-muted">{p.relationship}</div>}
                </div>
              )}
              {p.isPlusOne ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update((d) => ({
                      ...d,
                      people: d.people.filter((x) => x.key !== p.key),
                      attendance: Object.fromEntries(Object.entries(d.attendance).filter(([k]) => !k.startsWith(`${p.key}|`))),
                    }))
                  }
                >
                  Remove
                </Button>
              ) : (
                <Badge>Invited</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {view.invitation.plusOnesAllowed > 0 && (
        <div>
          <Button
            variant="secondary"
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
          >
            + Bring a guest
          </Button>
          <p className="mt-1 text-xs text-muted">
            You can bring up to {view.invitation.plusOnesAllowed} additional guest{view.invitation.plusOnesAllowed === 1 ? "" : "s"}.
          </p>
        </div>
      )}
    </section>
  );
}

function ActivityCard({
  activity: a,
  tz,
  people,
  attendance,
  labels,
  allowMaybe,
  setStatus,
  setAll,
}: {
  activity: RsvpView["activities"][number];
  tz: string;
  people: PersonState[];
  attendance: Record<string, Status>;
  labels: Record<Status, string>;
  allowMaybe: boolean;
  setStatus: (personKey: string, activityId: string, s: Status) => void;
  setAll: (s: Status) => void;
}) {
  const options: Status[] = allowMaybe ? ["attending", "maybe", "not_attending"] : ["attending", "not_attending"];
  const together = !a.allowDecline || people.length === 1;
  const current = people.map((p) => attendance[attKey(p.key, a.id)]);
  const shared = current.every((c) => c === current[0]) ? current[0] : undefined;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{a.name}</h3>
          <p className="text-sm text-muted">
            {formatDateTime(a.startAt, tz)}
            {a.endAt ? ` – ${formatTime(a.endAt, tz)}` : ""}
            {a.venueName ? ` · ${a.venueName}` : ""}
          </p>
          {a.description && <p className="mt-1 text-sm">{a.description}</p>}
        </div>
        {a.isFull && <Badge tone="warning">Full</Badge>}
      </div>
      {together ? (
        <div className="mt-3">
          {people.length > 1 && <p className="mb-2 text-xs text-muted">One answer for everyone in your party.</p>}
          <StatusPicker
            name={`${a.id}-all`}
            label={people.length > 1 ? `${a.name} – everyone` : a.name}
            value={shared}
            options={options}
            labels={labels}
            disabledAttending={a.isFull && shared !== "attending"}
            onChange={setAll}
          />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Everyone:</span>
            {options.map((o) => (
              <button
                key={o}
                type="button"
                aria-label={`${labels[o]}: everyone, ${a.name}`}
                className="rounded-full border border-border px-2.5 py-1 hover:border-brand"
                onClick={() => setAll(o)}
                disabled={o === "attending" && a.isFull}
              >
                {labels[o]}
              </button>
            ))}
          </div>
          {people.map((p) => (
            <div key={p.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-medium">{p.name || "Additional guest"}</span>
              <StatusPicker
                name={`${a.id}-${p.key}`}
                label={`${a.name} – ${p.name || "Additional guest"}`}
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
    </Card>
  );
}

function StatusPicker({
  name,
  label,
  value,
  options,
  labels,
  onChange,
  disabledAttending,
}: {
  name: string;
  label: string;
  value: Status | undefined;
  options: Status[];
  labels: Record<Status, string>;
  onChange: (s: Status) => void;
  disabledAttending?: boolean;
}) {
  const tone: Record<Status, string> = {
    attending: "peer-checked:bg-success peer-checked:text-white peer-checked:border-success",
    maybe: "peer-checked:bg-warning peer-checked:text-white peer-checked:border-warning",
    not_attending: "peer-checked:bg-text peer-checked:text-bg peer-checked:border-text",
  };
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1.5 sm:flex">
      {options.map((o) => (
        <label key={o} className="relative">
          <input
            type="radio"
            name={name}
            value={o}
            checked={value === o}
            disabled={o === "attending" && disabledAttending}
            onChange={() => onChange(o)}
            className="peer sr-only"
          />
          <span
            className={cx(
              "flex h-11 cursor-pointer items-center justify-center rounded-lg border border-border-strong bg-surface px-2 text-center text-sm font-medium leading-tight transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-40 sm:min-w-28",
              tone[o],
            )}
          >
            {labels[o]}
          </span>
        </label>
      ))}
    </div>
  );
}

function DetailsStep({
  view,
  state,
  update,
  attendingKeys,
  questions,
  attendingActivityIds,
}: {
  view: RsvpView;
  state: FlowState;
  update: (fn: (d: FlowState) => FlowState) => void;
  attendingKeys: Set<string>;
  questions: RsvpView["questions"];
  attendingActivityIds: Set<string>;
}) {
  const f = view.event.settings.features;
  const tz = view.event.timezone;
  const attending = state.people.filter((p) => attendingKeys.has(p.key));
  const setPerson = (key: string, patch: Partial<PersonState>) =>
    update((d) => ({ ...d, people: d.people.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));

  // Meals each person is expected at, from their answers.
  const staysNightBefore = (personKey: string, date: string) =>
    state.needsStay && state.stays.some((s) => s.personKeys.includes(personKey) && s.arrivalDate <= addDays(date, -1) && addDays(date, -1) < s.departureDate);
  const mealsFor = (personKey: string) =>
    view.meals.filter((m) =>
      m.basis === "activity"
        ? m.activityIds.some((id) => state.attendance[attKey(personKey, id)] === "attending")
        : m.basis === "overnight" && staysNightBefore(personKey, m.serviceDate),
    );

  return (
    <section aria-labelledby="det-h" className="space-y-4">
      <div>
        <h2 id="det-h" className="text-lg font-semibold">
          A few details
        </h2>
        <p className="text-sm text-muted">Optional unless marked. Only the hosts see this.</p>
      </div>
      {(f.dietary || f.accessibility || view.meals.length > 0) &&
        attending.map((p) => {
          const meals = mealsFor(p.key);
          return (
            <Card key={p.key} className="space-y-4 p-4 sm:p-5">
              <h3 className="font-semibold">{p.name || "Additional guest"}</h3>
              {f.dietary && (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Dietary needs</legend>
                  <div className="flex flex-wrap gap-2">
                    {view.event.settings.dietaryOptions.map((opt) => {
                      const on = p.dietary.includes(opt);
                      return (
                        <label key={opt} className={cx("cursor-pointer rounded-full border px-3 py-1.5 text-sm", on ? "border-brand bg-brand-soft text-brand" : "border-border-strong")}>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={on}
                            onChange={() => setPerson(p.key, { dietary: on ? p.dietary.filter((x) => x !== opt) : [...p.dietary, opt] })}
                          />
                          {dietaryLabel(opt)}
                        </label>
                      );
                    })}
                  </div>
                  <Input
                    className="mt-2"
                    aria-label={`Other food requirements for ${p.name}`}
                    placeholder="Allergies or other food notes"
                    maxLength={500}
                    value={p.dietaryNotes}
                    onChange={(e) => setPerson(p.key, { dietaryNotes: e.target.value })}
                  />
                </fieldset>
              )}
              {f.accessibility && (
                <Field label="Accessibility needs" htmlFor={`acc-${p.key}`}>
                  <Input id={`acc-${p.key}`} maxLength={500} placeholder="e.g. wheelchair access, step-free room" value={p.accessibilityNeeds} onChange={(e) => setPerson(p.key, { accessibilityNeeds: e.target.value })} />
                </Field>
              )}
              {meals.length > 0 && (
                <div>
                  <div className="mb-1 text-sm font-medium">Meals we&rsquo;ll plan for</div>
                  <ul className="space-y-1.5 text-sm">
                    {meals.map((m) => {
                      const k = attKey(p.key, m.id);
                      const out = state.mealOptOuts.includes(k);
                      return (
                        <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className={cx(out && "text-muted line-through")}>
                            {m.name} · {formatDate(m.serviceDate, { year: undefined })}
                            {m.serviceTime ? `, ${formatTime(`${m.serviceDate}T${m.serviceTime}:00Z`, "UTC")}` : ""}
                          </span>
                          {m.guestCanOptOut && (
                            <Checkbox
                              label="Skip this meal"
                              checked={out}
                              onChange={() => update((d) => ({ ...d, mealOptOuts: out ? d.mealOptOuts.filter((x) => x !== k) : [...d.mealOptOuts, k] }))}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      {questions.length > 0 && (
        <Card className="space-y-4 p-4 sm:p-5">
          {questions.map((q) => (
            <QuestionField key={q.id} q={q} value={state.answers[q.id]} onChange={(v) => update((d) => ({ ...d, answers: { ...d.answers, [q.id]: v } }))} />
          ))}
        </Card>
      )}
      {attendingActivityIds.size === 0 && attending.length > 0 && (
        <p className="text-sm text-muted">You&rsquo;ve only marked maybe so far — we&rsquo;ll keep these details for when you decide.</p>
      )}
      <p className="text-xs text-muted">Times shown in {tz}.</p>
    </section>
  );
}

function QuestionField({ q, value, onChange }: { q: RsvpView["questions"][number]; value: unknown; onChange: (v: unknown) => void }) {
  const id = useId();
  const label = (
    <>
      {q.questionText}
      {q.isRequired && <span className="text-danger"> *</span>}
    </>
  );
  switch (q.questionType) {
    case "long_text":
      return (
        <Field label={label} htmlFor={id}>
          <Textarea id={id} maxLength={3000} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "number":
      return (
        <Field label={label} htmlFor={id}>
          <Input id={id} type="number" value={(value as number | string) ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
        </Field>
      );
    case "boolean":
      return (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">{label}</legend>
          <div className="flex gap-4 text-sm">
            {[
              [true, "Yes"],
              [false, "No"],
            ].map(([v, l]) => (
              <label key={String(v)} className="flex items-center gap-2">
                <input type="radio" name={id} checked={value === v} onChange={() => onChange(v)} className="accent-[var(--brand)]" />
                {l as string}
              </label>
            ))}
          </div>
        </fieldset>
      );
    case "single_choice":
      return (
        <Field label={label} htmlFor={id}>
          <Select id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">Choose…</option>
            {q.options?.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </Field>
      );
    case "multi_choice": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">{label}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {q.options?.map((o) => (
              <Checkbox key={o} label={o} checked={arr.includes(o)} onChange={() => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])} />
            ))}
          </div>
        </fieldset>
      );
    }
    default:
      return (
        <Field label={label} htmlFor={id}>
          <Input id={id} maxLength={300} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
  }
}

function PeoplePicker({ people, selected, onChange, legend }: { people: PersonState[]; selected: string[]; onChange: (keys: string[]) => void; legend: string }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {people.map((p) => (
          <Checkbox
            key={p.key}
            label={p.name || "Additional guest"}
            checked={selected.includes(p.key)}
            onChange={() => onChange(selected.includes(p.key) ? selected.filter((k) => k !== p.key) : [...selected, p.key])}
          />
        ))}
      </div>
    </fieldset>
  );
}

function YesNo({ question, value, onChange, name }: { question: string; value: boolean; onChange: (v: boolean) => void; name: string }) {
  return (
    <fieldset>
      <legend className="mb-2 font-medium">{question}</legend>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        {[
          [true, "Yes"],
          [false, "No"],
        ].map(([v, l]) => (
          <label key={String(v)}>
            <input type="radio" name={name} className="peer sr-only" checked={value === v} onChange={() => onChange(v as boolean)} />
            <span className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-border-strong px-6 text-sm font-medium peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              {l as string}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TravelStep({
  view,
  state,
  update,
  attendingKeys,
}: {
  view: RsvpView;
  state: FlowState;
  update: (fn: (d: FlowState) => FlowState) => void;
  attendingKeys: Set<string>;
}) {
  const f = view.event.settings.features;
  const { startDate, endDate } = view.event;
  const minDate = addDays(startDate, -7);
  const maxDate = addDays(endDate, 7);
  const attending = state.people.filter((p) => attendingKeys.has(p.key));
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
  const tz = view.event.timezone;
  const firstLocal = view.activities[0] ? utcToZoned(view.activities[0].startAt, tz).date : startDate;

  return (
    <section aria-labelledby="travel-h" className="space-y-5">
      <h2 id="travel-h" className="text-lg font-semibold">
        Stay &amp; travel
      </h2>
      {f.accommodation && (
        <Card className="space-y-4 p-4 sm:p-5">
          <YesNo
            name="needsStay"
            question="Will anyone need a place to stay?"
            value={state.needsStay}
            onChange={(v) => update((d) => ({ ...d, needsStay: v, stays: v && d.stays.length === 0 ? [defaultStay()] : d.stays }))}
          />
          {state.needsStay && (
            <>
              <p className="text-xs text-muted">
                This is a request — the hosts will confirm rooms separately. Check-out is the morning you leave (e.g. check in {formatDate(firstLocal, { year: undefined })}, check
                out {formatDate(addDays(firstLocal, 2), { year: undefined })} = 2 nights).
              </p>
              {state.stays.map((st, i) => (
                <div key={st.id ?? i} className="space-y-3 rounded-lg border border-border p-3">
                  {st.confirmed && <Badge tone="success">Room confirmed by the hosts — changes will be sent for review</Badge>}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Check-in" htmlFor={`in-${i}`}>
                      <Input id={`in-${i}`} type="date" min={minDate} max={maxDate} value={st.arrivalDate} onChange={(e) => setStay(i, { arrivalDate: e.target.value })} />
                    </Field>
                    <Field label="Check-out" htmlFor={`out-${i}`}>
                      <Input id={`out-${i}`} type="date" min={st.arrivalDate || minDate} max={maxDate} value={st.departureDate} onChange={(e) => setStay(i, { departureDate: e.target.value })} />
                    </Field>
                    <Field label="Rooms needed" htmlFor={`rooms-${i}`}>
                      <select
                        id={`rooms-${i}`}
                        className={inputClass}
                        value={st.roomCount ?? ""}
                        onChange={(e) => setStay(i, { roomCount: e.target.value ? Number(e.target.value) : null })}
                      >
                        <option value="">Not sure</option>
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <PeoplePicker legend="Who's staying?" people={state.people} selected={st.personKeys} onChange={(keys) => setStay(i, { personKeys: keys })} />
                  <Field label="Room sharing or other requests" htmlFor={`share-${i}`}>
                    <Input id={`share-${i}`} maxLength={300} placeholder="e.g. parents in one room, ground floor please" value={st.roomSharing} onChange={(e) => setStay(i, { roomSharing: e.target.value })} />
                  </Field>
                  {state.stays.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => update((d) => ({ ...d, stays: d.stays.filter((_, j) => j !== i) }))}>
                      Remove this stay
                    </Button>
                  )}
                </div>
              ))}
              {state.stays.length < 10 && (
                <Button variant="secondary" size="sm" onClick={() => update((d) => ({ ...d, stays: [...d.stays, defaultStay()] }))}>
                  + Add a stay with different dates
                </Button>
              )}
            </>
          )}
        </Card>
      )}
      {f.transport && (
        <Card className="space-y-4 p-4 sm:p-5">
          <YesNo
            name="needsTransport"
            question="Do you need a pickup or drop-off?"
            value={state.needsTransport}
            onChange={(v) => update((d) => ({ ...d, needsTransport: v, transport: v && d.transport.length === 0 ? [defaultTransport()] : d.transport }))}
          />
          {state.needsTransport &&
            state.transport.map((t, i) => (
              <div key={t.id ?? i} className="space-y-3 rounded-lg border border-border p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Trip" htmlFor={`dir-${i}`}>
                    <Select id={`dir-${i}`} value={t.direction} onChange={(e) => setTr(i, { direction: e.target.value as TransportState["direction"] })}>
                      <option value="arrival">Pickup on arrival</option>
                      <option value="departure">Drop-off when leaving</option>
                      <option value="local">Local, between venues</option>
                    </Select>
                  </Field>
                  <Field label="Date" htmlFor={`td-${i}`}>
                    <Input id={`td-${i}`} type="date" min={minDate} max={maxDate} value={t.travelDate} onChange={(e) => setTr(i, { travelDate: e.target.value })} />
                  </Field>
                  <Field label="Time (approx.)" htmlFor={`tt-${i}`}>
                    <Input id={`tt-${i}`} type="time" value={t.travelTime} onChange={(e) => setTr(i, { travelTime: e.target.value })} />
                  </Field>
                </div>
                <Field label={t.direction === "departure" ? "Drop-off point" : "Pickup point"} htmlFor={`loc-${i}`} hint="Airport, station or address. Add flight/train numbers in notes.">
                  <Input id={`loc-${i}`} maxLength={300} value={t.location} onChange={(e) => setTr(i, { location: e.target.value })} />
                </Field>
                <PeoplePicker legend="Who's travelling?" people={state.people} selected={t.personKeys} onChange={(keys) => setTr(i, { personKeys: keys })} />
                <Field label="Notes" htmlFor={`tn-${i}`}>
                  <Input id={`tn-${i}`} maxLength={1000} placeholder="Flight AI 864, lands 14:20" value={t.notes} onChange={(e) => setTr(i, { notes: e.target.value })} />
                </Field>
                {state.transport.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => update((d) => ({ ...d, transport: d.transport.filter((_, j) => j !== i) }))}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
          {state.needsTransport && state.transport.length < 10 && (
            <Button variant="secondary" size="sm" onClick={() => update((d) => ({ ...d, transport: [...d.transport, { ...defaultTransport(), direction: "departure", travelDate: endDate }] }))}>
              + Add another trip
            </Button>
          )}
        </Card>
      )}
    </section>
  );
}

function Summary({
  view,
  state,
  labels,
  title,
  onEdit,
  steps,
}: {
  view: RsvpView;
  state: FlowState;
  labels: Record<Status, string>;
  title?: string;
  onEdit?: (id: StepId) => void;
  steps?: StepId[];
}) {
  const tz = view.event.timezone;
  const f = view.event.settings.features;
  const askable = view.activities.filter((a) => a.attendanceRequested);
  const name = (k: string) => state.people.find((p) => p.key === k)?.name || "Additional guest";
  const sectionProps = { onEdit, steps };
  const tone: Record<string, string> = { attending: "text-success", maybe: "text-warning", not_attending: "text-muted" };

  return (
    <Card className="divide-y divide-border">
      {title && <h2 className="px-4 py-3 text-lg font-semibold sm:px-5">{title}</h2>}
      <Section {...sectionProps} heading={view.event.settings.availabilityMode ? "Availability" : "Events"} id="activities">
        <ul className="space-y-2 text-sm">
          {askable.map((a) => (
            <li key={a.id}>
              <div className="font-medium">
                {a.name} <span className="font-normal text-muted">· {formatDateTime(a.startAt, tz)}</span>
              </div>
              <div className="flex flex-wrap gap-x-4">
                {state.people.map((p) => {
                  const st = state.attendance[attKey(p.key, a.id)];
                  return (
                    <span key={p.key} className={st ? tone[st] : "text-info"}>
                      {state.people.length > 1 ? `${p.name || "Guest"}: ` : ""}
                      {st ? labels[st] : "No answer"}
                    </span>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </Section>
      {f.dietary && state.people.some((p) => p.dietary.length || p.dietaryNotes) && (
        <Section {...sectionProps} heading="Dietary" id="details">
          <ul className="text-sm">
            {state.people
              .filter((p) => p.dietary.length || p.dietaryNotes)
              .map((p) => (
                <li key={p.key}>
                  {p.name}: {[...p.dietary.map(dietaryLabel), p.dietaryNotes].filter(Boolean).join(", ")}
                </li>
              ))}
          </ul>
        </Section>
      )}
      {f.accommodation && (
        <Section {...sectionProps} heading="Accommodation" id="travel">
          {state.needsStay && state.stays.length ? (
            <ul className="text-sm">
              {state.stays.map((s, i) => (
                <li key={i}>
                  {formatDate(s.arrivalDate, { year: undefined })} → {formatDate(s.departureDate, { year: undefined })} ·{" "}
                  {s.personKeys.map(name).join(", ")}
                  {s.roomCount ? ` · ${s.roomCount} room${s.roomCount > 1 ? "s" : ""}` : ""}
                  {s.confirmed && <Badge tone="success" className="ml-2">Confirmed</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Not needed</p>
          )}
        </Section>
      )}
      {f.transport && (
        <Section {...sectionProps} heading="Transport" id="travel">
          {state.needsTransport && state.transport.length ? (
            <ul className="text-sm">
              {state.transport.map((t, i) => (
                <li key={i}>
                  {t.direction === "arrival" ? "Pickup" : t.direction === "departure" ? "Drop-off" : "Local"} · {formatDate(t.travelDate, { year: undefined })}
                  {t.travelTime ? ` ${t.travelTime}` : ""} · {t.location} · {t.personKeys.map(name).join(", ")}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Not needed</p>
          )}
        </Section>
      )}
      {view.questions.length > 0 && Object.keys(state.answers).length > 0 && (
        <Section {...sectionProps} heading="Your answers" id="details">
          <dl className="space-y-1 text-sm">
            {view.questions
              .filter((q) => state.answers[q.id] !== undefined && state.answers[q.id] !== null && state.answers[q.id] !== "")
              .map((q) => {
                const v = state.answers[q.id];
                return (
                  <div key={q.id}>
                    <dt className="text-muted">{q.questionText}</dt>
                    <dd>{Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</dd>
                  </div>
                );
              })}
          </dl>
        </Section>
      )}
      {state.notes && !onEdit && (
        <div className="px-4 py-3 text-sm sm:px-5">
          <h3 className="mb-1 font-semibold">Note to the hosts</h3>
          <p className="whitespace-pre-line">{state.notes}</p>
        </div>
      )}
    </Card>
  );
}

function Section({
  heading,
  id,
  children,
  onEdit,
  steps,
}: {
  heading: string;
  id: StepId;
  children: ReactNode;
  onEdit?: (id: StepId) => void;
  steps?: StepId[];
}) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{heading}</h3>
        {onEdit && steps?.includes(id) && (
          <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => onEdit(id)}>
            Edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
