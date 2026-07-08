package config

import (
	"errors"
	"io/fs"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	CookieDomain string
	DB           DatabaseConfig
	FrontendURL  string
	OAuth        OAuthConfig
	Port         string
}

type DatabaseConfig struct {
	DatabaseURL string
}

type OAuthConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

func Load() (*Config, error) {
	err := godotenv.Load()

	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}

	cfg := &Config{
		Port: getEnv("PORT", "3333"),
		DB: DatabaseConfig{
			DatabaseURL: os.Getenv("DB_URL"),
		},
		OAuth: OAuthConfig{
			ClientID:     os.Getenv("OAUTH_CLIENT_ID"),
			ClientSecret: os.Getenv("OAUTH_CLIENT_SECRET"),
			RedirectURL:  os.Getenv("OAUTH_REDIRECT_URL"),
		},
		CookieDomain: os.Getenv("COOKIE_DOMAIN"),
		FrontendURL:  os.Getenv("FRONTEND_URL"),
	}
	return cfg, nil
}

func getEnv(key, fallback string) string {
	value, isEnvVariableSet := os.LookupEnv(key)

	if isEnvVariableSet && value != "" {
		return value
	}
	return fallback
}
