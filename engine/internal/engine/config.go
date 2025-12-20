package engine

import (
	"errors"
	"fmt"
	"os"
)

type Config struct {
	Port            string
	SupabaseURL     string
	SupabaseAnon    string
	PythonBin       string
	NodeBin         string
	Sandbox         string
	DockerBin       string
	DockerImage     string
	DockerNodeImage string
}

func LoadConfigFromEnv() (Config, error) {
	cfg := Config{
		Port:            getEnv("PORT", "8080"),
		SupabaseURL:     os.Getenv("SUPABASE_URL"),
		SupabaseAnon:    os.Getenv("SUPABASE_ANON_KEY"),
		PythonBin:       getEnv("PYTHON_BIN", "python"),
		NodeBin:         getEnv("NODE_BIN", "node"),
		Sandbox:         getEnv("ENGINE_SANDBOX", "local"),
		DockerBin:       getEnv("DOCKER_BIN", "docker"),
		DockerImage:     getEnv("DOCKER_IMAGE", "python:3.11-slim"),
		DockerNodeImage: getEnv("DOCKER_NODE_IMAGE", "node:20-slim"),
	}

	if cfg.SupabaseURL == "" {
		fmt.Println(cfg)
		return Config{}, errors.New("SUPABASE_URL is required")
	}
	if cfg.SupabaseAnon == "" {
		return Config{}, errors.New("SUPABASE_ANON_KEY is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
