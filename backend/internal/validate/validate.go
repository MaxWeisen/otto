// Package validate holds small input normalization and validation helpers
// shared by the backend's handlers.
package validate

import (
	"fmt"
	"strings"
	"unicode/utf8"
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
