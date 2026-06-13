package config

import (
	"errors"
	"io/fs"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DB   DatabaseConfig
	Port string
}

type DatabaseConfig struct {
	DatabaseURL string
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
