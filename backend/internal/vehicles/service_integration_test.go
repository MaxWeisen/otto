//go:build integration

package vehicles_test

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/maxweisen/otto/backend/internal/auth"
	"github.com/maxweisen/otto/backend/internal/store"
	"github.com/maxweisen/otto/backend/internal/testutil"
	"github.com/maxweisen/otto/backend/internal/vehicles"
)

func TestServiceCRUD(t *testing.T) {
	tx, q := testutil.TxDB(t)
	svc := vehicles.NewService(q)
	ctx := userContext(t, tx)

	created, err := svc.CreateVehicle(ctx, vehicles.VehicleInput{
		Year:     2018,
		Make:     "Toyota",
		Model:    "Tacoma",
		Trim:     new("TRD Off-Road"),
		Vin:      new("5TFCZ5AN0JX123456"),
		Nickname: new("Taco"),
		Mileage:  new(int32(84000)),
	})

	if err != nil {
		t.Fatalf("CreateVehicle: %v", err)
	}
	if created.ID == 0 || created.Make != "Toyota" || *created.Nickname != "Taco" {
		t.Fatalf("CreateVehicle = %+v, want stored input", created)
	}

	second, err := svc.CreateVehicle(ctx, vehicles.VehicleInput{
		Year:  2009,
		Make:  "Honda",
		Model: "Fit",
	})

	if err != nil {
		t.Fatalf("CreateVehicle: %v", err)
	}
	if second.Trim != nil || second.Vin != nil || second.Mileage != nil {
		t.Errorf("CreateVehicle = %+v, want NULL optional fields", second)
	}

	list, err := svc.ListVehiclesByUser(ctx)

	if err != nil {
		t.Fatalf("ListVehiclesByUser: %v", err)
	}
	assertIDs(t, list, created.ID, second.ID)

	got, err := svc.GetVehicle(ctx, created.ID)

	if err != nil {
		t.Fatalf("GetVehicle: %v", err)
	}
	if got.ID != created.ID || got.Model != "Tacoma" {
		t.Errorf("GetVehicle = %+v, want %+v", got, created)
	}

	updated, err := svc.UpdateVehicle(ctx, created.ID, vehicles.VehicleInput{
		Year:    2019,
		Make:    "Toyota",
		Model:   "Tacoma",
		Mileage: new(int32(90000)),
	})

	if err != nil {
		t.Fatalf("UpdateVehicle: %v", err)
	}
	if updated.Year != 2019 || *updated.Mileage != 90000 || updated.Nickname != nil {
		t.Errorf("UpdateVehicle = %+v, want year 2019, mileage 90000, no nickname", updated)
	}

	err = svc.DeleteVehicle(ctx, created.ID)

	if err != nil {
		t.Fatalf("DeleteVehicle: %v", err)
	}

	_, err = svc.GetVehicle(ctx, created.ID)

	if !errors.Is(err, vehicles.ErrVehicleNotFound) {
		t.Errorf("GetVehicle after delete err = %v, want ErrVehicleNotFound", err)
	}

	list, err = svc.ListVehiclesByUser(ctx)

	if err != nil {
		t.Fatalf("ListVehiclesByUser: %v", err)
	}
	assertIDs(t, list, second.ID)
}

func TestServiceNotFound(t *testing.T) {
	tx, q := testutil.TxDB(t)
	svc := vehicles.NewService(q)
	ctx := userContext(t, tx)
	const missingID = int64(-1)

	_, err := svc.GetVehicle(ctx, missingID)

	if !errors.Is(err, vehicles.ErrVehicleNotFound) {
		t.Errorf("GetVehicle err = %v, want ErrVehicleNotFound", err)
	}

	_, err = svc.UpdateVehicle(ctx, missingID, vehicles.VehicleInput{
		Year:  2020,
		Make:  "Ford",
		Model: "Ranger",
	})

	if !errors.Is(err, vehicles.ErrVehicleNotFound) {
		t.Errorf("UpdateVehicle err = %v, want ErrVehicleNotFound", err)
	}

	err = svc.DeleteVehicle(ctx, missingID)

	if !errors.Is(err, vehicles.ErrVehicleNotFound) {
		t.Errorf("DeleteVehicle err = %v, want ErrVehicleNotFound", err)
	}

	list, err := svc.ListVehiclesByUser(ctx)

	if err != nil {
		t.Fatalf("ListVehiclesByUser: %v", err)
	}
	if list == nil || len(list) != 0 {
		t.Errorf("ListVehiclesByUser = %#v, want empty non-nil slice", list)
	}
}

func TestServiceIsolatesUsers(t *testing.T) {
	tx, q := testutil.TxDB(t)
	svc := vehicles.NewService(q)
	ctxA := userContext(t, tx)
	ctxB := userContext(t, tx)

	vehicleA, err := svc.CreateVehicle(ctxA, vehicles.VehicleInput{
		Year:  2015,
		Make:  "Subaru",
		Model: "Outback",
	})

	if err != nil {
		t.Fatalf("CreateVehicle A: %v", err)
	}

	vehicleB, err := svc.CreateVehicle(ctxB, vehicles.VehicleInput{
		Year:  2021,
		Make:  "Mazda",
		Model: "CX-5",
	})

	if err != nil {
		t.Fatalf("CreateVehicle B: %v", err)
	}

	_, err = svc.GetVehicle(ctxB, vehicleA.ID)

	if !errors.Is(err, vehicles.ErrVehicleNotFound) {
		t.Errorf("B GetVehicle(A) err = %v, want ErrVehicleNotFound", err)
	}

	_, err = svc.UpdateVehicle(ctxB, vehicleA.ID, vehicles.VehicleInput{
		Year:  1999,
		Make:  "Hijacked",
		Model: "Hijacked",
	})

	if !errors.Is(err, vehicles.ErrVehicleNotFound) {
		t.Errorf("B UpdateVehicle(A) err = %v, want ErrVehicleNotFound", err)
	}

	err = svc.DeleteVehicle(ctxB, vehicleA.ID)

	if !errors.Is(err, vehicles.ErrVehicleNotFound) {
		t.Errorf("B DeleteVehicle(A) err = %v, want ErrVehicleNotFound", err)
	}

	listB, err := svc.ListVehiclesByUser(ctxB)

	if err != nil {
		t.Fatalf("ListVehiclesByUser B: %v", err)
	}
	assertIDs(t, listB, vehicleB.ID)

	// A's vehicle must be untouched by B's update and delete attempts.
	got, err := svc.GetVehicle(ctxA, vehicleA.ID)

	if err != nil {
		t.Fatalf("A GetVehicle: %v", err)
	}
	if got.Make != "Subaru" || got.Year != 2015 {
		t.Errorf("A GetVehicle = %+v, want unchanged Subaru 2015", got)
	}
}

// userContext creates a user in tx and returns a context authenticated as
// that user, the way auth.SessionMiddleware would.
func userContext(t *testing.T, tx pgx.Tx) context.Context {
	t.Helper()

	u := testutil.CreateUser(t, tx, testutil.UserOptions{})

	return auth.ContextWithUser(context.Background(), &auth.User{
		Id:    u.ID,
		Email: u.Email,
	})
}

// assertIDs fails unless list holds exactly the vehicles with wantIDs, in
// any order.
func assertIDs(t *testing.T, list []store.Vehicle, wantIDs ...int64) {
	t.Helper()

	got := make(map[int64]bool, len(list))
	for _, v := range list {
		got[v.ID] = true
	}

	if len(list) != len(wantIDs) {
		t.Fatalf("got %d vehicles %v, want IDs %v", len(list), got, wantIDs)
	}
	for _, id := range wantIDs {
		if !got[id] {
			t.Errorf("vehicle %d missing from %v", id, got)
		}
	}
}
