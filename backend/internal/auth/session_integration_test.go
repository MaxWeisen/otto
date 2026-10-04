//go:build integration

package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/maxweisen/otto/backend/internal/auth"
	"github.com/maxweisen/otto/backend/internal/config"
	"github.com/maxweisen/otto/backend/internal/testutil"
)

const sessionCookie = "otto_session_token"

func TestSessionMiddlewareCurrentUser(t *testing.T) {
	tx, _ := testutil.TxDB(t)
	h := auth.NewHandler(&config.Config{}, tx)
	me := h.SessionMiddleware(http.HandlerFunc(h.GetCurrentUser))

	tests := []struct {
		name string
		opts testutil.UserOptions
	}{
		{
			name: "all fields",
			opts: testutil.UserOptions{
				Name:      new("Ada"),
				AvatarURL: new("https://example.com/a.png"),
			},
		},
		{name: "null avatar", opts: testutil.UserOptions{Name: new("Ada")}},
		{
			name: "null name",
			opts: testutil.UserOptions{AvatarURL: new("https://example.com/a.png")},
		},
		{name: "null name and avatar", opts: testutil.UserOptions{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			user := testutil.CreateUser(t, tx, tt.opts)
			token := testutil.CreateSession(t, tx, user.ID)
			rec := httptest.NewRecorder()

			me.ServeHTTP(rec, newMeRequest(token))

			if rec.Code != http.StatusOK {
				t.Fatalf(
					"status = %d, want %d; body = %s",
					rec.Code,
					http.StatusOK,
					rec.Body.String(),
				)
			}

			body := decodeBody(t, rec)
			want := map[string]string{
				"id":        strconv.FormatInt(user.ID, 10),
				"email":     user.Email,
				"name":      deref(tt.opts.Name),
				"avatarUrl": deref(tt.opts.AvatarURL),
			}
			for k, v := range want {
				if body[k] != v {
					t.Errorf("%s = %q, want %q", k, body[k], v)
				}
			}
		})
	}
}

func TestSessionMiddlewareRejectsInvalidSession(t *testing.T) {
	tx, _ := testutil.TxDB(t)
	h := auth.NewHandler(&config.Config{}, tx)
	me := h.SessionMiddleware(http.HandlerFunc(h.GetCurrentUser))

	user := testutil.CreateUser(t, tx, testutil.UserOptions{})
	expired := testutil.CreateSession(t, tx, user.ID)

	_, err := tx.Exec(context.Background(),
		`UPDATE sessions SET expires_at = now() - interval '1 minute'
		WHERE user_id = $1`,
		user.ID,
	)

	if err != nil {
		t.Fatalf("expire session: %v", err)
	}

	tests := []struct {
		name  string
		token string
	}{
		{name: "no cookie"},
		{name: "bogus token", token: "not-a-real-session-token"},
		{name: "expired session", token: expired},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()

			me.ServeHTTP(rec, newMeRequest(tt.token))

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
			}

			body := decodeBody(t, rec)
			if body["error"] == "" {
				t.Errorf("body = %s, want non-empty error field", rec.Body.String())
			}
		})
	}
}

// newMeRequest builds a GET /auth/me request, with the session cookie set
// when token is non-empty.
func newMeRequest(token string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/auth/me", nil)

	if token != "" {
		req.AddCookie(&http.Cookie{Name: sessionCookie, Value: token})
	}

	return req
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]string {
	t.Helper()

	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}

	var body map[string]string

	err := json.Unmarshal(rec.Body.Bytes(), &body)

	if err != nil {
		t.Fatalf("body is not JSON: %v; body = %s", err, rec.Body.String())
	}

	return body
}

func deref(s *string) string {
	if s == nil {
		return ""
	}

	return *s
}
