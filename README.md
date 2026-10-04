Otto is your Automotive DIY Assistant.

Knowledge is based on your car or truck's factory service manual. 
No guessing or hallucinations. 
Only answers rooted in facts. 

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

The backend proxies NHTSA's public [vPIC API](https://vpic.nhtsa.dot.gov/api/) under `/api/vpic` for model lists and VIN decoding.
Answers are cached in memory.
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
They need `goose` on the `PATH` to migrate the database, and Postgres with the `otto_test` database described above.
`E2E_DATABASE_URL` defaults to the docker-compose `otto_test` database, and the tests refuse to run against any database other than `otto_test`.
A signed-in test user is created directly in the database, so no Google sign-in is needed:

```sh
docker compose up -d db
cd frontend
pnpm exec playwright install chromium
pnpm test:e2e
```
