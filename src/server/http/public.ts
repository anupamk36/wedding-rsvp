import "server-only";
import type { DbExecutor } from "../db/connect";
import { AppError } from "../lib/errors";
import { resolveInvitationToken } from "../modules/invitations";
import { enforceRateLimit, LIMITS } from "../modules/rate-limit";

export async function resolveOrThrow(db: DbExecutor, token: string, ip: string) {
  const resolved = await resolveInvitationToken(db, token);
  if (!resolved) {
    // Unknown tokens are throttled harder to make guessing impractical.
    await enforceRateLimit(db, `token-miss:${ip}`, LIMITS.tokenMiss);
    throw new AppError("not_found", "This invitation link is no longer valid.");
  }
  return resolved;
}
