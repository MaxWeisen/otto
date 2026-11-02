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

export type SeedVehicle = {
  year: number;
  make: string;
  model: string;
  trim?: string;
  vin?: string;
  nickname?: string;
  mileage?: number;
};

/**
 * The google_sub of a second user who signs in nowhere and only owns
 * vehicles, for checking that the test user cannot see them.
 */
function otherUserGoogleSub(): string {
  return `${e2eGoogleSub()}-other`;
}

/** Adds a vehicle to the test user's garage and returns its id. */
export function insertVehicle(vehicle: SeedVehicle): Promise<number> {
  return insertVehicleFor(e2eGoogleSub(), vehicle);
}

/** Adds a vehicle to the other user's garage and returns its id. */
export function insertOtherUsersVehicle(vehicle: SeedVehicle): Promise<number> {
  return withDb(async (db) => {
    await db.query(
      `INSERT INTO users (google_sub, email, name)
       VALUES ($1, 'e2e-other@example.invalid', 'E2E Other Tester')
       ON CONFLICT (google_sub) DO NOTHING`,
      [otherUserGoogleSub()],
    );

    return insertVehicleFor(otherUserGoogleSub(), vehicle);
  });
}

function insertVehicleFor(
  googleSub: string,
  vehicle: SeedVehicle,
): Promise<number> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO vehicles
         (user_id, year, make, model, trim, vin, nickname, mileage)
       SELECT id, $2, $3, $4, $5, $6, $7, $8 FROM users WHERE google_sub = $1
       RETURNING id`,
      [
        googleSub,
        vehicle.year,
        vehicle.make,
        vehicle.model,
        vehicle.trim ?? null,
        vehicle.vin ?? null,
        vehicle.nickname ?? null,
        vehicle.mileage ?? null,
      ],
    );

    return Number(rows[0].id);
  });
}

/** Reads a vehicle's stored fields, whoever owns it. */
export function findVehicle(id: number): Promise<SeedVehicle | undefined> {
  return withDb(async (db) => {
    const { rows } = await db.query<SeedVehicle>(
      `SELECT year, make, model, trim, vin, nickname, mileage
       FROM vehicles WHERE id = $1`,
      [id],
    );

    return rows[0];
  });
}

/**
 * Removes this run's test user and the other user along with their sessions
 * and vehicles.
 */
export function removeTestUser(): Promise<void> {
  return removeUsers("google_sub IN ($1, $2)", [
    e2eGoogleSub(),
    otherUserGoogleSub(),
  ]);
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
