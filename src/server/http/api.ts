import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getDb, type Database } from "../db/client";
import { AppError } from "../lib/errors";
import { validateSession, type SessionUser } from "../modules/identity";
import { enforceRateLimit } from "../modules/rate-limit";
import { SESSION_COOKIE } from "../auth/session";

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: error.issues[0]?.message ?? "Invalid request.",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: { code: "validation_error", message: "Malformed JSON body." } }, { status: 400 });
  }
  console.error("[api] unhandled error", error);
  return NextResponse.json({ error: { code: "internal_error", message: "Something went wrong. Please try again." } }, { status: 500 });
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Reject cross-site requests that ride on the session cookie. */
function assertSameOrigin(req: NextRequest) {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new AppError("forbidden", "Cross-site request blocked.");
  if (origin && new URL(origin).host !== req.headers.get("host")) throw new AppError("forbidden", "Cross-site request blocked.");
}

type Ctx<P> = { params: Promise<P> };

/** Authenticated host API route: resolves the session user and maps errors to JSON. */
export function hostRoute<P>(fn: (args: { req: NextRequest; db: Database; user: SessionUser; params: P }) => Promise<Response | unknown>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      assertSameOrigin(req);
      const db = await getDb();
      const token = req.cookies.get(SESSION_COOKIE)?.value;
      const user = token ? await validateSession(db, token) : null;
      if (!user) throw new AppError("unauthenticated", "Sign in to continue.");
      const result = await fn({ req, db, user, params: await ctx.params });
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Public (token-authenticated) API route with per-IP rate limiting. */
export function publicRoute<P>(
  limits: { limit: number; windowSeconds: number },
  fn: (args: { req: NextRequest; db: Database; params: P; ip: string }) => Promise<Response | unknown>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      assertSameOrigin(req);
      const db = await getDb();
      const ip = clientIp(req);
      await enforceRateLimit(db, `public:${req.method}:${ip}`, limits);
      const result = await fn({ req, db, params: await ctx.params, ip });
      const res = result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
      res.headers.set("Cache-Control", "no-store");
      res.headers.set("Referrer-Policy", "no-referrer");
      return res;
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > 512 * 1024) throw new AppError("validation_error", "Request body too large.");
  return text ? JSON.parse(text) : {};
}
