// Package httpx holds small HTTP helpers shared by the backend's handlers.
package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

// MaxBodyBytes is the largest request body DecodeJSON will read.
const MaxBodyBytes = 1 << 20

type errorResponse struct {
	Error string `json:"error"`
}

// WriteJSON writes v as a JSON response with the given status code.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// WriteError writes msg as a JSON error response of the form {"error": msg}.
func WriteError(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, errorResponse{Error: msg})
}

// DecodeJSON decodes a single JSON object from the request body into dst.
// The body is capped at MaxBodyBytes, unknown fields and trailing data are
// rejected, and the returned error message is safe to send to the client.
func DecodeJSON(
	w http.ResponseWriter,
	r *http.Request,
	dst any,
) error {
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)

	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	err := dec.Decode(dst)

	if err != nil {
		return decodeError(err)
	}

	err = dec.Decode(&struct{}{})

	if !errors.Is(err, io.EOF) {
		return errors.New("request body must contain a single JSON object")
	}

	return nil
}

// URLParamInt64 reads the chi URL parameter name and parses it as an int64.
func URLParamInt64(r *http.Request, name string) (int64, error) {
	raw := chi.URLParam(r, name)

	value, err := strconv.ParseInt(raw, 10, 64)

	if err != nil {
		return 0, fmt.Errorf("invalid %s: must be an integer", name)
	}

	return value, nil
}

func decodeError(err error) error {
	var syntaxErr *json.SyntaxError
	var typeErr *json.UnmarshalTypeError
	var maxBytesErr *http.MaxBytesError

	switch {
	case errors.As(err, &syntaxErr):
		return fmt.Errorf(
			"request body contains malformed JSON (at position %d)",
			syntaxErr.Offset,
		)
	case errors.Is(err, io.ErrUnexpectedEOF):
		return errors.New("request body contains malformed JSON")
	case errors.As(err, &typeErr):
		if typeErr.Field != "" {
			return fmt.Errorf(
				"request body has an invalid value for field %q",
				typeErr.Field,
			)
		}
		return errors.New("request body has an invalid value")
	case strings.HasPrefix(err.Error(), "json: unknown field "):
		field := strings.TrimPrefix(err.Error(), "json: unknown field ")
		return fmt.Errorf("request body contains unknown field %s", field)
	case errors.Is(err, io.EOF):
		return errors.New("request body must not be empty")
	case errors.As(err, &maxBytesErr):
		return fmt.Errorf(
			"request body must not be larger than %d bytes",
			maxBytesErr.Limit,
		)
	default:
		return errors.New("request body could not be decoded")
	}
}
