Otto is your Automotive DIY Assistant.

Knowledge is based on your car or truck's factory service manual.
No guessing or hallucinations.
Only answers rooted in facts.

## Develop Locally

### Prerequisites

- Go 1.26.1 or newer, as pinned in `backend/go.mod`.
- Node.js 20.9 or newer, the minimum for Next.js 16.
- pnpm 9 or newer, since both lockfiles use lockfile version 9.
- Docker with Compose, for Postgres.
- [goose](https://github.com/pressly/goose) on the `PATH` for migrations: `go install github.com/pressly/goose/v3/cmd/goose@latest`.
- A Google OAuth client, described below.

### Install dependencies

The root package holds `concurrently`, which runs everything together, and the commitizen tooling behind `pnpm commit`; the frontend has its own install:

```sh
pnpm install
cd frontend && pnpm install
```

### Database

Start Postgres and apply the migrations in `backend/migrations` to `otto_db`:

```sh
docker compose up -d db
goose -dir backend/migrations postgres 'postgres://dev_user:dev_password@localhost:5532/otto_db?sslmode=disable' up
```

Postgres listens on port 5532, and the user, password and database name come from `docker-compose.yml`.
Run the goose command again whenever new migrations land.

### Google OAuth client

Sign-in only works with Google, so create an OAuth client in the [Google Cloud console](https://console.cloud.google.com/apis/credentials):

1. Configure the OAuth consent screen and add your Google account as a test user.
2. Create an OAuth client ID of type "Web application".
3. Add `http://localhost:3333/auth/google/callback` as an authorized redirect URI.
4. Copy the client ID and secret into `backend/.env`.

### Backend environment

The backend loads `backend/.env` when it starts, and variables already exported in the shell take precedence.
Start from the committed example and fill in the OAuth client:

```sh
cp backend/.env.example backend/.env
```

- `DB_URL` (required) - Postgres connection string for `otto_db`.
- `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` (required) - the Google OAuth client.
- `OAUTH_REDIRECT_URL` (required) - `http://localhost:3333/auth/google/callback`, matching the redirect URI registered with Google.
- `FRONTEND_URL` (required) - where the browser lands after signing in, `http://localhost:4000`.
- `ENV` - set to `development` locally so cookies are not marked `Secure`, since local development runs on plain HTTP.
- `PORT` - API port, defaults to `3333`.
- `COOKIE_DOMAIN` - domain for the session cookie; leave it empty locally.
- `VPIC_BASE_URL` - vehicle data server, defaults to `https://vpic.nhtsa.dot.gov/api`.

### Frontend environment

Next.js loads `frontend/.env.local`, which needs the API's URL:

```sh
NEXT_PUBLIC_API_URL=http://localhost:3333
```

`COOKIE_DOMAIN` can also be set here and must match the backend's value; leave it unset locally.

### Run it

From the repo root:

```sh
pnpm dev
```

This starts Postgres, the Go API and the Next.js frontend together.
Open http://localhost:4000 for the app; the API runs on http://localhost:3333 and answers `GET /healthz`.

## Backend

### Running tests

Unit tests need no database:

```sh
cd backend
go test ./...
```

Integration tests are tagged `integration` and run against a real Postgres named by `OTTO_TEST_DATABASE_URL`.
Without that variable they skip.
Each test runs in a transaction that is rolled back, and the goose migrations in `backend/migrations` are applied automatically.
To use the docker-compose Postgres, create a separate `otto_test` database once so tests never touch `otto_db`:

```sh
docker compose up -d db
docker compose exec db createdb -U dev_user otto_test
cd backend
OTTO_TEST_DATABASE_URL='postgres://dev_user:dev_password@localhost:5532/otto_test?sslmode=disable' \
  go test -race -count=1 -tags integration ./...
```

### Vehicle data lookup

The backend proxies NHTSA's public [vPIC API](https://vpic.nhtsa.dot.gov/api/) under `/api/vpic` for model lists and VIN decoding, for signed-in users only:

- `GET /api/vpic/models?make=<make>&year=<year>` returns the sorted model names for a make and model year as `{"models": [...]}`.
- `GET /api/vpic/decode/<vin>` returns the `vin`, `year`, `make`, `model` and `trim` decoded from a 17-character VIN, with `null` for fields vPIC has no data for, or 404 when vPIC knows nothing about the VIN.

Inputs are validated with the same rules as vehicles, and an unreachable or failing vPIC answers 502.
Upstream requests time out after 5 seconds, and answers are cached in memory for 24 hours in LRU caches of up to 1000 entries each.
Set `VPIC_BASE_URL` to point it at another vPIC-compatible server; it defaults to `https://vpic.nhtsa.dot.gov/api`.

## Frontend

### Running tests

Unit and component tests use Vitest and need no running services:

```sh
cd frontend
pnpm test
```

End-to-end tests use Playwright.
They start a vPIC stub, the backend and a production build of the frontend on their own ports (4390, 3533 and 4200), so they can run next to the regular development servers.
Set `E2E_VPIC_PORT`, `E2E_BACKEND_PORT` or `E2E_FRONTEND_PORT` to use other ports when those are taken.
They need Go to run the backend, `goose` on the `PATH` to migrate the database, and Postgres with the `otto_test` database described above.
`E2E_DATABASE_URL` defaults to the docker-compose `otto_test` database, and the tests refuse to run against any database other than `otto_test`.
A signed-in test user is created directly in the database, so no Google sign-in is needed.
A second user that owns vehicles but never signs in is created the same way, to check that the test user cannot see or edit other people's vehicles.
To run them:

```sh
docker compose up -d db
cd frontend
pnpm exec playwright install chromium
pnpm test:e2e
```
