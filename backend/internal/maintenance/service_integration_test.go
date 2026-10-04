//go:build integration

package maintenance_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/maxweisen/otto/backend/internal/auth"
	"github.com/maxweisen/otto/backend/internal/maintenance"
	"github.com/maxweisen/otto/backend/internal/money"
	"github.com/maxweisen/otto/backend/internal/store"
	"github.com/maxweisen/otto/backend/internal/testutil"
)

func TestServiceCRUD(t *testing.T) {
	tx, q := testutil.TxDB(t)
	svc := maintenance.NewService(q)
	ctx, _ := userContext(t, tx)
	vehicle := createVehicle(t, ctx, q)

	created, err := svc.CreateRecord(ctx, vehicle.ID, maintenance.RecordParams{
		Type:        "oil_change",
		Description: "Synthetic 0W-20",
		PerformedAt: date(t, "2026-05-01"),
		Mileage:     new(int32(84000)),
		Cost:        amount(t, "49.99"),
		Notes:       new("Replaced drain plug washer"),
	})

	if err != nil {
		t.Fatalf("CreateRecord: %v", err)
	}
	if created.ID == 0 || created.VehicleID != vehicle.ID ||
		created.Type != "oil_change" || *created.Mileage != 84000 ||
		created.Cost.String() != "49.99" || *created.Notes != "Replaced drain plug washer" {
		t.Fatalf("CreateRecord = %+v, want stored input", created)
	}
	assertDate(t, created, "2026-05-01")

	minimal, err := svc.CreateRecord(ctx, vehicle.ID, maintenance.RecordParams{
		Type:        "inspection",
		Description: "State inspection",
		PerformedAt: date(t, "2026-04-01"),
	})

	if err != nil {
		t.Fatalf("CreateRecord: %v", err)
	}
	if minimal.Mileage != nil || minimal.Cost != nil || minimal.Notes != nil {
		t.Errorf("CreateRecord = %+v, want NULL optional fields", minimal)
	}

	list, err := svc.ListRecords(ctx, vehicle.ID)

	if err != nil {
		t.Fatalf("ListRecords: %v", err)
	}
	assertIDs(t, list, created.ID, minimal.ID)

	got, err := svc.GetRecord(ctx, vehicle.ID, created.ID)

	if err != nil {
		t.Fatalf("GetRecord: %v", err)
	}
	if got.ID != created.ID || got.Description != "Synthetic 0W-20" || got.Cost.String() != "49.99" {
		t.Errorf("GetRecord = %+v, want %+v", got, created)
	}

	updated, err := svc.UpdateRecord(ctx, vehicle.ID, created.ID, maintenance.RecordParams{
		Type:        "repair",
		Description: "Water pump",
		PerformedAt: date(t, "2026-05-02"),
		Cost:        amount(t, "450"),
	})

	if err != nil {
		t.Fatalf("UpdateRecord: %v", err)
	}
	if updated.Type != "repair" || updated.Description != "Water pump" ||
		updated.Mileage != nil || updated.Notes != nil ||
		updated.Cost == nil || updated.Cost.String() != "450.00" {
		t.Errorf("UpdateRecord = %+v, want a full replace with cost 450.00", updated)
	}
	assertDate(t, updated, "2026-05-02")

	err = svc.DeleteRecord(ctx, vehicle.ID, created.ID)

	if err != nil {
		t.Fatalf("DeleteRecord: %v", err)
	}

	_, err = svc.GetRecord(ctx, vehicle.ID, created.ID)

	if !errors.Is(err, maintenance.ErrRecordNotFound) {
		t.Errorf("GetRecord after delete err = %v, want ErrRecordNotFound", err)
	}

	err = svc.DeleteRecord(ctx, vehicle.ID, created.ID)

	if !errors.Is(err, maintenance.ErrRecordNotFound) {
		t.Errorf("second DeleteRecord err = %v, want ErrRecordNotFound", err)
	}

	list, err = svc.ListRecords(ctx, vehicle.ID)

	if err != nil {
		t.Fatalf("ListRecords: %v", err)
	}
	assertIDs(t, list, minimal.ID)
}

func TestServiceStoresCostExactly(t *testing.T) {
	tx, q := testutil.TxDB(t)
	svc := maintenance.NewService(q)
	ctx, _ := userContext(t, tx)
	vehicle := createVehicle(t, ctx, q)

	tests := []struct {
		input string
		want  string
	}{
		{input: "0", want: "0.00"},
		{input: "0.05", want: "0.05"},
		{input: "0.1", want: "0.10"},
		{input: "19.9", want: "19.90"},
		{input: "100", want: "100.00"},
		{input: "99999999.99", want: "99999999.99"},
	}

	for _, tt := range tests {
		input := validParams(t)
		input.Cost = amount(t, tt.input)

		created, err := svc.CreateRecord(ctx, vehicle.ID, input)

		if err != nil {
			t.Fatalf("CreateRecord(cost %s): %v", tt.input, err)
		}

		got, err := svc.GetRecord(ctx, vehicle.ID, created.ID)

		if err != nil {
			t.Fatalf("GetRecord: %v", err)
		}
		if got.Cost == nil || got.Cost.String() != tt.want {
			t.Errorf("cost %s stored as %v, want %s", tt.input, got.Cost, tt.want)
		}
	}
}

func TestServiceListOrdersByPerformedAtThenID(t *testing.T) {
	tx, q := testutil.TxDB(t)
	svc := maintenance.NewService(q)
	ctx, _ := userContext(t, tx)
	vehicle := createVehicle(t, ctx, q)

	oldest := createRecord(t, ctx, svc, vehicle.ID, "2025-01-10")
	sameDayFirst := createRecord(t, ctx, svc, vehicle.ID, "2026-03-15")
	newest := createRecord(t, ctx, svc, vehicle.ID, "2026-04-01")
	sameDaySecond := createRecord(t, ctx, svc, vehicle.ID, "2026-03-15")

	list, err := svc.ListRecords(ctx, vehicle.ID)

	if err != nil {
		t.Fatalf("ListRecords: %v", err)
	}

	want := []int64{newest.ID, sameDaySecond.ID, sameDayFirst.ID, oldest.ID}

	if len(list) != len(want) {
		t.Fatalf("got %d records, want %d", len(list), len(want))
	}
	for i, id := range want {
		if list[i].ID != id {
			t.Fatalf("record %d has id %d, want order %v", i, list[i].ID, want)
		}
	}
}

func TestServiceListEmptyAndMissingVehicle(t *testing.T) {
	tx, q := testutil.TxDB(t)
	svc := maintenance.NewService(q)
	ctx, _ := userContext(t, tx)
	vehicle := createVehicle(t, ctx, q)

	list, err := svc.ListRecords(ctx, vehicle.ID)

	if err != nil {
		t.Fatalf("ListRecords: %v", err)
	}
	if list == nil || len(list) != 0 {
		t.Errorf("ListRecords = %#v, want empty non-nil slice", list)
	}

	const missingID = int64(-1)

	_, err = svc.ListRecords(ctx, missingID)

	if !errors.Is(err, maintenance.ErrVehicleNotFound) {
		t.Errorf("ListRecords(missing) err = %v, want ErrVehicleNotFound", err)
	}

	_, err = svc.CreateRecord(ctx, missingID, validParams(t))

	if !errors.Is(err, maintenance.ErrVehicleNotFound) {
		t.Errorf("CreateRecord(missing) err = %v, want ErrVehicleNotFound", err)
	}

	_, err = svc.GetRecord(ctx, vehicle.ID, missingID)

	if !errors.Is(err, maintenance.ErrRecordNotFound) {
		t.Errorf("GetRecord(missing) err = %v, want ErrRecordNotFound", err)
	}

	_, err = svc.UpdateRecord(ctx, vehicle.ID, missingID, validParams(t))

	if !errors.Is(err, maintenance.ErrRecordNotFound) {
		t.Errorf("UpdateRecord(missing) err = %v, want ErrRecordNotFound", err)
	}

	err = svc.DeleteRecord(ctx, vehicle.ID, missingID)

	if !errors.Is(err, maintenance.ErrRecordNotFound) {
		t.Errorf("DeleteRecord(missing) err = %v, want ErrRecordNotFound", err)
	}
}

func TestServiceRecordMustBelongToVehicleInPath(t *testing.T) {
	tx, q := testutil.TxDB(t)
	svc := maintenance.NewService(q)
	ctx, _ := userContext(t, tx)
	truck := createVehicle(t, ctx, q)
	car := createVehicle(t, ctx, q)

	record := createRecord(t, ctx, svc, truck.ID, "2026-05-01")

	_, err := svc.GetRecord(ctx, car.ID, record.ID)

	if !errors.Is(err, maintenance.ErrRecordNotFound) {
		t.Errorf("GetRecord(other vehicle) err = %v, want ErrRecordNotFound", err)
	}

	_, err = svc.UpdateRecord(ctx, car.ID, record.ID, validParams(t))

	if !errors.Is(err, maintenance.ErrRecordNotFound) {
		t.Errorf("UpdateRecord(other vehicle) err = %v, want ErrRecordNotFound", err)
	}

	err = svc.DeleteRecord(ctx, car.ID, record.ID)

	if !errors.Is(err, maintenance.ErrRecordNotFound) {
		t.Errorf("DeleteRecord(other vehicle) err = %v, want ErrRecordNotFound", err)
	}

	got, err := svc.GetRecord(ctx, truck.ID, record.ID)

	if err != nil {
		t.Fatalf("GetRecord: %v", err)
	}
	if got.Description != record.Description || got.VehicleID != truck.ID {
		t.Errorf("GetRecord = %+v, want unchanged %+v", got, record)
	}
}

func TestServiceCascadesVehicleDelete(t *testing.T) {
	tx, q := testutil.TxDB(t)
	svc := maintenance.NewService(q)
	ctx, user := userContext(t, tx)
	vehicle := createVehicle(t, ctx, q)
	other := createVehicle(t, ctx, q)

	createRecord(t, ctx, svc, vehicle.ID, "2026-05-01")
	createRecord(t, ctx, svc, vehicle.ID, "2026-05-02")
	kept := createRecord(t, ctx, svc, other.ID, "2026-05-03")

	rows, err := q.DeleteVehicle(ctx, store.DeleteVehicleParams{
		ID:     vehicle.ID,
		UserID: user.ID,
	})

	if err != nil || rows != 1 {
		t.Fatalf("DeleteVehicle = %d, %v; want 1 row deleted", rows, err)
	}

	if n := countRecords(t, tx, vehicle.ID); n != 0 {
		t.Errorf("%d records remain for the deleted vehicle, want 0", n)
	}

	list, err := svc.ListRecords(ctx, other.ID)

	if err != nil {
		t.Fatalf("ListRecords: %v", err)
	}
	assertIDs(t, list, kept.ID)
}

func TestServiceIsolatesUsers(t *testing.T) {
	tx, q := testutil.TxDB(t)
	svc := maintenance.NewService(q)
	ctxA, _ := userContext(t, tx)
	ctxB, _ := userContext(t, tx)
	vehicleA := createVehicle(t, ctxA, q)
	vehicleB := createVehicle(t, ctxB, q)

	recordA := createRecord(t, ctxA, svc, vehicleA.ID, "2026-05-01")

	_, err := svc.CreateRecord(ctxB, vehicleA.ID, validParams(t))

	if !errors.Is(err, maintenance.ErrVehicleNotFound) {
		t.Errorf("B CreateRecord(A's vehicle) err = %v, want ErrVehicleNotFound", err)
	}

	_, err = svc.ListRecords(ctxB, vehicleA.ID)

	if !errors.Is(err, maintenance.ErrVehicleNotFound) {
		t.Errorf("B ListRecords(A's vehicle) err = %v, want ErrVehicleNotFound", err)
	}

	// B is refused A's record both through A's vehicle and through B's own.
	for _, vehicleID := range []int64{vehicleA.ID, vehicleB.ID} {
		_, err = svc.GetRecord(ctxB, vehicleID, recordA.ID)

		if !errors.Is(err, maintenance.ErrRecordNotFound) {
			t.Errorf("B GetRecord(%d, A's record) err = %v, want ErrRecordNotFound", vehicleID, err)
		}

		_, err = svc.UpdateRecord(ctxB, vehicleID, recordA.ID, maintenance.RecordParams{
			Type:        "other",
			Description: "Hijacked",
			PerformedAt: date(t, "2026-05-01"),
		})

		if !errors.Is(err, maintenance.ErrRecordNotFound) {
			t.Errorf("B UpdateRecord(%d, A's record) err = %v, want ErrRecordNotFound", vehicleID, err)
		}

		err = svc.DeleteRecord(ctxB, vehicleID, recordA.ID)

		if !errors.Is(err, maintenance.ErrRecordNotFound) {
			t.Errorf("B DeleteRecord(%d, A's record) err = %v, want ErrRecordNotFound", vehicleID, err)
		}
	}

	// A's data must be untouched by B's attempts.
	list, err := svc.ListRecords(ctxA, vehicleA.ID)

	if err != nil {
		t.Fatalf("A ListRecords: %v", err)
	}
	assertIDs(t, list, recordA.ID)

	if list[0].Description != recordA.Description || list[0].Type != recordA.Type {
		t.Errorf("A's record = %+v, want unchanged %+v", list[0], recordA)
	}

	listB, err := svc.ListRecords(ctxB, vehicleB.ID)

	if err != nil {
		t.Fatalf("B ListRecords: %v", err)
	}
	assertIDs(t, listB)
}

func TestServiceRequiresUser(t *testing.T) {
	_, q := testutil.TxDB(t)
	svc := maintenance.NewService(q)
	ctx := context.Background()

	_, err := svc.ListRecords(ctx, 1)

	if !errors.Is(err, maintenance.ErrUnauthorized) {
		t.Errorf("ListRecords err = %v, want ErrUnauthorized", err)
	}

	_, err = svc.CreateRecord(ctx, 1, validParams(t))

	if !errors.Is(err, maintenance.ErrUnauthorized) {
		t.Errorf("CreateRecord err = %v, want ErrUnauthorized", err)
	}

	_, err = svc.GetRecord(ctx, 1, 1)

	if !errors.Is(err, maintenance.ErrUnauthorized) {
		t.Errorf("GetRecord err = %v, want ErrUnauthorized", err)
	}

	_, err = svc.UpdateRecord(ctx, 1, 1, validParams(t))

	if !errors.Is(err, maintenance.ErrUnauthorized) {
		t.Errorf("UpdateRecord err = %v, want ErrUnauthorized", err)
	}

	err = svc.DeleteRecord(ctx, 1, 1)

	if !errors.Is(err, maintenance.ErrUnauthorized) {
		t.Errorf("DeleteRecord err = %v, want ErrUnauthorized", err)
	}
}

func validParams(t *testing.T) maintenance.RecordParams {
	t.Helper()

	return maintenance.RecordParams{
		Type:        "tire_rotation",
		Description: "Rotate and balance",
		PerformedAt: date(t, "2026-05-01"),
	}
}

// date returns the stored form of a YYYY-MM-DD date.
func date(t *testing.T, value string) pgtype.Date {
	t.Helper()

	d, err := time.Parse(time.DateOnly, value)

	if err != nil {
		t.Fatalf("parse date %q: %v", value, err)
	}

	return pgtype.Date{Time: d, Valid: true}
}

// amount returns the exact amount for a decimal string such as "49.99".
func amount(t *testing.T, value string) *money.Amount {
	t.Helper()

	a, err := money.Parse(value)

	if err != nil {
		t.Fatalf("parse amount %q: %v", value, err)
	}

	return &a
}

// userContext creates a user in tx and returns it with a context
// authenticated as that user, the way auth.SessionMiddleware would.
func userContext(t *testing.T, tx pgx.Tx) (context.Context, store.User) {
	t.Helper()

	u := testutil.CreateUser(t, tx, testutil.UserOptions{})

	ctx := auth.ContextWithUser(context.Background(), &auth.User{
		Id:    u.ID,
		Email: u.Email,
	})

	return ctx, u
}

// createVehicle creates a vehicle owned by the user in ctx.
func createVehicle(
	t *testing.T,
	ctx context.Context,
	q *store.Queries,
) store.Vehicle {
	t.Helper()

	user, _ := auth.UserFromContext(ctx)

	vehicle, err := q.CreateVehicle(ctx, store.CreateVehicleParams{
		UserID: user.Id,
		Year:   2018,
		Make:   "Toyota",
		Model:  "Tacoma",
	})

	if err != nil {
		t.Fatalf("create vehicle: %v", err)
	}

	return vehicle
}

// createRecord creates a record performed on performedAt for vehicleID.
func createRecord(
	t *testing.T,
	ctx context.Context,
	svc *maintenance.Service,
	vehicleID int64,
	performedAt string,
) store.MaintenanceRecord {
	t.Helper()

	input := validParams(t)
	input.PerformedAt = date(t, performedAt)

	record, err := svc.CreateRecord(ctx, vehicleID, input)

	if err != nil {
		t.Fatalf("create record: %v", err)
	}

	return record
}

func countRecords(t *testing.T, tx pgx.Tx, vehicleID int64) int {
	t.Helper()

	var n int

	err := tx.QueryRow(context.Background(),
		`SELECT count(*) FROM maintenance_records WHERE vehicle_id = $1`,
		vehicleID,
	).Scan(&n)

	if err != nil {
		t.Fatalf("count records: %v", err)
	}

	return n
}

func assertDate(t *testing.T, record store.MaintenanceRecord, want string) {
	t.Helper()

	if !record.PerformedAt.Valid {
		t.Fatalf("performed_at is NULL, want %s", want)
	}

	if got := record.PerformedAt.Time.Format(time.DateOnly); got != want {
		t.Errorf("performed_at = %s, want %s", got, want)
	}
}

// assertIDs fails unless list holds exactly the records with wantIDs, in
// any order.
func assertIDs(t *testing.T, list []store.MaintenanceRecord, wantIDs ...int64) {
	t.Helper()

	got := make(map[int64]bool, len(list))
	for _, r := range list {
		got[r.ID] = true
	}

	if len(list) != len(wantIDs) {
		t.Fatalf("got %d records %v, want IDs %v", len(list), got, wantIDs)
	}
	for _, id := range wantIDs {
		if !got[id] {
			t.Errorf("record %d missing from %v", id, got)
		}
	}
}
