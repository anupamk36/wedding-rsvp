"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import { EVENT_TYPE_META } from "@/domain/event-types";

export interface EventCardView {
  id: string;
  name: string;
  typeKey: keyof typeof EVENT_TYPE_META;
  typeLabel: string;
  live: boolean;
  when: string;
  replied: string;
  pct: number;
  facts: string[];
}

const tabClass = (on: boolean) =>
  cx(
    "inline-flex h-11 items-center gap-1.5 rounded-full border-[1.5px] px-4 text-sm font-semibold",
    on ? "border-text bg-text text-bg" : "border-border-strong bg-surface text-text hover:border-text",
  );

/** Event cards with client-side type filter tabs. */
export function EventCards({ events }: { events: EventCardView[] }) {
  const [type, setType] = useState<EventCardView["typeKey"] | null>(null);
  const types = [...new Set(events.map((e) => e.typeKey))];
  const shown = type ? events.filter((e) => e.typeKey === type) : events;
  return (
    <>
      {types.length > 1 && (
        <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={type === null} onClick={() => setType(null)} className={tabClass(type === null)}>
            All <span className="tabular">{events.length}</span>
          </button>
          {types.map((t) => (
            <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={tabClass(type === t)}>
              {EVENT_TYPE_META[t].plural}
            </button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-[18px]">
        {shown.map((e) => {
          const meta = EVENT_TYPE_META[e.typeKey];
          return (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="flex h-full flex-col gap-3.5 rounded-[18px] border border-border bg-surface p-5 hover:border-border-strong">
                <div className="flex items-center justify-between gap-2.5">
                  <span className={cx("inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold", meta.badge)}>
                    <Icon path={meta.icon} size={16} strokeWidth={2} />
                    {e.typeLabel}
                  </span>
                  <span className={cx("inline-flex items-center gap-1.5 text-[13px] font-bold", e.live ? "text-success" : "text-muted")}>
                    <span aria-hidden="true" className={cx("size-[7px] rounded-full", e.live ? "bg-success" : "bg-muted")} />
                    {e.live ? "Live" : "Draft"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <h2 className="font-display text-[22px] leading-tight font-semibold">{e.name}</h2>
                  <p className="text-sm text-muted">{e.when}</p>
                </div>
                <div className="mt-auto flex flex-col gap-1.5">
                  <div className="flex justify-between text-[13.5px]">
                    <span className="font-semibold">{e.replied}</span>
                    <span className="text-muted tabular">{e.pct}%</span>
                  </div>
                  <div role="img" aria-label={`${e.replied}, ${e.pct}%`} className="h-2 overflow-hidden rounded-full bg-border">
                    <div className={cx("h-full", meta.bar)} style={{ width: `${e.pct}%` }} />
                  </div>
                </div>
                {e.facts.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {e.facts.map((f) => (
                      <li key={f} className="inline-flex h-[30px] items-center rounded-[10px] bg-surface-2 px-3 text-[13px] font-semibold">
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
