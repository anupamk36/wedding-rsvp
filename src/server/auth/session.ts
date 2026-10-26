import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getDb } from "../db/client";
import { createSession, invalidateSession, validateSession, type SessionUser } from "../modules/identity";

// Secure whenever the app is served over HTTPS. A production build served over plain
// HTTP (e.g. a local container at http://localhost:3000) needs a non-Secure cookie,
// or browsers would drop it.
const secure = process.env.APP_URL ? process.env.APP_URL.startsWith("https://") : process.env.NODE_ENV === "production";
// __Host- cookies must be Secure, path=/ and host-only, which pins them to this origin.
export const SESSION_COOKIE = secure ? "__Host-gatherly_session" : "gatherly_session";

/** Current user for this request, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // Session checks compare against the current time, so they only run at request time
  // (not in the per-session App Shell prefetch).
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSession(await getDb(), token);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Only callable from Server Actions and Route Handlers. */
export async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(await getDb(), userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(await getDb(), token);
  store.delete(SESSION_COOKIE);
}
