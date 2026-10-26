"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function EventNavLinks({ base, items, role }: { base: string; items: { href: string; label: string }[]; role: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Event" className="lg:w-52 lg:shrink-0 print:hidden">
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:sticky lg:top-20">
        {items.map((item) => {
          const href = `${base}${item.href}`;
          const active = item.href === "" ? pathname === base : pathname.startsWith(href);
          return (
            <li key={item.href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "block whitespace-nowrap rounded-lg px-3 py-2 text-sm",
                  active ? "bg-brand-soft font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {role !== "owner" && <p className="mt-3 hidden px-3 text-xs text-muted lg:block">You have {role} access.</p>}
    </nav>
  );
}
