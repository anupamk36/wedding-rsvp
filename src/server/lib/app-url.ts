/**
 * Public origin used for invitation links, emails and cookie security.
 * An explicit APP_URL always wins. On Vercel it falls back to the project's
 * production domain (which follows custom domains) or the deployment's own URL
 * for previews, so every deployment builds links that point at itself.
 */
export function getAppUrl(env: Record<string, string | undefined> = process.env): string | null {
  const explicit = env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const host =
    env.VERCEL_ENV === "production"
      ? env.VERCEL_PROJECT_PRODUCTION_URL
      : env.VERCEL_BRANCH_URL || env.VERCEL_URL;
  return host ? `https://${host}` : null;
}

export function appUrlOrLocal(): string {
  return getAppUrl() ?? "http://localhost:3000";
}
