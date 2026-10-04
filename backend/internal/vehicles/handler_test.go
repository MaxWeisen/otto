package vehicles

import (
	"strings"
	"testing"
)

func ptr[T any](v T) *T {
	return &v
}

func TestValidateVehicle(t *testing.T) {
	long := strings.Repeat("a", maxTextLength+1)
	maxRunes := strings.Repeat("é", maxTextLength)

	tests := []struct {
		name     string
		make     string
		model    string
		trim     *string
		nickname *string
		mileage  *int32
		wantErr  string
	}{
		{name: "valid", make: "Honda", model: "Civic"},
		{name: "max length multibyte", make: maxRunes, model: "Civic"},
		{name: "zero mileage", make: "Honda", model: "Civic", mileage: ptr(int32(0))},
		{name: "long make", make: long, model: "Civic", wantErr: "make must be at most 255 characters"},
		{name: "long model", make: "Honda", model: long, wantErr: "model must be at most 255 characters"},
		{name: "long trim", make: "Honda", model: "Civic", trim: &long, wantErr: "trim must be at most 255 characters"},
		{name: "long nickname", make: "Honda", model: "Civic", nickname: &long, wantErr: "nickname must be at most 255 characters"},
		{name: "negative mileage", make: "Honda", model: "Civic", mileage: ptr(int32(-1)), wantErr: "mileage must not be negative"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateVehicle(2020, tt.make, tt.model, tt.trim, nil, tt.nickname, tt.mileage)

			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}

			if err == nil || err.Error() != tt.wantErr {
				t.Fatalf("got error %v, want %q", err, tt.wantErr)
			}
		})
	}
}

func TestNormalizeOptional(t *testing.T) {
	tests := []struct {
		name  string
		input *string
		want  *string
	}{
		{name: "nil", input: nil, want: nil},
		{name: "empty", input: ptr(""), want: nil},
		{name: "whitespace", input: ptr("  \t "), want: nil},
		{name: "trimmed", input: ptr("  Sport  "), want: ptr("Sport")},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeOptional(tt.input)

			if (got == nil) != (tt.want == nil) || (got != nil && *got != *tt.want) {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}
