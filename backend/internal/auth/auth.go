package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/maxweisen/otto/backend/internal/config"
)

type Handler struct {
	oauthConfig *oauth2.Config
	db          *pgxpool.Pool
}

type GoogleUserInfo struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

func NewHandler(cfg *config.Config, db *pgxpool.Pool) *Handler {
	h := Handler{
		oauthConfig: &oauth2.Config{
			ClientID:     cfg.OAuth.ClientID,
			ClientSecret: cfg.OAuth.ClientSecret,
			RedirectURL:  cfg.OAuth.RedirectURL,
			Scopes: []string{
				"openid",
				"https://www.googleapis.com/auth/userinfo.email",
				"https://www.googleapis.com/auth/userinfo.profile",
			},
			Endpoint: google.Endpoint,
		},
		db: db,
	}
	return &h
}

func (h *Handler) LoginHandler(w http.ResponseWriter, r *http.Request) {
	randomText := rand.Text()

	stateCookie := http.Cookie{
		Name:     "oauth_state_token",
		Value:    randomText,
		MaxAge:   320,
		HttpOnly: true,
		Path:     "/",
		Secure:   !isDev(),
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(w, &stateCookie)
	authUrl := h.oauthConfig.AuthCodeURL(randomText)
	// Redirect user to Google's consent page to ask for permission
	// for the scopes specified above.
	http.Redirect(w, r, authUrl, http.StatusFound)
}

func (h *Handler) CallbackHandler(w http.ResponseWriter, r *http.Request) {
	// user clicks "cancel" on oauth page
	errParam := r.URL.Query().Get("error")
	if errParam != "" {
		http.Error(w, "login cancelled", http.StatusBadRequest)
		return
	}
	// Handle the exchange code to initiate a transport.
	state := r.URL.Query().Get("state")
	cookie, err := r.Cookie("oauth_state_token")
	// CSRF Protection
	// If cookie returns an error or does not match the URL query state
	// respond with an HTTP 400 status
	if err != nil || state != cookie.Value {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state_token",
		MaxAge:   -1,
		HttpOnly: true,
		Path:     "/",
		Secure:   !isDev(),
		SameSite: http.SameSiteLaxMode,
	})

	code := r.URL.Query().Get("code")
	token, err := h.oauthConfig.Exchange(r.Context(), code)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	client := h.oauthConfig.Client(r.Context(), token)
	res, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if res.StatusCode != http.StatusOK {
		http.Error(w, "failed to get user info", http.StatusInternalServerError)
		return
	}

	// Read response from Google OAuth to parse data to create User
	defer res.Body.Close()
	var userInfo GoogleUserInfo
	err = json.NewDecoder(res.Body).Decode(&userInfo)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// upsert user and session
	var userID int64
	err = h.db.QueryRow(r.Context(),
		`INSERT INTO users (google_sub, email, name, avatar_url)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (google_sub)
		DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
		RETURNING ID`,
		userInfo.ID, userInfo.Email, userInfo.Name, userInfo.Picture,
	).Scan(&userID)
	if err != nil {
		http.Error(w, "unable to create user", http.StatusInternalServerError)
		return
	}

	sessionToken := rand.Text()
	raw := sha256.Sum256([]byte(sessionToken))
	sessionTokenHash := hex.EncodeToString(raw[:])

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	// delete any existing sessions
	_, err = tx.Exec(r.Context(),
		`DELETE FROM sessions WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		http.Error(w, "unable to delete previous session", http.StatusInternalServerError)
		return
	}

	// create a new session
	_, err = tx.Exec(r.Context(),
		`INSERT INTO sessions (user_id, token)
		VALUES ($1, $2)
		`,
		userID, sessionTokenHash,
	)
	if err != nil {
		http.Error(w, "unable to create session", http.StatusInternalServerError)
		return
	}

	// commit changes if successful
	err = tx.Commit(r.Context())
	if err != nil {
		http.Error(w, "failed to create a session", http.StatusInternalServerError)
		return
	}

	// create session cookie upon success
	http.SetCookie(w, &http.Cookie{
		Name:     "otto_session_token",
		Value:    sessionToken,
		MaxAge:   60 * 60 * 24, // 24 hours
		HttpOnly: true,
		Secure:   !isDev(),
		Path:     "/",
		SameSite: http.SameSiteStrictMode,
	})

	http.Redirect(w, r, "/", http.StatusFound)
}

func isDev() bool {
	return os.Getenv("ENV") == "development"
}
