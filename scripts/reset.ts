// Development only: drops every table and re-applies migrations.
import "./env";
import { rm } from "node:fs/promises";
import path from "node:path";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database.");
  const url = process.env.DATABASE_URL;
  if (url) {
    if (!/localhost|127\.0\.0\.1/.test(url) && process.env.FORCE_RESET !== "true") {
      throw new Error("DATABASE_URL is not local. Set FORCE_RESET=true if you really mean it.");
    }
    const { Client } = await import("pg");
    const client = new Client({ connectionString: url });
    await client.connect();
    await client.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
    await client.end();
  } else {
    await rm(process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite"), { recursive: true, force: true });
  }
  await import("./migrate");
  console.log("Database reset.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
