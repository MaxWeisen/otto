package httpx

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestWriteJSON(t *testing.T) {
	tests := []struct {
		name     string
		status   int
		value    any
		wantBody string
	}{
		{
			name:     "object",
			status:   http.StatusCreated,
			value:    map[string]int{"id": 1},
			wantBody: `{"id":1}`,
		},
		{
			name:     "empty slice",
			status:   http.StatusOK,
			value:    []string{},
			wantBody: `[]`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()

			WriteJSON(rec, tt.status, tt.value)

			if rec.Code != tt.status {
				t.Errorf("status = %d, want %d", rec.Code, tt.status)
			}
			if got := rec.Header().Get("Content-Type"); got != "application/json" {
				t.Errorf("Content-Type = %q, want application/json", got)
			}
			if got := strings.TrimSpace(rec.Body.String()); got != tt.wantBody {
				t.Errorf("body = %s, want %s", got, tt.wantBody)
			}
		})
	}
}

func TestWriteError(t *testing.T) {
	tests := []struct {
		name   string
		status int
		msg    string
	}{
		{name: "bad request", status: http.StatusBadRequest, msg: "bad input"},
		{name: "not found", status: http.StatusNotFound, msg: "Vehicle not found."},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()

			WriteError(rec, tt.status, tt.msg)

			if rec.Code != tt.status {
				t.Errorf("status = %d, want %d", rec.Code, tt.status)
			}

			var body map[string]string

			err := json.Unmarshal(rec.Body.Bytes(), &body)

			if err != nil {
				t.Fatalf("body is not JSON: %v", err)
			}
			if body["error"] != tt.msg {
				t.Errorf("error = %q, want %q", body["error"], tt.msg)
			}
		})
	}
}

func TestDecodeJSON(t *testing.T) {
	type payload struct {
		Name string `json:"name"`
		Year int    `json:"year"`
	}

	tests := []struct {
		name    string
		body    string
		want    payload
		wantErr string
	}{
		{
			name: "valid",
			body: `{"name":"civic","year":2020}`,
			want: payload{Name: "civic", Year: 2020},
		},
		{
			name:    "empty body",
			body:    ``,
			wantErr: "request body must not be empty",
		},
		{
			name:    "malformed",
			body:    `{"name":`,
			wantErr: "request body contains malformed JSON",
		},
		{
			name:    "syntax error",
			body:    `{"name" "civic"}`,
			wantErr: "request body contains malformed JSON (at position 9)",
		},
		{
			name:    "wrong type",
			body:    `{"year":"2020"}`,
			wantErr: `request body has an invalid value for field "year"`,
		},
		{
			name:    "unknown field",
			body:    `{"color":"red"}`,
			wantErr: `request body contains unknown field "color"`,
		},
		{
			name:    "trailing data",
			body:    `{"name":"civic"}{"name":"accord"}`,
			wantErr: "request body must contain a single JSON object",
		},
		{
			name:    "too large",
			body:    `{"name":"` + strings.Repeat("a", MaxBodyBytes) + `"}`,
			wantErr: "request body must not be larger than 1048576 bytes",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(
				http.MethodPost,
				"/",
				strings.NewReader(tt.body),
			)
			rec := httptest.NewRecorder()

			var got payload

			err := DecodeJSON(rec, req, &got)

			if tt.wantErr != "" {
				if err == nil || err.Error() != tt.wantErr {
					t.Fatalf("err = %v, want %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("got %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestURLParamInt64(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		want    int64
		wantErr bool
	}{
		{name: "valid", value: "42", want: 42},
		{name: "negative", value: "-7", want: -7},
		{name: "empty", value: "", wantErr: true},
		{name: "not a number", value: "abc", wantErr: true},
		{name: "float", value: "1.5", wantErr: true},
		{name: "overflow", value: "9223372036854775808", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rctx := chi.NewRouteContext()
			rctx.URLParams.Add("id", tt.value)
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req = req.WithContext(
				context.WithValue(req.Context(), chi.RouteCtxKey, rctx),
			)

			got, err := URLParamInt64(req, "id")

			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %d", got)
				}
				if err.Error() != "invalid id: must be an integer" {
					t.Errorf("err = %q", err.Error())
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("got %d, want %d", got, tt.want)
			}
		})
	}
}
