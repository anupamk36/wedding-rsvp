// Presentational controls for the guest flow. Used only from client components.
import type { ReactNode } from "react";
import { cx } from "../ui";
import { initials } from "./logic";
import type { Status } from "./types";

const SELECTED: Record<Status, string> = {
  attending: "border-success bg-success text-on-status",
  maybe: "border-warning bg-warning text-on-status",
  not_attending: "border-decline bg-decline text-decline-contrast",
};

/**
 * One answer per person and activity. Native radios keep keyboard and screen
 * reader behaviour; the selected segment is filled and carries a check mark.
 */
export function StatusPicker({
  name,
  label,
  value,
  options,
  labels,
  onChange,
  disabledAttending,
}: {
  name: string;
  label: string;
  value: Status | undefined;
  options: Status[];
  labels: Record<Status, string>;
  onChange: (s: Status) => void;
  disabledAttending?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {options.map((o) => {
        const checked = value === o;
        return (
          <label key={o} className="relative min-w-0 flex-1">
            <input
              type="radio"
              name={name}
              value={o}
              checked={checked}
              disabled={o === "attending" && disabledAttending}
              onChange={() => onChange(o)}
              className="peer sr-only"
            />
            <span
              className={cx(
                "flex h-11 cursor-pointer items-center justify-center gap-1 rounded-[10px] border-[1.5px] px-1 text-center text-[13.5px] font-semibold leading-tight transition-colors",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand peer-disabled:cursor-not-allowed peer-disabled:opacity-40",
                checked ? SELECTED[o] : "border-border-strong bg-surface text-text hover:border-brand",
              )}
            >
              {checked && <span aria-hidden="true">✓</span>}
              {labels[o]}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, labelledBy }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={cx("relative h-8 w-[52px] shrink-0 rounded-full transition-colors", checked ? "bg-success" : "bg-border-strong")}
    >
      <span
        aria-hidden="true"
        className={cx("absolute top-[3px] left-[3px] size-[26px] rounded-full bg-white shadow-sm transition-transform", checked && "translate-x-5")}
      />
    </button>
  );
}

/** Counter with a "not sure" (null) state below the minimum. */
export function Stepper({
  value,
  onChange,
  labelledBy,
  min = 1,
  max = 20,
  unitLess,
  unitMore,
  emptyText = "Not sure",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  labelledBy: string;
  min?: number;
  max?: number;
  unitLess: string;
  unitMore: string;
  emptyText?: string;
}) {
  const btn =
    "flex size-11 items-center justify-center rounded-xl border-[1.5px] border-border-strong bg-surface text-[22px] font-semibold leading-none disabled:opacity-40";
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex items-center gap-2.5">
      <button type="button" className={btn} aria-label={unitLess} disabled={value == null} onClick={() => onChange(value == null || value <= min ? null : value - 1)}>
        −
      </button>
      <span aria-live="polite" className={cx("min-w-14 text-center", value == null ? "text-[13px] font-semibold text-muted" : "text-lg font-bold tabular")}>
        {value ?? emptyText}
      </span>
      <button type="button" className={btn} aria-label={unitMore} disabled={value != null && value >= max} onClick={() => onChange(value == null ? min : value + 1)}>
        +
      </button>
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full bg-brand font-semibold text-brand-contrast",
        size === "sm" ? "size-7 text-xs" : "size-8 text-xs",
      )}
    >
      {initials(name)}
    </span>
  );
}

export function StepHeader({
  steps,
  index,
  onBack,
  backLabel,
}: {
  steps: { id: string; label: string }[];
  index: number;
  onBack: () => void;
  backLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3.5 border-b border-border bg-surface px-5 pt-3.5 pb-4 sm:rounded-t-[20px]">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} aria-label={backLabel} className="-ml-2.5 flex size-11 items-center justify-center rounded-xl text-text hover:bg-surface-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>
        <span className="text-[13px] font-semibold text-muted">
          Step {index + 1} of {steps.length}
        </span>
      </div>
      <ol aria-label="Progress" className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((st, i) => (
          <li key={st.id}>
            <div className={cx("h-[5px] rounded-full", i <= index ? "bg-brand" : "bg-border")} />
            <span
              aria-current={i === index ? "step" : undefined}
              className={cx("mt-1.5 block truncate text-xs", i === index ? "font-bold text-text" : "text-muted")}
            >
              {st.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Sticky bottom bar; full-bleed on phones. */
export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("sticky bottom-0 z-10 border-t border-border bg-surface px-5 pt-3 pb-5 sm:rounded-b-[20px]", className)}>
      {children}
    </div>
  );
}

export const bigButton =
  "inline-flex h-[50px] items-center justify-center gap-2 rounded-[14px] px-[22px] text-base font-semibold transition-colors disabled:opacity-50";

export function ArrowRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Notice({ tone, children, action }: { tone: "info" | "warning" | "success" | "danger"; children: ReactNode; action?: ReactNode }) {
  const tones = {
    info: "bg-info-soft text-info-ink",
    warning: "bg-warning-soft text-warning-ink",
    success: "bg-success-soft text-success-ink",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <div className={cx("flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-[14px] leading-snug", tones[tone])}>
      <div>{children}</div>
      {action}
    </div>
  );
}
