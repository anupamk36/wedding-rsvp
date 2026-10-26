import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { Badge, Skeleton } from "@/components/ui";
import { getEventContext } from "./context";
import { EventNavLinks } from "./nav-links";

export default function EventLayout({ children, params }: LayoutProps<"/events/[eventId]">) {
  return (
    <>
      <AppHeader>
        <Suspense fallback={null}>
          <EventTitle params={params} />
        </Suspense>
      </AppHeader>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:py-8">
        <Suspense fallback={<Skeleton className="h-10 w-full lg:h-96 lg:w-52" />}>
          <EventNav params={params} />
        </Suspense>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}

async function EventTitle({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event } = await getEventContext(eventId);
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="text-muted">/</span>
      <span className="truncate font-medium">{event.name}</span>
      {event.archivedAt ? <Badge>Archived</Badge> : event.status === "draft" ? <Badge>Draft</Badge> : null}
    </div>
  );
}

async function EventNav({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { settings, role } = await getEventContext(eventId);
  const f = settings.features;
  const items = [
    { href: "", label: "Overview" },
    { href: "/schedule", label: settings.availabilityMode ? "Time slots" : "Schedule" },
    { href: "/guests", label: "Guests" },
    { href: "/invitations", label: "Invitations" },
    { href: "/responses", label: "Responses" },
    ...(f.accommodation ? [{ href: "/accommodation", label: "Accommodation" }] : []),
    ...(f.meals ? [{ href: "/meals", label: "Meals" }] : []),
    ...(f.transport ? [{ href: "/transport", label: "Transport" }] : []),
    { href: "/reports", label: "Reports" },
    { href: "/settings", label: "Settings" },
  ];
  return <EventNavLinks base={`/events/${eventId}`} items={items} role={role} />;
}
