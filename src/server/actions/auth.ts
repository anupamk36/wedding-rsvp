"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db/client";
import { endSession, startSession } from "../auth/session";
import { authenticate, signup } from "../modules/identity";
import { enforceRateLimit, LIMITS } from "../modules/rate-limit";
import { runAction, str, type ActionState } from "./run";

async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function signupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const db = await getDb();
    await enforceRateLimit(db, `signup:${await ip()}`, LIMITS.signup);
    const user = await signup(db, { name: str(fd, "name"), email: str(fd, "email"), password: str(fd, "password") });
    await startSession(user.id);
  });
  if (state.ok) redirect("/dashboard");
  return state;
}

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const db = await getDb();
    const email = str(fd, "email").trim().toLowerCase();
    await enforceRateLimit(db, `login:${await ip()}`, LIMITS.login);
    await enforceRateLimit(db, `login-email:${email}`, LIMITS.login);
    const user = await authenticate(db, { email, password: str(fd, "password") });
    await startSession(user.id);
  });
  if (state.ok) redirect(safeNext(str(fd, "next")));
  return state;
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
