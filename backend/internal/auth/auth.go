package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strconv"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/maxweisen/otto/backend/internal/config"
)

// types
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

type User struct {
	Id        int64
	Email     string
	Name      string
	AvatarUrl string
}

type contextKey string

// constants
const userContextKey contextKey = "user"

// handlers
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
		slog.Error("error from google oauth", "err", nil, "request_id", middleware.GetReqID(r.Context()))
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
		slog.Error("cookie error", "err", err, "request_id", middleware.GetReqID(r.Context()))
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
		slog.Error(
			"failed to exchange oauth auth code into token",
			"err",
			err,
			"request_id",
			middleware.GetReqID(r.Context()),
		)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	client := h.oauthConfig.Client(r.Context(), token)
	res, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		slog.Error(
			"failed to get oauth user info",
			"err",
			err,
			"request_id",
			middleware.GetReqID(r.Context()),
		)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if res.StatusCode != http.StatusOK {
		slog.Error("failed to get user info", "err", err, "request_id", middleware.GetReqID(r.Context()))
		http.Error(w, "failed to get user info", http.StatusInternalServerError)
		return
	}

	// Read response from Google OAuth to parse data to create User
	defer res.Body.Close()
	var userInfo GoogleUserInfo
	err = json.NewDecoder(res.Body).Decode(&userInfo)
	if err != nil {
		slog.Error("failed to read oauth response to parse data to create User",
			"err",
			err,
			"request_id",
			middleware.GetReqID(r.Context()),
		)
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
		slog.Error("user upsert failed", "err", err, "request_id", middleware.GetReqID(r.Context()))
		http.Error(w, "unable to create user", http.StatusInternalServerError)
		return
	}

	sessionToken := rand.Text()
	sessionTokenHash := getSessionTokenHash(sessionToken)

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin db transaction", "err", err, "request_id", middleware.GetReqID(r.Context()))
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
		slog.Error("unable to delete previous session", "err", err, "request_id", middleware.GetReqID(r.Context()))
		http.Error(w, "unable to delete previous session", http.StatusInternalServerError)
		return
	}

	// create a new session
	_, err = tx.Exec(r.Context(),
		`INSERT INTO sessions (user_id, token, expires_at)
		VALUES ($1, $2, now() + interval '3 days' )
		`,
		userID, sessionTokenHash,
	)
	if err != nil {
		slog.Error("unable to create session", "err", err, "request_id", middleware.GetReqID(r.Context()))
		http.Error(w, "unable to create session", http.StatusInternalServerError)
		return
	}

	// commit changes if successful
	err = tx.Commit(r.Context())
	if err != nil {
		slog.Error("failed to create a session", "err", err, "request_id", middleware.GetReqID(r.Context()))
		http.Error(w, "failed to create a session", http.StatusInternalServerError)
		return
	}

	// create session cookie upon success
	http.SetCookie(w, &http.Cookie{
		Name:     "otto_session_token",
		Value:    sessionToken,
		MaxAge:   60 * 60 * 24 * 3, // 3 days
		HttpOnly: true,
		Secure:   !isDev(),
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
	})

	http.Redirect(w, r, "/", http.StatusFound)
}

func (h *Handler) SessionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, err := r.Cookie("otto_session_token")
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		sessionTokenHash := getSessionTokenHash(token.Value)

		var user User
		err = h.db.QueryRow(r.Context(),
			`SELECT u.id, u.email, u.name, u.avatar_url
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token = $1 AND s.expires_at > now()
		`,
			sessionTokenHash,
		).Scan(&user.Id, &user.Email, &user.Name, &user.AvatarUrl)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		ctx := context.WithValue(r.Context(), userContextKey, &user)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (h *Handler) GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFromContext(r.Context())

	if !ok {
		http.Error(w, "Unauthorized user. Please login and try again", http.StatusUnauthorized)
		return
	}

	res, err := json.Marshal(map[string]string{
		"name":      user.Name,
		"id":        strconv.FormatInt(user.Id, 10),
		"email":     user.Email,
		"avatarUrl": user.AvatarUrl,
	})
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(res)
}

// helper funtions
func isDev() bool {
	return os.Getenv("ENV") == "development"
}

func UserFromContext(ctx context.Context) (*User, bool) {
	val := ctx.Value(userContextKey)
	user, ok := val.(*User)
	return user, ok
}

func getSessionTokenHash(token string) string {
	raw := sha256.Sum256([]byte(token))
	return hex.EncodeToString(raw[:])
}
