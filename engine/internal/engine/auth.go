package engine

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

type SupabaseUser struct {
	ID string `json:"id"`
}

func (h *Handler) authHTTP(r *http.Request) (SupabaseUser, error) {
	authz := r.Header.Get("Authorization")
	if authz == "" {
		return SupabaseUser{}, errors.New("missing Authorization header")
	}
	parts := strings.SplitN(authz, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return SupabaseUser{}, errors.New("invalid Authorization header")
	}
	return h.verifyToken(parts[1])
}

func (h *Handler) authWS(r *http.Request) (SupabaseUser, error) {
	token := r.URL.Query().Get("token")
	if token == "" {
		return SupabaseUser{}, errors.New("missing token query param")
	}
	return h.verifyToken(token)
}

func (h *Handler) verifyToken(token string) (SupabaseUser, error) {
	req, err := http.NewRequest("GET", h.cfg.SupabaseURL+"/auth/v1/user", nil)
	if err != nil {
		return SupabaseUser{}, err
	}
	req.Header.Set("apikey", h.cfg.SupabaseAnon)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return SupabaseUser{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return SupabaseUser{}, fmt.Errorf("token check failed: %s", resp.Status)
	}

	var user SupabaseUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return SupabaseUser{}, err
	}
	if user.ID == "" {
		return SupabaseUser{}, errors.New("token check returned no user id")
	}
	return user, nil
}
