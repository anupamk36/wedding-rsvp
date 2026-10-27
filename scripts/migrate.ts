// Applies pending migrations from ./drizzle. Uses DATABASE_URL when set,
// otherwise the local PGlite database (which migrates itself on open).
import "./env";
import { createDatabase, MIGRATIONS_FOLDER } from "../src/server/db/connect";

async function main() {
  // Prefer a direct connection for DDL; pooled endpoints (e.g. Neon's PgBouncer) can break migrations.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
    await pool.end();
    console.log("Migrations applied (PostgreSQL).");
  } else {
    await createDatabase(process.env);
    console.log("Migrations applied (PGlite, .data/pglite).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
