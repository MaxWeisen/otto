package vehicles

import (
	"strings"
	"testing"
)

func ptr[T any](v T) *T {
	return &v
}

func TestNormalizeAndValidate(t *testing.T) {
	long := strings.Repeat("a", maxTextLength+1)
	maxRunes := strings.Repeat("é", maxTextLength)

	tests := []struct {
		name     string
		make     string
		model    string
		trim     *string
		vin      *string
		nickname *string
		mileage  *int32
		wantErr  string
	}{
		{name: "valid", make: "Honda", model: "Civic"},
		{name: "max length multibyte", make: maxRunes, model: "Civic"},
		{name: "zero mileage", make: "Honda", model: "Civic", mileage: ptr(int32(0))},
		{name: "blank make", make: "  ", model: "Civic", wantErr: "make is required"},
		{name: "long make", make: long, model: "Civic", wantErr: "make must be at most 255 characters"},
		{name: "long model", make: "Honda", model: long, wantErr: "model must be at most 255 characters"},
		{name: "long trim", make: "Honda", model: "Civic", trim: &long, wantErr: "trim must be at most 255 characters"},
		{name: "long nickname", make: "Honda", model: "Civic", nickname: &long, wantErr: "nickname must be at most 255 characters"},
		{name: "negative mileage", make: "Honda", model: "Civic", mileage: ptr(int32(-1)), wantErr: "mileage must not be negative"},
		{name: "valid vin", make: "Honda", model: "Civic", vin: ptr("1HGCM82633A004352")},
		{name: "blank vin", make: "Honda", model: "Civic", vin: ptr("   ")},
		{name: "short vin", make: "Honda", model: "Civic", vin: ptr("ABC"), wantErr: "vin must be 17 characters"},
		{name: "multibyte vin", make: "Honda", model: "Civic", vin: ptr(strings.Repeat("é", vinLength))},
		{name: "null in make", make: "Hon\x00da", model: "Civic", wantErr: "make must not contain null characters"},
		{name: "null in model", make: "Honda", model: "Civ\x00ic", wantErr: "model must not contain null characters"},
		{name: "null in trim", make: "Honda", model: "Civic", trim: ptr("Sp\x00ort"), wantErr: "trim must not contain null characters"},
		{name: "null in vin", make: "Honda", model: "Civic", vin: ptr("1HGCM82633A00435\x00"), wantErr: "vin must not contain null characters"},
		{name: "null in nickname", make: "Honda", model: "Civic", nickname: ptr("\x00"), wantErr: "nickname must not contain null characters"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := VehicleInput{
				Year:     2020,
				Make:     tt.make,
				Model:    tt.model,
				Trim:     tt.trim,
				Vin:      tt.vin,
				Nickname: tt.nickname,
				Mileage:  tt.mileage,
			}

			err := input.normalizeAndValidate()

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

func TestNormalizeAndValidateNormalizes(t *testing.T) {
	input := VehicleInput{
		Year:     2020,
		Make:     "  Honda ",
		Model:    " Civic  ",
		Trim:     ptr("  "),
		Vin:      ptr("  1hgcm82633a004352 "),
		Nickname: ptr(" Daily "),
	}

	err := input.normalizeAndValidate()

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if input.Make != "Honda" || input.Model != "Civic" {
		t.Fatalf("got make %q model %q", input.Make, input.Model)
	}

	if input.Trim != nil {
		t.Fatalf("got trim %q, want nil", *input.Trim)
	}

	if input.Vin == nil || *input.Vin != "1HGCM82633A004352" {
		t.Fatalf("got vin %v, want 1HGCM82633A004352", input.Vin)
	}

	if input.Nickname == nil || *input.Nickname != "Daily" {
		t.Fatalf("got nickname %v, want Daily", input.Nickname)
	}

	input.Vin = ptr("")

	err = input.normalizeAndValidate()

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if input.Vin != nil {
		t.Fatalf("got vin %q, want nil", *input.Vin)
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
