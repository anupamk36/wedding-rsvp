import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { PageHeader, Skeleton } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { NewEventForm } from "./new-event-form";

export const metadata: Metadata = { title: "New event" };

export default function NewEventPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <PageHeader title="Create an event" description="Pick a starting point. Everything a template adds can be edited or removed later." />
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Gate />
        </Suspense>
      </main>
    </>
  );
}

async function Gate() {
  await requireUser();
  return <NewEventForm />;
}
