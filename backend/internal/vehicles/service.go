package vehicles

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/maxweisen/otto/backend/internal/auth"
	"github.com/maxweisen/otto/backend/internal/store"
)

var ErrUnauthorized = errors.New("unauthorized")
var ErrVehicleNotFound = errors.New("vehicle not found")

type Service struct {
	queries *store.Queries
}

type CreateVehicleInput struct {
	Year     int16   `json:"year"`
	Make     string  `json:"make"`
	Model    string  `json:"model"`
	Trim     *string `json:"trim"`
	Vin      *string `json:"vin"`
	Nickname *string `json:"nickname"`
	Mileage  *int32  `json:"mileage"`
}

type UpdateVehicleInput struct {
	Year     int16   `json:"year"`
	Make     string  `json:"make"`
	Model    string  `json:"model"`
	Trim     *string `json:"trim"`
	Vin      *string `json:"vin"`
	Nickname *string `json:"nickname"`
	Mileage  *int32  `json:"mileage"`
}

func NewService(q *store.Queries) *Service {
	return &Service{
		queries: q,
	}
}

func (s *Service) CreateVehicle(
	ctx context.Context,
	params CreateVehicleInput,
) (store.Vehicle, error) {
	user, ok := auth.UserFromContext(ctx)

	if !ok {
		return store.Vehicle{}, ErrUnauthorized
	}

	vehicle, err := s.queries.CreateVehicle(ctx, store.CreateVehicleParams{
		UserID:   user.Id,
		Year:     params.Year,
		Make:     params.Make,
		Model:    params.Model,
		Trim:     params.Trim,
		Vin:      params.Vin,
		Nickname: params.Nickname,
		Mileage:  params.Mileage,
	})

	if err != nil {
		return store.Vehicle{}, err
	}

	return vehicle, nil
}

func (s *Service) ListVehiclesByUser(
	ctx context.Context,
) ([]store.Vehicle, error) {
	user, ok := auth.UserFromContext(ctx)

	if !ok {
		return nil, ErrUnauthorized
	}

	vehicles, err := s.queries.ListVehiclesByUser(ctx, user.Id)

	if err != nil {
		return nil, err
	}

	return vehicles, nil
}

func (s *Service) GetVehicle(
	ctx context.Context,
	id int64,
) (store.Vehicle, error) {
	user, ok := auth.UserFromContext(ctx)

	if !ok {
		return store.Vehicle{}, ErrUnauthorized
	}

	vehicle, err := s.queries.GetVehicle(
		ctx,
		store.GetVehicleParams{ID: id, UserID: user.Id},
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return store.Vehicle{}, ErrVehicleNotFound
	}

	if err != nil {
		return store.Vehicle{}, err
	}

	return vehicle, nil
}

func (s *Service) UpdateVehicle(
	ctx context.Context,
	vehicleID int64,
	params UpdateVehicleInput,
) (store.Vehicle, error) {
	user, ok := auth.UserFromContext(ctx)

	if !ok {
		return store.Vehicle{}, ErrUnauthorized
	}

	vehicle, err := s.queries.UpdateVehicle(ctx, store.UpdateVehicleParams{
		Year:     params.Year,
		Make:     params.Make,
		Model:    params.Model,
		Trim:     params.Trim,
		Vin:      params.Vin,
		Nickname: params.Nickname,
		Mileage:  params.Mileage,
		ID:       vehicleID,
		UserID:   user.Id,
	})

	if errors.Is(err, pgx.ErrNoRows) {
		return store.Vehicle{}, ErrVehicleNotFound
	}

	if err != nil {
		return store.Vehicle{}, err
	}

	return vehicle, nil
}

func (s *Service) DeleteVehicle(ctx context.Context, vehicleID int64) error {
	user, ok := auth.UserFromContext(ctx)

	if !ok {
		return ErrUnauthorized
	}

	rowsDeleted, err := s.queries.DeleteVehicle(ctx, store.DeleteVehicleParams{
		ID:     vehicleID,
		UserID: user.Id,
	})

	if err != nil {
		return err
	}

	if rowsDeleted == 0 {
		return ErrVehicleNotFound
	}

	return nil
}
