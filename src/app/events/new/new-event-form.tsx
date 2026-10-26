"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Card, Checkbox, cx, Field, Input, Select, Textarea } from "@/components/ui";
import { EVENT_TYPE_LABELS, EVENT_TYPES, type EventType } from "@/domain/settings";
import { TEMPLATES } from "@/domain/templates";
import { addDays, COMMON_TIME_ZONES } from "@/lib/dates";
import { createEventAction } from "@/server/actions/events";

export function NewEventForm() {
  const [state, action] = useActionState(createEventAction, {});
  const [type, setType] = useState<EventType>("wedding");
  const [start, setStart] = useState("");
  const template = TEMPLATES[type];
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">What are you planning?</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {EVENT_TYPES.map((t) => (
            <label
              key={t}
              className={cx(
                "cursor-pointer rounded-xl border bg-surface p-4 transition-colors",
                t === type ? "border-brand ring-2 ring-ring" : "border-border hover:border-border-strong",
              )}
            >
              <input type="radio" name="eventType" value={t} checked={t === type} onChange={() => setType(t)} className="sr-only" />
              <div className="font-medium">{EVENT_TYPE_LABELS[t]}</div>
              <div className="mt-1 text-xs text-muted">{TEMPLATES[t].description}</div>
            </label>
          ))}
        </div>
      </fieldset>

      <Card className="space-y-4 p-5">
        <Field label="Event name" htmlFor="name" error={fe.name}>
          <Input id="name" name="name" required maxLength={160} placeholder={type === "wedding" ? "Purva & Anupam's wedding" : "Event name"} />
        </Field>
        <Field label="Hosted by" htmlFor="hostDisplayName" hint="Shown on the invitation.">
          <Input id="hostDisplayName" name="hostDisplayName" maxLength={160} placeholder="The Sharma & Iyer families" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Starts" htmlFor="startDate" error={fe.startDate}>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Ends" htmlFor="endDate" error={fe.endDate}>
            <Input
              id="endDate"
              name="endDate"
              type="date"
              required
              min={start || undefined}
              key={`${start}-${type}`}
              defaultValue={start ? addDays(start, template.defaultDays - 1) : ""}
            />
          </Field>
          <Field label="Timezone" htmlFor="timezone">
            <Select id="timezone" name="timezone" defaultValue="Asia/Kolkata">
              {COMMON_TIME_ZONES.map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Main venue" htmlFor="venueName" hint="Activities can have their own venues.">
            <Input id="venueName" name="venueName" maxLength={200} />
          </Field>
          <Field label="RSVP deadline" htmlFor="rsvpDeadlineLocal" hint="Optional, in the event's timezone.">
            <Input id="rsvpDeadlineLocal" name="rsvpDeadlineLocal" type="datetime-local" />
          </Field>
        </div>
        <Field label="Venue address" htmlFor="venueAddress">
          <Input id="venueAddress" name="venueAddress" maxLength={500} />
        </Field>
        <Field label="Message for guests" htmlFor="description">
          <Textarea id="description" name="description" maxLength={4000} rows={3} />
        </Field>
      </Card>

      {template.activities.length > 0 && (
        <Card className="p-5">
          <Checkbox
            name="useTemplate"
            defaultChecked
            value="on"
            onChange={(e) => {
              const hidden = e.currentTarget.form?.elements.namedItem("useTemplateOff") as HTMLInputElement | null;
              if (hidden) hidden.disabled = e.currentTarget.checked;
            }}
            label="Start with the suggested schedule"
            description={`${template.activities.map((a) => a.name).join(", ")}${
              template.meals.length ? `, plus ${template.meals.length} meals` : ""
            }${template.groups.length ? ` and guest groups` : ""}.`}
          />
          <input type="hidden" name="useTemplate" value="off" id="useTemplateOff" disabled />
        </Card>
      )}

      <div className="flex justify-end">
        <SubmitButton pendingText="Creating…">Create event</SubmitButton>
      </div>
    </form>
  );
}
