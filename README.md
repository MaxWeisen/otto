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
