import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/server/auth/session";
import { logoutAction } from "@/server/actions/auth";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/login" className="flex h-11 items-center px-2 text-sm font-semibold text-brand">
        Sign in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-brand-contrast">
        {initials(user.name)}
      </span>
      <span className="hidden text-sm font-semibold sm:inline" title={user.email}>
        {user.name}
      </span>
      <form action={logoutAction}>
        <button type="submit" className="flex h-11 items-center rounded-[10px] px-3 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text">
          Sign out
        </button>
      </form>
    </div>
  );
}

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur print:hidden">
      <div className="mx-auto flex h-16 max-w-[1160px] items-center gap-4 px-4 sm:px-6">
        <Link href="/dashboard" className="font-display text-2xl font-semibold tracking-tight text-brand-ink">
          Gatherly
        </Link>
        <div className="min-w-0 flex-1">{children}</div>
        <Suspense fallback={<span className="h-9 w-24" />}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}
