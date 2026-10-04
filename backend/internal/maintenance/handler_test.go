package maintenance

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
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/maxweisen/otto/backend/internal/money"
	"github.com/maxweisen/otto/backend/internal/store"
)

// fixedNow is the instant the performed_at validation sees in tests, so the
// latest accepted date does not shift while the tests run.
var fixedNow = time.Date(2026, time.June, 15, 12, 0, 0, 0, time.UTC)

// fixedLatestDate is the latest performed_at accepted at fixedNow: it is
// already June 16 in UTC+14.
const fixedLatestDate = "2026-06-16"

const costErr = `cost must be a decimal amount with at most 8 digits before ` +
	`and 2 after the decimal point, e.g. "49.99"`

const typeErr = "type must be one of: oil_change, tire_rotation, brakes, " +
	"inspection, repair, other"

func TestMain(m *testing.M) {
	// Set before any test runs, so parallel tests only ever read it.
	now = func() time.Time {
		return fixedNow
	}

	slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))

	os.Exit(m.Run())
}

func ptr[T any](v T) *T {
	return &v
}

func validInput() RecordInput {
	return RecordInput{
		Type:        "oil_change",
		Description: "Synthetic 0W-20",
		PerformedAt: "2026-05-01",
	}
}

func TestNormalizeAndValidate(t *testing.T) {
	long := strings.Repeat("a", maxDescriptionLength+1)
	maxRunes := strings.Repeat("é", maxDescriptionLength)
	longNotes := strings.Repeat("a", maxNotesLength+1)

	tests := []struct {
		name    string
		modify  func(in *RecordInput)
		wantErr string
	}{
		{name: "valid", modify: func(in *RecordInput) {}},
		{name: "max length multibyte description", modify: func(in *RecordInput) { in.Description = maxRunes }},
		{name: "max length notes", modify: func(in *RecordInput) { in.Notes = ptr(strings.Repeat("é", maxNotesLength)) }},
		{name: "zero mileage", modify: func(in *RecordInput) { in.Mileage = ptr(int32(0)) }},
		{name: "zero cost", modify: func(in *RecordInput) { in.Cost = ptr("0") }},
		{name: "max cost", modify: func(in *RecordInput) { in.Cost = ptr("99999999.99") }},
		{name: "max cost with leading zeros", modify: func(in *RecordInput) { in.Cost = ptr("0099999999.99") }},
		{name: "earliest date", modify: func(in *RecordInput) { in.PerformedAt = "1886-01-01" }},
		{name: "latest date", modify: func(in *RecordInput) { in.PerformedAt = fixedLatestDate }},
		{name: "blank type", modify: func(in *RecordInput) { in.Type = "  " }, wantErr: "type is required"},
		{name: "unknown type", modify: func(in *RecordInput) { in.Type = "car_wash" }, wantErr: typeErr},
		{name: "uppercase type", modify: func(in *RecordInput) { in.Type = "OIL_CHANGE" }, wantErr: typeErr},
		{name: "blank description", modify: func(in *RecordInput) { in.Description = " \t" }, wantErr: "description is required"},
		{name: "long description", modify: func(in *RecordInput) { in.Description = long }, wantErr: "description must be at most 255 characters"},
		{name: "null in description", modify: func(in *RecordInput) { in.Description = "Oil\x00" }, wantErr: "description must not contain null characters"},
		{name: "long notes", modify: func(in *RecordInput) { in.Notes = &longNotes }, wantErr: "notes must be at most 10000 characters"},
		{name: "null in notes", modify: func(in *RecordInput) { in.Notes = ptr("a\x00b") }, wantErr: "notes must not contain null characters"},
		{name: "missing date", modify: func(in *RecordInput) { in.PerformedAt = "" }, wantErr: "performed_at is required"},
		{name: "timestamp date", modify: func(in *RecordInput) { in.PerformedAt = "2026-05-01T10:00:00Z" }, wantErr: "performed_at must be a date in YYYY-MM-DD format"},
		{name: "unpadded date", modify: func(in *RecordInput) { in.PerformedAt = "2026-5-1" }, wantErr: "performed_at must be a date in YYYY-MM-DD format"},
		{name: "impossible date", modify: func(in *RecordInput) { in.PerformedAt = "2026-02-30" }, wantErr: "performed_at must be a date in YYYY-MM-DD format"},
		{name: "too old date", modify: func(in *RecordInput) { in.PerformedAt = "1885-12-31" }, wantErr: "performed_at must not be before 1886-01-01"},
		{name: "future date", modify: func(in *RecordInput) { in.PerformedAt = "2026-06-17" }, wantErr: "performed_at must not be in the future"},
		{name: "negative mileage", modify: func(in *RecordInput) { in.Mileage = ptr(int32(-1)) }, wantErr: "mileage must not be negative"},
		{name: "negative cost", modify: func(in *RecordInput) { in.Cost = ptr("-1.00") }, wantErr: "cost must not be negative"},
		{name: "too many decimals", modify: func(in *RecordInput) { in.Cost = ptr("1.999") }, wantErr: costErr},
		{name: "cost too large", modify: func(in *RecordInput) { in.Cost = ptr("100000000") }, wantErr: costErr},
		{name: "cost with currency", modify: func(in *RecordInput) { in.Cost = ptr("$5") }, wantErr: costErr},
		{name: "cost with comma", modify: func(in *RecordInput) { in.Cost = ptr("1,000") }, wantErr: costErr},
		{name: "cost exponent", modify: func(in *RecordInput) { in.Cost = ptr("1e3") }, wantErr: costErr},
		{name: "cost trailing dot", modify: func(in *RecordInput) { in.Cost = ptr("5.") }, wantErr: costErr},
		{name: "cost leading dot", modify: func(in *RecordInput) { in.Cost = ptr(".5") }, wantErr: costErr},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := validInput()
			tt.modify(&input)

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

func TestNormalizeAndValidateAcceptsEveryType(t *testing.T) {
	for _, typ := range recordTypes {
		input := validInput()
		input.Type = typ

		err := input.normalizeAndValidate()

		if err != nil {
			t.Fatalf("type %q: %v", typ, err)
		}
	}
}

func TestNormalizeAndValidateNormalizes(t *testing.T) {
	input := RecordInput{
		Type:        " brakes ",
		Description: "  Front pads ",
		PerformedAt: " 2026-05-01 ",
		Cost:        ptr(" 120.5 "),
		Notes:       ptr("   "),
	}

	err := input.normalizeAndValidate()

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := RecordInput{
		Type:        "brakes",
		Description: "Front pads",
		PerformedAt: "2026-05-01",
		Cost:        ptr("120.50"),
	}

	if !reflect.DeepEqual(input, want) {
		t.Fatalf("got %s, want %s", formatInput(input), formatInput(want))
	}

	input.Cost = ptr("")

	err = input.normalizeAndValidate()

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if input.Cost != nil {
		t.Fatalf("got cost %q, want nil", *input.Cost)
	}
}

// handler tests

// requestMarkerKey tags the request context so tests can check that the
// handler hands the request's own context, which carries the authenticated
// user, to the service.
type requestMarkerKey struct{}

const requestMarker = "authenticated-request"

const validBody = `{"type":"oil_change","description":"Synthetic 0W-20",` +
	`"performed_at":"2026-05-01"}`

const genericErrorMessage = "Something went wrong. Please try again."

// fakeService is a hand-written recordService. Each test builds its own, sets
// the values to return, and inspects the captured arguments afterwards.
type fakeService struct {
	records []store.MaintenanceRecord
	record  store.MaintenanceRecord
	err     error

	calls        []string
	gotCtx       context.Context
	gotVehicleID int64
	gotRecordID  int64
	gotInput     RecordInput
}

var _ recordService = (*fakeService)(nil)

func (f *fakeService) capture(ctx context.Context, call string, vehicleID int64) {
	f.calls = append(f.calls, call)
	f.gotCtx = ctx
	f.gotVehicleID = vehicleID
}

func (f *fakeService) ListRecords(
	ctx context.Context,
	vehicleID int64,
) ([]store.MaintenanceRecord, error) {
	f.capture(ctx, "ListRecords", vehicleID)

	return f.records, f.err
}

func (f *fakeService) CreateRecord(
	ctx context.Context,
	vehicleID int64,
	params RecordInput,
) (store.MaintenanceRecord, error) {
	f.capture(ctx, "CreateRecord", vehicleID)
	f.gotInput = params

	return f.record, f.err
}

func (f *fakeService) GetRecord(
	ctx context.Context,
	vehicleID int64,
	recordID int64,
) (store.MaintenanceRecord, error) {
	f.capture(ctx, "GetRecord", vehicleID)
	f.gotRecordID = recordID

	return f.record, f.err
}

func (f *fakeService) UpdateRecord(
	ctx context.Context,
	vehicleID int64,
	recordID int64,
	params RecordInput,
) (store.MaintenanceRecord, error) {
	f.capture(ctx, "UpdateRecord", vehicleID)
	f.gotRecordID = recordID
	f.gotInput = params

	return f.record, f.err
}

func (f *fakeService) DeleteRecord(
	ctx context.Context,
	vehicleID int64,
	recordID int64,
) error {
	f.capture(ctx, "DeleteRecord", vehicleID)
	f.gotRecordID = recordID

	return f.err
}

// assertCalled fails unless the service received exactly the given call with
// the request's context and vehicle id 7.
func (f *fakeService) assertCalled(t *testing.T, call string) {
	t.Helper()

	if len(f.calls) != 1 || f.calls[0] != call {
		t.Fatalf("service calls = %v, want [%s]", f.calls, call)
	}

	if f.gotCtx == nil || f.gotCtx.Value(requestMarkerKey{}) != requestMarker {
		t.Fatalf("service did not receive the request context")
	}

	if f.gotVehicleID != 7 {
		t.Fatalf("service vehicle id = %d, want 7", f.gotVehicleID)
	}
}

func (f *fakeService) assertNotCalled(t *testing.T) {
	t.Helper()

	if len(f.calls) != 0 {
		t.Fatalf("service calls = %v, want none", f.calls)
	}
}

// serve sends a request through the handler's routes mounted under
// /vehicles/{vehicleID}/maintenance, the way main.go mounts them below
// /api, without the auth middleware. The maintenance package never reads the
// user itself (the service does), so the stand-in middleware marks the
// request context instead and the fake checks that this context reaches the
// service.
func serve(
	t *testing.T,
	svc recordService,
	method string,
	target string,
	body string,
) *httptest.ResponseRecorder {
	t.Helper()

	router := chi.NewRouter()

	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), requestMarkerKey{}, requestMarker)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})

	router.Mount(
		"/vehicles/{"+VehicleIDParam+"}/maintenance",
		NewHandler(svc).Routes(),
	)

	req := httptest.NewRequest(method, target, strings.NewReader(body))
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

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

func sampleRecord(id int64) store.MaintenanceRecord {
	return store.MaintenanceRecord{
		ID:          id,
		VehicleID:   7,
		Type:        "oil_change",
		Description: "Synthetic 0W-20",
		PerformedAt: pgtype.Date{
			Time:  time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC),
			Valid: true,
		},
		Mileage: ptr(int32(84000)),
		Cost:    ptr(money.Amount(4999)),
		Notes:   ptr("Replaced drain plug washer"),
		CreatedAt: pgtype.Timestamptz{
			Time:  time.Date(2026, 5, 1, 3, 4, 5, 0, time.UTC),
			Valid: true,
		},
	}
}

func TestRecordJSON(t *testing.T) {
	t.Parallel()

	got, err := json.Marshal(sampleRecord(3))

	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	want := `{"id":3,"vehicle_id":7,"type":"oil_change",` +
		`"description":"Synthetic 0W-20","performed_at":"2026-05-01",` +
		`"mileage":84000,"cost":"49.99","notes":"Replaced drain plug washer",` +
		`"created_at":"2026-05-01T03:04:05Z"}`

	if string(got) != want {
		t.Fatalf("got %s, want %s", got, want)
	}
}

func TestHandlerList(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		records []store.MaintenanceRecord
	}{
		{
			name:    "with items",
			records: []store.MaintenanceRecord{sampleRecord(2), sampleRecord(1)},
		},
		{
			name:    "empty",
			records: []store.MaintenanceRecord{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := &fakeService{records: tt.records}

			rec := serve(t, svc, http.MethodGet, "/vehicles/7/maintenance", "")

			svc.assertCalled(t, "ListRecords")

			got := decodeResponse[[]store.MaintenanceRecord](t, rec, http.StatusOK)

			if got == nil {
				t.Fatalf("body = %s, want a JSON array", rec.Body)
			}

			if !reflect.DeepEqual(got, tt.records) {
				t.Fatalf("got %+v, want %+v", got, tt.records)
			}
		})
	}
}

func TestHandlerCreate(t *testing.T) {
	t.Parallel()

	want := sampleRecord(1)
	svc := &fakeService{record: want}

	rec := serve(t, svc, http.MethodPost, "/vehicles/7/maintenance", validBody)

	svc.assertCalled(t, "CreateRecord")

	got := decodeResponse[store.MaintenanceRecord](t, rec, http.StatusCreated)

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}

	if !reflect.DeepEqual(svc.gotInput, validInput()) {
		t.Fatalf("service input = %s, want %s", formatInput(svc.gotInput), formatInput(validInput()))
	}
}

func TestHandlerGet(t *testing.T) {
	t.Parallel()

	want := sampleRecord(42)
	svc := &fakeService{record: want}

	rec := serve(t, svc, http.MethodGet, "/vehicles/7/maintenance/42", "")

	svc.assertCalled(t, "GetRecord")

	got := decodeResponse[store.MaintenanceRecord](t, rec, http.StatusOK)

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}

	if svc.gotRecordID != 42 {
		t.Fatalf("service record id = %d, want 42", svc.gotRecordID)
	}
}

func TestHandlerUpdate(t *testing.T) {
	t.Parallel()

	want := sampleRecord(42)
	svc := &fakeService{record: want}

	rec := serve(t, svc, http.MethodPut, "/vehicles/7/maintenance/42", validBody)

	svc.assertCalled(t, "UpdateRecord")

	got := decodeResponse[store.MaintenanceRecord](t, rec, http.StatusOK)

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}

	if svc.gotRecordID != 42 {
		t.Fatalf("service record id = %d, want 42", svc.gotRecordID)
	}

	if !reflect.DeepEqual(svc.gotInput, validInput()) {
		t.Fatalf("service input = %s, want %s", formatInput(svc.gotInput), formatInput(validInput()))
	}
}

func TestHandlerDelete(t *testing.T) {
	t.Parallel()

	svc := &fakeService{}

	rec := serve(t, svc, http.MethodDelete, "/vehicles/7/maintenance/42", "")

	svc.assertCalled(t, "DeleteRecord")

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}

	if rec.Body.Len() != 0 {
		t.Fatalf("body = %q, want empty", rec.Body)
	}

	if svc.gotRecordID != 42 {
		t.Fatalf("service record id = %d, want 42", svc.gotRecordID)
	}
}

// route is an endpoint request and the service call it should make.
type route struct {
	name   string
	method string
	// byRecord routes take a record id after the vehicle id.
	byRecord bool
	body     string
	call     string
}

// target returns the request URL for the route with the given ids.
func (rt route) target(vehicleID, recordID string) string {
	url := "/vehicles/" + vehicleID + "/maintenance"

	if rt.byRecord {
		url += "/" + recordID
	}

	return url
}

var listRoute = route{
	name:   "list",
	method: http.MethodGet,
	call:   "ListRecords",
}

var createRoute = route{
	name:   "create",
	method: http.MethodPost,
	body:   validBody,
	call:   "CreateRecord",
}

var getRoute = route{
	name:     "get",
	method:   http.MethodGet,
	byRecord: true,
	call:     "GetRecord",
}

var updateRoute = route{
	name:     "update",
	method:   http.MethodPut,
	byRecord: true,
	body:     validBody,
	call:     "UpdateRecord",
}

var deleteRoute = route{
	name:     "delete",
	method:   http.MethodDelete,
	byRecord: true,
	call:     "DeleteRecord",
}

var allRoutes = []route{listRoute, createRoute, getRoute, updateRoute, deleteRoute}

// bodyRoutes are the endpoints that decode and validate a RecordInput.
var bodyRoutes = []route{createRoute, updateRoute}

// recordRoutes are the endpoints that take a record id in the path.
var recordRoutes = []route{getRoute, updateRoute, deleteRoute}

func TestHandlerRejectsInvalidBody(t *testing.T) {
	t.Parallel()

	long := strings.Repeat("a", maxDescriptionLength+1)

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
			body:    `{"type":"oil_change",`,
			wantErr: "request body contains malformed JSON",
		},
		{
			name:    "numeric cost",
			body:    `{"type":"oil_change","description":"Oil","performed_at":"2026-05-01","cost":49.99}`,
			wantErr: `request body has an invalid value for field "cost"`,
		},
		{
			name:    "unknown field",
			body:    `{"type":"oil_change","description":"Oil","performed_at":"2026-05-01","vehicle_id":9}`,
			wantErr: `request body contains unknown field "vehicle_id"`,
		},
		{
			name:    "trailing data",
			body:    validBody + `{}`,
			wantErr: "request body must contain a single JSON object",
		},
		{
			name:    "missing type",
			body:    `{"description":"Oil","performed_at":"2026-05-01"}`,
			wantErr: "type is required",
		},
		{
			name:    "unknown type",
			body:    `{"type":"detailing","description":"Oil","performed_at":"2026-05-01"}`,
			wantErr: typeErr,
		},
		{
			name:    "blank description",
			body:    `{"type":"oil_change","description":"  ","performed_at":"2026-05-01"}`,
			wantErr: "description is required",
		},
		{
			name:    "long description",
			body:    `{"type":"oil_change","description":"` + long + `","performed_at":"2026-05-01"}`,
			wantErr: "description must be at most 255 characters",
		},
		{
			name:    "missing performed_at",
			body:    `{"type":"oil_change","description":"Oil"}`,
			wantErr: "performed_at is required",
		},
		{
			name:    "bad performed_at",
			body:    `{"type":"oil_change","description":"Oil","performed_at":"05/01/2026"}`,
			wantErr: "performed_at must be a date in YYYY-MM-DD format",
		},
		{
			name:    "future performed_at",
			body:    `{"type":"oil_change","description":"Oil","performed_at":"2026-06-17"}`,
			wantErr: "performed_at must not be in the future",
		},
		{
			name:    "negative mileage",
			body:    `{"type":"oil_change","description":"Oil","performed_at":"2026-05-01","mileage":-1}`,
			wantErr: "mileage must not be negative",
		},
		{
			name:    "negative cost",
			body:    `{"type":"oil_change","description":"Oil","performed_at":"2026-05-01","cost":"-5"}`,
			wantErr: "cost must not be negative",
		},
		{
			name:    "invalid cost",
			body:    `{"type":"oil_change","description":"Oil","performed_at":"2026-05-01","cost":"4.999"}`,
			wantErr: costErr,
		},
		{
			name:    "null byte",
			body:    `{"type":"oil_change","description":"Oil\u0000","performed_at":"2026-05-01"}`,
			wantErr: "description must not contain null characters",
		},
	}

	for _, rt := range bodyRoutes {
		for _, tt := range tests {
			t.Run(rt.name+"/"+tt.name, func(t *testing.T) {
				t.Parallel()

				svc := &fakeService{}

				rec := serve(t, svc, rt.method, rt.target("7", "42"), tt.body)

				assertError(t, rec, http.StatusBadRequest, tt.wantErr)
				svc.assertNotCalled(t)
			})
		}
	}
}

func TestHandlerNormalizesBody(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		body string
		want RecordInput
	}{
		{
			name: "trims and canonicalizes",
			body: `{"type":" repair ","description":"  Water pump ",` +
				`"performed_at":" 2026-05-01 ","mileage":0,` +
				`"cost":" 0450.5 ","notes":" Under warranty "}`,
			want: RecordInput{
				Type:        "repair",
				Description: "Water pump",
				PerformedAt: "2026-05-01",
				Mileage:     ptr(int32(0)),
				Cost:        ptr("450.50"),
				Notes:       ptr("Under warranty"),
			},
		},
		{
			name: "blank optionals become nil",
			body: `{"type":"oil_change","description":"Synthetic 0W-20",` +
				`"performed_at":"2026-05-01","cost":"  ","notes":"\t"}`,
			want: validInput(),
		},
		{
			name: "null optionals stay nil",
			body: `{"type":"oil_change","description":"Synthetic 0W-20",` +
				`"performed_at":"2026-05-01","mileage":null,"cost":null,"notes":null}`,
			want: validInput(),
		},
		{
			name: "latest accepted date",
			body: `{"type":"oil_change","description":"Synthetic 0W-20",` +
				`"performed_at":"` + fixedLatestDate + `"}`,
			want: RecordInput{
				Type:        "oil_change",
				Description: "Synthetic 0W-20",
				PerformedAt: fixedLatestDate,
			},
		},
	}

	for _, rt := range bodyRoutes {
		for _, tt := range tests {
			t.Run(rt.name+"/"+tt.name, func(t *testing.T) {
				t.Parallel()

				svc := &fakeService{}

				serve(t, svc, rt.method, rt.target("7", "42"), tt.body)

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
func formatInput(in RecordInput) string {
	out, err := json.Marshal(in)

	if err != nil {
		return fmt.Sprintf("%+v", in)
	}

	return string(out)
}

func TestHandlerRejectsInvalidVehicleID(t *testing.T) {
	t.Parallel()

	ids := []string{"abc", "1.5", "9223372036854775808"}

	for _, rt := range allRoutes {
		for _, id := range ids {
			t.Run(rt.name+"/"+id, func(t *testing.T) {
				t.Parallel()

				svc := &fakeService{}

				rec := serve(t, svc, rt.method, rt.target(id, "42"), rt.body)

				assertError(t, rec, http.StatusBadRequest, "invalid vehicleID: must be an integer")
				svc.assertNotCalled(t)
			})
		}
	}
}

func TestHandlerRejectsInvalidRecordID(t *testing.T) {
	t.Parallel()

	ids := []string{"abc", "1.5", "9223372036854775808"}

	for _, rt := range recordRoutes {
		for _, id := range ids {
			t.Run(rt.name+"/"+id, func(t *testing.T) {
				t.Parallel()

				svc := &fakeService{}

				rec := serve(t, svc, rt.method, rt.target("7", id), rt.body)

				assertError(t, rec, http.StatusBadRequest, "invalid recordID: must be an integer")
				svc.assertNotCalled(t)
			})
		}
	}
}

func TestHandlerMapsServiceErrors(t *testing.T) {
	t.Parallel()

	const secret = "pq: connection refused to db.internal:5432"

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
			name:       "vehicle not found",
			err:        ErrVehicleNotFound,
			wantStatus: http.StatusNotFound,
			wantMsg:    "Vehicle not found.",
		},
		{
			name:       "record not found",
			err:        ErrRecordNotFound,
			wantStatus: http.StatusNotFound,
			wantMsg:    "Maintenance record not found.",
		},
		{
			name:       "wrapped not found",
			err:        fmt.Errorf("lookup: %w", ErrRecordNotFound),
			wantStatus: http.StatusNotFound,
			wantMsg:    "Maintenance record not found.",
		},
		{
			name:       "unexpected",
			err:        errors.New(secret),
			wantStatus: http.StatusInternalServerError,
			wantMsg:    genericErrorMessage,
		},
	}

	for _, rt := range allRoutes {
		for _, tt := range tests {
			t.Run(rt.name+"/"+tt.name, func(t *testing.T) {
				t.Parallel()

				svc := &fakeService{err: tt.err}

				rec := serve(t, svc, rt.method, rt.target("7", "42"), rt.body)

				svc.assertCalled(t, rt.call)

				if strings.Contains(rec.Body.String(), secret) {
					t.Fatalf("body %q leaks the service error", rec.Body)
				}

				assertError(t, rec, tt.wantStatus, tt.wantMsg)
			})
		}
	}
}
