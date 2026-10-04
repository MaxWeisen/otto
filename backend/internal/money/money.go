// Package money holds Amount, an exact non-negative amount of money with two
// decimal places, stored in Postgres as numeric(10,2).
package money

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
)

// Amount is an amount of money in cents. It is never converted through a
// float: it parses from and formats to a decimal string such as "49.99", and
// reads and writes Postgres numeric values exactly.
type Amount int64

// MaxAmount is the largest value a numeric(10,2) column holds, 99999999.99.
const MaxAmount Amount = 99_999_999_99

var ErrNegative = errors.New("amount must not be negative")
var ErrInvalid = errors.New("invalid amount")

var amountPattern = regexp.MustCompile(`^([0-9]+)(?:\.([0-9]{1,2}))?$`)

// Parse reads a decimal string with at most two decimal places, such as
// "49.99", "7.5" or "120". It returns ErrNegative for a negative value and
// ErrInvalid for anything else that is not an amount between 0 and
// MaxAmount.
func Parse(s string) (Amount, error) {
	if strings.HasPrefix(s, "-") {
		return 0, ErrNegative
	}

	match := amountPattern.FindStringSubmatch(s)

	if match == nil {
		return 0, ErrInvalid
	}

	whole := strings.TrimLeft(match[1], "0")
	fraction := match[2] + strings.Repeat("0", 2-len(match[2]))

	if len(whole) > 8 {
		return 0, ErrInvalid
	}

	cents, err := strconv.ParseInt(whole+fraction, 10, 64)

	if err != nil {
		return 0, ErrInvalid
	}

	return Amount(cents), nil
}

// String formats the amount with exactly two decimal places, e.g. "7.50".
func (a Amount) String() string {
	return fmt.Sprintf("%d.%02d", a/100, a%100)
}

// MarshalJSON encodes the amount as a JSON string, e.g. "7.50", so clients
// never have to round-trip money through a float.
func (a Amount) MarshalJSON() ([]byte, error) {
	return json.Marshal(a.String())
}

// UnmarshalJSON decodes an amount from a JSON string accepted by Parse.
func (a *Amount) UnmarshalJSON(data []byte) error {
	var s string

	err := json.Unmarshal(data, &s)

	if err != nil {
		return ErrInvalid
	}

	parsed, err := Parse(s)

	if err != nil {
		return err
	}

	*a = parsed

	return nil
}

// ScanNumeric implements pgtype.NumericScanner.
func (a *Amount) ScanNumeric(n pgtype.Numeric) error {
	if !n.Valid || n.NaN || n.InfinityModifier != pgtype.Finite {
		return fmt.Errorf("cannot scan %v into money.Amount", n)
	}

	cents := new(big.Int).Set(n.Int)
	shift := int64(n.Exp) + 2

	if shift >= 0 {
		cents.Mul(cents, new(big.Int).Exp(big.NewInt(10), big.NewInt(shift), nil))
	} else {
		divisor := new(big.Int).Exp(big.NewInt(10), big.NewInt(-shift), nil)
		remainder := new(big.Int)

		cents.QuoRem(cents, divisor, remainder)

		if remainder.Sign() != 0 {
			return errors.New("cannot scan a numeric with more than 2 decimal places into money.Amount")
		}
	}

	if cents.Sign() < 0 {
		return ErrNegative
	}

	if !cents.IsInt64() {
		return errors.New("numeric value out of range for money.Amount")
	}

	*a = Amount(cents.Int64())

	return nil
}

// NumericValue implements pgtype.NumericValuer.
func (a Amount) NumericValue() (pgtype.Numeric, error) {
	return pgtype.Numeric{
		Int:   big.NewInt(int64(a)),
		Exp:   -2,
		Valid: true,
	}, nil
}
