import { getDb } from "./client.js";

/** Consistent standalone snapshot, including committed WAL pages. */
export function createDatabaseBackup(destination: string): void {
  getDb().exec(`VACUUM INTO '${destination.replace(/'/g, "''")}'`);
}
