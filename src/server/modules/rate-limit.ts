import { sql } from "drizzle-orm";
import type { DbExecutor } from "../db/connect";
import { rateLimits } from "../db/schema";
import { sha256 } from "../lib/crypto";
import { AppError } from "../lib/errors";

/**
 * Fixed-window counter stored in Postgres so limits hold across instances.
 * Keys are hashed so raw IP addresses are not stored.
 */
export async function consumeRateLimit(
  db: DbExecutor,
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<{ allowed: boolean; remaining: number }> {
  if (process.env.RATE_LIMIT_DISABLED === "true") return { allowed: true, remaining: limit };
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const hashedKey = sha256(key);
  const [row] = await db
    .insert(rateLimits)
    .values({ key: hashedKey, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} = excluded.window_start then ${rateLimits.count} + 1 else 1 end`,
        windowStart: sql`excluded.window_start`,
      },
    })
    .returning({ count: rateLimits.count });
  return { allowed: row.count <= limit, remaining: Math.max(0, limit - row.count) };
}

export async function enforceRateLimit(
  db: DbExecutor,
  key: string,
  opts: { limit: number; windowSeconds: number },
): Promise<void> {
  const { allowed } = await consumeRateLimit(db, key, opts);
  if (!allowed) throw new AppError("rate_limited", "Too many requests. Please wait a moment and try again.");
}

export const LIMITS = {
  publicRead: { limit: 120, windowSeconds: 60 },
  publicWrite: { limit: 20, windowSeconds: 60 },
  tokenMiss: { limit: 20, windowSeconds: 600 },
  login: { limit: 10, windowSeconds: 600 },
  signup: { limit: 5, windowSeconds: 3600 },
} as const;
