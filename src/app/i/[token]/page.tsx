import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { InvitationHero } from "@/components/rsvp/invitation-hero";
import { RsvpFlow } from "@/components/rsvp/rsvp-flow";
import { Skeleton } from "@/components/ui";
import { getDb, type Database } from "@/server/db/client";
import { AppError } from "@/server/lib/errors";
import { resolveInvitationToken } from "@/server/modules/invitations";
import { enforceRateLimit, LIMITS } from "@/server/modules/rate-limit";
import { getRsvpView } from "@/server/modules/rsvp";

export const metadata: Metadata = {
  title: "Your invitation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function InvitationPage({ params, searchParams }: PageProps<"/i/[token]">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 sm:px-4 sm:py-10">
      <Suspense
        fallback={
          <div className="space-y-4 p-4" role="status" aria-busy="true" aria-label="Loading your invitation">
            <Skeleton className="h-64" />
            <Skeleton className="h-40" />
          </div>
        }
      >
        <Invitation params={params} searchParams={searchParams} />
      </Suspense>
      <p className="px-5 py-8 text-center text-xs text-muted">
        This link is personal to your invitation — please don&rsquo;t forward it. Your answers are only shared with the hosts.
      </p>
    </main>
  );
}

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <div className="m-4 rounded-[20px] border border-border bg-surface px-6 py-12 text-center sm:m-0">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}

async function Invitation({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, sp, h] = await Promise.all([params, searchParams, headers()]);
  await connection();
  const db = await getDb();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const result = await loadInvitation(db, token, ip);
  if (result === "rate_limited") {
    return <Problem title="Please wait a moment" body="We've had a lot of requests from your connection. Try again in a minute." />;
  }
  if (!result) {
    return (
      <Problem
        title="This link isn't working"
        body="The invitation may have been replaced with a new link, or it has been cancelled. Please ask the hosts to send you the latest link."
      />
    );
  }
  const view = result;
  return (
    <div className={`accent-${view.event.settings.theme.accent}`}>
      <RsvpFlow
        key={view.invitation.responseVersion}
        view={view}
        endpoint={`/api/public/invitations/${token}/response`}
        mode="guest"
        justSaved={sp.saved === "1"}
        invitation={<InvitationHero event={view.event} activities={view.activities} greeting={greetingFor(view.invitation.label, view.people.length)} />}
      />
    </div>
  );
}

async function loadInvitation(db: Database, token: string, ip: string) {
  try {
    await enforceRateLimit(db, `public:PAGE:${ip}`, LIMITS.publicRead);
    const resolved = await resolveInvitationToken(db, token);
    if (!resolved) {
      await enforceRateLimit(db, `token-miss:${ip}`, LIMITS.tokenMiss);
      return null;
    }
    return await getRsvpView(db, resolved);
  } catch (e) {
    if (e instanceof AppError && e.code === "rate_limited") return "rate_limited" as const;
    throw e;
  }
}

/** "Dear Asha", or "For the Sharma family · 4 people" for households. */
function greetingFor(label: string, people: number): string {
  const base = /^the\s/i.test(label) ? `For ${label.replace(/^the/i, "the")}` : `Dear ${label}`;
  return people > 1 ? `${base} · ${people} people` : base;
}
