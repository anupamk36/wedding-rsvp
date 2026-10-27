import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "link" | "danger";
type Size = "sm" | "md" | "lg";

// Every size keeps a 44px minimum touch target; "sm" only tightens padding and type.
const base =
  "inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-contrast hover:bg-brand-hover",
  secondary: "bg-surface text-text border-[1.5px] border-border-strong hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  link: "text-brand hover:underline underline-offset-4",
  danger: "bg-danger text-white hover:opacity-90 dark:text-bg",
};
const sizes: Record<Size, string> = {
  sm: "h-11 rounded-xl px-3.5 text-sm",
  md: "h-11 rounded-xl px-4 text-[14.5px]",
  lg: "h-13 rounded-[14px] px-6 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cx(base, variants[variant], sizes[size], variant === "link" && "px-1", className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-[18px] border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 className="font-display text-[19px] font-semibold leading-snug">{title}</h2>
        {description && <p className="mt-0.5 text-[13.5px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Small uppercase section label used above cards and groups. */
export function Eyebrow({ children, className, as: Tag = "p" }: { children: ReactNode; className?: string; as?: "p" | "h2" | "h3" | "span" }) {
  return <Tag className={cx("text-xs font-bold uppercase tracking-[0.1em] text-brand", className)}>{children}</Tag>;
}

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  brand: "bg-brand-soft text-brand-ink",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info-ink",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-[26px] items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const statValueTone: Partial<Record<Tone, string>> = {
  success: "text-success",
  warning: "text-warning",
  brand: "text-brand",
  info: "text-info-ink",
};

export function Stat({ label, value, sub, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; href?: string }) {
  const inner = (
    <>
      <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={cx("mt-1.5 font-display text-[28px] font-semibold leading-none tabular", tone && statValueTone[tone])}>{value}</div>
      {sub && <div className="mt-1.5 text-[13px] text-muted">{sub}</div>}
    </>
  );
  const cls = cx("block rounded-2xl border px-4 py-3.5", tone === "info" ? "border-transparent bg-info-soft" : "border-border bg-surface");
  return href ? (
    <Link href={href} className={cx(cls, "transition-colors hover:border-border-strong")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[18px] border-[1.5px] border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {description && <p className="mx-auto mt-1.5 max-w-md text-[15px] text-muted">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

// Selection chips ---------------------------------------------------------------

export function chipClass(on: boolean, className?: string) {
  return cx(
    "inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-sm transition-colors",
    on ? "border-brand bg-brand-soft font-bold text-brand-ink" : "border-border-strong bg-surface font-medium text-text hover:border-brand",
    className,
  );
}

/** Toggle chip. Selection is announced with aria-pressed and shown with a check, not colour alone. */
export function Chip({ on, children, className, ...props }: ComponentProps<"button"> & { on: boolean }) {
  return (
    <button type="button" aria-pressed={on} className={chipClass(on, className)} {...props}>
      {on && <span aria-hidden>✓</span>}
      {children}
    </button>
  );
}

// Form controls ---------------------------------------------------------------

export const inputClass =
  "block w-full min-h-12 rounded-xl border-[1.5px] border-border-strong bg-surface px-3.5 py-2.5 text-[15px] text-text placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputClass, "min-h-24 leading-normal", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(inputClass, "pr-8", className)} {...props} />;
}

export function Checkbox({ label, description, className, ...props }: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cx("flex min-h-11 cursor-pointer items-start gap-3 py-2", className)}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" {...props} />
      <span className="text-[15px] leading-snug">
        <span className="font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-[13.5px] text-muted">{description}</span>}
      </span>
    </label>
  );
}

export const tableClass = "w-full text-[14.5px]";
export const thClass =
  "bg-surface-2 px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.08em] text-muted whitespace-nowrap";
export const tdClass = "px-4 py-3.5 align-middle";

export function TableWrap({ children }: { children: ReactNode }) {
  // Rounds itself when it is the first/last child of a Card so the header fill stays inside the corners.
  return <div className="overflow-x-auto first:rounded-t-[17px] last:rounded-b-[17px]">{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-[18px]" />
    </div>
  );
}
