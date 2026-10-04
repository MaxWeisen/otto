package maintenance

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/maxweisen/otto/backend/internal/auth"
	"github.com/maxweisen/otto/backend/internal/money"
	"github.com/maxweisen/otto/backend/internal/store"
)

var ErrUnauthorized = errors.New("unauthorized")
var ErrVehicleNotFound = errors.New("vehicle not found")
var ErrRecordNotFound = errors.New("maintenance record not found")

type Service struct {
	queries *store.Queries
}

// RecordParams is the validated content of a maintenance record, in the
// types it is stored as.
type RecordParams struct {
	Type        string
	Description string
	PerformedAt pgtype.Date
	Mileage     *int32
	Cost        *money.Amount
	Notes       *string
}

func NewService(q *store.Queries) *Service {
	return &Service{
		queries: q,
	}
}

func (s *Service) CreateRecord(
	ctx context.Context,
	vehicleID int64,
	params RecordParams,
) (store.MaintenanceRecord, error) {
	user, ok := auth.UserFromContext(ctx)

	if !ok {
		return store.MaintenanceRecord{}, ErrUnauthorized
	}

	record, err := s.queries.CreateMaintenanceRecord(
		ctx,
		store.CreateMaintenanceRecordParams{
			Type:        params.Type,
			Description: params.Description,
			PerformedAt: params.PerformedAt,
			Mileage:     params.Mileage,
			Cost:        params.Cost,
			Notes:       params.Notes,
			VehicleID:   vehicleID,
			UserID:      user.Id,
		},
	)

	// The insert selects from the user's own vehicles, so no row means the
	// vehicle does not exist or belongs to someone else.
	if errors.Is(err, pgx.ErrNoRows) {
		return store.MaintenanceRecord{}, ErrVehicleNotFound
	}

	if err != nil {
		return store.MaintenanceRecord{}, err
	}

	return record, nil
}

func (s *Service) ListRecords(
	ctx context.Context,
	vehicleID int64,
) ([]store.MaintenanceRecord, error) {
	user, ok := auth.UserFromContext(ctx)

	if !ok {
		return nil, ErrUnauthorized
	}

	// An empty list is ambiguous, so check the vehicle first to answer 404
	// rather than [] for a vehicle the user does not own.
	_, err := s.queries.GetVehicle(
		ctx,
		store.GetVehicleParams{ID: vehicleID, UserID: user.Id},
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrVehicleNotFound
	}

	if err != nil {
		return nil, err
	}

	records, err := s.queries.ListMaintenanceRecordsByVehicle(
		ctx,
		store.ListMaintenanceRecordsByVehicleParams{
			VehicleID: vehicleID,
			UserID:    user.Id,
		},
	)

	if err != nil {
		return nil, err
	}

	return records, nil
}

func (s *Service) GetRecord(
	ctx context.Context,
	vehicleID int64,
	recordID int64,
) (store.MaintenanceRecord, error) {
	user, ok := auth.UserFromContext(ctx)

	if !ok {
		return store.MaintenanceRecord{}, ErrUnauthorized
	}

	record, err := s.queries.GetMaintenanceRecord(
		ctx,
		store.GetMaintenanceRecordParams{
			ID:        recordID,
			VehicleID: vehicleID,
			UserID:    user.Id,
		},
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return store.MaintenanceRecord{}, ErrRecordNotFound
	}

	if err != nil {
		return store.MaintenanceRecord{}, err
	}

	return record, nil
}

func (s *Service) UpdateRecord(
	ctx context.Context,
	vehicleID int64,
	recordID int64,
	params RecordParams,
) (store.MaintenanceRecord, error) {
	user, ok := auth.UserFromContext(ctx)

	if !ok {
		return store.MaintenanceRecord{}, ErrUnauthorized
	}

	record, err := s.queries.UpdateMaintenanceRecord(
		ctx,
		store.UpdateMaintenanceRecordParams{
			Type:        params.Type,
			Description: params.Description,
			PerformedAt: params.PerformedAt,
			Mileage:     params.Mileage,
			Cost:        params.Cost,
			Notes:       params.Notes,
			ID:          recordID,
			VehicleID:   vehicleID,
			UserID:      user.Id,
		},
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return store.MaintenanceRecord{}, ErrRecordNotFound
	}

	if err != nil {
		return store.MaintenanceRecord{}, err
	}

	return record, nil
}

func (s *Service) DeleteRecord(
	ctx context.Context,
	vehicleID int64,
	recordID int64,
) error {
	user, ok := auth.UserFromContext(ctx)

	if !ok {
		return ErrUnauthorized
	}

	rowsDeleted, err := s.queries.DeleteMaintenanceRecord(
		ctx,
		store.DeleteMaintenanceRecordParams{
			ID:        recordID,
			VehicleID: vehicleID,
			UserID:    user.Id,
		},
	)

	if err != nil {
		return err
	}

	if rowsDeleted == 0 {
		return ErrRecordNotFound
	}

	return nil
}
