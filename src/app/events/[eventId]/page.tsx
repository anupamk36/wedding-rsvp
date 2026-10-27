import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Icon } from "@/components/icons";
import { attendanceLabel } from "@/components/status";
import { Badge, ButtonLink, Card, cx, EmptyState, Eyebrow, PageSkeleton } from "@/components/ui";
import { daysBetween, formatDate, formatDateRange, formatDateTime, utcToZoned } from "@/lib/dates";
import { setEventStatusAction } from "@/server/actions/events";
import { emailInvitationsAction, markSentAction } from "@/server/actions/guests";
import { listInvitations } from "@/server/modules/invitations";
import { getAccommodationReport, getEventSummary, getMealReport, getTransportReport } from "@/server/modules/reporting";
import type { ChangeEntry } from "@/server/modules/rsvp";
import { getEventContext } from "./context";
import { WhatsAppButton } from "./invitations/share-links";

export default function OverviewPage({ params }: PageProps<"/events/[eventId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

function describeChange(c: ChangeEntry, availability: boolean): string {
  if (c.type === "attendance") {
    const to = c.to ? attendanceLabel(c.to, availability).toLowerCase() : "no answer";
    return c.from ? `${c.guest}: ${c.activity} → ${to}` : `${c.guest}: ${to} for ${c.activity}`;
  }
  if (c.type === "plus_one") return `${c.guest} ${c.change === "added" ? "added as a guest" : "removed"}`;
  return c.summary;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "11 days to go", "Happening now", "Ended 3 days ago". */
function countdown(today: string, start: string, end: string): string {
  const until = daysBetween(today, start);
  if (until > 1) return `${until} days to go`;
  if (until === 1) return "Tomorrow";
  if (until === 0) return "Starts today";
  const since = daysBetween(end, today);
  if (since <= 0) return "Happening now";
  return since === 1 ? "Ended yesterday" : `Ended ${since} days ago`;
}

function StatusPill({ status, archived }: { status: string; archived: boolean }) {
  const [label, cls, dot] = archived
    ? ["Archived", "bg-surface-2 text-muted", "bg-muted"]
    : status === "published"
      ? ["Live", "bg-success-soft text-success-ink", "bg-success"]
      : ["Draft", "bg-warning-soft text-warning-ink", "bg-warning"];
  return (
    <span className={cx("inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-bold", cls)}>
      <span aria-hidden="true" className={cx("size-[7px] rounded-full", dot)} />
      {label}
    </span>
  );
}

function SectionCard({ id, title, sub, actions, children, className }: { id: string; title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cx("overflow-hidden", className)} aria-labelledby={id} role="region">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3.5 sm:px-[22px] sm:pt-[22px]">
        <div className="flex flex-col gap-1">
          <Eyebrow as="h2">
            <span id={id}>{title}</span>
          </Eyebrow>
          {sub && <p className="text-[13.5px] text-muted">{sub}</p>}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}

async function Overview({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const ctx = await getEventContext(eventId);
  const { db, user, event, settings, canManage, isOwner } = ctx;
  const base = `/events/${eventId}`;
  const f = settings.features;
  const [s, acc, meals, transport, invitations] = await Promise.all([
    getEventSummary(db, user.id, eventId),
    f.accommodation ? getAccommodationReport(db, user.id, eventId) : null,
    f.meals ? getMealReport(db, user.id, eventId) : null,
    f.transport ? getTransportReport(db, user.id, eventId) : null,
    listInvitations(db, user.id, eventId),
  ]);
  const availability = settings.availabilityMode;
  const tz = event.timezone;
  const today = utcToZoned(new Date(), tz).date;
  const host = event.hostDisplayName ?? "We";

  const steps = [
    { done: s.checklist.activities, label: availability ? "Add candidate time slots" : "Add activities to the schedule", href: `${base}/schedule` },
    { done: s.checklist.guests, label: "Add guests and households", href: `${base}/guests` },
    { done: s.checklist.invitations, label: "Create invitation links", href: `${base}/invitations` },
    { done: s.checklist.shared, label: "Share or send the invitations", href: `${base}/invitations` },
    { done: s.checklist.responses, label: "Watch responses arrive", href: `${base}/responses` },
  ];
  const showChecklist = steps.some((x) => !x.done);

  const deadline = event.rsvpDeadline
    ? `${event.rsvpDeadline < new Date() ? "RSVPs closed" : "RSVP by"} ${formatDateTime(event.rsvpDeadline, tz, { hour: undefined, minute: undefined })}`
    : null;
  const deadlineDay = event.rsvpDeadline ? formatDate(utcToZoned(event.rsvpDeadline, tz).date, { weekday: undefined, year: undefined }) : null;

  const attention = [
    {
      n: s.totals.lateChanges,
      title: "Late changes to review",
      sub: deadlineDay ? `Changed after the ${deadlineDay} deadline. Check them against your final numbers.` : "Changed after the deadline. Check them against your final numbers.",
      cta: "Review changes",
      href: `${base}/responses?late=1`,
      cls: "bg-warning-soft text-warning-ink",
    },
    {
      n: s.totals.invitationsPending,
      title: s.totals.invitationsPending === 1 ? "Invitation with no reply" : "Invitations with no reply",
      sub: "Nudge them by WhatsApp or email before numbers are final.",
      cta: "Chase replies",
      href: `${base}/responses?response=pending`,
      cls: "bg-info-soft text-info-ink",
    },
    {
      n: acc?.totals.requestsWithoutRoomCount ?? 0,
      title: "Stays without a room count",
      sub: "Guests asked for rooms but did not say how many. Room counts are lower bounds.",
      cta: "Fix room counts",
      href: `${base}/accommodation`,
      cls: "bg-brand-soft text-brand-ink",
    },
  ].filter((a) => a.n > 0);

  const replied = s.totals.invitedPeople ? Math.round((s.totals.respondedPeople / s.totals.invitedPeople) * 100) : 0;
  const ring = 2 * Math.PI * 54;

  const pending = invitations.filter((r) => r.invitation.status !== "revoked" && r.invitation.responseStatus === "pending");
  const emailable = pending.filter((r) => r.primaryEmail);

  const labels = availability
    ? { attending: "available", maybe: "if needed", not_attending: "unavailable" }
    : { attending: "confirmed", maybe: "maybe", not_attending: "declined" };
  const slotById = new Map(s.slots.map((x) => [x.activityId, x]));
  const rows = availability && s.slots.length ? s.slots.map((x) => s.activities.find((a) => a.id === x.activityId)!).filter(Boolean) : s.activities;

  const logistics = [
    acc && {
      label: "Accommodation",
      value: plural(acc.totals.roomNights, "room-night"),
      sub: `${plural(acc.totals.guestNights, "guest-night")} · ${acc.awaiting} awaiting a room`,
      href: `${base}/accommodation`,
    },
    meals && {
      label: "Meals",
      value: meals.meals.length ? plural(meals.meals.reduce((n, m) => n + m.confirmed, 0), "serving") : "No meals",
      sub: meals.meals.length ? `Across ${plural(meals.meals.length, "meal")} · ${meals.meals.reduce((n, m) => n + m.tentative, 0)} tentative` : "Add meals to estimate catering",
      href: `${base}/meals`,
    },
    transport && {
      label: "Transport",
      value: plural(transport.totals.passengers, "passenger"),
      sub: `${plural(transport.totals.requests, "request")} · ${transport.totals.unassigned} unassigned`,
      href: `${base}/transport`,
    },
  ].filter((x) => !!x);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusPill status={event.status} archived={!!event.archivedAt} />
            <span className="text-[13.5px] text-muted">
              Today is {formatDate(today, { year: undefined })} · {countdown(today, event.startDate, event.endDate)}
            </span>
          </div>
          <h1 className="font-display text-[28px] leading-[1.1] font-semibold tracking-tight sm:text-4xl">{event.name}</h1>
          <p className="text-[14.5px] text-muted">
            {[formatDateRange(event.startDate, event.endDate), event.venueName, deadline].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <ButtonLink href={`${base}/preview`} variant="secondary">
            Preview invitation
          </ButtonLink>
          {canManage && (
            <ButtonLink href={`${base}/invitations`} variant={isOwner && event.status !== "published" && !event.archivedAt ? "secondary" : "primary"}>
              Share invitations
            </ButtonLink>
          )}
          {isOwner && !event.archivedAt && (
            <ActionButton
              size="md"
              variant={event.status === "published" ? "ghost" : "primary"}
              action={setEventStatusAction.bind(null, eventId, event.status === "published" ? "draft" : "published")}
            >
              {event.status === "published" ? "Mark as draft" : "Mark as live"}
            </ActionButton>
          )}
        </div>
      </header>

      {showChecklist && canManage && (
        <Card className="p-5">
          <h2 className="font-display text-[19px] font-semibold">Get set up</h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((step, i) => (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className={cx(
                    "flex h-full min-h-11 items-start gap-2.5 rounded-xl border p-3 text-sm",
                    step.done ? "border-border bg-surface-2 text-muted" : "border-border-strong font-medium hover:border-brand",
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      step.done ? "bg-success text-on-status" : "bg-brand-soft text-brand-ink",
                    )}
                  >
                    {step.done ? "✓" : i + 1}
                  </span>
                  <span>
                    {step.label}
                    <span className="sr-only">{step.done ? " (done)" : ""}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {attention.length > 0 && (
        <section aria-labelledby="att-h" className="flex flex-col gap-3">
          <Eyebrow as="h2">
            <span id="att-h">Needs your attention</span>
          </Eyebrow>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3.5">
            {attention.map((a) => (
              <Card key={a.title} className="flex flex-col gap-3.5 p-4">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className={cx("flex size-10 shrink-0 items-center justify-center rounded-xl font-display text-xl font-semibold tabular", a.cls)}>
                    {a.n}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <h3 className="text-[15.5px] leading-snug font-bold">
                      <span className="sr-only">{a.n} </span>
                      {a.title}
                    </h3>
                    <p className="text-[13.5px] leading-snug text-muted">{a.sub}</p>
                  </div>
                </div>
                <ButtonLink href={a.href} variant="secondary" size="sm" className="self-start">
                  {a.cta}
                </ButtonLink>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-5">
        <SectionCard id="prog-h" title="Replies">
          <div className="flex flex-col gap-[18px] px-5 pb-5 sm:px-[22px] sm:pb-[22px]">
            <div className="flex items-center gap-5">
              <div className="relative size-[132px] shrink-0">
                <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`${replied} percent of invited people have replied`}>
                  <circle cx="66" cy="66" r="54" fill="none" strokeWidth="14" className="stroke-border" />
                  {replied > 0 && (
                    <circle
                      cx="66"
                      cy="66"
                      r="54"
                      fill="none"
                      strokeWidth="14"
                      strokeLinecap="round"
                      strokeDasharray={`${(replied / 100) * ring} ${ring}`}
                      transform="rotate(-90 66 66)"
                      className="stroke-brand"
                    />
                  )}
                </svg>
                <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                  <span className="font-display text-[32px] font-semibold">{replied}%</span>
                  <span className="mt-1 text-xs text-muted">replied</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Link href={`${base}/responses?response=submitted`} className="text-[15px] leading-snug hover:underline underline-offset-4">
                  <strong className="font-display text-[22px] font-semibold">{s.totals.respondedPeople}</strong> of {plural(s.totals.invitedPeople, "person", "people")}
                </Link>
                <span className="text-[13.5px] leading-snug text-muted">
                  {s.totals.invitationsResponded} of {plural(s.totals.invitations, "invitation")} answered
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Link href={`${base}/guests`} className="flex flex-col gap-0.5 rounded-xl bg-surface-2 px-3.5 py-3 hover:ring-1 hover:ring-border-strong">
                <span className="text-[22px] font-bold tabular">{s.totals.invitedPeople}</span>
                <span className="text-[13px] text-muted">invited people</span>
              </Link>
              <Link href={`${base}/responses?response=pending`} className="flex flex-col gap-0.5 rounded-xl bg-info-soft px-3.5 py-3 text-info-ink hover:ring-1 hover:ring-info">
                <span className="text-[22px] font-bold tabular">{s.totals.pendingPeople}</span>
                <span className="text-[13px]">no reply yet</span>
              </Link>
            </div>
            {s.totals.notInvited > 0 && (
              <p className="text-[13px] text-muted">
                {plural(s.totals.notInvited, "person", "people")} on the guest list without an invitation.{" "}
                <Link href={`${base}/invitations`} className="font-semibold text-brand hover:underline underline-offset-4">
                  Create invitations
                </Link>
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard
          id="act-h"
          title={availability ? "Availability by slot" : "Attendance by event"}
          sub={
            availability && settings.minParticipants
              ? `Ranked by availability · needs at least ${settings.minParticipants} available · select a number to see who`
              : availability
                ? "Ranked by availability · nothing is chosen automatically · select a number to see who"
                : s.lastUpdated
                  ? `Live from replies · last change ${formatDateTime(s.lastUpdated, tz)} · select a number to see who`
                  : "Counts appear as guests reply · select a number to see who"
          }
          actions={
            // Visual key only: each bar's label spells out its counts.
            <div aria-hidden="true" className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px] text-muted">
              {(
                [
                  [labels.attending, "bg-success"],
                  [labels.maybe, "bg-marigold"],
                  [labels.not_attending, "bg-decline-bar"],
                  ["no answer", "border border-info/40 bg-info-soft"],
                ] as const
              ).map(([label, cls]) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className={cx("size-3 rounded-[3px]", cls)} />
                  {label[0]!.toUpperCase() + label.slice(1)}
                </span>
              ))}
            </div>
          }
        >
          {rows.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState
                title={availability ? "No time slots yet" : "No activities yet"}
                description="Add the functions or time slots guests should respond to."
                action={canManage ? <ButtonLink href={`${base}/schedule`}>Add activities</ButtonLink> : undefined}
              />
            </div>
          ) : (
            <ul>
              {rows.map((a, rank) => {
                const total = Math.max(a.invited, 1);
                const pct = (n: number) => `${(n / total) * 100}%`;
                const slot = slotById.get(a.id);
                const link = (status: string, n: number, label: string, cls?: string) => (
                  <Link href={`${base}/responses?activityId=${a.id}&status=${status}`} className={cx("rounded underline-offset-4 hover:underline", cls)}>
                    {n} {label}
                  </Link>
                );
                return (
                  <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-border px-5 py-3.5 sm:grid-cols-[minmax(0,150px)_minmax(120px,1fr)_auto] sm:px-[22px]">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-x-2 text-[15px] font-bold">
                        {availability && <span className="text-muted tabular">{rank + 1}.</span>}
                        {a.name}
                      </span>
                      <span className="text-[12.5px] text-muted">{formatDateTime(a.startAt, tz)}</span>
                      {a.capacity != null && (
                        <span className={cx("text-[12.5px]", a.confirmed >= a.capacity ? "font-semibold text-danger" : "text-muted")}>
                          {a.confirmed}/{a.capacity} places
                        </span>
                      )}
                    </span>
                    <span className="col-span-2 row-start-2 flex flex-col gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                      <span
                        role="img"
                        aria-label={`${a.name}: ${a.confirmed} ${labels.attending}, ${a.tentative} ${labels.maybe}, ${a.declined} ${labels.not_attending}, ${a.unanswered} no answer`}
                        className="flex h-3.5 overflow-hidden rounded-full bg-info-soft"
                      >
                        <span className="bg-success" style={{ width: pct(a.confirmed) }} />
                        <span className="bg-marigold" style={{ width: pct(a.tentative) }} />
                        <span className="bg-decline-bar" style={{ width: pct(a.declined) }} />
                      </span>
                      <span className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted tabular">
                        {link("maybe", a.tentative, labels.maybe)} ·{link("not_attending", a.declined, labels.not_attending)} ·{link("unanswered", a.unanswered, "no answer")}
                        {settings.showForecast && !availability && (
                          <span title={`Confirmed + ${Math.round(settings.tentativeWeight * 100)}% of maybes`}> · ~{a.expected} forecast</span>
                        )}
                        {slot?.meetsMinimum != null && (
                          <Badge tone={slot.meetsMinimum ? "success" : "neutral"} className="ml-1">
                            {slot.meetsMinimum ? "Enough players" : "Below minimum"}
                          </Badge>
                        )}
                      </span>
                    </span>
                    <Link
                      href={`${base}/responses?activityId=${a.id}&status=attending`}
                      className="col-start-2 row-start-1 justify-self-end rounded font-display text-2xl font-semibold text-success tabular underline-offset-4 hover:underline sm:col-start-3"
                    >
                      {a.confirmed}
                      <span className="sr-only"> {labels.attending}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {settings.showForecast && !availability && rows.length > 0 && (
            <p className="border-t border-border px-5 py-2.5 text-xs text-muted sm:px-[22px]">
              Forecast = confirmed + {Math.round(settings.tentativeWeight * 100)}% of maybes. It is an estimate, not a confirmed count.
            </p>
          )}
          {canManage && (
            <div className="border-t border-border px-3 py-1 sm:px-4">
              <ButtonLink href={`${base}/schedule`} variant="link" size="sm">
                {availability ? "Edit time slots" : "Edit schedule"}
              </ButtonLink>
            </div>
          )}
        </SectionCard>
      </div>

      {logistics.length > 0 && (
        <section aria-labelledby="log-h" className="flex flex-col gap-3">
          <Eyebrow as="h2">
            <span id="log-h">What it means for the plan</span>
          </Eyebrow>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3.5">
            {logistics.map((l) => (
              <Link key={l.label} href={l.href} className="flex flex-col gap-2 rounded-[18px] border border-border bg-surface p-[18px] hover:border-border-strong">
                <span className="flex items-center justify-between text-[13.5px] font-semibold text-muted">
                  {l.label}
                  <Icon name="chevronRight" size={18} strokeWidth={2} />
                </span>
                <span className="font-display text-[30px] leading-[1.1] font-semibold">{l.value}</span>
                <span className="text-[13.5px] leading-snug text-muted">{l.sub}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] items-start gap-5">
        {pending.length > 0 && (
          <SectionCard
            id="await-h"
            title="Still to reply"
            sub={`${plural(pending.length, "invitation")} · ${plural(s.totals.pendingPeople, "person", "people")}`}
            actions={
              canManage && emailable.length > 0 ? (
                <ActionForm
                  action={emailInvitationsAction.bind(null, eventId)}
                  className="flex flex-col items-end gap-2 space-y-0"
                  confirm={`Email a reminder with their personal link to ${plural(emailable.length, "invitation")}?`}
                >
                  {emailable.map((r) => (
                    <input key={r.invitation.id} type="hidden" name="invitationIds" value={r.invitation.id} />
                  ))}
                  <input type="hidden" name="message" value={`A reminder: ${host} would love for you to join us for ${event.name}. Please let us know if you can make it.`} />
                  <SubmitButton size="sm" pendingText="Queuing…">
                    Email all {emailable.length}
                  </SubmitButton>
                </ActionForm>
              ) : undefined
            }
          >
            <ul>
              {pending.slice(0, 4).map((r) => (
                <li key={r.invitation.id} className="flex items-center justify-between gap-3 border-t border-border px-5 py-2.5 sm:px-[22px]">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <Link href={`${base}/responses/${r.invitation.id}`} className="truncate text-[15px] font-semibold hover:underline underline-offset-4">
                      {r.label}
                    </Link>
                    <span className="text-[12.5px] text-muted">
                      {plural(r.memberCount, "person", "people")} ·{" "}
                      {r.invitation.sentAt ? `link sent ${formatDateTime(r.invitation.sentAt, tz, { weekday: undefined, hour: undefined, minute: undefined })}` : "link not sent yet"}
                    </span>
                  </span>
                  {canManage && r.url && (
                    <WhatsAppButton
                      url={r.url}
                      phone={r.primaryPhone}
                      message={`Hi ${r.label}! A reminder: ${host} would love for you to join us for ${event.name}. Please RSVP here:`}
                      markSent={markSentAction.bind(null, eventId, [r.invitation.id])}
                      label={`WhatsApp ${r.label}`}
                    />
                  )}
                </li>
              ))}
            </ul>
            <Link
              href={`${base}/responses?response=pending`}
              className="flex h-12 items-center justify-center border-t border-border text-sm font-semibold text-brand hover:underline underline-offset-4"
            >
              See all {pending.length}
            </Link>
          </SectionCard>
        )}

        <SectionCard id="rec-h" title="Recent changes">
          {s.recent.length === 0 ? (
            <p className="border-t border-border px-5 py-6 text-sm text-muted sm:px-[22px]">No responses yet. New replies and changes will appear here.</p>
          ) : (
            <ul>
              {s.recent.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 border-t border-border px-5 py-3.5 sm:px-[22px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`${base}/responses/${r.invitationId}`} className="text-[15px] font-bold hover:underline underline-offset-4">
                        {r.label}
                      </Link>
                      <span className="text-[13.5px] text-muted">
                        {r.kind === "submitted" ? "responded" : r.kind === "withdrawn" ? "withdrew" : r.kind === "host_edit" ? "edited by host" : "updated"}
                      </span>
                      {r.isLate && <Badge tone="warning">After deadline</Badge>}
                    </span>
                    <time className="text-[12.5px] text-muted" dateTime={r.submittedAt.toISOString()}>
                      {formatDateTime(r.submittedAt, tz)}
                    </time>
                  </div>
                  {r.changes.length > 0 && (
                    <ul className="text-[13.5px] text-muted">
                      {r.changes.slice(0, 4).map((c, i) => (
                        <li key={i}>{describeChange(c, availability)}</li>
                      ))}
                      {r.changes.length > 4 && <li>and {r.changes.length - 4} more</li>}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
