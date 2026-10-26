import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <p className="text-sm font-medium text-brand">404</p>
      <h1 className="mt-2 font-display text-2xl font-semibold">This page could not be found</h1>
      <p className="mt-2 text-sm text-muted">It may have been removed, or you may not have access to it.</p>
      <Link href="/dashboard" className="mt-6 text-sm font-medium text-brand hover:underline">
        Go to your events
      </Link>
    </main>
  );
}
