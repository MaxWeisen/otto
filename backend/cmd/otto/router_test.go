package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/maxweisen/otto/backend/internal/auth"
	"github.com/maxweisen/otto/backend/internal/config"
	"github.com/maxweisen/otto/backend/internal/maintenance"
	"github.com/maxweisen/otto/backend/internal/store"
	"github.com/maxweisen/otto/backend/internal/vehicles"
)

const sessionCookie = "otto_session_token=router-test"

const vehicleBody = `{"year":2020,"make":"Honda","model":"Civic"}`

const recordBody = `{"type":"oil_change","description":"Synthetic 0W-20",` +
	`"performed_at":"2026-05-01"}`

func TestMain(m *testing.M) {
	slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))

	os.Exit(m.Run())
}

// sessionDB is an auth.DB whose session lookup always finds user 1.
type sessionDB struct{}

func (sessionDB) Begin(context.Context) (pgx.Tx, error) {
	return nil, errors.New("not supported")
}

func (sessionDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("not supported")
}

func (sessionDB) QueryRow(context.Context, string, ...any) pgx.Row {
	return userRow{}
}

type userRow struct{}

func (userRow) Scan(dest ...any) error {
	*dest[0].(*int64) = 1
	*dest[1].(*string) = "router@example.com"
	*dest[2].(*string) = ""
	*dest[3].(*string) = ""

	return nil
}

// call is the service method a request reached and the ids it received.
type call struct {
	name      string
	vehicleID int64
	recordID  int64
}

type fakeVehicles struct{ got *call }

func (f fakeVehicles) ListVehiclesByUser(context.Context) ([]store.Vehicle, error) {
	*f.got = call{name: "vehicles.List"}
	return []store.Vehicle{}, nil
}

func (f fakeVehicles) CreateVehicle(
	context.Context,
	vehicles.VehicleInput,
) (store.Vehicle, error) {
	*f.got = call{name: "vehicles.Create"}
	return store.Vehicle{}, nil
}

func (f fakeVehicles) GetVehicle(_ context.Context, id int64) (store.Vehicle, error) {
	*f.got = call{name: "vehicles.Get", vehicleID: id}
	return store.Vehicle{}, nil
}

func (f fakeVehicles) UpdateVehicle(
	_ context.Context,
	id int64,
	_ vehicles.VehicleInput,
) (store.Vehicle, error) {
	*f.got = call{name: "vehicles.Update", vehicleID: id}
	return store.Vehicle{}, nil
}

func (f fakeVehicles) DeleteVehicle(_ context.Context, id int64) error {
	*f.got = call{name: "vehicles.Delete", vehicleID: id}
	return nil
}

type fakeRecords struct{ got *call }

func (f fakeRecords) ListRecords(
	_ context.Context,
	vehicleID int64,
) ([]store.MaintenanceRecord, error) {
	*f.got = call{name: "maintenance.List", vehicleID: vehicleID}
	return []store.MaintenanceRecord{}, nil
}

func (f fakeRecords) CreateRecord(
	_ context.Context,
	vehicleID int64,
	_ maintenance.RecordParams,
) (store.MaintenanceRecord, error) {
	*f.got = call{name: "maintenance.Create", vehicleID: vehicleID}
	return store.MaintenanceRecord{}, nil
}

func (f fakeRecords) GetRecord(
	_ context.Context,
	vehicleID int64,
	recordID int64,
) (store.MaintenanceRecord, error) {
	*f.got = call{name: "maintenance.Get", vehicleID: vehicleID, recordID: recordID}
	return store.MaintenanceRecord{}, nil
}

func (f fakeRecords) UpdateRecord(
	_ context.Context,
	vehicleID int64,
	recordID int64,
	_ maintenance.RecordParams,
) (store.MaintenanceRecord, error) {
	*f.got = call{name: "maintenance.Update", vehicleID: vehicleID, recordID: recordID}
	return store.MaintenanceRecord{}, nil
}

func (f fakeRecords) DeleteRecord(
	_ context.Context,
	vehicleID int64,
	recordID int64,
) error {
	*f.got = call{name: "maintenance.Delete", vehicleID: vehicleID, recordID: recordID}
	return nil
}

// TestRouter checks that the vehicles mount and the maintenance mount nested
// below it each receive their own requests on the real router.
func TestRouter(t *testing.T) {
	t.Parallel()

	tests := []struct {
		method     string
		path       string
		body       string
		anonymous  bool
		wantStatus int
		want       call
	}{
		{method: http.MethodGet, path: "/healthz", anonymous: true, wantStatus: http.StatusOK},
		{method: http.MethodGet, path: "/api/vehicles", anonymous: true, wantStatus: http.StatusUnauthorized},
		{method: http.MethodGet, path: "/api/vehicles/5/maintenance", anonymous: true, wantStatus: http.StatusUnauthorized},
		{method: http.MethodGet, path: "/api/vehicles/5/maintenance/9", anonymous: true, wantStatus: http.StatusUnauthorized},

		{method: http.MethodGet, path: "/api/vehicles", wantStatus: http.StatusOK, want: call{name: "vehicles.List"}},
		{method: http.MethodPost, path: "/api/vehicles", body: vehicleBody, wantStatus: http.StatusCreated, want: call{name: "vehicles.Create"}},
		{method: http.MethodGet, path: "/api/vehicles/5", wantStatus: http.StatusOK, want: call{name: "vehicles.Get", vehicleID: 5}},
		{method: http.MethodPut, path: "/api/vehicles/5", body: vehicleBody, wantStatus: http.StatusOK, want: call{name: "vehicles.Update", vehicleID: 5}},
		{method: http.MethodDelete, path: "/api/vehicles/5", wantStatus: http.StatusNoContent, want: call{name: "vehicles.Delete", vehicleID: 5}},

		{method: http.MethodGet, path: "/api/vehicles/5/maintenance", wantStatus: http.StatusOK, want: call{name: "maintenance.List", vehicleID: 5}},
		{method: http.MethodGet, path: "/api/vehicles/5/maintenance/", wantStatus: http.StatusOK, want: call{name: "maintenance.List", vehicleID: 5}},
		{method: http.MethodPost, path: "/api/vehicles/5/maintenance", body: recordBody, wantStatus: http.StatusCreated, want: call{name: "maintenance.Create", vehicleID: 5}},
		{method: http.MethodGet, path: "/api/vehicles/5/maintenance/9", wantStatus: http.StatusOK, want: call{name: "maintenance.Get", vehicleID: 5, recordID: 9}},
		{method: http.MethodPut, path: "/api/vehicles/5/maintenance/9", body: recordBody, wantStatus: http.StatusOK, want: call{name: "maintenance.Update", vehicleID: 5, recordID: 9}},
		{method: http.MethodDelete, path: "/api/vehicles/5/maintenance/9", wantStatus: http.StatusNoContent, want: call{name: "maintenance.Delete", vehicleID: 5, recordID: 9}},

		{method: http.MethodGet, path: "/api/vehicles/5/unknown", wantStatus: http.StatusNotFound},
		{method: http.MethodGet, path: "/api/vehicles/5/maintenance/9/unknown", wantStatus: http.StatusNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			t.Parallel()

			var got call

			router := newRouter(
				auth.NewHandler(&config.Config{}, sessionDB{}),
				vehicles.NewHandler(fakeVehicles{got: &got}),
				maintenance.NewHandler(fakeRecords{got: &got}),
			)

			req := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))

			if !tt.anonymous {
				req.Header.Set("Cookie", sessionCookie)
			}

			rec := httptest.NewRecorder()

			router.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, tt.wantStatus, rec.Body)
			}

			if got != tt.want {
				t.Fatalf("service call = %+v, want %+v", got, tt.want)
			}
		})
	}
}
