// Package vpic looks up vehicle data in NHTSA's public vPIC API
// (https://vpic.nhtsa.dot.gov/api/) and serves it to the frontend.
package vpic

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
)

const (
	requestTimeout   = 5 * time.Second
	cacheTTL         = 24 * time.Hour
	maxCacheEntries  = 1000
	maxResponseBytes = 2 << 20
)

// ErrUpstream reports that vPIC could not be reached or answered with
// something other than a usable result.
var ErrUpstream = errors.New("vpic upstream error")

// ErrVINNotFound reports that vPIC has no vehicle data for a VIN.
var ErrVINNotFound = errors.New("vin not found")

// DecodedVIN is the vehicle identity vPIC decodes from a VIN. Fields vPIC has
// no data for are nil.
type DecodedVIN struct {
	VIN   string  `json:"vin"`
	Year  *int    `json:"year"`
	Make  *string `json:"make"`
	Model *string `json:"model"`
	Trim  *string `json:"trim"`
}

// Client calls the vPIC API and caches its answers in memory.
type Client struct {
	baseURL     string
	httpClient  *http.Client
	modelsCache *ttlCache[[]string]
	vinCache    *ttlCache[DecodedVIN]
}

// NewClient returns a Client for the vPIC API rooted at baseURL.
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:     strings.TrimRight(baseURL, "/"),
		httpClient:  &http.Client{Timeout: requestTimeout},
		modelsCache: newTTLCache[[]string](cacheTTL, maxCacheEntries),
		vinCache:    newTTLCache[DecodedVIN](cacheTTL, maxCacheEntries),
	}
}

// ModelsForMakeYear returns the sorted, de-duplicated model names vPIC lists
// for makeName in the given model year.
func (c *Client) ModelsForMakeYear(
	ctx context.Context,
	makeName string,
	year int,
) ([]string, error) {
	key := strings.ToLower(makeName) + "|" + strconv.Itoa(year)

	if models, ok := c.modelsCache.get(key); ok {
		return models, nil
	}

	var body struct {
		Results []struct {
			ModelName string `json:"Model_Name"`
		} `json:"Results"`
	}

	path := fmt.Sprintf(
		"/vehicles/GetModelsForMakeYear/make/%s/modelyear/%d",
		url.PathEscape(makeName),
		year,
	)

	err := c.get(ctx, path, &body)

	if err != nil {
		return nil, err
	}

	seen := make(map[string]bool, len(body.Results))
	models := make([]string, 0, len(body.Results))

	for _, result := range body.Results {
		name := strings.TrimSpace(result.ModelName)
		folded := strings.ToLower(name)

		if name == "" || seen[folded] {
			continue
		}

		seen[folded] = true
		models = append(models, name)
	}

	slices.SortFunc(models, func(a, b string) int {
		return cmp.Or(
			cmp.Compare(strings.ToLower(a), strings.ToLower(b)),
			cmp.Compare(a, b),
		)
	})

	c.modelsCache.set(key, models)

	return models, nil
}

// DecodeVIN returns the year, make, model and trim vPIC decodes from vin, or
// ErrVINNotFound when vPIC knows none of them.
func (c *Client) DecodeVIN(ctx context.Context, vin string) (DecodedVIN, error) {
	if decoded, ok := c.vinCache.get(vin); ok {
		return decoded, nil
	}

	var body struct {
		Results []map[string]string `json:"Results"`
	}

	err := c.get(ctx, "/vehicles/DecodeVinValues/"+url.PathEscape(vin), &body)

	if err != nil {
		return DecodedVIN{}, err
	}

	if len(body.Results) == 0 {
		return DecodedVIN{}, fmt.Errorf("%w: decode returned no results", ErrUpstream)
	}

	result := body.Results[0]
	decoded := DecodedVIN{
		VIN:   vin,
		Make:  nonEmpty(result["Make"]),
		Model: nonEmpty(result["Model"]),
		Trim:  cmp.Or(nonEmpty(result["Trim"]), nonEmpty(result["Series"])),
	}

	if year, err := strconv.Atoi(strings.TrimSpace(result["ModelYear"])); err == nil {
		decoded.Year = &year
	}

	if decoded.Year == nil && decoded.Make == nil && decoded.Model == nil {
		return DecodedVIN{}, ErrVINNotFound
	}

	c.vinCache.set(vin, decoded)

	return decoded, nil
}

// get fetches path from vPIC as JSON and decodes it into dst. Any failure is
// reported as ErrUpstream.
func (c *Client) get(ctx context.Context, path string, dst any) error {
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		c.baseURL+path+"?format=json",
		nil,
	)

	if err != nil {
		return fmt.Errorf("%w: build request: %w", ErrUpstream, err)
	}

	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)

	if err != nil {
		return fmt.Errorf("%w: %w", ErrUpstream, err)
	}

	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%w: status %d", ErrUpstream, resp.StatusCode)
	}

	err = json.NewDecoder(io.LimitReader(resp.Body, maxResponseBytes)).Decode(dst)

	if err != nil {
		return fmt.Errorf("%w: decode response: %w", ErrUpstream, err)
	}

	return nil
}

func nonEmpty(s string) *string {
	trimmed := strings.TrimSpace(s)

	if trimmed == "" {
		return nil
	}

	return &trimmed
}
