import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/server/auth/session";
import { logoutAction } from "@/server/actions/auth";

async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/login" className="text-sm font-medium text-brand">
        Sign in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-muted sm:inline" title={user.email}>
        {user.name}
      </span>
      <form action={logoutAction}>
        <button type="submit" className="rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text">
          Sign out
        </button>
      </form>
    </div>
  );
}

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/dashboard" className="font-display text-lg font-semibold tracking-tight">
          Gatherly
        </Link>
        <div className="min-w-0 flex-1">{children}</div>
        <Suspense fallback={<span className="h-5 w-16" />}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}
