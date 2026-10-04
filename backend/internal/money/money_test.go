package money

import (
	"encoding/json"
	"errors"
	"math/big"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestParse(t *testing.T) {
	tests := []struct {
		input   string
		want    Amount
		wantErr error
	}{
		{input: "0", want: 0},
		{input: "00", want: 0},
		{input: "0.00", want: 0},
		{input: "0.5", want: 50},
		{input: "0.01", want: 1},
		{input: "007.5", want: 750},
		{input: "49.99", want: 4999},
		{input: "120", want: 12000},
		{input: "99999999.99", want: MaxAmount},
		{input: "00099999999.99", want: MaxAmount},
		{input: "-1", wantErr: ErrNegative},
		{input: "-0.01", wantErr: ErrNegative},
		{input: "100000000", wantErr: ErrInvalid},
		{input: "1.999", wantErr: ErrInvalid},
		{input: "", wantErr: ErrInvalid},
		{input: ".5", wantErr: ErrInvalid},
		{input: "5.", wantErr: ErrInvalid},
		{input: "+5", wantErr: ErrInvalid},
		{input: "$5", wantErr: ErrInvalid},
		{input: "1,000", wantErr: ErrInvalid},
		{input: "1e3", wantErr: ErrInvalid},
		{input: " 5", wantErr: ErrInvalid},
		{input: "٣", wantErr: ErrInvalid},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := Parse(tt.input)

			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("got %v, %v; want error %v", got, err, tt.wantErr)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if got != tt.want {
				t.Fatalf("got %d, want %d", got, tt.want)
			}
		})
	}
}

func TestString(t *testing.T) {
	tests := []struct {
		amount Amount
		want   string
	}{
		{amount: 0, want: "0.00"},
		{amount: 5, want: "0.05"},
		{amount: 750, want: "7.50"},
		{amount: 4999, want: "49.99"},
		{amount: MaxAmount, want: "99999999.99"},
	}

	for _, tt := range tests {
		if got := tt.amount.String(); got != tt.want {
			t.Errorf("Amount(%d).String() = %q, want %q", tt.amount, got, tt.want)
		}
	}
}

func TestJSON(t *testing.T) {
	type wrapper struct {
		Cost *Amount `json:"cost"`
	}

	zero := Amount(0)
	price := Amount(4999)

	tests := []struct {
		value wrapper
		json  string
	}{
		{value: wrapper{Cost: &price}, json: `{"cost":"49.99"}`},
		{value: wrapper{Cost: &zero}, json: `{"cost":"0.00"}`},
		{value: wrapper{}, json: `{"cost":null}`},
	}

	for _, tt := range tests {
		got, err := json.Marshal(tt.value)

		if err != nil || string(got) != tt.json {
			t.Fatalf("Marshal = %s, %v; want %s", got, err, tt.json)
		}

		var decoded wrapper

		err = json.Unmarshal(got, &decoded)

		if err != nil {
			t.Fatalf("Unmarshal(%s): %v", got, err)
		}

		if (decoded.Cost == nil) != (tt.value.Cost == nil) ||
			(decoded.Cost != nil && *decoded.Cost != *tt.value.Cost) {
			t.Fatalf("Unmarshal(%s) = %+v, want %+v", got, decoded, tt.value)
		}
	}

	for _, bad := range []string{`{"cost":49.99}`, `{"cost":"4.999"}`, `{"cost":"-1"}`} {
		var decoded wrapper

		if err := json.Unmarshal([]byte(bad), &decoded); err == nil {
			t.Errorf("Unmarshal(%s) = %+v, want error", bad, decoded)
		}
	}
}

func TestScanNumeric(t *testing.T) {
	numeric := func(i int64, exp int32) pgtype.Numeric {
		return pgtype.Numeric{Int: big.NewInt(i), Exp: exp, Valid: true}
	}

	tests := []struct {
		name    string
		value   pgtype.Numeric
		want    Amount
		wantErr bool
	}{
		{name: "zero", value: numeric(0, 0), want: 0},
		{name: "cents", value: numeric(4999, -2), want: 4999},
		{name: "tenths", value: numeric(75, -1), want: 750},
		{name: "whole", value: numeric(12, 1), want: 12000},
		{name: "trailing zeros", value: numeric(45000, -4), want: 450},
		{name: "sub-cent", value: numeric(4999, -3), wantErr: true},
		{name: "negative", value: numeric(-1, 0), wantErr: true},
		{name: "null", value: pgtype.Numeric{}, wantErr: true},
		{name: "NaN", value: pgtype.Numeric{NaN: true, Valid: true}, wantErr: true},
		{
			name:    "infinity",
			value:   pgtype.Numeric{InfinityModifier: pgtype.Infinity, Valid: true},
			wantErr: true,
		},
		{name: "out of range", value: numeric(1, 30), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got Amount

			err := got.ScanNumeric(tt.value)

			if tt.wantErr {
				if err == nil {
					t.Fatalf("got %d, want error", got)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if got != tt.want {
				t.Fatalf("got %d, want %d", got, tt.want)
			}
		})
	}
}

func TestNumericValue(t *testing.T) {
	got, err := Amount(4999).NumericValue()

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !got.Valid || got.Exp != -2 || got.Int.Int64() != 4999 {
		t.Fatalf("got %+v, want 4999e-2", got)
	}
}
