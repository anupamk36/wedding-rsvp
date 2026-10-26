import "server-only";
import { createDatabase, type Database } from "./connect";

// One database handle per server process. In development the module can be
// re-evaluated on hot reload, so the handle is kept on globalThis.
const globalForDb = globalThis as unknown as { __gatherlyDb?: Promise<Database> };

export function getDb(): Promise<Database> {
  globalForDb.__gatherlyDb ??= createDatabase(process.env);
  return globalForDb.__gatherlyDb;
}

export type { Database, DbExecutor } from "./connect";
