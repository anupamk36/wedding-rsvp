"use client";

import { useId, useState } from "react";
import { dietaryLabel } from "@/domain/settings";
import { addDays, formatDate, formatTime } from "@/lib/dates";
import { Checkbox, Chip, cx, Field, Input, Select, Textarea } from "../ui";
import { Avatar } from "./controls";
import { personName } from "./logic";
import { attKey, type FlowState, type PersonState, type RsvpView } from "./types";

type Update = (fn: (d: FlowState) => FlowState) => void;

export function DetailsStep({
  view,
  state,
  update,
  attendingKeys,
  questions,
  attendingActivityIds,
}: {
  view: RsvpView;
  state: FlowState;
  update: Update;
  attendingKeys: Set<string>;
  questions: RsvpView["questions"];
  attendingActivityIds: Set<string>;
}) {
  const f = view.event.settings.features;
  const attending = state.people.filter((p) => attendingKeys.has(p.key));
  const setPerson = (key: string, patch: Partial<PersonState>) =>
    update((d) => ({ ...d, people: d.people.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set(state.people.filter((p) => p.dietaryNotes || p.accessibilityNeeds).map((p) => p.key)));

  const staysNightBefore = (personKey: string, date: string) =>
    state.needsStay && state.stays.some((s) => s.personKeys.includes(personKey) && s.arrivalDate <= addDays(date, -1) && addDays(date, -1) < s.departureDate);
  const mealsFor = (personKey: string) =>
    view.meals.filter((m) =>
      m.basis === "activity"
        ? m.activityIds.some((id) => state.attendance[attKey(personKey, id)] === "attending")
        : m.basis === "overnight" && staysNightBefore(personKey, m.serviceDate),
    );

  const foodFirst = f.dietary || view.meals.length > 0;
  return (
    <section aria-labelledby="details-h" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 id="details-h" className="font-display text-[28px] leading-tight font-semibold">
          {foodFirst ? (f.accessibility ? "Food and access" : "Food") : "A few details"}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted">
          {foodFirst ? "So the caterers and venue plan for everyone. Skip anyone with no needs." : "Optional unless marked. Only the hosts see this."}
        </p>
      </div>

      {(f.dietary || f.accessibility || view.meals.length > 0) &&
        attending.map((p) => {
          // Meal counts are derived automatically; only meals a guest may skip need a control here.
          const meals = mealsFor(p.key).filter((m) => m.guestCanOptOut);
          const notesOpen = openNotes.has(p.key);
          const hasNoteFields = f.dietary || f.accessibility;
          return (
            <section key={p.key} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center gap-2.5">
                <Avatar name={personName(p)} />
                <h2 className="text-base font-bold">{personName(p)}</h2>
              </div>
              {f.dietary && (
                <div role="group" aria-label={`Dietary needs for ${personName(p)}`} className="flex flex-wrap gap-2">
                  {view.event.settings.dietaryOptions.map((opt) => {
                    const on = p.dietary.includes(opt);
                    return (
                      <Chip key={opt} on={on} onClick={() => setPerson(p.key, { dietary: on ? p.dietary.filter((x) => x !== opt) : [...p.dietary, opt] })}>
                        {dietaryLabel(opt)}
                      </Chip>
                    );
                  })}
                </div>
              )}
              {hasNoteFields && notesOpen && (
                <div className="flex flex-col gap-3">
                  {f.dietary && (
                    <Field label="Allergies or other food notes" htmlFor={`food-${p.key}`}>
                      <Input id={`food-${p.key}`} maxLength={500} value={p.dietaryNotes} onChange={(e) => setPerson(p.key, { dietaryNotes: e.target.value })} />
                    </Field>
                  )}
                  {f.accessibility && (
                    <Field label="Access needs" htmlFor={`acc-${p.key}`}>
                      <Input
                        id={`acc-${p.key}`}
                        maxLength={500}
                        placeholder="e.g. step-free access, ground-floor room"
                        value={p.accessibilityNeeds}
                        onChange={(e) => setPerson(p.key, { accessibilityNeeds: e.target.value })}
                      />
                    </Field>
                  )}
                </div>
              )}
              {hasNoteFields && !notesOpen && (
                <button
                  type="button"
                  onClick={() => setOpenNotes((s) => new Set(s).add(p.key))}
                  className="-mx-1 flex h-11 items-center self-start px-1 text-[14px] font-semibold text-brand hover:underline underline-offset-4"
                >
                  + Add {f.dietary && f.accessibility ? "an allergy or access" : f.dietary ? "an allergy or food" : "an access"} note
                </button>
              )}
              {meals.length > 0 && (
                <div className="border-t border-border pt-3">
                  <div className="mb-1 text-[13.5px] font-semibold">Meals you can skip</div>
                  <ul className="flex flex-col">
                    {meals.map((m) => {
                      const k = attKey(p.key, m.id);
                      const out = state.mealOptOuts.includes(k);
                      return (
                        <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-3 text-[14px]">
                          <span className={cx("py-2", out && "text-muted line-through")}>
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
            </section>
          );
        })}

      {questions.map((q) => (
        <section key={q.id} className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-4">
          <QuestionField q={q} value={state.answers[q.id]} onChange={(v) => update((d) => ({ ...d, answers: { ...d.answers, [q.id]: v } }))} />
        </section>
      ))}

      {attendingActivityIds.size === 0 && attending.length > 0 && (
        <p className="text-[14px] text-muted">You&rsquo;ve only answered maybe so far. We&rsquo;ll keep these details for when you decide.</p>
      )}
    </section>
  );
}

function QuestionLabel({ q, id }: { q: RsvpView["questions"][number]; id?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2.5">
      <label htmlFor={id} className="text-base font-bold">
        {q.questionText}
        {q.isRequired && <span className="text-danger"> *</span>}
      </label>
      {!q.isRequired && <span className="shrink-0 text-[12.5px] text-muted">Optional</span>}
    </div>
  );
}

function QuestionField({ q, value, onChange }: { q: RsvpView["questions"][number]; value: unknown; onChange: (v: unknown) => void }) {
  const id = useId();
  switch (q.questionType) {
    case "long_text":
      return (
        <>
          <QuestionLabel q={q} id={id} />
          <Textarea id={id} maxLength={3000} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
        </>
      );
    case "number":
      return (
        <>
          <QuestionLabel q={q} id={id} />
          <Input id={id} type="number" value={(value as number | string) ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
        </>
      );
    case "boolean":
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{q.questionText}</legend>
          <QuestionLabel q={q} />
          <div className="flex gap-2">
            {(
              [
                [true, "Yes"],
                [false, "No"],
              ] as const
            ).map(([v, l]) => (
              <Chip key={l} on={value === v} onClick={() => onChange(v)}>
                {l}
              </Chip>
            ))}
          </div>
        </fieldset>
      );
    case "single_choice":
      return (
        <>
          <QuestionLabel q={q} id={id} />
          <Select id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">Choose…</option>
            {q.options?.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </>
      );
    case "multi_choice": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{q.questionText}</legend>
          <QuestionLabel q={q} />
          <div className="flex flex-wrap gap-2">
            {q.options?.map((o) => (
              <Chip key={o} on={arr.includes(o)} onClick={() => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])}>
                {o}
              </Chip>
            ))}
          </div>
        </fieldset>
      );
    }
    default:
      return (
        <>
          <QuestionLabel q={q} id={id} />
          <Input id={id} maxLength={300} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
        </>
      );
  }
}
