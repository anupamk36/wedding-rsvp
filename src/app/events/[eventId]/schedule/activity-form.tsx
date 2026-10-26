"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type ActionState } from "@/components/forms";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui";

export interface ActivityDefaults {
  name?: string;
  description?: string | null;
  date?: string;
  startTime?: string;
  endTime?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  attendanceRequested?: boolean;
  allowDecline?: boolean;
  capacity?: number | null;
  eligibility?: "all" | "groups";
  eligibleGroupIds?: string[];
}

export function ActivityForm({
  action,
  defaults = {},
  groups,
  minDate,
  maxDate,
  submitLabel,
  slotMode,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  defaults?: ActivityDefaults;
  groups: { id: string; name: string }[];
  minDate: string;
  maxDate: string;
  submitLabel: string;
  slotMode: boolean;
}) {
  const [eligibility, setEligibility] = useState(defaults.eligibility ?? "all");
  const isNew = !defaults.name;
  return (
    <ActionForm action={action} resetOnSuccess={isNew}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={slotMode ? "Slot name" : "Activity name"} htmlFor="a-name">
          <Input id="a-name" name="name" required maxLength={160} defaultValue={defaults.name} placeholder={slotMode ? "Saturday morning" : "Sangeet"} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Date" htmlFor="a-date" className="col-span-3 sm:col-span-1">
            <Input id="a-date" name="date" type="date" required min={minDate} max={maxDate} defaultValue={defaults.date ?? minDate} />
          </Field>
          <Field label="Starts" htmlFor="a-start">
            <Input id="a-start" name="startTime" type="time" required defaultValue={defaults.startTime ?? "18:00"} />
          </Field>
          <Field label="Ends" htmlFor="a-end">
            <Input id="a-end" name="endTime" type="time" defaultValue={defaults.endTime ?? ""} />
          </Field>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Venue" htmlFor="a-venue" hint="Leave blank to use the main venue.">
          <Input id="a-venue" name="venueName" maxLength={200} defaultValue={defaults.venueName ?? ""} />
        </Field>
        <Field label="Address" htmlFor="a-address">
          <Input id="a-address" name="venueAddress" maxLength={500} defaultValue={defaults.venueAddress ?? ""} />
        </Field>
      </div>
      <Field label="Details for guests" htmlFor="a-desc" hint="Dress code, what to expect…">
        <Textarea id="a-desc" name="description" rows={2} maxLength={2000} defaultValue={defaults.description ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who is invited?" htmlFor="a-elig">
          <Select id="a-elig" name="eligibility" value={eligibility} onChange={(e) => setEligibility(e.target.value as "all" | "groups")}>
            <option value="all">Everyone invited to the event</option>
            <option value="groups" disabled={!groups.length}>
              Only selected guest groups{groups.length ? "" : " (create groups first)"}
            </option>
          </Select>
        </Field>
        <Field label="Capacity" htmlFor="a-cap" hint="Optional. Guests can't confirm beyond this.">
          <Input id="a-cap" name="capacity" type="number" min={1} max={100000} defaultValue={defaults.capacity ?? ""} />
        </Field>
      </div>
      {eligibility === "groups" && (
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium">Groups</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {groups.map((g) => (
              <Checkbox key={g.id} name="eligibleGroupIds" value={g.id} label={g.name} defaultChecked={defaults.eligibleGroupIds?.includes(g.id)} />
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap gap-6">
        <input type="hidden" name="attendanceRequested" value="false" />
        <Checkbox
          name="attendanceRequested"
          value="true"
          defaultChecked={defaults.attendanceRequested ?? true}
          label="Ask guests to respond"
          description="Turn off for informational items like a baraat route."
        />
        <input type="hidden" name="allowDecline" value="false" />
        <Checkbox
          name="allowDecline"
          value="true"
          defaultChecked={defaults.allowDecline ?? true}
          label="People in a party can answer differently"
          description="Off means one answer for the whole party."
        />
      </div>
      <div className="flex justify-end">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
