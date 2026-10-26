import { Suspense } from "react";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, Checkbox, cx, Field, Input, PageHeader, PageSkeleton, Select, Textarea } from "@/components/ui";
import { ACCENTS, EVENT_TYPE_LABELS, EVENT_TYPES } from "@/domain/settings";
import { COMMON_TIME_ZONES, utcToZoned } from "@/lib/dates";
import {
  addCollaboratorAction,
  archiveEventAction,
  deleteEventAction,
  duplicateEventAction,
  removeCollaboratorAction,
  updateEventAction,
  updateSettingsAction,
} from "@/server/actions/events";
import { createQuestionAction, deleteQuestionAction } from "@/server/actions/logistics";
import { listActivities, listCollaborators } from "@/server/modules/events";
import { listQuestions } from "@/server/modules/logistics";
import { getEventContext } from "../context";
import { QuestionTypeFields } from "./question-fields";

export default function SettingsPage({ params }: PageProps<"/events/[eventId]/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings params={params} />
    </Suspense>
  );
}

const ACCENT_SWATCH: Record<(typeof ACCENTS)[number], string> = {
  rose: "#9f1239",
  amber: "#92400e",
  emerald: "#046c4e",
  sky: "#075985",
  violet: "#5b21b6",
  slate: "#334155",
};

const QUESTION_TYPE: Record<string, string> = {
  short_text: "Short answer",
  long_text: "Paragraph",
  single_choice: "One choice",
  multi_choice: "Several choices",
  boolean: "Yes / no",
  number: "Number",
};

async function Settings({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { db, user, event, settings, isOwner, canManage } = await getEventContext(eventId);
  const [collaborators, questions, acts] = await Promise.all([
    listCollaborators(db, user.id, eventId),
    listQuestions(db, eventId),
    listActivities(db, eventId),
  ]);
  const deadlineLocal = event.rsvpDeadline ? (({ date, time }) => `${date}T${time}`)(utcToZoned(event.rsvpDeadline, event.timezone)) : "";
  const f = settings.features;
  const actName = new Map(acts.map((a) => [a.id, a.name]));
  const disabled = !isOwner;

  return (
    <>
      <PageHeader title="Settings" description={isOwner ? undefined : "Only the event owner can change these settings."} />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Event details" />
          <div className="p-5">
            <ActionForm action={updateEventAction.bind(null, eventId)}>
              <fieldset disabled={disabled} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" htmlFor="name">
                    <Input id="name" name="name" required maxLength={160} defaultValue={event.name} />
                  </Field>
                  <Field label="Hosted by" htmlFor="hostDisplayName">
                    <Input id="hostDisplayName" name="hostDisplayName" maxLength={160} defaultValue={event.hostDisplayName ?? ""} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-4">
                  <Field label="Type" htmlFor="eventType">
                    <Select id="eventType" name="eventType" defaultValue={event.eventType}>
                      {EVENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {EVENT_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Starts" htmlFor="startDate">
                    <Input id="startDate" name="startDate" type="date" required defaultValue={event.startDate} />
                  </Field>
                  <Field label="Ends" htmlFor="endDate">
                    <Input id="endDate" name="endDate" type="date" required defaultValue={event.endDate} />
                  </Field>
                  <Field label="Timezone" htmlFor="timezone">
                    <Select id="timezone" name="timezone" defaultValue={event.timezone}>
                      {[...new Set([event.timezone, ...COMMON_TIME_ZONES])].map((tz) => (
                        <option key={tz}>{tz}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Main venue" htmlFor="venueName">
                    <Input id="venueName" name="venueName" maxLength={200} defaultValue={event.venueName ?? ""} />
                  </Field>
                  <Field label="Address" htmlFor="venueAddress">
                    <Input id="venueAddress" name="venueAddress" maxLength={500} defaultValue={event.venueAddress ?? ""} />
                  </Field>
                  <Field label="RSVP deadline" htmlFor="rsvpDeadlineLocal" hint={`In ${event.timezone}`}>
                    <Input id="rsvpDeadlineLocal" name="rsvpDeadlineLocal" type="datetime-local" defaultValue={deadlineLocal} />
                  </Field>
                </div>
                <Field label="Message for guests" htmlFor="description">
                  <Textarea id="description" name="description" rows={3} maxLength={4000} defaultValue={event.description ?? ""} />
                </Field>
                <input type="hidden" name="visibility" value={event.visibility} />
                {isOwner && (
                  <div className="flex justify-end">
                    <SubmitButton>Save details</SubmitButton>
                  </div>
                )}
              </fieldset>
            </ActionForm>
          </div>
        </Card>

        <Card>
          <CardHeader title="RSVP options" description="Only enabled sections are shown to guests and in your navigation." />
          <div className="p-5">
            <ActionForm action={updateSettingsAction.bind(null, eventId)}>
              <fieldset disabled={disabled} className="space-y-6">
                <div>
                  <h3 className="mb-3 text-sm font-semibold">What to ask guests</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Checkbox name="f_dietary" defaultChecked={f.dietary} label="Dietary needs" description="Per person, from your list of options below." />
                    <Checkbox name="f_meals" defaultChecked={f.meals} label="Meal planning" description="Derive meal counts from attendance." />
                    <Checkbox name="f_accommodation" defaultChecked={f.accommodation} label="Accommodation" description="Who needs a room, which nights." />
                    <Checkbox name="f_transport" defaultChecked={f.transport} label="Transport" description="Pickups, drop-offs and local trips." />
                    <Checkbox name="f_accessibility" defaultChecked={f.accessibility} label="Accessibility needs" />
                    <Checkbox name="f_plusOnes" defaultChecked={f.plusOnes} label="Plus-ones by default" description="New invitations allow one additional guest." />
                  </div>
                </div>
                <Field label="Dietary options" htmlFor="dietaryOptions" hint="Comma-separated. Guests can pick several.">
                  <Input id="dietaryOptions" name="dietaryOptions" defaultValue={settings.dietaryOptions.join(", ")} />
                </Field>
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Responses</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Checkbox name="allowMaybe" defaultChecked={settings.allowMaybe} label="Allow “maybe”" />
                    <Checkbox name="allowGuestEdits" defaultChecked={settings.allowGuestEdits} label="Guests can change their response" />
                    <Checkbox name="availabilityMode" defaultChecked={settings.availabilityMode} label="Availability poll" description="Activities are candidate time slots (available / if needed / unavailable)." />
                    <Field label="Minimum participants per slot" htmlFor="minParticipants">
                      <Input id="minParticipants" name="minParticipants" type="number" min={1} defaultValue={settings.minParticipants ?? ""} />
                    </Field>
                    <Field label="After the deadline" htmlFor="latePolicy">
                      <Select id="latePolicy" name="latePolicy" defaultValue={settings.latePolicy}>
                        <option value="accept_flag">Accept changes and flag them for review</option>
                        <option value="reject">Don&rsquo;t accept changes online</option>
                      </Select>
                    </Field>
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Forecast</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Checkbox name="showForecast" defaultChecked={settings.showForecast} label="Show a headcount forecast" description="Labelled as an estimate, never as confirmed." />
                    <Field label="Count each “maybe” as" htmlFor="tentativeWeight" hint="Percent of a person.">
                      <Input id="tentativeWeight" name="tentativeWeight" type="number" min={0} max={100} defaultValue={Math.round(settings.tentativeWeight * 100)} />
                    </Field>
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Notifications</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Checkbox name="notifyHostOnResponse" defaultChecked={settings.notifyHostOnResponse} label="Email hosts when someone responds" />
                    <Checkbox name="sendGuestConfirmation" defaultChecked={settings.sendGuestConfirmation} label="Email guests a confirmation" description="Only when we have their email address." />
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Invitation look</h3>
                  <div className="flex flex-wrap gap-3">
                    {ACCENTS.map((a) => (
                      <label key={a} className="cursor-pointer">
                        <input type="radio" name="accent" value={a} defaultChecked={settings.theme.accent === a} className="peer sr-only" />
                        <span className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm capitalize peer-checked:border-text peer-checked:ring-2 peer-checked:ring-ring peer-focus-visible:ring-2">
                          <span className="size-4 rounded-full" style={{ background: ACCENT_SWATCH[a] }} aria-hidden />
                          {a}
                        </span>
                      </label>
                    ))}
                  </div>
                  <Field label="Cover image URL" htmlFor="coverImageUrl" hint="Optional HTTPS image shown at the top of the invitation." className="mt-4">
                    <Input id="coverImageUrl" name="coverImageUrl" type="url" pattern="https://.*" defaultValue={settings.theme.coverImageUrl ?? ""} />
                  </Field>
                </div>
                {isOwner && (
                  <div className="flex justify-end">
                    <SubmitButton>Save options</SubmitButton>
                  </div>
                )}
              </fieldset>
            </ActionForm>
          </div>
        </Card>

        <Card>
          <CardHeader title="Custom questions" description="Asked on the Details step. Questions tied to an activity only appear when someone in the party attends it." />
          <ul className="divide-y divide-border">
            {questions.map((q) => (
              <li key={q.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3 text-sm">
                <div>
                  <div className="font-medium">
                    {q.questionText}
                    {q.isRequired && <span className="text-danger"> *</span>}
                  </div>
                  <div className="text-xs text-muted">
                    {QUESTION_TYPE[q.questionType]}
                    {q.options?.length ? ` · ${q.options.join(" / ")}` : ""}
                    {q.activityId ? ` · only for ${actName.get(q.activityId)}` : ""}
                  </div>
                </div>
                {canManage && (
                  <ActionButton action={deleteQuestionAction.bind(null, q.id)} variant="ghost" confirm="Delete this question and its answers?">
                    Delete
                  </ActionButton>
                )}
              </li>
            ))}
            {questions.length === 0 && <li className="px-5 py-3 text-sm text-muted">No custom questions.</li>}
          </ul>
          {canManage && (
            <div className="border-t border-border p-5">
              <ActionForm action={createQuestionAction.bind(null, eventId)} resetOnSuccess>
                <Field label="Question" htmlFor="questionText">
                  <Input id="questionText" name="questionText" required maxLength={300} placeholder="Any song requests for the sangeet?" />
                </Field>
                <QuestionTypeFields activities={acts.map((a) => ({ id: a.id, name: a.name }))} />
                <div className="flex justify-end">
                  <SubmitButton variant="secondary">Add question</SubmitButton>
                </div>
              </ActionForm>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Collaborators" description="Organizers manage guests, invitations and logistics. Viewers can only look." />
          <ul className="divide-y divide-border">
            {collaborators.map((c) => (
              <li key={c.userId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <div>
                  <span className="font-medium">{c.name}</span> <span className="text-muted">{c.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={c.role === "owner" ? "brand" : "neutral"}>{c.role}</Badge>
                  {isOwner && c.role !== "owner" && (
                    <ActionButton action={removeCollaboratorAction.bind(null, eventId, c.userId)} variant="ghost" confirm={`Remove ${c.name}'s access?`}>
                      Remove
                    </ActionButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {isOwner && (
            <div className="border-t border-border p-5">
              <ActionForm action={addCollaboratorAction.bind(null, eventId)} resetOnSuccess className="grid gap-3 space-y-0 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <Field label="Email of their Gatherly account" htmlFor="c-email">
                  <Input id="c-email" name="email" type="email" required />
                </Field>
                <Field label="Role" htmlFor="c-role">
                  <Select id="c-role" name="role" defaultValue="organizer">
                    <option value="organizer">Organizer</option>
                    <option value="viewer">Viewer</option>
                  </Select>
                </Field>
                <SubmitButton variant="secondary">Add</SubmitButton>
              </ActionForm>
            </div>
          )}
        </Card>

        {canManage && (
          <Card>
            <CardHeader title="Reuse this setup" description="Copies schedule, meals, groups and settings — no guests or responses." />
            <div className="p-5">
              <ActionForm action={duplicateEventAction.bind(null, eventId)} className="flex flex-wrap items-end gap-3 space-y-0">
                <Field label="New start date (optional)" htmlFor="dup-start">
                  <Input id="dup-start" name="startDate" type="date" />
                </Field>
                <SubmitButton variant="secondary" pendingText="Copying…">
                  Duplicate event
                </SubmitButton>
              </ActionForm>
            </div>
          </Card>
        )}

        {isOwner && (
          <Card className="border-danger/40">
            <CardHeader title="Danger zone" />
            <div className="space-y-5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="font-medium">{event.archivedAt ? "Restore event" : "Archive event"}</div>
                  <div className="text-muted">Archiving hides the event and disables all invitation links. You can restore it later.</div>
                </div>
                <ActionButton action={archiveEventAction.bind(null, eventId, !event.archivedAt)} size="md" confirm={event.archivedAt ? undefined : "Archive this event? Guest links will stop working."}>
                  {event.archivedAt ? "Restore" : "Archive"}
                </ActionButton>
              </div>
              <div className={cx("border-t border-border pt-5")}>
                <div className="mb-2 text-sm">
                  <div className="font-medium text-danger">Delete permanently</div>
                  <div className="text-muted">Removes the event, every guest record and all responses. This cannot be undone.</div>
                </div>
                <ActionForm action={deleteEventAction.bind(null, eventId)} className="flex flex-wrap items-end gap-3 space-y-0">
                  <Field label={`Type “${event.name}” to confirm`} htmlFor="confirmName" className="min-w-64 flex-1">
                    <Input id="confirmName" name="confirmName" required autoComplete="off" />
                  </Field>
                  <SubmitButton variant="danger" pendingText="Deleting…">
                    Delete event
                  </SubmitButton>
                </ActionForm>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
