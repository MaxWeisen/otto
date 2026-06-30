package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/maxweisen/otto/backend/internal/auth"
	"github.com/maxweisen/otto/backend/internal/config"
)

func main() {
	// setup default slog JSON handler
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	// load environment variables
	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load environment variables", "err", err)
		os.Exit(1)
	}

	pool, err := pgxpool.New(context.Background(), cfg.DB.DatabaseURL)
	if err != nil {
		slog.Error("unable to connect to database", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	authHandler := auth.NewHandler(cfg, pool)

	r := chi.NewRouter()

	// middlewares
	r.Use(middleware.RequestID)
	r.Use(requestLogger)
	r.Use(middleware.Recoverer)

	// public routes
	r.Get("/auth/google/login", authHandler.LoginHandler)
	r.Get("/auth/google/callback", authHandler.CallbackHandler)
	// health
	r.Get("/healthz", healthzHandler)

	// authenticated routes
	r.Group(func(r chi.Router) {
		r.Use(authHandler.SessionMiddleware)

		r.Get("/auth/me", authHandler.GetCurrentUser)
	})

	err = http.ListenAndServe(":"+cfg.Port, r)

	if err != nil {
		slog.Error("could not start server", "err", err)
		os.Exit(1)
	}
}

// middleware
func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		start := time.Now()

		next.ServeHTTP(ww, r)

		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", ww.Status(),
			"duration_ms", time.Since(start).Milliseconds(),
			"request_id", middleware.GetReqID(r.Context()),
		)
	})
}

// route handlers
func healthzHandler(w http.ResponseWriter, r *http.Request) {
	res, err := json.Marshal(map[string]string{"status": "ok"})

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(res)
}
