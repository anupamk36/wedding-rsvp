export type ErrorCode =
  | "validation_error"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "rsvp_closed";

const STATUS: Record<ErrorCode, number> = {
  validation_error: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  rsvp_closed: 403,
};

/** Expected, user-facing failure. Anything else is treated as an internal error. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

export const notFound = (what = "Resource") => new AppError("not_found", `${what} not found.`);
export const forbidden = (message = "You do not have permission to do that.") =>
  new AppError("forbidden", message);
export const conflict = (message: string, details?: unknown) =>
  new AppError("conflict", message, details);
export const invalid = (message: string, details?: unknown) =>
  new AppError("validation_error", message, details);

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = findPgError(error);
  return !!e && e.code === "23505" && (!constraint || e.constraint === constraint);
}

function findPgError(error: unknown): { code?: string; constraint?: string } | undefined {
  let current: unknown = error;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    const c = current as { code?: unknown; constraint?: string; cause?: unknown };
    if (typeof c.code === "string" && /^[0-9A-Z]{5}$/.test(c.code)) return c as never;
    current = c.cause;
  }
  return undefined;
}
