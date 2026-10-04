package validate

import (
	"strings"
	"testing"
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
