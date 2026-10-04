package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequireAuth(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	tests := []struct {
		name       string
		user       *User
		wantStatus int
	}{
		{name: "no user", wantStatus: http.StatusUnauthorized},
		{
			name:       "user",
			user:       &User{Id: 1, Email: "a@example.com"},
			wantStatus: http.StatusNoContent,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := newRequestWithUser(tt.user)
			rec := httptest.NewRecorder()

			RequireAuth(next).ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if tt.wantStatus == http.StatusUnauthorized {
				assertJSONError(t, rec)
			}
		})
	}
}

func TestGetCurrentUser(t *testing.T) {
	h := &Handler{}

	t.Run("no user", func(t *testing.T) {
		rec := httptest.NewRecorder()

		h.GetCurrentUser(rec, newRequestWithUser(nil))

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
		}
		assertJSONError(t, rec)
	})

	t.Run("user", func(t *testing.T) {
		user := &User{
			Id:        42,
			Email:     "a@example.com",
			Name:      "Ada",
			AvatarUrl: "https://example.com/a.png",
		}
		rec := httptest.NewRecorder()

		h.GetCurrentUser(rec, newRequestWithUser(user))

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
		}
		if got := rec.Header().Get("Content-Type"); got != "application/json" {
			t.Errorf("Content-Type = %q, want application/json", got)
		}

		var body map[string]string

		err := json.Unmarshal(rec.Body.Bytes(), &body)

		if err != nil {
			t.Fatalf("body is not JSON: %v", err)
		}

		want := map[string]string{
			"id":        "42",
			"email":     "a@example.com",
			"name":      "Ada",
			"avatarUrl": "https://example.com/a.png",
		}
		for k, v := range want {
			if body[k] != v {
				t.Errorf("%s = %q, want %q", k, body[k], v)
			}
		}
	})
}

func newRequestWithUser(user *User) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/", nil)

	if user == nil {
		return req
	}

	return req.WithContext(
		context.WithValue(req.Context(), userContextKey, user),
	)
}

func assertJSONError(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()

	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}

	var body map[string]string

	err := json.Unmarshal(rec.Body.Bytes(), &body)

	if err != nil {
		t.Fatalf("body is not JSON: %v", err)
	}
	if body["error"] == "" {
		t.Errorf("body = %s, want non-empty error field", rec.Body.String())
	}
}
