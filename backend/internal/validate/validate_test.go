package validate

import (
	"strings"
	"testing"
	"time"
)

func ptr[T any](v T) *T {
	return &v
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
			got := NormalizeOptional(tt.input)

			if (got == nil) != (tt.want == nil) || (got != nil && *got != *tt.want) {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestText(t *testing.T) {
	tests := []struct {
		name    string
		value   *string
		wantErr string
	}{
		{name: "nil", value: nil},
		{name: "empty", value: ptr("")},
		{name: "at limit", value: ptr(strings.Repeat("a", 5))},
		{name: "multibyte at limit", value: ptr(strings.Repeat("é", 5))},
		{name: "too long", value: ptr(strings.Repeat("a", 6)), wantErr: "notes must be at most 5 characters"},
		{name: "null character", value: ptr("a\x00b"), wantErr: "notes must not contain null characters"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Text("notes", tt.value, 5)

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

func TestVIN(t *testing.T) {
	const vinErr = "vin must be 17 characters using letters and digits, excluding I, O and Q"

	tests := []struct {
		name    string
		value   string
		wantErr string
	}{
		{name: "valid", value: "1HGCM82633A004352"},
		{name: "every allowed letter", value: "ABCDEFGHJKLMNPRST"},
		{name: "empty", value: "", wantErr: vinErr},
		{name: "too short", value: "1HGCM82633A00435", wantErr: vinErr},
		{name: "too long", value: "1HGCM82633A0043521", wantErr: vinErr},
		{name: "lowercase", value: "1hgcm82633a004352", wantErr: vinErr},
		{name: "contains I", value: "1HGCM82633I004352", wantErr: vinErr},
		{name: "contains O", value: "1HGCM82633O004352", wantErr: vinErr},
		{name: "contains Q", value: "1HGCM82633Q004352", wantErr: vinErr},
		{name: "contains a symbol", value: "1HGCM82633-004352", wantErr: vinErr},
		{name: "multibyte", value: strings.Repeat("é", VINLength), wantErr: vinErr},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertErr(t, VIN("vin", tt.value), tt.wantErr)
		})
	}
}

func TestModelYear(t *testing.T) {
	now := time.Date(2026, time.June, 15, 12, 0, 0, 0, time.UTC)
	const rangeErr = "year must be between 1886 and 2027"

	tests := []struct {
		name    string
		year    int
		wantErr string
	}{
		{name: "first model year", year: MinModelYear},
		{name: "this year", year: 2026},
		{name: "next year", year: 2027},
		{name: "before the first model year", year: MinModelYear - 1, wantErr: rangeErr},
		{name: "after next year", year: 2028, wantErr: rangeErr},
		{name: "zero", year: 0, wantErr: rangeErr},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertErr(t, ModelYear("year", tt.year, now), tt.wantErr)
		})
	}
}

func TestModelYearNamesField(t *testing.T) {
	now := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

	assertErr(
		t,
		ModelYear("model year", 1700, now),
		"model year must be between 1886 and 2027",
	)
}

func assertErr(t *testing.T, err error, wantErr string) {
	t.Helper()

	if wantErr == "" {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		return
	}

	if err == nil || err.Error() != wantErr {
		t.Fatalf("got error %v, want %q", err, wantErr)
	}
}
