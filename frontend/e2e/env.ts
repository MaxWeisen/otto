// Ports and database for the end-to-end stack. They are kept apart from the
// regular development servers so both can run at once.
export const E2E_FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT ?? 4200);
export const E2E_BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT ?? 3533);
export const E2E_VPIC_PORT = Number(process.env.E2E_VPIC_PORT ?? 4390);

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://dev_user:dev_password@localhost:5532/otto_test?sslmode=disable";

export const E2E_STORAGE_STATE = "e2e/.auth/user.json";

/** The google_sub that marks the user these tests create and remove. */
export const E2E_GOOGLE_SUB = "e2e-playwright-user";
