package vpic

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakeVPIC is an httptest server standing in for the vPIC API. It answers
// every request with handler and counts the requests it receives.
type fakeVPIC struct {
	server   *httptest.Server
	requests atomic.Int32
	mu       sync.Mutex
	paths    []string
}

func newFakeVPIC(t *testing.T, handler http.HandlerFunc) *fakeVPIC {
	t.Helper()

	f := &fakeVPIC{}
	f.server = httptest.NewServer(http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			f.requests.Add(1)

			f.mu.Lock()
			f.paths = append(f.paths, r.URL.EscapedPath()+"?"+r.URL.RawQuery)
			f.mu.Unlock()

			handler(w, r)
		},
	))
	t.Cleanup(f.server.Close)

	return f
}

func (f *fakeVPIC) lastPath(t *testing.T) string {
	t.Helper()

	f.mu.Lock()
	defer f.mu.Unlock()

	if len(f.paths) == 0 {
		t.Fatal("vPIC received no requests")
	}

	return f.paths[len(f.paths)-1]
}

func respond(status int, body string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}
}

const toyotaModels = `{"Count":5,"Results":[
	{"Make_Name":"TOYOTA","Model_Name":"Corolla"},
	{"Make_Name":"TOYOTA","Model_Name":"4Runner"},
	{"Make_Name":"TOYOTA","Model_Name":"camry"},
	{"Make_Name":"TOYOTA","Model_Name":"Corolla"},
	{"Make_Name":"TOYOTA","Model_Name":"  "},
	{"Make_Name":"TOYOTA","Model_Name":"Avalon "}
]}`

const accordDecode = `{"Count":1,"Results":[{
	"ModelYear":"2003","Make":"HONDA","Model":"Accord",
	"Trim":"EX-V6","Series":"","ErrorCode":"0"
}]}`

func TestClientModelsForMakeYear(t *testing.T) {
	t.Parallel()

	fake := newFakeVPIC(t, respond(http.StatusOK, toyotaModels))
	client := NewClient(fake.server.URL + "/")

	models, err := client.ModelsForMakeYear(context.Background(), "Toyota", 2020)

	if err != nil {
		t.Fatalf("ModelsForMakeYear() error = %v", err)
	}

	want := []string{"4Runner", "Avalon", "camry", "Corolla"}

	if !reflect.DeepEqual(models, want) {
		t.Errorf("models = %q, want %q", models, want)
	}

	wantPath := "/vehicles/GetModelsForMakeYear/make/Toyota/modelyear/2020?format=json"

	if got := fake.lastPath(t); got != wantPath {
		t.Errorf("path = %q, want %q", got, wantPath)
	}
}

func TestClientModelsEscapesMake(t *testing.T) {
	t.Parallel()

	fake := newFakeVPIC(t, respond(http.StatusOK, `{"Results":[]}`))
	client := NewClient(fake.server.URL)

	_, err := client.ModelsForMakeYear(context.Background(), "Land Rover/../x?y", 2020)

	if err != nil {
		t.Fatalf("ModelsForMakeYear() error = %v", err)
	}

	wantPath := "/vehicles/GetModelsForMakeYear/make/Land%20Rover%2F..%2Fx%3Fy/modelyear/2020?format=json"

	if got := fake.lastPath(t); got != wantPath {
		t.Errorf("path = %q, want %q", got, wantPath)
	}
}

func TestClientModelsEmpty(t *testing.T) {
	t.Parallel()

	fake := newFakeVPIC(t, respond(http.StatusOK, `{"Count":0,"Results":[]}`))
	client := NewClient(fake.server.URL)

	models, err := client.ModelsForMakeYear(context.Background(), "Nosuchmake", 2020)

	if err != nil {
		t.Fatalf("ModelsForMakeYear() error = %v", err)
	}

	if models == nil || len(models) != 0 {
		t.Errorf("models = %#v, want an empty, non-nil slice", models)
	}
}

func TestClientModelsCachesByMakeAndYear(t *testing.T) {
	t.Parallel()

	fake := newFakeVPIC(t, respond(http.StatusOK, toyotaModels))
	client := NewClient(fake.server.URL)
	ctx := context.Background()

	for _, makeName := range []string{"Toyota", "TOYOTA", "toyota"} {
		_, err := client.ModelsForMakeYear(ctx, makeName, 2020)

		if err != nil {
			t.Fatalf("ModelsForMakeYear(%q) error = %v", makeName, err)
		}
	}

	if got := fake.requests.Load(); got != 1 {
		t.Fatalf("upstream requests = %d, want 1", got)
	}

	_, err := client.ModelsForMakeYear(ctx, "Toyota", 2021)

	if err != nil {
		t.Fatalf("ModelsForMakeYear() error = %v", err)
	}

	if got := fake.requests.Load(); got != 2 {
		t.Fatalf("upstream requests = %d, want 2 after a new year", got)
	}
}

func TestClientDecodeVIN(t *testing.T) {
	t.Parallel()

	fake := newFakeVPIC(t, respond(http.StatusOK, accordDecode))
	client := NewClient(fake.server.URL)

	decoded, err := client.DecodeVIN(context.Background(), "1HGCM82633A004352")

	if err != nil {
		t.Fatalf("DecodeVIN() error = %v", err)
	}

	year := 2003
	makeName, model, trim := "HONDA", "Accord", "EX-V6"
	want := DecodedVIN{
		VIN:   "1HGCM82633A004352",
		Year:  &year,
		Make:  &makeName,
		Model: &model,
		Trim:  &trim,
	}

	if !reflect.DeepEqual(decoded, want) {
		t.Errorf("decoded = %+v, want %+v", decoded, want)
	}

	wantPath := "/vehicles/DecodeVinValues/1HGCM82633A004352?format=json"

	if got := fake.lastPath(t); got != wantPath {
		t.Errorf("path = %q, want %q", got, wantPath)
	}
}

func TestClientDecodeVINFallsBackToSeries(t *testing.T) {
	t.Parallel()

	fake := newFakeVPIC(t, respond(http.StatusOK, `{"Results":[{
		"ModelYear":"","Make":"FORD","Model":"F-150","Trim":" ","Series":"XLT"
	}]}`))
	client := NewClient(fake.server.URL)

	decoded, err := client.DecodeVIN(context.Background(), "1FTFW1E50PFA00000")

	if err != nil {
		t.Fatalf("DecodeVIN() error = %v", err)
	}

	if decoded.Year != nil {
		t.Errorf("year = %d, want nil", *decoded.Year)
	}

	if decoded.Trim == nil || *decoded.Trim != "XLT" {
		t.Errorf("trim = %v, want XLT", decoded.Trim)
	}
}

func TestClientDecodeVINNotFound(t *testing.T) {
	t.Parallel()

	fake := newFakeVPIC(t, respond(http.StatusOK, `{"Results":[{
		"ModelYear":"","Make":"","Model":"","Trim":"","ErrorCode":"1,7,11"
	}]}`))
	client := NewClient(fake.server.URL)

	_, err := client.DecodeVIN(context.Background(), "ZZZZZZZZZZZZZZZZZ")

	if !errors.Is(err, ErrVINNotFound) {
		t.Fatalf("DecodeVIN() error = %v, want ErrVINNotFound", err)
	}
}

func TestClientDecodeVINCaches(t *testing.T) {
	t.Parallel()

	fake := newFakeVPIC(t, respond(http.StatusOK, accordDecode))
	client := NewClient(fake.server.URL)

	for range 3 {
		_, err := client.DecodeVIN(context.Background(), "1HGCM82633A004352")

		if err != nil {
			t.Fatalf("DecodeVIN() error = %v", err)
		}
	}

	if got := fake.requests.Load(); got != 1 {
		t.Fatalf("upstream requests = %d, want 1", got)
	}
}

func TestClientUpstreamFailures(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		handler http.HandlerFunc
	}{
		{name: "server error", handler: respond(http.StatusInternalServerError, `{"Message":"internal db.vpic:1433"}`)},
		{name: "not found status", handler: respond(http.StatusNotFound, `<html></html>`)},
		{name: "malformed json", handler: respond(http.StatusOK, `{"Results":[`)},
		{name: "no decode results", handler: respond(http.StatusOK, `{"Results":[]}`)},
	}

	calls := []struct {
		name string
		call func(c *Client) error
	}{
		{
			name: "models",
			call: func(c *Client) error {
				_, err := c.ModelsForMakeYear(context.Background(), "Toyota", 2020)
				return err
			},
		},
		{
			name: "decode",
			call: func(c *Client) error {
				_, err := c.DecodeVIN(context.Background(), "1HGCM82633A004352")
				return err
			},
		},
	}

	for _, tt := range tests {
		for _, call := range calls {
			if tt.name == "no decode results" && call.name == "models" {
				continue
			}

			t.Run(tt.name+"/"+call.name, func(t *testing.T) {
				t.Parallel()

				fake := newFakeVPIC(t, tt.handler)
				client := NewClient(fake.server.URL)

				err := call.call(client)

				if !errors.Is(err, ErrUpstream) {
					t.Fatalf("error = %v, want ErrUpstream", err)
				}

				// Failures are not cached, so the next call asks vPIC again.
				_ = call.call(client)

				if got := fake.requests.Load(); got != 2 {
					t.Fatalf("upstream requests = %d, want 2", got)
				}
			})
		}
	}
}

func TestClientTimeout(t *testing.T) {
	t.Parallel()

	release := make(chan struct{})
	fake := newFakeVPIC(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-r.Context().Done():
		}
	})
	t.Cleanup(func() { close(release) })

	client := NewClient(fake.server.URL)
	client.httpClient.Timeout = 50 * time.Millisecond

	start := time.Now()
	_, err := client.ModelsForMakeYear(context.Background(), "Toyota", 2020)

	if !errors.Is(err, ErrUpstream) {
		t.Fatalf("error = %v, want ErrUpstream", err)
	}

	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("request took %v, want it to time out quickly", elapsed)
	}
}

func TestClientHonorsContextCancellation(t *testing.T) {
	t.Parallel()

	release := make(chan struct{})
	fake := newFakeVPIC(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-r.Context().Done():
		}
	})
	t.Cleanup(func() { close(release) })

	client := NewClient(fake.server.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, err := client.DecodeVIN(ctx, "1HGCM82633A004352")

	if !errors.Is(err, ErrUpstream) || !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("error = %v, want ErrUpstream wrapping context.DeadlineExceeded", err)
	}
}
