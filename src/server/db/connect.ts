import path from "node:path";
import type { SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
/** Either the root database or a transaction; services accept both. */
export type DbExecutor = Database;

/** Raw SQL returning rows; node-postgres and PGlite both expose `.rows`. */
export async function queryRows<T>(db: DbExecutor, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows: T[] };
  return result.rows;
}

/**
 * pg treats sslmode=require as verify-full today but will switch to libpq
 * semantics (no certificate check) in its next major. Pin the secure behaviour.
 */
export function normalizeSslMode(url: string): string {
  return url.replace(/([?&])sslmode=(prefer|require|verify-ca)(?=&|$)/, "$1sslmode=verify-full");
}

/** True for databases on this machine (or the local Docker network). */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "::1", "db"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

type Env = Record<string, string | undefined>;

/**
 * DATABASE_URL (postgres://...) selects node-postgres. Without it the app falls
 * back to embedded PGlite stored in PGLITE_DATA_DIR (default .data/pglite),
 * which is intended for local development only.
 */
export async function createDatabase(env: Env): Promise<Database> {
  const url = env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({
      connectionString: normalizeSslMode(url),
      max: Number(env.DATABASE_POOL_MAX ?? 10),
      ssl: env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
    return drizzle(pool, { schema }) as unknown as Database;
  }
  if (env.NODE_ENV === "production" && env.ALLOW_PGLITE_IN_PRODUCTION !== "true") {
    throw new Error("DATABASE_URL must be set in production.");
  }
  const dataDir = env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
  return createPgliteDatabase(dataDir, { migrate: true });
}

/** PGlite database; pass `memory://` for an in-memory instance (tests). */
export async function createPgliteDatabase(
  dataDir: string,
  { migrate }: { migrate: boolean },
): Promise<Database> {
  if (!dataDir.includes("://")) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dataDir, { recursive: true });
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema }) as unknown as Database;
  if (migrate) {
    const { migrate: runMigrations } = await import("drizzle-orm/pglite/migrator");
    await runMigrations(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  return db;
}
