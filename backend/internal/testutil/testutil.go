// Package testutil provides helpers for integration tests that need a real
// Postgres database.
//
// Tests using it should live in files tagged //go:build integration. The
// database is read from OTTO_TEST_DATABASE_URL; when that is unset, TxDB
// skips the test, so plain `go test ./...` never needs a database.
package testutil

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/maxweisen/otto/backend/internal/store"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

// DatabaseURLEnv is the environment variable holding the test database URL.
const DatabaseURLEnv = "OTTO_TEST_DATABASE_URL"

var (
	setupOnce sync.Once
	setupPool *pgxpool.Pool
	setupErr  error
)

// TxDB returns a transaction on the test database and a store.Queries bound
// to it. The transaction is rolled back in t.Cleanup, so nothing a test
// writes is ever visible to other tests.
//
// It skips the test when OTTO_TEST_DATABASE_URL is unset. On first use in a
// test binary it connects and applies the goose migrations in
// backend/migrations.
func TxDB(t *testing.T) (pgx.Tx, *store.Queries) {
	t.Helper()

	url := os.Getenv(DatabaseURLEnv)
	if url == "" {
		t.Skipf("%s is not set; skipping integration test", DatabaseURLEnv)
	}

	setupOnce.Do(func() {
		setupPool, setupErr = setup(url)
	})
	if setupErr != nil {
		t.Fatalf("set up test database: %v", setupErr)
	}

	ctx := context.Background()

	tx, err := setupPool.Begin(ctx)

	if err != nil {
		t.Fatalf("begin transaction: %v", err)
	}

	t.Cleanup(func() {
		err := tx.Rollback(context.Background())

		if err != nil && !errors.Is(err, pgx.ErrTxClosed) {
			t.Errorf("rollback transaction: %v", err)
		}
	})

	return tx, store.New(tx)
}

// setup connects to the test database and migrates it to the latest version.
// Test binaries for different packages run concurrently, so goose takes a
// Postgres advisory lock while migrating.
func setup(url string) (*pgxpool.Pool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, url)

	if err != nil {
		return nil, err
	}

	err = migrate(ctx, pool)

	if err != nil {
		pool.Close()
		return nil, err
	}

	return pool, nil
}

func migrate(ctx context.Context, pool *pgxpool.Pool) error {
	db := stdlib.OpenDBFromPool(pool)
	defer db.Close()

	locker, err := lock.NewPostgresSessionLocker()

	if err != nil {
		return err
	}

	provider, err := goose.NewProvider(
		goose.DialectPostgres,
		db,
		os.DirFS(migrationsDir()),
		goose.WithSessionLocker(locker),
	)

	if err != nil {
		return err
	}

	_, err = provider.Up(ctx)

	return err
}

// migrationsDir returns the absolute path of backend/migrations, resolved
// from this source file so it works from any package's test directory.
func migrationsDir() string {
	_, file, _, _ := runtime.Caller(0)

	return filepath.Join(filepath.Dir(file), "..", "..", "migrations")
}

// UserOptions customizes CreateUser. Nil Name or AvatarURL store SQL NULL.
type UserOptions struct {
	Email     string
	Name      *string
	AvatarURL *string
}

// CreateUser inserts a user with a unique google_sub and returns it.
// An empty Email defaults to a unique example.com address.
func CreateUser(t *testing.T, tx pgx.Tx, opts UserOptions) store.User {
	t.Helper()

	sub := rand.Text()
	email := opts.Email
	if email == "" {
		email = sub + "@example.com"
	}

	var user store.User

	err := tx.QueryRow(context.Background(),
		`INSERT INTO users (google_sub, email, name, avatar_url)
		VALUES ($1, $2, $3, $4)
		RETURNING id, google_sub, email, name, avatar_url, created_at`,
		sub, email, opts.Name, opts.AvatarURL,
	).Scan(
		&user.ID,
		&user.GoogleSub,
		&user.Email,
		&user.Name,
		&user.AvatarUrl,
		&user.CreatedAt,
	)

	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	return user
}

// CreateSession inserts a session for userID that expires in one day and
// returns the raw token to send in the session cookie. Only the token's
// SHA-256 hex digest is stored, matching how the auth package stores it.
func CreateSession(t *testing.T, tx pgx.Tx, userID int64) string {
	t.Helper()

	token := rand.Text()
	hash := sha256.Sum256([]byte(token))

	_, err := tx.Exec(context.Background(),
		`INSERT INTO sessions (user_id, token, expires_at)
		VALUES ($1, $2, now() + interval '1 day')`,
		userID, hex.EncodeToString(hash[:]),
	)

	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	return token
}
