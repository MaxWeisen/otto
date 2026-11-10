package maintenance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"slices"
	"strconv"
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
var minPerformedAt = time.Date(
	validate.MinModelYear, time.January, 1, 0, 0, 0, 0, time.UTC,
)

// maxUTCOffset is the furthest any time zone runs ahead of UTC. A date is
// only in the future once it has not yet started anywhere on Earth.
const maxUTCOffset = 14 * time.Hour

var now = time.Now

// groupedDigits matches a whole number written without separators or with a
// comma before every group of three digits, such as 84500 or 84,500.
var groupedDigits = regexp.MustCompile(`^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$`)

// RecordInput is the request body for creating or replacing a maintenance
// record. PerformedAt is a YYYY-MM-DD date and Cost an exact decimal amount
// such as "1,234.56", so money never passes through a float. Mileage is a
// JSON number or a string such as "84,500", kept raw so a value that is not
// a whole number is reported as a mileage field error instead of failing to
// decode the whole body.
type RecordInput struct {
	Type        string          `json:"type"`
	Description string          `json:"description"`
	PerformedAt string          `json:"performed_at"`
	Mileage     json.RawMessage `json:"mileage"`
	Cost        *string         `json:"cost"`
	Notes       *string         `json:"notes"`
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

	params, fieldErrors := input.normalizeAndValidate()

	if len(fieldErrors) > 0 {
		httpx.WriteFieldErrors(w, fieldErrors)
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

	params, fieldErrors := input.normalizeAndValidate()

	if len(fieldErrors) > 0 {
		httpx.WriteFieldErrors(w, fieldErrors)
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
// the database schema limits and the domain rules, and converts it into the
// stored types. It returns a message for each invalid field.
func (in RecordInput) normalizeAndValidate() (RecordParams, map[string]string) {
	errs := map[string]string{}
	params := RecordParams{
		Type:        strings.TrimSpace(in.Type),
		Description: strings.TrimSpace(in.Description),
		Notes:       validate.NormalizeOptional(in.Notes),
	}

	switch {
	case params.Type == "":
		errs["type"] = "Type is required"
	case !slices.Contains(recordTypes, params.Type):
		errs["type"] = "Choose a type from the list"
	}

	if params.Description == "" {
		errs["description"] = "Description is required"
	} else if err := validate.Text("Description", &params.Description, maxDescriptionLength); err != nil {
		errs["description"] = err.Error()
	}

	if err := validate.Text("Notes", params.Notes, maxNotesLength); err != nil {
		errs["notes"] = err.Error()
	}

	performedAt, msg := parsePerformedAt(strings.TrimSpace(in.PerformedAt))

	if msg != "" {
		errs["performed_at"] = msg
	} else {
		params.PerformedAt = pgtype.Date{Time: performedAt, Valid: true}
	}

	params.Mileage, msg = parseMileage(in.Mileage)

	if msg != "" {
		errs["mileage"] = msg
	}

	params.Cost, msg = parseCost(validate.NormalizeOptional(in.Cost))

	if msg != "" {
		errs["cost"] = msg
	}

	return params, errs
}

// parsePerformedAt parses a YYYY-MM-DD service date and checks that it is
// neither before minPerformedAt nor in the future.
func parsePerformedAt(value string) (time.Time, string) {
	if value == "" {
		return time.Time{}, "Date is required"
	}

	date, err := time.Parse(time.DateOnly, value)

	if err != nil {
		return time.Time{}, "Date must be a valid date"
	}

	if date.Before(minPerformedAt) {
		return time.Time{}, fmt.Sprintf(
			"Date must not be before %d",
			minPerformedAt.Year(),
		)
	}

	if date.After(now().UTC().Add(maxUTCOffset)) {
		return time.Time{}, "Date must not be in the future"
	}

	return date, ""
}

// parseMileage reads an optional whole-number mileage from a JSON number or
// a string with optional thousands separators. Absent, null and blank stay
// nil.
func parseMileage(raw json.RawMessage) (*int32, string) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, ""
	}

	text := string(raw)

	if json.Unmarshal(raw, &text) == nil {
		text = strings.TrimSpace(text)

		if text == "" {
			return nil, ""
		}
	}

	digits, negative := strings.CutPrefix(text, "-")

	if !groupedDigits.MatchString(digits) {
		return nil, "Mileage must be a whole number like 84,500"
	}

	mileage, err := strconv.ParseInt(strings.ReplaceAll(digits, ",", ""), 10, 32)

	if negative && (err != nil || mileage != 0) {
		return nil, "Mileage must not be negative"
	}

	if err != nil {
		return nil, "Mileage is too large"
	}

	result := int32(mileage)

	return &result, ""
}

// parseCost parses an optional decimal cost with optional thousands
// separators, such as "1,234.56", into an exact amount. A nil cost stays
// nil.
func parseCost(value *string) (*money.Amount, string) {
	if value == nil {
		return nil, ""
	}

	whole, fraction, hasFraction := strings.Cut(*value, ".")

	if !groupedDigits.MatchString(strings.TrimPrefix(whole, "-")) {
		return nil, "Cost must be an amount like 1,234.56"
	}

	plain := strings.ReplaceAll(whole, ",", "")

	if hasFraction {
		plain += "." + fraction
	}

	cost, err := money.Parse(plain)

	if errors.Is(err, money.ErrNegative) {
		return nil, "Cost must not be negative"
	}

	if err != nil {
		return nil, "Cost must be an amount like 1,234.56"
	}

	return &cost, ""
}
