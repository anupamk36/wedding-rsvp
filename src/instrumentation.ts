// Fail fast on a misconfigured production server instead of erroring on the
// first request that needs the missing value.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  const problems: string[] = [];
  if (!process.env.DATABASE_URL && process.env.ALLOW_PGLITE_IN_PRODUCTION !== "true") problems.push("DATABASE_URL is not set");
  if (!process.env.APP_SECRET || process.env.APP_SECRET.length < 32) problems.push("APP_SECRET must be at least 32 characters");
  if (!process.env.APP_URL) problems.push("APP_URL is not set");
  if (problems.length) throw new Error(`Gatherly cannot start: ${problems.join("; ")}.`);
}
