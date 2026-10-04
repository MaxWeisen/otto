package vehicles

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/maxweisen/otto/backend/internal/httpx"
	"github.com/maxweisen/otto/backend/internal/store"
)

const minVehicleYear = 1886
const vinLength = 17
const maxTextLength = 255

var vinPattern = regexp.MustCompile(
	fmt.Sprintf("^[A-HJ-NPR-Z0-9]{%d}$", vinLength),
)

// now is the clock the year validation reads. Tests pin it to a fixed date.
var now = time.Now

// vehicleService is the subset of *Service the handler depends on, so tests
// can substitute a fake.
type vehicleService interface {
	ListVehiclesByUser(ctx context.Context) ([]store.Vehicle, error)
	CreateVehicle(ctx context.Context, params VehicleInput) (store.Vehicle, error)
	GetVehicle(ctx context.Context, id int64) (store.Vehicle, error)
	UpdateVehicle(
		ctx context.Context,
		vehicleID int64,
		params VehicleInput,
	) (store.Vehicle, error)
	DeleteVehicle(ctx context.Context, vehicleID int64) error
}

var _ vehicleService = (*Service)(nil)

type Handler struct {
	service vehicleService
}

func NewHandler(s vehicleService) *Handler {
	return &Handler{service: s}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/{id}", h.Get)
	r.Put("/{id}", h.Update)
	r.Delete("/{id}", h.Delete)

	return r
}

func (h *Handler) List(
	w http.ResponseWriter,
	r *http.Request,
) {
	vehicles, err := h.service.ListVehiclesByUser(r.Context())

	if err != nil {
		writeServiceError(w, r, "unable to list vehicles by user", err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, vehicles)
}

func (h *Handler) Create(
	w http.ResponseWriter,
	r *http.Request,
) {
	var input VehicleInput

	err := httpx.DecodeJSON(w, r, &input)

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	err = input.normalizeAndValidate()

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	vehicle, err := h.service.CreateVehicle(r.Context(), input)

	if err != nil {
		writeServiceError(w, r, "unable to create vehicle", err)
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, vehicle)
}

func (h *Handler) Get(
	w http.ResponseWriter,
	r *http.Request,
) {
	id, err := httpx.URLParamInt64(r, "id")

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	vehicle, err := h.service.GetVehicle(r.Context(), id)

	if err != nil {
		writeServiceError(w, r, "unable to get vehicle", err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, vehicle)
}

func (h *Handler) Update(
	w http.ResponseWriter,
	r *http.Request,
) {
	id, err := httpx.URLParamInt64(r, "id")

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var input VehicleInput

	err = httpx.DecodeJSON(w, r, &input)

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	err = input.normalizeAndValidate()

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	vehicle, err := h.service.UpdateVehicle(r.Context(), id, input)

	if err != nil {
		writeServiceError(w, r, "unable to update vehicle", err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, vehicle)
}

func (h *Handler) Delete(
	w http.ResponseWriter,
	r *http.Request,
) {
	id, err := httpx.URLParamInt64(r, "id")

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	err = h.service.DeleteVehicle(r.Context(), id)

	if err != nil {
		writeServiceError(w, r, "unable to delete vehicle", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// helper functions

// writeServiceError maps an error returned by the service to an HTTP
// response. Unexpected errors are logged and hidden behind a generic 500.
func writeServiceError(
	w http.ResponseWriter,
	r *http.Request,
	msg string,
	err error,
) {
	switch {
	case errors.Is(err, ErrUnauthorized):
		httpx.WriteError(w, http.StatusUnauthorized, "Unauthorized.")
	case errors.Is(err, ErrVehicleNotFound):
		httpx.WriteError(w, http.StatusNotFound, "Vehicle not found.")
	default:
		slog.Error(msg,
			"err", err,
			"request_id", middleware.GetReqID(r.Context()))

		httpx.WriteError(
			w,
			http.StatusInternalServerError,
			"Something went wrong. Please try again.",
		)
	}
}

// normalizeOptional trims an optional string and turns a blank value into nil
// so it is stored as NULL.
func normalizeOptional(s *string) *string {
	if s == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*s)

	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func validateText(
	field string,
	value *string,
) error {
	if value == nil {
		return nil
	}

	if strings.ContainsRune(*value, 0) {
		return fmt.Errorf("%s must not contain null characters", field)
	}

	if utf8.RuneCountInString(*value) > maxTextLength {
		return fmt.Errorf(
			"%s must be at most %d characters",
			field,
			maxTextLength,
		)
	}

	return nil
}

// normalizeAndValidate trims and normalizes the input in place, then checks
// it against the database schema limits and the domain rules for year range,
// VIN format and mileage.
func (in *VehicleInput) normalizeAndValidate() error {
	in.Make = strings.TrimSpace(in.Make)
	in.Model = strings.TrimSpace(in.Model)
	in.Trim = normalizeOptional(in.Trim)
	in.Nickname = normalizeOptional(in.Nickname)
	in.Vin = normalizeOptional(in.Vin)

	if in.Vin != nil {
		upper := strings.ToUpper(*in.Vin)
		in.Vin = &upper
	}

	maxYear := now().Year() + 1

	if int(in.Year) < minVehicleYear || int(in.Year) > maxYear {
		return fmt.Errorf(
			"year must be between %d and %d",
			minVehicleYear,
			maxYear,
		)
	}

	if in.Make == "" {
		return errors.New("make is required")
	}

	if in.Model == "" {
		return errors.New("model is required")
	}

	textChecks := []struct {
		field string
		value *string
	}{
		{"make", &in.Make},
		{"model", &in.Model},
		{"trim", in.Trim},
		{"vin", in.Vin},
		{"nickname", in.Nickname},
	}

	for _, check := range textChecks {
		err := validateText(check.field, check.value)

		if err != nil {
			return err
		}
	}

	if in.Vin != nil && !vinPattern.MatchString(*in.Vin) {
		return fmt.Errorf(
			"vin must be %d characters using letters and digits, excluding I, O and Q",
			vinLength,
		)
	}

	if in.Mileage != nil && *in.Mileage < 0 {
		return errors.New("mileage must not be negative")
	}

	return nil
}
