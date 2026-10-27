"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, cx } from "./ui";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: unknown;
}

type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  disabled,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "ghost" | "link" | "danger";
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending || disabled} className={className} aria-busy={pending}>
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
        {state.error}
      </div>
    );
  }
  if (state.message) {
    return (
      <div role="status" className="rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success-ink">
        {state.message}
      </div>
    );
  }
  return null;
}

/**
 * Form bound to a Server Action with inline success/error feedback.
 * `resetOnSuccess` clears inputs after a successful create.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  render,
  id,
  confirm,
}: {
  id?: string;
  /** Ask before submitting (e.g. before emailing many people). */
  confirm?: string;
  action: FormAction;
  children?: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
  render?: (state: ActionState) => ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const last = useRef(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
  }, [state, resetOnSuccess, onSuccess]);
  return (
    <form
      id={id}
      ref={ref}
      action={formAction}
      className={cx("space-y-4", className)}
      onSubmit={confirm ? (e) => !window.confirm(confirm) && e.preventDefault() : undefined}
    >
      <FormMessage state={state} />
      {children}
      {render?.(state)}
    </form>
  );
}

/** A one-click action (no fields) with an optional confirmation prompt. */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "secondary",
  size = "sm",
  pendingText,
}: {
  action: () => Promise<void>;
  children: ReactNode;
  confirm?: string;
  variant?: "primary" | "secondary" | "ghost" | "link" | "danger";
  size?: "sm" | "md";
  pendingText?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <SubmitButton variant={variant} size={size} pendingText={pendingText ?? "Working…"}>
        {children}
      </SubmitButton>
    </form>
  );
}

export function CopyButton({ text, label = "Copy link", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("Copy this link:", text);
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/** Disclosure used for inline create/edit forms. */
export function Disclosure({
  summary,
  children,
  defaultOpen,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={cx("group rounded-[18px] border border-border bg-surface", className)}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 font-semibold [&::-webkit-details-marker]:hidden">
        {summary}
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-border px-5 py-4">{children}</div>
    </details>
  );
}
