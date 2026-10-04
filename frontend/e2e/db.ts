import { Client } from "pg";
import { E2E_DATABASE_URL, E2E_GOOGLE_SUB_PREFIX, e2eGoogleSub } from "./env";

/**
 * Runs fn with a connection to the end-to-end database. It refuses any
 * database other than otto_test so a misconfigured run never touches real
 * data.
 */
export async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const database = new URL(E2E_DATABASE_URL).pathname.slice(1);

  if (database !== "otto_test") {
    throw new Error(
      `E2E_DATABASE_URL must point at otto_test, not "${database}"`,
    );
  }

  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();

  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/** Removes the test user's vehicles, so each test starts from an empty list. */
export function clearVehicles(): Promise<void> {
  return withDb(async (db) => {
    await db.query(
      `DELETE FROM vehicles
       WHERE user_id IN (SELECT id FROM users WHERE google_sub = $1)`,
      [e2eGoogleSub()],
    );
  });
}

/** Removes this run's test user along with its sessions and vehicles. */
export function removeTestUser(): Promise<void> {
  return removeUsers("google_sub = $1", [e2eGoogleSub()]);
}

/** Removes test users that earlier, interrupted runs left behind. */
export function removeStaleTestUsers(): Promise<void> {
  return removeUsers(
    "google_sub LIKE $1 AND created_at < now() - interval '1 day'",
    [`${E2E_GOOGLE_SUB_PREFIX}%`],
  );
}

function removeUsers(condition: string, params: string[]): Promise<void> {
  return withDb(async (db) => {
    await db.query(
      `DELETE FROM sessions
       WHERE user_id IN (SELECT id FROM users WHERE ${condition})`,
      params,
    );
    await db.query(`DELETE FROM users WHERE ${condition}`, params);
  });
}
