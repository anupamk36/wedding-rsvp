import { ATTENDANCE_LABELS } from "@/domain/settings";
import { Badge, type Tone } from "./ui";

type Attendance = "attending" | "not_attending" | "maybe" | "unanswered" | "not_invited";

const ATTENDANCE_TONE: Record<Attendance, Tone> = {
  attending: "success",
  maybe: "warning",
  not_attending: "neutral",
  unanswered: "info",
  not_invited: "neutral",
};

export function attendanceLabel(status: Attendance, availability = false): string {
  if (status === "unanswered") return "No answer";
  if (status === "not_invited") return "—";
  return ATTENDANCE_LABELS[availability ? "availability" : "standard"][status];
}

export function AttendanceBadge({ status, availability }: { status: Attendance; availability?: boolean }) {
  if (status === "not_invited") return <span className="text-muted">—</span>;
  return <Badge tone={ATTENDANCE_TONE[status]}>{attendanceLabel(status, availability)}</Badge>;
}

const RESPONSE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Awaiting reply", tone: "info" },
  submitted: { label: "Responded", tone: "success" },
  updated: { label: "Updated", tone: "success" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export function ResponseBadge({ status }: { status: string | null }) {
  if (!status) return <Badge>Not invited</Badge>;
  const r = RESPONSE[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={r.tone}>{r.label}</Badge>;
}

const INVITATION: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Not sent", tone: "neutral" },
  sent: { label: "Sent", tone: "brand" },
  delivered: { label: "Delivered", tone: "brand" },
  failed: { label: "Failed", tone: "danger" },
  revoked: { label: "Revoked", tone: "danger" },
};

export function InvitationBadge({ status }: { status: string }) {
  const r = INVITATION[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={r.tone}>{r.label}</Badge>;
}
