package maintenance

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/maxweisen/otto/backend/internal/httpx"
	"github.com/maxweisen/otto/backend/internal/money"
	"github.com/maxweisen/otto/backend/internal/store"
	"github.com/maxweisen/otto/backend/internal/validate"
)

// VehicleIDParam and RecordIDParam are the URL parameters the handler reads.
// The router mounting Routes must provide VehicleIDParam.
const VehicleIDParam = "vehicleID"
const RecordIDParam = "recordID"

const maxDescriptionLength = 255
const maxNotesLength = 10000

// recordTypes are the accepted values of RecordInput.Type. They are checked
// here rather than in a Postgres enum or CHECK constraint so the list can
// grow without a migration.
var recordTypes = []string{
	"oil_change",
	"tire_rotation",
	"brakes",
	"inspection",
	"repair",
	"other",
}

// minPerformedAt is the earliest accepted service date, the year of the
// first production automobile.
var minPerformedAt = time.Date(1886, time.January, 1, 0, 0, 0, 0, time.UTC)

// maxUTCOffset is the furthest any time zone runs ahead of UTC. A date is
// only in the future once it has not yet started anywhere on Earth.
const maxUTCOffset = 14 * time.Hour

var now = time.Now

// RecordInput is the request body for creating or replacing a maintenance
// record. PerformedAt is a YYYY-MM-DD date and Cost an exact decimal amount
// such as "49.99", so money never passes through a float.
type RecordInput struct {
	Type        string  `json:"type"`
	Description string  `json:"description"`
	PerformedAt string  `json:"performed_at"`
	Mileage     *int32  `json:"mileage"`
	Cost        *string `json:"cost"`
	Notes       *string `json:"notes"`
}

type recordService interface {
	ListRecords(
		ctx context.Context,
		vehicleID int64,
	) ([]store.MaintenanceRecord, error)
	CreateRecord(
		ctx context.Context,
		vehicleID int64,
		params RecordParams,
	) (store.MaintenanceRecord, error)
	GetRecord(
		ctx context.Context,
		vehicleID int64,
		recordID int64,
	) (store.MaintenanceRecord, error)
	UpdateRecord(
		ctx context.Context,
		vehicleID int64,
		recordID int64,
		params RecordParams,
	) (store.MaintenanceRecord, error)
	DeleteRecord(ctx context.Context, vehicleID int64, recordID int64) error
}

var _ recordService = (*Service)(nil)

type Handler struct {
	service recordService
}

func NewHandler(s recordService) *Handler {
	return &Handler{service: s}
}

// Routes returns the maintenance record routes. Mount it under a pattern
// that captures VehicleIDParam, such as /api/vehicles/{vehicleID}/maintenance.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/{"+RecordIDParam+"}", h.Get)
	r.Put("/{"+RecordIDParam+"}", h.Update)
	r.Delete("/{"+RecordIDParam+"}", h.Delete)

	return r
}

func (h *Handler) List(
	w http.ResponseWriter,
	r *http.Request,
) {
	vehicleID, err := httpx.URLParamInt64(r, VehicleIDParam)

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	records, err := h.service.ListRecords(r.Context(), vehicleID)

	if err != nil {
		writeServiceError(w, r, "unable to list maintenance records", err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, records)
}

func (h *Handler) Create(
	w http.ResponseWriter,
	r *http.Request,
) {
	vehicleID, err := httpx.URLParamInt64(r, VehicleIDParam)

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var input RecordInput

	err = httpx.DecodeJSON(w, r, &input)

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	params, err := input.normalizeAndValidate()

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	record, err := h.service.CreateRecord(r.Context(), vehicleID, params)

	if err != nil {
		writeServiceError(w, r, "unable to create maintenance record", err)
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, record)
}

func (h *Handler) Get(
	w http.ResponseWriter,
	r *http.Request,
) {
	vehicleID, recordID, err := recordIDs(r)

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	record, err := h.service.GetRecord(r.Context(), vehicleID, recordID)

	if err != nil {
		writeServiceError(w, r, "unable to get maintenance record", err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, record)
}

func (h *Handler) Update(
	w http.ResponseWriter,
	r *http.Request,
) {
	vehicleID, recordID, err := recordIDs(r)

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var input RecordInput

	err = httpx.DecodeJSON(w, r, &input)

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	params, err := input.normalizeAndValidate()

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	record, err := h.service.UpdateRecord(
		r.Context(),
		vehicleID,
		recordID,
		params,
	)

	if err != nil {
		writeServiceError(w, r, "unable to update maintenance record", err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, record)
}

func (h *Handler) Delete(
	w http.ResponseWriter,
	r *http.Request,
) {
	vehicleID, recordID, err := recordIDs(r)

	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	err = h.service.DeleteRecord(r.Context(), vehicleID, recordID)

	if err != nil {
		writeServiceError(w, r, "unable to delete maintenance record", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// helper functions

// recordIDs reads the vehicle and record ids from the URL.
func recordIDs(r *http.Request) (int64, int64, error) {
	vehicleID, err := httpx.URLParamInt64(r, VehicleIDParam)

	if err != nil {
		return 0, 0, err
	}

	recordID, err := httpx.URLParamInt64(r, RecordIDParam)

	if err != nil {
		return 0, 0, err
	}

	return vehicleID, recordID, nil
}

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
	case errors.Is(err, ErrRecordNotFound):
		httpx.WriteError(
			w,
			http.StatusNotFound,
			"Maintenance record not found.",
		)
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

// normalizeAndValidate trims and normalizes the input, checks it against
// the database schema limits and the domain rules for record type, service
// date, mileage and cost, and converts it into the stored types.
func (in RecordInput) normalizeAndValidate() (RecordParams, error) {
	params := RecordParams{
		Type:        strings.TrimSpace(in.Type),
		Description: strings.TrimSpace(in.Description),
		Mileage:     in.Mileage,
		Notes:       validate.NormalizeOptional(in.Notes),
	}

	if params.Type == "" {
		return RecordParams{}, errors.New("type is required")
	}

	if !slices.Contains(recordTypes, params.Type) {
		return RecordParams{}, fmt.Errorf(
			"type must be one of: %s",
			strings.Join(recordTypes, ", "),
		)
	}

	if params.Description == "" {
		return RecordParams{}, errors.New("description is required")
	}

	textChecks := []struct {
		field     string
		value     *string
		maxLength int
	}{
		{"description", &params.Description, maxDescriptionLength},
		{"notes", params.Notes, maxNotesLength},
	}

	for _, check := range textChecks {
		err := validate.Text(check.field, check.value, check.maxLength)

		if err != nil {
			return RecordParams{}, err
		}
	}

	performedAt, err := parsePerformedAt(strings.TrimSpace(in.PerformedAt))

	if err != nil {
		return RecordParams{}, err
	}

	params.PerformedAt = pgtype.Date{Time: performedAt, Valid: true}

	if params.Mileage != nil && *params.Mileage < 0 {
		return RecordParams{}, errors.New("mileage must not be negative")
	}

	cost, err := parseCost(validate.NormalizeOptional(in.Cost))

	if err != nil {
		return RecordParams{}, err
	}

	params.Cost = cost

	return params, nil
}

// parsePerformedAt parses a YYYY-MM-DD service date and checks that it is
// neither before minPerformedAt nor in the future.
func parsePerformedAt(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, errors.New("performed_at is required")
	}

	date, err := time.Parse(time.DateOnly, value)

	if err != nil {
		return time.Time{}, errors.New("performed_at must be a date in YYYY-MM-DD format")
	}

	if date.Before(minPerformedAt) {
		return time.Time{}, fmt.Errorf(
			"performed_at must not be before %s",
			minPerformedAt.Format(time.DateOnly),
		)
	}

	latest := now().UTC().Add(maxUTCOffset)

	if date.After(latest) {
		return time.Time{}, errors.New("performed_at must not be in the future")
	}

	return date, nil
}

// parseCost parses an optional decimal cost such as "49.99" into an exact
// amount. A nil cost stays nil.
func parseCost(value *string) (*money.Amount, error) {
	if value == nil {
		return nil, nil
	}

	cost, err := money.Parse(*value)

	if errors.Is(err, money.ErrNegative) {
		return nil, errors.New("cost must not be negative")
	}

	if err != nil {
		return nil, errors.New(
			"cost must be a decimal amount with at most 8 digits before " +
				"and 2 after the decimal point, e.g. \"49.99\"",
		)
	}

	return &cost, nil
}
