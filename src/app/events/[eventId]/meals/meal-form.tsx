"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type ActionState } from "@/components/forms";
import { Checkbox, Field, Input, Select } from "@/components/ui";

export function MealForm({
  action,
  activities,
  minDate,
  maxDate,
  defaults,
  submitLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  activities: { id: string; name: string; date: string }[];
  minDate: string;
  maxDate: string;
  defaults?: { name: string; serviceDate: string; serviceTime: string | null; basis: string; activityIds: string[]; guestCanOptOut: boolean };
  submitLabel: string;
}) {
  const [basis, setBasis] = useState(defaults?.basis ?? "activity");
  return (
    <ActionForm action={action} resetOnSuccess={!defaults}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Meal" htmlFor="m-name">
          <Input id="m-name" name="name" required maxLength={80} defaultValue={defaults?.name} placeholder="Lunch" />
        </Field>
        <Field label="Date" htmlFor="m-date">
          <Input id="m-date" name="serviceDate" type="date" required min={minDate} max={maxDate} defaultValue={defaults?.serviceDate ?? minDate} />
        </Field>
        <Field label="Time" htmlFor="m-time">
          <Input id="m-time" name="serviceTime" type="time" defaultValue={defaults?.serviceTime ?? ""} />
        </Field>
      </div>
      <Field label="Who is counted?" htmlFor="m-basis">
        <Select id="m-basis" name="basis" value={basis} onChange={(e) => setBasis(e.target.value)}>
          <option value="activity">People attending the linked activities</option>
          <option value="overnight">People staying the night before (e.g. hotel breakfast)</option>
          <option value="manual">Only people you add individually</option>
        </Select>
      </Field>
      {basis === "activity" && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Linked activities</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {activities.map((a) => (
              <Checkbox key={a.id} name="activityIds" value={a.id} label={a.name} description={a.date} defaultChecked={defaults?.activityIds.includes(a.id)} />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Someone attending several linked activities is counted once.</p>
        </fieldset>
      )}
      <Checkbox name="guestCanOptOut" label="Let guests skip this meal in their RSVP" defaultChecked={defaults?.guestCanOptOut} />
      <div className="flex justify-end">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
