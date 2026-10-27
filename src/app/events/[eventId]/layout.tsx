import Link from "next/link";
import { Suspense } from "react";
import type { IconName } from "@/components/icons";
import { Skeleton } from "@/components/ui";
import { EVENT_TYPE_META, eventTypeKey } from "@/domain/event-types";
import { formatDateRange } from "@/lib/dates";
import { logoutAction } from "@/server/actions/auth";
import { getEventContext } from "./context";
import { EventNavLinks } from "./nav-links";

export default function EventLayout({ children, params }: LayoutProps<"/events/[eventId]">) {
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <Suspense fallback={<SidebarSkeleton />}>
        <EventSidebar params={params} />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 pt-6 pb-12 sm:px-6 lg:px-10 lg:pt-8">{children}</main>
    </div>
  );
}

const asideClass =
  "flex flex-col gap-3 border-b border-border bg-surface-2 px-4 pt-3 pb-2 lg:sticky lg:top-0 lg:h-dvh lg:w-[248px] lg:shrink-0 lg:gap-6 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:py-6 print:hidden";

function Wordmark() {
  return (
    <Link href="/dashboard" className="px-3 font-display text-2xl font-semibold tracking-tight text-brand-ink">
      Gatherly
    </Link>
  );
}

function SidebarSkeleton() {
  return (
    <aside className={asideClass}>
      <Wordmark />
      <Skeleton className="h-11 w-full lg:h-96" />
    </aside>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

async function EventSidebar({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event, settings, role, user } = await getEventContext(eventId);
  const f = settings.features;
  const items: { href: string; label: string; icon: IconName }[] = [
    { href: "", label: "Overview", icon: "overview" },
    { href: "/schedule", label: settings.availabilityMode ? "Time slots" : "Schedule", icon: "schedule" },
    { href: "/guests", label: "Guests", icon: "guests" },
    { href: "/invitations", label: "Invitations", icon: "invitations" },
    { href: "/responses", label: "Responses", icon: "responses" },
    ...(f.accommodation ? [{ href: "/accommodation", label: "Accommodation", icon: "accommodation" as const }] : []),
    ...(f.meals ? [{ href: "/meals", label: "Meals", icon: "meals" as const }] : []),
    ...(f.transport ? [{ href: "/transport", label: "Transport", icon: "transport" as const }] : []),
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ];
  const type = EVENT_TYPE_META[eventTypeKey(event.eventType, settings.availabilityMode)].label;
  const dates = formatDateRange(event.startDate, event.endDate, { weekday: false, year: false });
  const roleLabel = role[0]!.toUpperCase() + role.slice(1);
  const signOut = (
    <form action={logoutAction}>
      <button type="submit" className="flex h-11 items-center rounded-[10px] px-3 text-sm font-semibold whitespace-nowrap text-muted hover:bg-border/60 hover:text-text">
        Sign out
      </button>
    </form>
  );

  return (
    <aside className={asideClass}>
      <div className="flex items-center justify-between gap-3">
        <Wordmark />
        <div className="lg:hidden">{signOut}</div>
      </div>
      <div className="hidden flex-col gap-0.5 rounded-[14px] border border-border bg-surface px-3.5 py-3 lg:flex">
        <span className="text-xs font-semibold text-muted">Event</span>
        <span className="text-[15px] leading-snug font-bold">{event.name}</span>
        <span className="text-[13px] text-muted">
          {type} · {dates}
          {event.archivedAt ? " · Archived" : event.status === "draft" ? " · Draft" : ""}
        </span>
      </div>
      <EventNavLinks base={`/events/${eventId}`} items={items} />
      <div className="mt-auto hidden flex-col gap-2 lg:flex">
        <div className="flex items-center gap-2.5 px-3">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-brand-contrast">
            {initials(user.name)}
          </span>
          <span className="flex min-w-0 flex-col leading-snug">
            <span className="truncate text-sm font-semibold" title={user.email}>
              {user.name}
            </span>
            <span className="text-[12.5px] text-muted">{role === "owner" ? roleLabel : `${roleLabel} access`}</span>
          </span>
        </div>
        {signOut}
      </div>
    </aside>
  );
}
