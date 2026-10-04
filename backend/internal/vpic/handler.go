package vpic

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/maxweisen/otto/backend/internal/httpx"
)

// These limits match the vehicle validation in internal/vehicles.
const minModelYear = 1886
const vinLength = 17
const maxMakeLength = 255

var vinPattern = regexp.MustCompile(
	fmt.Sprintf("^[A-HJ-NPR-Z0-9]{%d}$", vinLength),
)

var now = time.Now

const upstreamErrorMessage = "Vehicle data lookup is unavailable right now. Please try again."

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

	if !vinPattern.MatchString(vin) {
		httpx.WriteError(
			w,
			http.StatusBadRequest,
			fmt.Sprintf(
				"vin must be %d characters using letters and digits, excluding I, O and Q",
				vinLength,
			),
		)
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

	if strings.ContainsRune(makeName, 0) {
		return errors.New("make must not contain null characters")
	}

	if utf8.RuneCountInString(makeName) > maxMakeLength {
		return fmt.Errorf("make must be at most %d characters", maxMakeLength)
	}

	return nil
}

func parseYear(raw string) (int, error) {
	maxYear := now().Year() + 1
	rangeErr := fmt.Errorf(
		"year must be between %d and %d",
		minModelYear,
		maxYear,
	)

	year, err := strconv.Atoi(strings.TrimSpace(raw))

	if err != nil {
		return 0, rangeErr
	}

	if year < minModelYear || year > maxYear {
		return 0, rangeErr
	}

	return year, nil
}

// writeLookupError maps an error from the lookup service to an HTTP response.
// Upstream details are logged but never sent to the client.
func writeLookupError(
	w http.ResponseWriter,
	r *http.Request,
	msg string,
	err error,
) {
	switch {
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
