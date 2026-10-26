import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbExecutor } from "../db/connect";
import { sessions, users } from "../db/schema";
import { generateToken, sha256 } from "../lib/crypto";
import { AppError, invalid, isUniqueViolation } from "../lib/errors";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Verified against when the email does not exist, keeping login timing similar.
let dummyHash: Promise<string> | undefined;

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.email("Enter a valid email.").trim().toLowerCase().max(254),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password.").max(200),
});

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export async function signup(db: DbExecutor, input: unknown): Promise<SessionUser> {
  const data = signupSchema.parse(input);
  const passwordHash = await hash(data.password);
  try {
    const [user] = await db
      .insert(users)
      .values({ name: data.name, email: data.email, passwordHash })
      .returning({ id: users.id, name: users.name, email: users.email });
    return user;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("conflict", "An account with this email already exists.");
    throw e;
  }
}

export async function authenticate(db: DbExecutor, input: unknown): Promise<SessionUser> {
  const data = loginSchema.parse(input);
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${data.email}`)
    .limit(1);
  dummyHash ??= hash("gatherly-dummy-password");
  const ok = await verify(user?.passwordHash ?? (await dummyHash), data.password).catch(() => false);
  if (!user || !ok) throw new AppError("unauthenticated", "Incorrect email or password.");
  return { id: user.id, name: user.name, email: user.email };
}

export async function createSession(db: DbExecutor, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  // Opportunistic cleanup of this user's expired sessions.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  return { token, expiresAt };
}

/** Returns the user for a valid, unexpired session token. */
export async function validateSession(db: DbExecutor, token: string): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function invalidateSession(db: DbExecutor, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function invalidateAllSessions(db: DbExecutor, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function changePassword(
  db: DbExecutor,
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !(await verify(user.passwordHash, input.currentPassword).catch(() => false))) {
    throw invalid("Your current password is incorrect.");
  }
  const parsed = signupSchema.shape.password.safeParse(input.newPassword);
  if (!parsed.success) throw invalid(parsed.error.issues[0].message);
  await db.update(users).set({ passwordHash: await hash(parsed.data) }).where(eq(users.id, userId));
  await invalidateAllSessions(db, userId);
}
