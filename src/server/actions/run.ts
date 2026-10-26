import "server-only";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Arbitrary result data for the client (e.g. import results). */
  data?: unknown;
}

/** Converts expected failures into form state; unexpected errors are logged and genericised. */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    if (isRedirectOrNotFound(e)) throw e;
    if (e instanceof AppError) return { error: e.message };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const key = issue.path.join(".");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { error: e.issues[0]?.message ?? "Please check the form.", fieldErrors };
    }
    console.error("[action] unhandled error", e);
    return { error: "Something went wrong. Please try again." };
  }
}

function isRedirectOrNotFound(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}

// FormData helpers -----------------------------------------------------------

export const str = (fd: FormData, key: string): string => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};
export const optStr = (fd: FormData, key: string): string | null => str(fd, key).trim() || null;
/** True if any value for `key` is "on"/"true" (supports a hidden "false" fallback before a checkbox). */
export const bool = (fd: FormData, key: string): boolean => fd.getAll(key).some((v) => v === "on" || v === "true");
export const strs = (fd: FormData, key: string): string[] =>
  fd.getAll(key).filter((v): v is string => typeof v === "string" && v !== "");
export const num = (fd: FormData, key: string): number | null => {
  const v = str(fd, key).trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
