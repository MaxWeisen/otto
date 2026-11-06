## Getting Started

See [Develop Locally](../README.md#develop-locally) in the root README to set up Postgres, the backend and the environment, then run `pnpm dev` from the repo root to start everything together.
To run only the frontend, run `pnpm dev` here.

Open [http://localhost:4000](http://localhost:4000) with your browser to see the result.

## Environment

Set these in `frontend/.env.local`.

- `NEXT_PUBLIC_API_URL` - base URL of the backend API, used for sign-in, logout and every server-side API call, including the vehicles pages, their maintenance records and the `/api/vpic` route handlers that proxy vehicle data lookups.
  A 401 from the backend sends the visitor to the login page.
- `COOKIE_DOMAIN` - optional; set it to the same value as the backend's `COOKIE_DOMAIN` so logout clears the `otto_session_token` cookie on that domain.
  Leave it unset when the backend does not set a cookie domain.

## Testing

Run `pnpm test` for the Vitest unit and component tests, `pnpm test:watch` to rerun them on change, or `pnpm test:e2e` for the Playwright end-to-end tests.
Unit and component tests live in `test/`, mirroring the source path of the file they cover, and the Playwright tests live in `e2e/`.
See the [root README](../README.md#frontend) for what the end-to-end tests need.

## Formatting

Run `pnpm format` to apply Prettier, or `pnpm format:check` to verify formatting.
Shadcn-generated components in `components/ui/` are listed in `.prettierignore` and are kept exactly as generated.
