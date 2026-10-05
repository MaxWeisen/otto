// Package validate holds small input normalization and validation helpers
// shared by the backend's handlers.
package validate

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// MinModelYear is the earliest accepted model year, the year of the first
// production automobile.
const MinModelYear = 1886

// VINLength is the number of characters in a vehicle identification number.
const VINLength = 17

// MaxTextLength is the longest value the varchar(255) vehicle columns hold.
const MaxTextLength = 255

// VINPattern matches a normalized VIN: VINLength uppercase letters and
// digits, excluding I, O and Q.
var VINPattern = regexp.MustCompile(
	fmt.Sprintf("^[A-HJ-NPR-Z0-9]{%d}$", VINLength),
)

// NormalizeOptional trims an optional string and turns a blank value into nil
// so it is stored as NULL.
func NormalizeOptional(s *string) *string {
	if s == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*s)

	if trimmed == "" {
		return nil
	}

	return &trimmed
}

// Text checks that value, when present, holds no null characters (which
// Postgres text columns reject) and is at most maxLength characters long.
// The returned error names field and is safe to send to the client.
func Text(field string, value *string, maxLength int) error {
	if value == nil {
		return nil
	}

	if strings.ContainsRune(*value, 0) {
		return fmt.Errorf("%s must not contain null characters", field)
	}

	if utf8.RuneCountInString(*value) > maxLength {
		return fmt.Errorf(
			"%s must be at most %d characters",
			field,
			maxLength,
		)
	}

	return nil
}

// VIN checks that value is a normalized VIN. The returned error names field
// and is safe to send to the client.
func VIN(field string, value string) error {
	if !VINPattern.MatchString(value) {
		return fmt.Errorf(
			"%s must be %d characters using letters and digits, excluding I, O and Q",
			field,
			VINLength,
		)
	}

	return nil
}

// ModelYear checks that year lies between MinModelYear and the year after
// now, so next year's models are accepted. The returned error names field and
// is safe to send to the client.
func ModelYear(field string, year int, now time.Time) error {
	maxYear := now.Year() + 1

	if year < MinModelYear || year > maxYear {
		return fmt.Errorf(
			"%s must be between %d and %d",
			field,
			MinModelYear,
			maxYear,
		)
	}

	return nil
}
