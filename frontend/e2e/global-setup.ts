import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { removeStaleTestUsers, withDb } from "./db";
import {
  E2E_DATABASE_URL,
  E2E_GOOGLE_SUB_PREFIX,
  E2E_STORAGE_STATE,
} from "./env";

/**
 * Migrates the end-to-end database, creates a signed-in test user and saves
 * its session cookie for the browser, standing in for Google sign-in.
 */
export default async function globalSetup() {
  await withDb(async () => {});

  execFileSync(
    "goose",
    ["-dir", "../backend/migrations", "postgres", E2E_DATABASE_URL, "up"],
    { stdio: "inherit" },
  );

  await removeStaleTestUsers();

  const googleSub = `${E2E_GOOGLE_SUB_PREFIX}${randomBytes(6).toString("hex")}`;
  process.env.E2E_GOOGLE_SUB = googleSub;

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  await withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (google_sub, email, name)
       VALUES ($1, 'e2e@example.invalid', 'E2E Tester')
       RETURNING id`,
      [googleSub],
    );

    await db.query(
      `INSERT INTO sessions (user_id, token, expires_at)
       VALUES ($1, $2, now() + interval '1 day')`,
      [rows[0].id, tokenHash],
    );
  });

  mkdirSync(dirname(E2E_STORAGE_STATE), { recursive: true });
  writeFileSync(
    E2E_STORAGE_STATE,
    JSON.stringify({
      cookies: [
        {
          name: "otto_session_token",
          value: token,
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    }),
  );
}
