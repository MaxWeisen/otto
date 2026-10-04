package vpic

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

// fixedNow is the date the year validation sees in tests, so the allowed
// year range does not shift while the tests run.
var fixedNow = time.Date(2026, time.June, 15, 12, 0, 0, 0, time.UTC)

const vinErr = "vin must be 17 characters using letters and digits, excluding I, O and Q"
const yearErr = "year must be between 1886 and 2027"

func TestMain(m *testing.M) {
	// Set before any test runs, so parallel tests only ever read it.
	now = func() time.Time {
		return fixedNow
	}

	slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))

	os.Exit(m.Run())
}

// fakeLookup records the arguments it is called with and returns the
// configured results.
type fakeLookup struct {
	mu      sync.Mutex
	calls   []string
	models  []string
	decoded DecodedVIN
	err     error
}

func (f *fakeLookup) ModelsForMakeYear(
	_ context.Context,
	makeName string,
	year int,
) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.calls = append(f.calls, fmt.Sprintf("models %s %d", makeName, year))

	return f.models, f.err
}

func (f *fakeLookup) DecodeVIN(_ context.Context, vin string) (DecodedVIN, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.calls = append(f.calls, "decode "+vin)

	return f.decoded, f.err
}

func (f *fakeLookup) assertCalls(t *testing.T, want ...string) {
	t.Helper()

	f.mu.Lock()
	defer f.mu.Unlock()

	if len(want) == 0 && len(f.calls) == 0 {
		return
	}

	if !reflect.DeepEqual(f.calls, want) {
		t.Fatalf("calls = %q, want %q", f.calls, want)
	}
}

func serve(t *testing.T, svc lookupService, target string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, target, nil)
	rec := httptest.NewRecorder()

	NewHandler(svc).Routes().ServeHTTP(rec, req)

	return rec
}

// decodeResponse checks the status and JSON content type of rec and decodes
// its body into a value of type T, rejecting unknown fields.
func decodeResponse[T any](
	t *testing.T,
	rec *httptest.ResponseRecorder,
	wantStatus int,
) T {
	t.Helper()

	if rec.Code != wantStatus {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, wantStatus, rec.Body)
	}

	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}

	var got T

	dec := json.NewDecoder(rec.Body)
	dec.DisallowUnknownFields()

	err := dec.Decode(&got)

	if err != nil {
		t.Fatalf("body %q is not the expected JSON: %v", rec.Body, err)
	}

	return got
}

func assertError(
	t *testing.T,
	rec *httptest.ResponseRecorder,
	wantStatus int,
	wantMsg string,
) {
	t.Helper()

	got := decodeResponse[struct {
		Error string `json:"error"`
	}](t, rec, wantStatus)

	if got.Error != wantMsg {
		t.Fatalf("error = %q, want %q", got.Error, wantMsg)
	}
}

func TestHandlerModels(t *testing.T) {
	t.Parallel()

	svc := &fakeLookup{models: []string{"4Runner", "Camry"}}

	rec := serve(t, svc, "/models?make=%20Land%20Rover%20&year=2020")

	got := decodeResponse[modelsResponse](t, rec, http.StatusOK)

	if !reflect.DeepEqual(got.Models, svc.models) {
		t.Errorf("models = %q, want %q", got.Models, svc.models)
	}

	svc.assertCalls(t, "models Land Rover 2020")
}

func TestHandlerModelsEmpty(t *testing.T) {
	t.Parallel()

	svc := &fakeLookup{models: []string{}}

	rec := serve(t, svc, "/models?make=Nosuchmake&year=2020")

	if body := strings.TrimSpace(rec.Body.String()); body != `{"models":[]}` {
		t.Fatalf("body = %s, want {\"models\":[]}", body)
	}
}

func TestHandlerModelsRejectsInvalidInput(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		target  string
		wantMsg string
	}{
		{name: "missing make", target: "/models?year=2020", wantMsg: "make is required"},
		{name: "blank make", target: "/models?make=%20%20&year=2020", wantMsg: "make is required"},
		{name: "long make", target: "/models?make=" + strings.Repeat("a", 256) + "&year=2020", wantMsg: "make must be at most 255 characters"},
		{name: "null in make", target: "/models?make=Hon%00da&year=2020", wantMsg: "make must not contain null characters"},
		{name: "missing year", target: "/models?make=Toyota", wantMsg: yearErr},
		{name: "non-numeric year", target: "/models?make=Toyota&year=abc", wantMsg: yearErr},
		{name: "year too early", target: "/models?make=Toyota&year=1885", wantMsg: yearErr},
		{name: "year too late", target: "/models?make=Toyota&year=2028", wantMsg: yearErr},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := &fakeLookup{}

			rec := serve(t, svc, tt.target)

			assertError(t, rec, http.StatusBadRequest, tt.wantMsg)
			svc.assertCalls(t)
		})
	}
}

func TestHandlerModelsAcceptsYearBounds(t *testing.T) {
	t.Parallel()

	for _, year := range []int{1886, 2027} {
		t.Run(fmt.Sprint(year), func(t *testing.T) {
			t.Parallel()

			svc := &fakeLookup{models: []string{}}

			rec := serve(t, svc, fmt.Sprintf("/models?make=Ford&year=%d", year))

			decodeResponse[modelsResponse](t, rec, http.StatusOK)
			svc.assertCalls(t, fmt.Sprintf("models Ford %d", year))
		})
	}
}

func TestHandlerDecode(t *testing.T) {
	t.Parallel()

	year := 2003
	makeName, model := "HONDA", "Accord"
	svc := &fakeLookup{decoded: DecodedVIN{
		VIN:   "1HGCM82633A004352",
		Year:  &year,
		Make:  &makeName,
		Model: &model,
	}}

	rec := serve(t, svc, "/decode/1hgcm82633a004352")

	got := decodeResponse[DecodedVIN](t, rec, http.StatusOK)

	if !reflect.DeepEqual(got, svc.decoded) {
		t.Errorf("decoded = %+v, want %+v", got, svc.decoded)
	}

	svc.assertCalls(t, "decode 1HGCM82633A004352")
}

func TestHandlerDecodeRejectsInvalidVIN(t *testing.T) {
	t.Parallel()

	for _, vin := range []string{
		"ABC",
		"1HGCM82633A0043521",
		"1HGCM82633I004352",
		"1HGCM82633O004352",
		"1HGCM82633Q004352",
		"1HGCM82633-004352",
	} {
		t.Run(vin, func(t *testing.T) {
			t.Parallel()

			svc := &fakeLookup{}

			rec := serve(t, svc, "/decode/"+vin)

			assertError(t, rec, http.StatusBadRequest, vinErr)
			svc.assertCalls(t)
		})
	}
}

func TestHandlerMapsLookupErrors(t *testing.T) {
	t.Parallel()

	const secret = "dial tcp vpic.internal:443: connection refused"

	targets := []string{
		"/models?make=Toyota&year=2020",
		"/decode/1HGCM82633A004352",
	}

	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantMsg    string
	}{
		{
			name:       "upstream",
			err:        fmt.Errorf("%w: %s", ErrUpstream, secret),
			wantStatus: http.StatusBadGateway,
			wantMsg:    upstreamErrorMessage,
		},
		{
			name:       "vin not found",
			err:        ErrVINNotFound,
			wantStatus: http.StatusNotFound,
			wantMsg:    "No vehicle data found for this VIN.",
		},
		{
			name:       "unexpected",
			err:        errors.New(secret),
			wantStatus: http.StatusInternalServerError,
			wantMsg:    "Something went wrong. Please try again.",
		},
	}

	for _, target := range targets {
		for _, tt := range tests {
			t.Run(target+"/"+tt.name, func(t *testing.T) {
				t.Parallel()

				rec := serve(t, &fakeLookup{err: tt.err}, target)

				if strings.Contains(rec.Body.String(), secret) {
					t.Fatalf("body %q leaks the upstream error", rec.Body)
				}

				assertError(t, rec, tt.wantStatus, tt.wantMsg)
			})
		}
	}
}

// TestHandlerWithClient runs the handler against a real Client and a fake
// vPIC server, covering the path from HTTP request to upstream call.
func TestHandlerWithClient(t *testing.T) {
	t.Parallel()

	fake := newFakeVPIC(t, respond(http.StatusOK, toyotaModels))
	handler := NewHandler(NewClient(fake.server.URL))

	for range 2 {
		req := httptest.NewRequest(http.MethodGet, "/models?make=toyota&year=2020", nil)
		rec := httptest.NewRecorder()

		handler.Routes().ServeHTTP(rec, req)

		got := decodeResponse[modelsResponse](t, rec, http.StatusOK)

		if want := []string{"4Runner", "Avalon", "camry", "Corolla"}; !reflect.DeepEqual(got.Models, want) {
			t.Fatalf("models = %q, want %q", got.Models, want)
		}
	}

	if got := fake.requests.Load(); got != 1 {
		t.Fatalf("upstream requests = %d, want 1", got)
	}

	req := httptest.NewRequest(http.MethodGet, "/models?make=toyota&year=1800", nil)
	rec := httptest.NewRecorder()

	handler.Routes().ServeHTTP(rec, req)

	assertError(t, rec, http.StatusBadRequest, yearErr)

	if got := fake.requests.Load(); got != 1 {
		t.Fatalf("upstream requests = %d after invalid input, want 1", got)
	}
}

func TestHandlerWithClientUpstreamFailure(t *testing.T) {
	t.Parallel()

	fake := newFakeVPIC(t, respond(http.StatusInternalServerError, `{"Message":"db.vpic:1433 down"}`))
	handler := NewHandler(NewClient(fake.server.URL))

	req := httptest.NewRequest(http.MethodGet, "/decode/1HGCM82633A004352", nil)
	rec := httptest.NewRecorder()

	handler.Routes().ServeHTTP(rec, req)

	if strings.Contains(rec.Body.String(), "db.vpic") {
		t.Fatalf("body %q leaks the upstream body", rec.Body)
	}

	assertError(t, rec, http.StatusBadGateway, upstreamErrorMessage)
}
