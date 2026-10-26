import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { queryRows, type DbExecutor } from "../db/connect";
import { invitations, notificationJobs } from "../db/schema";
import { getEmailProvider, type EmailMessage } from "../adapters/email";
import { invitationUrl } from "./invitations";

const MAX_ATTEMPTS = 5;

export interface NotificationRequest {
  eventId: string | null;
  /** Re-enqueueing with the same key is a no-op, so retries never duplicate messages. */
  idempotencyKey: string;
  recipient: string;
  templateKey: "host_response" | "guest_confirmation" | "invitation";
  payload: Record<string, unknown>;
  scheduledAt?: Date;
}

export async function enqueueNotification(db: DbExecutor, req: NotificationRequest): Promise<void> {
  await db
    .insert(notificationJobs)
    .values({
      eventId: req.eventId,
      idempotencyKey: req.idempotencyKey,
      recipient: req.recipient,
      templateKey: req.templateKey,
      payload: req.payload,
      scheduledAt: req.scheduledAt ?? new Date(),
    })
    .onConflictDoNothing({ target: notificationJobs.idempotencyKey });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function appUrl(path: string) {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}

async function render(db: DbExecutor, job: typeof notificationJobs.$inferSelect): Promise<EmailMessage | null> {
  const p = job.payload as Record<string, string | number | boolean | undefined>;
  const eventName = String(p.eventName ?? "your event");
  const wrap = (body: string) =>
    `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1c1917">${body}<p style="color:#78716c;font-size:12px;margin-top:32px">Sent by Gatherly</p></div>`;

  if (job.templateKey === "host_response") {
    const url = appUrl(`/events/${p.eventId}/responses`);
    const verb = p.kind === "withdrawn" ? "withdrew their response" : p.kind === "updated" ? "updated their RSVP" : "responded";
    const subject = `${p.label} ${verb} — ${eventName}`;
    return {
      to: job.recipient,
      subject,
      text: `${p.label} ${verb} for ${eventName}.${p.late ? " This change arrived after the RSVP deadline." : ""}\n\nView responses: ${url}`,
      html: wrap(
        `<p><strong>${escapeHtml(String(p.label))}</strong> ${verb} for ${escapeHtml(eventName)}.</p>${
          p.late ? "<p>This change arrived after the RSVP deadline and is flagged for review.</p>" : ""
        }<p><a href="${url}">View responses</a></p>`,
      ),
    };
  }

  if (job.templateKey === "guest_confirmation" || job.templateKey === "invitation") {
    const [inv] = await db
      .select({ status: invitations.status, tokenCiphertext: invitations.tokenCiphertext })
      .from(invitations)
      .where(eq(invitations.id, String(p.invitationId)));
    if (!inv || inv.status === "revoked") return null;
    const url = invitationUrl(inv.tokenCiphertext);
    if (job.templateKey === "invitation") {
      const message = p.message ? String(p.message) : `You're invited to ${eventName}.`;
      return {
        to: job.recipient,
        subject: `You're invited: ${eventName}`,
        text: `${message}\n\nRespond here: ${url}\n\nThis link is personal to you. Please don't share it.`,
        html: wrap(
          `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p><p><a href="${url}" style="display:inline-block;background:#be123c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">View invitation &amp; RSVP</a></p><p style="font-size:13px;color:#57534e">This link is personal to you. Please don't share it.</p>`,
        ),
      };
    }
    const verb = p.kind === "withdrawn" ? "withdrawn" : "saved";
    return {
      to: job.recipient,
      subject: `Your RSVP for ${eventName} is ${verb}`,
      text: `Thanks! Your RSVP for ${eventName} has been ${verb}. You can review or change it here: ${url}`,
      html: wrap(
        `<p>Thanks! Your RSVP for <strong>${escapeHtml(eventName)}</strong> has been ${verb}.</p><p><a href="${url}">Review or change your response</a></p>`,
      ),
    };
  }
  return null;
}

/**
 * Claims due jobs and sends them. Safe to run concurrently: rows are claimed
 * with SKIP LOCKED, and failures are retried with backoff up to MAX_ATTEMPTS.
 */
export async function processDueNotifications(db: DbExecutor, limit = 25): Promise<{ sent: number; failed: number }> {
  // Release jobs stuck in "processing" (e.g. a crashed worker) after 10 minutes.
  await db
    .update(notificationJobs)
    .set({ status: "pending" })
    .where(and(eq(notificationJobs.status, "processing"), lte(notificationJobs.lockedAt, new Date(Date.now() - 10 * 60_000))));

  const claimed = await queryRows<{ id: string }>(db, sql`
    update notification_jobs set status = 'processing', locked_at = now(), attempt_count = attempt_count + 1
     where id in (
       select id from notification_jobs
        where status = 'pending' and scheduled_at <= now()
        order by scheduled_at
        limit ${limit}
        for update skip locked)
    returning id`);
  const ids = claimed.map((r) => r.id);
  if (!ids.length) return { sent: 0, failed: 0 };

  const jobs = await db.select().from(notificationJobs).where(inArray(notificationJobs.id, ids));
  const provider = getEmailProvider();
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const message = await render(db, job);
      if (message) await provider.send(message, { idempotencyKey: job.idempotencyKey });
      await db.update(notificationJobs).set({ status: "sent", sentAt: new Date(), lastError: null }).where(eq(notificationJobs.id, job.id));
      sent++;
    } catch (e) {
      failed++;
      const terminal = job.attemptCount >= MAX_ATTEMPTS;
      const backoffMs = Math.min(60 * 60_000, 2 ** job.attemptCount * 30_000);
      await db
        .update(notificationJobs)
        .set({
          status: terminal ? "failed" : "pending",
          scheduledAt: new Date(Date.now() + backoffMs),
          lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        })
        .where(eq(notificationJobs.id, job.id));
    }
  }
  return { sent, failed };
}

export async function notificationStats(db: DbExecutor, eventId: string) {
  const rows = await db
    .select({ status: notificationJobs.status, n: sql<number>`count(*)::int` })
    .from(notificationJobs)
    .where(eq(notificationJobs.eventId, eventId))
    .groupBy(notificationJobs.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<"pending" | "processing" | "sent" | "failed", number>>;
}
