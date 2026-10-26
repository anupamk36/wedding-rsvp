import { randomBytes } from "node:crypto";
import { createPgliteDatabase, MIGRATIONS_FOLDER, type Database } from "@/server/db/connect";
import * as schema from "@/server/db/schema";
import { signup } from "@/server/modules/identity";

/**
 * Fresh database with all migrations applied. Uses in-memory PGlite by
 * default; set TEST_DATABASE_URL to run against a real PostgreSQL server
 * (a throwaway database is created per call).
 */
export async function createTestDb(): Promise<Database> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) return createPgliteDatabase("memory://", { migrate: true });

  const { Client, Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const name = `gatherly_test_${randomBytes(6).toString("hex")}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 5 });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Database;
}

let counter = 0;
export async function createUser(db: Database, name = "Host") {
  counter++;
  return signup(db, { name, email: `user${counter}-${Date.now()}@example.com`, password: "correct horse battery" });
}
