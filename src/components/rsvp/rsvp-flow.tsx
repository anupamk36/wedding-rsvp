"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { ATTENDANCE_LABELS } from "@/domain/settings";
import { formatDate, utcToZoned } from "@/lib/dates";
import { Button, cx, Field, Textarea } from "../ui";
import { ActionBar, ArrowRight, bigButton, Notice, StepHeader } from "./controls";
import { Confirmed } from "./confirmed";
import { DetailsStep } from "./details-step";
import { EventsStep } from "./events-step";
import { blankActivities, isComplete, listNames } from "./logic";
import { Summary, type SectionId } from "./summary";
import { TravelStep } from "./travel-step";
import { attKey, type FlowState, type RsvpView, type Status } from "./types";

type StepId = "activities" | "details" | "travel" | "review";

interface Props {
  view: RsvpView;
  endpoint: string;
  mode: "guest" | "host";
  /** Where the host returns after saving. */
  doneHref?: string;
  justSaved?: boolean;
  /** The invitation cover and schedule, shown before replying (guest mode). */
  invitation?: ReactNode;
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

export function RsvpFlow({ view, endpoint, mode, doneHref, justSaved, invitation }: Props) {
  const router = useRouter();
  const [state, setState] = useState<FlowState>(() => initialState(view));
  const responded = view.invitation.responseStatus === "submitted" || view.invitation.responseStatus === "updated";
  const locked = mode === "guest" && view.invitation.lockedReason !== null;
  // Guests always land on the invitation first; hosts go straight to editing.
  const [editing, setEditing] = useState(mode === "host");
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; stale?: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const s = view.event.settings;
  const f = s.features;
  const availability = s.availabilityMode;
  const labels = ATTENDANCE_LABELS[availability ? "availability" : "standard"];
  const askable = view.activities.filter((a) => a.attendanceRequested);
  const tz = view.event.timezone;
  const n = state.people.length;

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

  // The party is shown as chips on the first step, so there is no separate party step.
  const steps: { id: StepId; label: string }[] = [
    { id: "activities", label: availability ? "Availability" : "Events" },
    ...(hasDetails ? [{ id: "details" as const, label: f.dietary || view.meals.length > 0 ? "Food" : "Details" }] : []),
    ...(hasTravel ? [{ id: "travel" as const, label: f.accommodation && f.transport ? "Stay & travel" : f.accommodation ? "Stay" : "Travel" }] : []),
    { id: "review", label: "Review" },
  ];
  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index];

  const update = (fn: (draft: FlowState) => FlowState) => setState((prev) => fn(prev));
  const answeredCount = askable.filter((a) => isComplete(a.id, state.people, state.attendance)).length;
  const blanks = blankActivities(view, state.people, state.attendance);
  const deadline = view.event.rsvpDeadline ? formatDate(utcToZoned(view.event.rsvpDeadline, tz).date, { weekday: undefined, day: "numeric", month: "long", year: undefined }) : null;

  function validateStep(id: StepId): string | null {
    if (id === "activities" && state.people.some((p) => p.isNew && !p.name.trim())) return "Enter a name for each additional guest.";
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

  function goTo(i: number) {
    setError(null);
    setStepIndex(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function next() {
    const problem = validateStep(step.id);
    if (problem) {
      setError({ message: problem });
      return;
    }
    goTo(Math.min(index + 1, steps.length - 1));
  }
  function back() {
    if (index > 0) return goTo(index - 1);
    setError(null);
    if (mode === "host" && doneHref) router.push(doneHref);
    else setEditing(false);
  }
  function editSection(id: SectionId) {
    const i = steps.findIndex((x) => x.id === id);
    if (i >= 0) goTo(i);
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

  function startEditing() {
    setEditing(true);
    setStepIndex(0);
    setNotice(null);
    window.scrollTo({ top: 0 });
  }

  // ---------------------------------------------------------------------------
  // Not editing: confirmation, or the invitation with a reply button
  // ---------------------------------------------------------------------------
  if (!editing) {
    if (responded && !locked) {
      return (
        <div className="flex flex-col gap-4">
          <Confirmed
            view={view}
            state={state}
            labels={labels}
            justSaved={!!justSaved}
            canEdit
            onChange={startEditing}
            onWithdraw={withdraw}
            submitting={submitting}
          />
          {error && (
            <div className="px-5 sm:px-0">
              <ErrorBanner error={error} />
            </div>
          )}
        </div>
      );
    }

    const ctaLabel = view.invitation.responseStatus === "withdrawn" ? "Respond again" : availability ? "Mark your availability" : n > 1 ? `Reply for all ${n} of you` : "Reply now";
    return (
      <div className="flex flex-col">
        {invitation}
        <div className="flex flex-col gap-4 px-5 pt-5 sm:px-0">
          {notice && <Notice tone="success">{notice}</Notice>}
          {locked && (
            <Notice tone="warning">
              {view.invitation.lockedReason === "deadline"
                ? "The RSVP deadline has passed, so responses can no longer be changed online. Please contact the hosts if your plans change."
                : "Responses can't be edited online for this event. Please contact the hosts if your plans change."}
            </Notice>
          )}
          {view.invitation.responseStatus === "withdrawn" && !notice && (
            <Notice tone="info">You withdrew your response. You can respond again any time before the deadline.</Notice>
          )}
          {(responded || view.invitation.responseStatus === "withdrawn") && (
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-xl font-semibold">{responded ? "Your response" : "Your previous answers"}</h2>
              <Summary view={view} state={state} labels={labels} />
            </div>
          )}
          {error && <ErrorBanner error={error} />}
        </div>
        {!locked && (
          <ActionBar className="mt-6 sm:mt-6 sm:rounded-[20px] sm:border">
            <div className="flex flex-col gap-2.5">
              <button type="button" onClick={startEditing} className={cx(bigButton, "h-[54px] w-full bg-brand text-brand-contrast hover:bg-brand-hover")}>
                {ctaLabel}
                <ArrowRight />
              </button>
              <p className="text-center text-[13px] text-muted">About 2 minutes · No account needed · This link is just for you</p>
            </div>
          </ActionBar>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Guided flow
  // ---------------------------------------------------------------------------
  const nextLabel = steps[index + 1]?.id === "review" && step.id !== "activities" ? "Review" : "Continue";
  return (
    <div className="flex min-h-dvh flex-col bg-bg sm:min-h-0 sm:rounded-[20px] sm:border sm:border-border">
      <StepHeader steps={steps} index={index} onBack={back} backLabel={index === 0 ? (mode === "host" ? "Back to the response" : "Back to the invitation") : `Back to ${steps[index - 1].label.toLowerCase()}`} />

      <div className="flex flex-1 flex-col gap-5 px-5 pt-6 pb-7">
        {mode === "guest" && view.invitation.isLate && (
          <Notice tone="warning">The RSVP deadline has passed. You can still update your response, and the hosts will be asked to review it.</Notice>
        )}

        {step.id === "activities" && <EventsStep view={view} state={state} update={update} labels={labels} />}

        {step.id === "details" && (
          <DetailsStep view={view} state={state} update={update} attendingKeys={attendingKeys} questions={visibleQuestions} attendingActivityIds={attendingActivityIds} />
        )}

        {step.id === "travel" && <TravelStep view={view} state={state} update={update} attendingKeys={attendingKeys} />}

        {step.id === "review" && (
          <section aria-labelledby="review-h" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h1 id="review-h" className="font-display text-[28px] leading-tight font-semibold">
                Check your answers
              </h1>
              <p className="text-[15px] leading-relaxed text-muted">
                {view.invitation.label} · {n} {n === 1 ? "person" : "people"}.
                {s.allowGuestEdits && mode === "guest" ? ` You can change this any time${deadline ? ` before ${deadline}` : ""}.` : ""}
              </p>
            </div>
            {blanks.length > 0 && (
              <Notice
                tone="info"
                action={
                  <button
                    type="button"
                    onClick={() => editSection("activities")}
                    className="flex min-h-11 shrink-0 items-center px-1.5 text-[14px] font-semibold whitespace-nowrap text-info-ink underline-offset-4 hover:underline"
                  >
                    Answer now
                  </button>
                }
              >
                {blanks.length > 3 ? `${blanks.length} events are` : `${listNames(blanks.map((a) => a.name))} ${blanks.length === 1 ? "is" : "are"}`} still blank. The hosts will see{" "}
                <strong>no answer</strong>, not a decline.
              </Notice>
            )}
            <Summary view={view} state={state} labels={labels} onEdit={editSection} sections={steps.map((x) => x.id).filter((x): x is SectionId => x !== "review")} />
            <Field label={<span className="text-[15px] font-bold">Anything else the hosts should know?</span>} htmlFor="notes">
              <Textarea id="notes" placeholder="Optional" value={state.notes} maxLength={2000} onChange={(e) => update((d) => ({ ...d, notes: e.target.value }))} />
            </Field>
          </section>
        )}

        {error && <ErrorBanner error={error} />}
      </div>

      <ActionBar>
        {step.id === "review" ? (
          <div className="flex flex-col gap-2.5">
            <button type="button" onClick={submit} disabled={submitting} aria-busy={submitting} className={cx(bigButton, "h-[54px] w-full bg-brand text-brand-contrast hover:bg-brand-hover")}>
              {submitting ? "Saving…" : responded || mode === "host" ? "Save changes" : "Send response"}
            </button>
            <p className="text-center text-[13px] text-muted">
              {mode === "host" ? "Saved as a host edit and recorded in the history." : n > 1 ? `The hosts get one clear reply for all ${n} of you.` : "The hosts see your reply straight away."}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3.5">
            {step.id === "activities" ? (
              <div className="flex flex-col gap-0.5" aria-live="polite">
                <span className="text-[15px] font-bold">
                  {answeredCount} of {askable.length} {availability ? (askable.length === 1 ? "option" : "options") : askable.length === 1 ? "event" : "events"}
                </span>
                <span className="text-[13px] text-muted">answered</span>
              </div>
            ) : (
              <button type="button" onClick={back} className={cx(bigButton, "border-[1.5px] border-border-strong bg-surface text-text hover:bg-surface-2")}>
                Back
              </button>
            )}
            <button type="button" onClick={next} className={cx(bigButton, "min-w-[150px] bg-brand text-brand-contrast hover:bg-brand-hover")}>
              {nextLabel}
              <ArrowRight />
            </button>
          </div>
        )}
      </ActionBar>
    </div>
  );
}

function ErrorBanner({ error }: { error: { message: string; stale?: boolean } }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
      <span>{error.message}</span>
      {error.stale && (
        <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
          Reload latest
        </Button>
      )}
    </div>
  );
}
