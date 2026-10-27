"use client";

import type { ReactNode } from "react";
import { nightsInStay } from "@/domain/calculations";
import { dietaryLabel } from "@/domain/settings";
import { formatDate, formatDateTime } from "@/lib/dates";
import { Badge, Eyebrow } from "../ui";
import { activityResult, chipNames, listNames, type Labels } from "./logic";
import type { FlowState, RsvpView } from "./types";

export type SectionId = "activities" | "details" | "travel";

function Section({ title, editId, editLabel, onEdit, children }: { title: string; editId: SectionId; editLabel: string; onEdit?: (id: SectionId) => void; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface px-4 pt-4 pb-3.5">
      <div className="flex min-h-6 items-center justify-between">
        <Eyebrow as="h2">{title}</Eyebrow>
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(editId)}
            aria-label={editLabel}
            className="-my-2.5 flex min-h-11 items-center px-1.5 text-[14px] font-semibold text-brand hover:underline underline-offset-4"
          >
            Edit
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

const transportLabel = { arrival: "Pickup on arrival", departure: "Drop-off when leaving", local: "Transport between venues" } as const;

export function Summary({
  view,
  state,
  labels,
  onEdit,
  sections,
}: {
  view: RsvpView;
  state: FlowState;
  labels: Labels;
  onEdit?: (id: SectionId) => void;
  /** Which edit targets exist (steps that are part of the flow). */
  sections?: SectionId[];
}) {
  const tz = view.event.timezone;
  const f = view.event.settings.features;
  const askable = view.activities.filter((a) => a.attendanceRequested);
  const edit = (id: SectionId) => (onEdit && (!sections || sections.includes(id)) ? onEdit : undefined);
  const names = chipNames(state.people);
  const name = (k: string) => names.get(k) ?? "Guest";

  // Group people with identical requirements: "Neha, Aarav: vegetarian".
  const food = new Map<string, string[]>();
  for (const p of state.people) {
    const parts = [
      ...(f.dietary ? p.dietary.map(dietaryLabel) : []),
      ...(f.dietary && p.dietaryNotes ? [p.dietaryNotes] : []),
      ...(f.accessibility && p.accessibilityNeeds ? [p.accessibilityNeeds] : []),
    ];
    const key = parts.join(", ") || "no requirements";
    food.set(key, [...(food.get(key) ?? []), name(p.key)]);
  }

  const answered = view.questions.filter((q) => state.answers[q.id] !== undefined && state.answers[q.id] !== null && state.answers[q.id] !== "");

  return (
    <div className="flex flex-col gap-3">
      <Section title={view.event.settings.availabilityMode ? "Availability" : "Events"} editId="activities" editLabel="Edit events" onEdit={edit("activities")}>
        <ul className="flex flex-col">
          {askable.map((a) => {
            const r = activityResult(a.id, state.people, state.attendance, labels);
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 border-t border-border py-3 first:border-t-0">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">{a.name}</span>
                  <span className="text-[13px] text-muted">{formatDateTime(a.startAt, tz)}</span>
                </span>
                <Badge tone={r.tone}>{r.text}</Badge>
              </li>
            );
          })}
        </ul>
      </Section>

      {(f.dietary || f.accessibility) && (
        <Section title={f.accessibility ? "Food and access" : "Food"} editId="details" editLabel={f.accessibility ? "Edit food and access" : "Edit food"} onEdit={edit("details")}>
          <ul className="text-[15px] leading-relaxed">
            {[...food.entries()].map(([desc, names]) => (
              <li key={desc}>
                {listNames(names)}: {desc}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(f.accommodation || f.transport) && (
        <Section title="Stay and travel" editId="travel" editLabel="Edit stay and travel" onEdit={edit("travel")}>
          <div className="flex flex-col gap-2 text-[15px] leading-relaxed">
            {f.accommodation &&
              (state.needsStay && state.stays.length ? (
                state.stays.map((s, i) => {
                  let nights: number | null = null;
                  try {
                    nights = nightsInStay(s.arrivalDate, s.departureDate);
                  } catch {}
                  return (
                    <p key={i}>
                      <strong>{s.roomCount ? `${s.roomCount} room${s.roomCount > 1 ? "s" : ""}` : "A place to stay"}</strong> for {listNames(s.personKeys.map(name))}
                      {s.confirmed && (
                        <Badge tone="success" className="ml-2">
                          Confirmed
                        </Badge>
                      )}
                      <br />
                      {formatDate(s.arrivalDate, { year: undefined })} – {formatDate(s.departureDate, { year: undefined })}
                      {nights ? ` · ${nights} night${nights > 1 ? "s" : ""}` : ""}
                    </p>
                  );
                })
              ) : (
                <p className="text-muted">No accommodation needed</p>
              ))}
            {f.transport &&
              (state.needsTransport && state.transport.length ? (
                state.transport.map((t, i) => (
                  <p key={i}>
                    <strong>{transportLabel[t.direction]}</strong>
                    <br />
                    {formatDate(t.travelDate, { year: undefined })}
                    {t.travelTime ? `, ${t.travelTime}` : ""} · {t.location} · {listNames(t.personKeys.map(name))}
                  </p>
                ))
              ) : (
                <p className="text-muted">No transport needed</p>
              ))}
          </div>
        </Section>
      )}

      {answered.length > 0 && (
        <Section title="Your answers" editId="details" editLabel="Edit your answers" onEdit={edit("details")}>
          <dl className="flex flex-col gap-2 text-[15px]">
            {answered.map((q) => {
              const v = state.answers[q.id];
              return (
                <div key={q.id}>
                  <dt className="text-[13.5px] text-muted">{q.questionText}</dt>
                  <dd>{Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</dd>
                </div>
              );
            })}
          </dl>
        </Section>
      )}

      {state.notes && !onEdit && (
        <section className="rounded-2xl border border-border bg-surface px-4 py-3.5 text-[15px]">
          <Eyebrow as="h2">Note to the hosts</Eyebrow>
          <p className="mt-1.5 whitespace-pre-line">{state.notes}</p>
        </section>
      )}
    </div>
  );
}
