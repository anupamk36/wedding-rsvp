"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { cx } from "@/components/ui";

export function EventNavLinks({ base, items }: { base: string; items: { href: string; label: string; icon: IconName }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Event">
      <ul className="-mx-4 flex gap-0.5 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {items.map((item) => {
          const href = `${base}${item.href}`;
          const active = item.href === "" ? pathname === base : pathname.startsWith(href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-11 items-center gap-3 rounded-[10px] px-3 text-[14.5px] whitespace-nowrap",
                  active ? "bg-brand-soft font-bold text-brand-ink" : "font-medium text-muted hover:bg-border/60 hover:text-text",
                )}
              >
                <Icon name={item.icon} className="hidden shrink-0 lg:block" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
