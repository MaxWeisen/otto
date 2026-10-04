package vehicles

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/maxweisen/otto/backend/internal/httpx"
)

const minVehicleYear = 1886
const vinLength = 17

type Handler struct {
	service *Service
}

func NewHandler(s *Service) *Handler {
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
	var input CreateVehicleInput

	err := httpx.DecodeJSON(w, r, &input)

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	input.Make = strings.TrimSpace(input.Make)
	input.Model = strings.TrimSpace(input.Model)

	err = validateVehicle(input.Year, input.Make, input.Model, input.Vin)

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

	var input UpdateVehicleInput

	err = httpx.DecodeJSON(w, r, &input)

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	input.Make = strings.TrimSpace(input.Make)
	input.Model = strings.TrimSpace(input.Model)

	err = validateVehicle(input.Year, input.Make, input.Model, input.Vin)

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

func validateVehicle(
	year int16,
	vehicleMake string,
	model string,
	vin *string,
) error {
	maxYear := time.Now().Year() + 1

	if int(year) < minVehicleYear || int(year) > maxYear {
		return fmt.Errorf(
			"year must be between %d and %d",
			minVehicleYear,
			maxYear,
		)
	}

	if vehicleMake == "" {
		return errors.New("make is required")
	}

	if model == "" {
		return errors.New("model is required")
	}

	if vin != nil && len(*vin) != vinLength {
		return fmt.Errorf("vin must be %d characters", vinLength)
	}

	return nil
}
