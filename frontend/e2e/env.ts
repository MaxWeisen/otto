// Ports and database for the end-to-end stack. They are kept apart from the
// regular development servers so both can run at once.
export const E2E_FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT ?? 4200);
export const E2E_BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT ?? 3533);
export const E2E_VPIC_PORT = Number(process.env.E2E_VPIC_PORT ?? 4390);

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://dev_user:dev_password@localhost:5532/otto_test?sslmode=disable";

export const E2E_STORAGE_STATE = "e2e/.auth/user.json";

/** Marks the users end-to-end runs create, so leftovers can be found. */
export const E2E_GOOGLE_SUB_PREFIX = "e2e-playwright-";

/**
 * The google_sub of this run's test user. Global setup picks a unique one per
 * run, so runs from different checkouts can share otto_test, and the test
 * workers inherit it through the environment.
 */
export function e2eGoogleSub(): string {
  const sub = process.env.E2E_GOOGLE_SUB;

  if (!sub) {
    throw new Error("E2E_GOOGLE_SUB is not set; global setup did not run");
  }

  return sub;
}
