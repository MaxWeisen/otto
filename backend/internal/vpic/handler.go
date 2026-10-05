package vpic

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/maxweisen/otto/backend/internal/httpx"
	"github.com/maxweisen/otto/backend/internal/validate"
)

var now = time.Now

const upstreamErrorMessage = "Vehicle data lookup is unavailable right now. Please try again."

// statusClientClosedRequest is the non-standard status recorded when the
// client goes away before the lookup finishes.
const statusClientClosedRequest = 499

type lookupService interface {
	ModelsForMakeYear(ctx context.Context, makeName string, year int) ([]string, error)
	DecodeVIN(ctx context.Context, vin string) (DecodedVIN, error)
}

var _ lookupService = (*Client)(nil)

type Handler struct {
	service lookupService
}

func NewHandler(s lookupService) *Handler {
	return &Handler{service: s}
}

type modelsResponse struct {
	Models []string `json:"models"`
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/models", h.Models)
	r.Get("/decode/{vin}", h.Decode)

	return r
}

// Models lists the models vPIC knows for the make and year query parameters.
func (h *Handler) Models(
	w http.ResponseWriter,
	r *http.Request,
) {
	makeName := strings.TrimSpace(r.URL.Query().Get("make"))

	err := validateMake(makeName)

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	year, err := parseYear(r.URL.Query().Get("year"))

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	models, err := h.service.ModelsForMakeYear(r.Context(), makeName, year)

	if err != nil {
		writeLookupError(w, r, "unable to list vpic models", err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, modelsResponse{Models: models})
}

// Decode returns the year, make, model and trim decoded from the VIN in the
// path.
func (h *Handler) Decode(
	w http.ResponseWriter,
	r *http.Request,
) {
	vin := strings.ToUpper(strings.TrimSpace(chi.URLParam(r, "vin")))

	err := validate.VIN("vin", vin)

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	decoded, err := h.service.DecodeVIN(r.Context(), vin)

	if err != nil {
		writeLookupError(w, r, "unable to decode vin", err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, decoded)
}

// helper functions

func validateMake(makeName string) error {
	if makeName == "" {
		return errors.New("make is required")
	}

	return validate.Text("make", &makeName, validate.MaxTextLength)
}

func parseYear(raw string) (int, error) {
	// Atoi yields 0 or an out-of-range value for anything that is not a
	// whole number, so ModelYear reports it like any other invalid year.
	year, _ := strconv.Atoi(strings.TrimSpace(raw))

	err := validate.ModelYear("year", year, now())

	if err != nil {
		return 0, err
	}

	return year, nil
}

// writeLookupError maps an error from the lookup service to an HTTP response.
// Upstream details are logged but never sent to the client. Lookups abandoned
// by the client are not logged.
func writeLookupError(
	w http.ResponseWriter,
	r *http.Request,
	msg string,
	err error,
) {
	switch {
	case r.Context().Err() != nil:
		w.WriteHeader(statusClientClosedRequest)
	case errors.Is(err, ErrVINNotFound):
		httpx.WriteError(w, http.StatusNotFound, "No vehicle data found for this VIN.")
	case errors.Is(err, ErrUpstream):
		slog.Warn(msg,
			"err", err,
			"request_id", middleware.GetReqID(r.Context()))

		httpx.WriteError(w, http.StatusBadGateway, upstreamErrorMessage)
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
