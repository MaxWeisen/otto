package vehicles

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/maxweisen/otto/backend/internal/store"
)

// fixedNow is the date the year validation sees in tests, so the allowed
// year range does not shift while the tests run.
var fixedNow = time.Date(2026, time.June, 15, 12, 0, 0, 0, time.UTC)

// fixedMaxYear is the latest model year accepted at fixedNow.
const fixedMaxYear = 2027

func TestMain(m *testing.M) {
	// Set before any test runs, so parallel tests only ever read it.
	now = func() time.Time {
		return fixedNow
	}

	os.Exit(m.Run())
}

func ptr[T any](v T) *T {
	return &v
}

func TestNormalizeAndValidate(t *testing.T) {
	long := strings.Repeat("a", maxTextLength+1)
	maxRunes := strings.Repeat("é", maxTextLength)

	tests := []struct {
		name     string
		make     string
		model    string
		trim     *string
		vin      *string
		nickname *string
		mileage  *int32
		wantErr  string
	}{
		{name: "valid", make: "Honda", model: "Civic"},
		{name: "max length multibyte", make: maxRunes, model: "Civic"},
		{name: "zero mileage", make: "Honda", model: "Civic", mileage: ptr(int32(0))},
		{name: "blank make", make: "  ", model: "Civic", wantErr: "make is required"},
		{name: "long make", make: long, model: "Civic", wantErr: "make must be at most 255 characters"},
		{name: "long model", make: "Honda", model: long, wantErr: "model must be at most 255 characters"},
		{name: "long trim", make: "Honda", model: "Civic", trim: &long, wantErr: "trim must be at most 255 characters"},
		{name: "long nickname", make: "Honda", model: "Civic", nickname: &long, wantErr: "nickname must be at most 255 characters"},
		{name: "negative mileage", make: "Honda", model: "Civic", mileage: ptr(int32(-1)), wantErr: "mileage must not be negative"},
		{name: "valid vin", make: "Honda", model: "Civic", vin: ptr("1HGCM82633A004352")},
		{name: "blank vin", make: "Honda", model: "Civic", vin: ptr("   ")},
		{name: "short vin", make: "Honda", model: "Civic", vin: ptr("ABC"), wantErr: "vin must be 17 characters"},
		{name: "multibyte vin", make: "Honda", model: "Civic", vin: ptr(strings.Repeat("é", vinLength))},
		{name: "null in make", make: "Hon\x00da", model: "Civic", wantErr: "make must not contain null characters"},
		{name: "null in model", make: "Honda", model: "Civ\x00ic", wantErr: "model must not contain null characters"},
		{name: "null in trim", make: "Honda", model: "Civic", trim: ptr("Sp\x00ort"), wantErr: "trim must not contain null characters"},
		{name: "null in vin", make: "Honda", model: "Civic", vin: ptr("1HGCM82633A00435\x00"), wantErr: "vin must not contain null characters"},
		{name: "null in nickname", make: "Honda", model: "Civic", nickname: ptr("\x00"), wantErr: "nickname must not contain null characters"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := VehicleInput{
				Year:     2020,
				Make:     tt.make,
				Model:    tt.model,
				Trim:     tt.trim,
				Vin:      tt.vin,
				Nickname: tt.nickname,
				Mileage:  tt.mileage,
			}

			err := input.normalizeAndValidate()

			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}

			if err == nil || err.Error() != tt.wantErr {
				t.Fatalf("got error %v, want %q", err, tt.wantErr)
			}
		})
	}
}

func TestNormalizeAndValidateNormalizes(t *testing.T) {
	input := VehicleInput{
		Year:     2020,
		Make:     "  Honda ",
		Model:    " Civic  ",
		Trim:     ptr("  "),
		Vin:      ptr("  1hgcm82633a004352 "),
		Nickname: ptr(" Daily "),
	}

	err := input.normalizeAndValidate()

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if input.Make != "Honda" || input.Model != "Civic" {
		t.Fatalf("got make %q model %q", input.Make, input.Model)
	}

	if input.Trim != nil {
		t.Fatalf("got trim %q, want nil", *input.Trim)
	}

	if input.Vin == nil || *input.Vin != "1HGCM82633A004352" {
		t.Fatalf("got vin %v, want 1HGCM82633A004352", input.Vin)
	}

	if input.Nickname == nil || *input.Nickname != "Daily" {
		t.Fatalf("got nickname %v, want Daily", input.Nickname)
	}

	input.Vin = ptr("")

	err = input.normalizeAndValidate()

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if input.Vin != nil {
		t.Fatalf("got vin %q, want nil", *input.Vin)
	}
}

func TestNormalizeOptional(t *testing.T) {
	tests := []struct {
		name  string
		input *string
		want  *string
	}{
		{name: "nil", input: nil, want: nil},
		{name: "empty", input: ptr(""), want: nil},
		{name: "whitespace", input: ptr("  \t "), want: nil},
		{name: "trimmed", input: ptr("  Sport  "), want: ptr("Sport")},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeOptional(tt.input)

			if (got == nil) != (tt.want == nil) || (got != nil && *got != *tt.want) {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}

// handler tests

// requestMarkerKey tags the request context so tests can check that the
// handler hands the request's own context, which carries the authenticated
// user, to the service.
type requestMarkerKey struct{}

const requestMarker = "authenticated-request"

const validBody = `{"year":2020,"make":"Honda","model":"Civic"}`

const genericErrorMessage = "Something went wrong. Please try again."

// fakeService is a hand-written vehicleService. Each test builds its own, sets
// the values to return, and inspects the captured arguments afterwards.
type fakeService struct {
	vehicles []store.Vehicle
	vehicle  store.Vehicle
	err      error

	calls    []string
	gotCtx   context.Context
	gotID    int64
	gotInput VehicleInput
}

var _ vehicleService = (*fakeService)(nil)

func (f *fakeService) record(ctx context.Context, call string) {
	f.calls = append(f.calls, call)
	f.gotCtx = ctx
}

func (f *fakeService) ListVehiclesByUser(
	ctx context.Context,
) ([]store.Vehicle, error) {
	f.record(ctx, "ListVehiclesByUser")

	return f.vehicles, f.err
}

func (f *fakeService) CreateVehicle(
	ctx context.Context,
	params VehicleInput,
) (store.Vehicle, error) {
	f.record(ctx, "CreateVehicle")
	f.gotInput = params

	return f.vehicle, f.err
}

func (f *fakeService) GetVehicle(
	ctx context.Context,
	id int64,
) (store.Vehicle, error) {
	f.record(ctx, "GetVehicle")
	f.gotID = id

	return f.vehicle, f.err
}

func (f *fakeService) UpdateVehicle(
	ctx context.Context,
	vehicleID int64,
	params VehicleInput,
) (store.Vehicle, error) {
	f.record(ctx, "UpdateVehicle")
	f.gotID = vehicleID
	f.gotInput = params

	return f.vehicle, f.err
}

func (f *fakeService) DeleteVehicle(
	ctx context.Context,
	vehicleID int64,
) error {
	f.record(ctx, "DeleteVehicle")
	f.gotID = vehicleID

	return f.err
}

// assertCalled fails unless the service received exactly the given call with
// the request's context.
func (f *fakeService) assertCalled(t *testing.T, call string) {
	t.Helper()

	if len(f.calls) != 1 || f.calls[0] != call {
		t.Fatalf("service calls = %v, want [%s]", f.calls, call)
	}

	if f.gotCtx == nil || f.gotCtx.Value(requestMarkerKey{}) != requestMarker {
		t.Fatalf("service did not receive the request context")
	}
}

func (f *fakeService) assertNotCalled(t *testing.T) {
	t.Helper()

	if len(f.calls) != 0 {
		t.Fatalf("service calls = %v, want none", f.calls)
	}
}

// serve sends a request through the handler's router, mounted the same way
// main.go does. The vehicles package never reads the user itself (the
// service does), and auth only lets its session middleware store one, so the
// stand-in middleware marks the request context instead and the fake checks
// that this context reaches the service.
func serve(
	t *testing.T,
	svc vehicleService,
	method string,
	target string,
	body string,
) *httptest.ResponseRecorder {
	t.Helper()

	router := NewHandler(svc).Routes()

	authenticated := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), requestMarkerKey{}, requestMarker)

		router.ServeHTTP(w, r.WithContext(ctx))
	})

	req := httptest.NewRequest(method, target, strings.NewReader(body))
	rec := httptest.NewRecorder()

	authenticated.ServeHTTP(rec, req)

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

// assertError checks that rec is a JSON error response {"error": wantMsg}.
func assertError(
	t *testing.T,
	rec *httptest.ResponseRecorder,
	wantStatus int,
	wantMsg string,
) {
	t.Helper()

	body := rec.Body.String()
	got := decodeResponse[struct {
		Error string `json:"error"`
	}](t, rec, wantStatus)

	if got.Error != wantMsg {
		t.Fatalf("error = %q, want %q (body %s)", got.Error, wantMsg, body)
	}
}

func sampleVehicle(id int64) store.Vehicle {
	return store.Vehicle{
		ID:       id,
		UserID:   7,
		Year:     2020,
		Make:     "Honda",
		Model:    "Civic",
		Trim:     ptr("Sport"),
		Vin:      ptr("1HGCM82633A004352"),
		Nickname: ptr("Daily"),
		Mileage:  ptr(int32(12000)),
		CreatedAt: pgtype.Timestamptz{
			Time:  time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC),
			Valid: true,
		},
	}
}

func TestHandlerList(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		vehicles []store.Vehicle
	}{
		{
			name:     "with items",
			vehicles: []store.Vehicle{sampleVehicle(1), sampleVehicle(2)},
		},
		{
			name:     "empty",
			vehicles: []store.Vehicle{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := &fakeService{vehicles: tt.vehicles}

			rec := serve(t, svc, http.MethodGet, "/", "")

			svc.assertCalled(t, "ListVehiclesByUser")

			got := decodeResponse[[]store.Vehicle](t, rec, http.StatusOK)

			if got == nil {
				t.Fatalf("body = %s, want a JSON array", rec.Body)
			}

			if !reflect.DeepEqual(got, tt.vehicles) {
				t.Fatalf("got %+v, want %+v", got, tt.vehicles)
			}
		})
	}
}

func TestHandlerCreate(t *testing.T) {
	t.Parallel()

	want := sampleVehicle(1)
	svc := &fakeService{vehicle: want}

	rec := serve(t, svc, http.MethodPost, "/", validBody)

	svc.assertCalled(t, "CreateVehicle")

	got := decodeResponse[store.Vehicle](t, rec, http.StatusCreated)

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}

	wantInput := VehicleInput{Year: 2020, Make: "Honda", Model: "Civic"}

	if !reflect.DeepEqual(svc.gotInput, wantInput) {
		t.Fatalf("service input = %+v, want %+v", svc.gotInput, wantInput)
	}
}

func TestHandlerUpdate(t *testing.T) {
	t.Parallel()

	want := sampleVehicle(42)
	svc := &fakeService{vehicle: want}

	rec := serve(t, svc, http.MethodPut, "/42", validBody)

	svc.assertCalled(t, "UpdateVehicle")

	got := decodeResponse[store.Vehicle](t, rec, http.StatusOK)

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}

	if svc.gotID != 42 {
		t.Fatalf("service id = %d, want 42", svc.gotID)
	}

	wantInput := VehicleInput{Year: 2020, Make: "Honda", Model: "Civic"}

	if !reflect.DeepEqual(svc.gotInput, wantInput) {
		t.Fatalf("service input = %+v, want %+v", svc.gotInput, wantInput)
	}
}

func TestHandlerGet(t *testing.T) {
	t.Parallel()

	want := sampleVehicle(42)
	svc := &fakeService{vehicle: want}

	rec := serve(t, svc, http.MethodGet, "/42", "")

	svc.assertCalled(t, "GetVehicle")

	got := decodeResponse[store.Vehicle](t, rec, http.StatusOK)

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}

	if svc.gotID != 42 {
		t.Fatalf("service id = %d, want 42", svc.gotID)
	}
}

func TestHandlerDelete(t *testing.T) {
	t.Parallel()

	svc := &fakeService{}

	rec := serve(t, svc, http.MethodDelete, "/42", "")

	svc.assertCalled(t, "DeleteVehicle")

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}

	if rec.Body.Len() != 0 {
		t.Fatalf("body = %q, want empty", rec.Body)
	}

	if svc.gotID != 42 {
		t.Fatalf("service id = %d, want 42", svc.gotID)
	}
}

// route is an endpoint request and the service call it should make.
type route struct {
	name   string
	method string
	target string
	body   string
	call   string
}

var listRoute = route{
	name:   "list",
	method: http.MethodGet,
	target: "/",
	call:   "ListVehiclesByUser",
}

var createRoute = route{
	name:   "create",
	method: http.MethodPost,
	target: "/",
	body:   validBody,
	call:   "CreateVehicle",
}

var getRoute = route{
	name:   "get",
	method: http.MethodGet,
	target: "/42",
	call:   "GetVehicle",
}

var updateRoute = route{
	name:   "update",
	method: http.MethodPut,
	target: "/42",
	body:   validBody,
	call:   "UpdateVehicle",
}

var deleteRoute = route{
	name:   "delete",
	method: http.MethodDelete,
	target: "/42",
	call:   "DeleteVehicle",
}

// bodyRoutes are the endpoints that decode and validate a VehicleInput.
var bodyRoutes = []route{createRoute, updateRoute}

// idRoutes are the endpoints that take a vehicle id in the path.
var idRoutes = []route{getRoute, updateRoute, deleteRoute}

func TestHandlerRejectsInvalidBody(t *testing.T) {
	t.Parallel()

	yearRangeErr := fmt.Sprintf("year must be between %d and %d", minVehicleYear, fixedMaxYear)
	long := strings.Repeat("a", maxTextLength+1)

	tests := []struct {
		name    string
		body    string
		wantErr string
	}{
		{
			name:    "empty body",
			body:    ``,
			wantErr: "request body must not be empty",
		},
		{
			name:    "malformed JSON",
			body:    `{"year":2020,`,
			wantErr: "request body contains malformed JSON",
		},
		{
			name:    "wrong type",
			body:    `{"year":"2020","make":"Honda","model":"Civic"}`,
			wantErr: `request body has an invalid value for field "year"`,
		},
		{
			name:    "unknown field",
			body:    `{"year":2020,"make":"Honda","model":"Civic","color":"red"}`,
			wantErr: `request body contains unknown field "color"`,
		},
		{
			name:    "trailing data",
			body:    validBody + `{}`,
			wantErr: "request body must contain a single JSON object",
		},
		{
			name:    "blank make",
			body:    `{"year":2020,"make":"  ","model":"Civic"}`,
			wantErr: "make is required",
		},
		{
			name:    "missing model",
			body:    `{"year":2020,"make":"Honda"}`,
			wantErr: "model is required",
		},
		{
			name:    "year missing",
			body:    `{"make":"Honda","model":"Civic"}`,
			wantErr: yearRangeErr,
		},
		{
			name:    "year too old",
			body:    fmt.Sprintf(`{"year":%d,"make":"Honda","model":"Civic"}`, minVehicleYear-1),
			wantErr: yearRangeErr,
		},
		{
			name:    "year too new",
			body:    fmt.Sprintf(`{"year":%d,"make":"Honda","model":"Civic"}`, fixedMaxYear+1),
			wantErr: yearRangeErr,
		},
		{
			name:    "negative mileage",
			body:    `{"year":2020,"make":"Honda","model":"Civic","mileage":-1}`,
			wantErr: "mileage must not be negative",
		},
		{
			name:    "long model",
			body:    `{"year":2020,"make":"Honda","model":"` + long + `"}`,
			wantErr: "model must be at most 255 characters",
		},
		{
			name:    "long nickname",
			body:    `{"year":2020,"make":"Honda","model":"Civic","nickname":"` + long + `"}`,
			wantErr: "nickname must be at most 255 characters",
		},
		{
			name:    "short vin",
			body:    `{"year":2020,"make":"Honda","model":"Civic","vin":"ABC"}`,
			wantErr: "vin must be 17 characters",
		},
		{
			name:    "long vin",
			body:    `{"year":2020,"make":"Honda","model":"Civic","vin":"1HGCM82633A0043521"}`,
			wantErr: "vin must be 17 characters",
		},
		{
			name:    "null byte",
			body:    `{"year":2020,"make":"Hon\u0000da","model":"Civic"}`,
			wantErr: "make must not contain null characters",
		},
	}

	for _, rt := range bodyRoutes {
		for _, tt := range tests {
			t.Run(rt.name+"/"+tt.name, func(t *testing.T) {
				t.Parallel()

				svc := &fakeService{}

				rec := serve(t, svc, rt.method, rt.target, tt.body)

				assertError(t, rec, http.StatusBadRequest, tt.wantErr)
				svc.assertNotCalled(t)
			})
		}
	}
}

func TestHandlerAcceptsYearBounds(t *testing.T) {
	t.Parallel()

	years := []int16{minVehicleYear, fixedMaxYear}

	for _, rt := range bodyRoutes {
		for _, year := range years {
			t.Run(fmt.Sprintf("%s/%d", rt.name, year), func(t *testing.T) {
				t.Parallel()

				svc := &fakeService{}
				body := fmt.Sprintf(`{"year":%d,"make":"Honda","model":"Civic"}`, year)

				serve(t, svc, rt.method, rt.target, body)

				svc.assertCalled(t, rt.call)

				if svc.gotInput.Year != year {
					t.Fatalf("service year = %d, want %d", svc.gotInput.Year, year)
				}
			})
		}
	}
}

func TestHandlerNormalizesBody(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		body string
		want VehicleInput
	}{
		{
			name: "trims and uppercases",
			body: `{"year":2020,"make":"  Honda ","model":" Civic  ",` +
				`"trim":" Sport ","vin":" 1hgcm82633a004352 ",` +
				`"nickname":" Daily ","mileage":0}`,
			want: VehicleInput{
				Year:     2020,
				Make:     "Honda",
				Model:    "Civic",
				Trim:     ptr("Sport"),
				Vin:      ptr("1HGCM82633A004352"),
				Nickname: ptr("Daily"),
				Mileage:  ptr(int32(0)),
			},
		},
		{
			name: "blank optionals become nil",
			body: `{"year":2020,"make":"Honda","model":"Civic",` +
				`"trim":"  ","vin":"","nickname":"\t"}`,
			want: VehicleInput{Year: 2020, Make: "Honda", Model: "Civic"},
		},
		{
			name: "null optionals stay nil",
			body: `{"year":2020,"make":"Honda","model":"Civic",` +
				`"trim":null,"vin":null,"nickname":null,"mileage":null}`,
			want: VehicleInput{Year: 2020, Make: "Honda", Model: "Civic"},
		},
	}

	for _, rt := range bodyRoutes {
		for _, tt := range tests {
			t.Run(rt.name+"/"+tt.name, func(t *testing.T) {
				t.Parallel()

				svc := &fakeService{}

				serve(t, svc, rt.method, rt.target, tt.body)

				svc.assertCalled(t, rt.call)

				if !reflect.DeepEqual(svc.gotInput, tt.want) {
					t.Fatalf(
						"service input = %s, want %s",
						formatInput(svc.gotInput),
						formatInput(tt.want),
					)
				}
			})
		}
	}
}

// formatInput renders an input with its pointer fields dereferenced.
func formatInput(in VehicleInput) string {
	out, err := json.Marshal(in)

	if err != nil {
		return fmt.Sprintf("%+v", in)
	}

	return string(out)
}

func TestHandlerRejectsInvalidID(t *testing.T) {
	t.Parallel()

	ids := []string{"abc", "1.5", "9223372036854775808"}

	for _, rt := range idRoutes {
		for _, id := range ids {
			t.Run(rt.name+"/"+id, func(t *testing.T) {
				t.Parallel()

				svc := &fakeService{}

				rec := serve(t, svc, rt.method, "/"+id, rt.body)

				assertError(t, rec, http.StatusBadRequest, "invalid id: must be an integer")
				svc.assertNotCalled(t)
			})
		}
	}
}

func TestHandlerMapsServiceErrors(t *testing.T) {
	t.Parallel()

	const secret = "pq: connection refused to db.internal:5432"

	routes := []route{
		listRoute,
		createRoute,
		getRoute,
		updateRoute,
		deleteRoute,
	}

	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantMsg    string
	}{
		{
			name:       "unauthorized",
			err:        ErrUnauthorized,
			wantStatus: http.StatusUnauthorized,
			wantMsg:    "Unauthorized.",
		},
		{
			name:       "not found",
			err:        ErrVehicleNotFound,
			wantStatus: http.StatusNotFound,
			wantMsg:    "Vehicle not found.",
		},
		{
			name:       "wrapped not found",
			err:        fmt.Errorf("lookup: %w", ErrVehicleNotFound),
			wantStatus: http.StatusNotFound,
			wantMsg:    "Vehicle not found.",
		},
		{
			name:       "unexpected",
			err:        errors.New(secret),
			wantStatus: http.StatusInternalServerError,
			wantMsg:    genericErrorMessage,
		},
	}

	for _, rt := range routes {
		for _, tt := range tests {
			t.Run(rt.name+"/"+tt.name, func(t *testing.T) {
				t.Parallel()

				svc := &fakeService{err: tt.err}

				rec := serve(t, svc, rt.method, rt.target, rt.body)

				svc.assertCalled(t, rt.call)

				if strings.Contains(rec.Body.String(), secret) {
					t.Fatalf("body %q leaks the service error", rec.Body)
				}

				assertError(t, rec, tt.wantStatus, tt.wantMsg)
			})
		}
	}
}
