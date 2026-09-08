package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrNotFound = errors.New("not found")

// User is the full row. JSON tags define the wire shape shared with the
// frontend (PublicUser contract) — only Public() is ever serialized.
type User struct {
	ID                 string     `json:"id"`
	Email              string     `json:"email"`
	EmailNormalized    *string    `json:"emailNormalized"`
	FirstName          *string    `json:"firstName"`
	LastName           *string    `json:"lastName"`
	ProfileImageURL    *string    `json:"profileImageUrl"`
	PasswordHash       *string    `json:"-"`
	AuthProvider       string     `json:"authProvider"`
	IsActive           bool       `json:"-"`
	HasNotifiedTeam    bool       `json:"hasNotifiedTeam"`
	ReadNotificationID []byte     `json:"-"`
	CreatedAt          time.Time  `json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
	EmailVerifiedAt    *time.Time `json:"-"`
	IsAdmin            bool       `json:"-"`
	MFASecret          *string    `json:"-"`
	MFAEnabled         bool       `json:"-"`
	PasswordAlgo       string     `json:"-"`
}

// Public strips secrets and internal fields; matches the legacy TS PublicUser.
func (u *User) Public() map[string]any {
	return map[string]any{
		"id":                  u.ID,
		"email":               u.Email,
		"emailNormalized":     nilString(u.EmailNormalized),
		"firstName":           nilString(u.FirstName),
		"lastName":            nilString(u.LastName),
		"profileImageUrl":     nilString(u.ProfileImageURL),
		"authProvider":        u.AuthProvider,
		"isActive":            u.IsActive,
		"hasNotifiedTeam":     u.HasNotifiedTeam,
		"readNotificationIds": jsonRawOrEmpty(u.ReadNotificationID),
		"createdAt":           u.CreatedAt,
		"updatedAt":           u.UpdatedAt,
	}
}

func nilString(s *string) any {
	if s == nil {
		return nil
	}
	return *s
}

func jsonRawOrEmpty(b []byte) any {
	if len(b) == 0 {
		return []any{}
	}
	return json.RawMessage(b)
}

const userCols = `id, email, email_normalized, first_name, last_name, profile_image_url,
	password_hash, auth_provider, is_active, has_notified_team, read_notification_ids,
	created_at, updated_at, email_verified_at, is_admin, mfa_secret, mfa_enabled, password_algo`

const userTableCols = `u.id, u.email, u.email_normalized, u.first_name, u.last_name, u.profile_image_url,
	u.password_hash, u.auth_provider, u.is_active, u.has_notified_team, u.read_notification_ids,
	u.created_at, u.updated_at, u.email_verified_at, u.is_admin, u.mfa_secret, u.mfa_enabled, u.password_algo`

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.EmailNormalized, &u.FirstName, &u.LastName,
		&u.ProfileImageURL, &u.PasswordHash, &u.AuthProvider, &u.IsActive,
		&u.HasNotifiedTeam, &u.ReadNotificationID, &u.CreatedAt, &u.UpdatedAt,
		&u.EmailVerifiedAt, &u.IsAdmin, &u.MFASecret, &u.MFAEnabled, &u.PasswordAlgo)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// FindUserByEmail looks up by the normalized column (indexed); the caller must
// pass an already-normalized email.
func (d *DB) FindUserByEmail(ctx context.Context, emailNormalized string) (*User, error) {
	return scanUser(d.Pool.QueryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE email_normalized = $1 AND is_active = true`,
		emailNormalized))
}

func (d *DB) FindUserByID(ctx context.Context, id string) (*User, error) {
	return scanUser(d.Pool.QueryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE id = $1 AND is_active = true`, id))
}

type CreateUserInput struct {
	Email           string
	FirstName       *string
	LastName        *string
	ProfileImageURL *string
	PasswordHash    *string
	AuthProvider    string
	PasswordAlgo    string // "bcrypt" | "argon2id"; ignored when hash nil
}

// CreateUser inserts a user. On concurrent duplicate email it returns
// ErrDuplicateEmail so callers can translate to a uniform public response.
var ErrDuplicateEmail = errors.New("duplicate email")
var ErrConflict = errors.New("identity conflicts with an existing account")

func (d *DB) CreateUser(ctx context.Context, in CreateUserInput) (*User, error) {
	algo := in.PasswordAlgo
	if in.PasswordHash == nil {
		algo = "none"
	} else if algo == "" {
		algo = "argon2id"
	}
	row := d.Pool.QueryRow(ctx, `
		INSERT INTO users (email, email_normalized, first_name, last_name,
			profile_image_url, password_hash, auth_provider, password_algo)
		VALUES (trim($1), LOWER(TRIM($1)), $2, $3, $4, $5, $6, $7)
		RETURNING `+userCols,
		in.Email, in.FirstName, in.LastName, in.ProfileImageURL,
		in.PasswordHash, in.AuthProvider, algo)
	u, err := scanUser(row)
	if err != nil && isUniqueViolation(err) {
		return nil, ErrDuplicateEmail
	}
	return u, err
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func (d *DB) SetPasswordHash(ctx context.Context, userID, hash, algo string) error {
	_, err := d.Pool.Exec(ctx,
		`UPDATE users SET password_hash = $2, password_algo = $3, updated_at = now() WHERE id = $1`,
		userID, hash, algo)
	return err
}

// UpdatePreferences applies an explicit whitelist of user-owned preference
// columns. There is deliberately no generic update-everything API.
func (d *DB) UpdatePreferences(ctx context.Context, userID string, hasNotifiedTeam *bool, readNotificationIDs *[]int) (*User, error) {
	row := d.Pool.QueryRow(ctx, `
		UPDATE users SET
			has_notified_team = COALESCE($2, has_notified_team),
			read_notification_ids = COALESCE($3::jsonb, read_notification_ids),
			updated_at = now()
		WHERE id = $1 RETURNING `+userCols,
		userID, hasNotifiedTeam, readNotificationIDs)
	return scanUser(row)
}

func (d *DB) MarkEmailVerified(ctx context.Context, userID string) error {
	_, err := d.Pool.Exec(ctx,
		`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1`,
		userID)
	return err
}

func (d *DB) SetMFASecret(ctx context.Context, userID string, encryptedSecret *string) error {
	_, err := d.Pool.Exec(ctx,
		`UPDATE users SET mfa_secret = $2, mfa_enabled = false, updated_at = now() WHERE id = $1`,
		userID, encryptedSecret)
	return err
}

func (d *DB) ActivateMFA(ctx context.Context, userID string) error {
	_, err := d.Pool.Exec(ctx,
		`UPDATE users SET mfa_enabled = true, mfa_secret = mfa_secret, updated_at = now() WHERE id = $1`,
		userID)
	return err
}

func (d *DB) DisableMFA(ctx context.Context, userID string) error {
	_, err := d.Pool.Exec(ctx,
		`UPDATE users SET mfa_enabled = false, mfa_secret = NULL, updated_at = now() WHERE id = $1`,
		userID)
	if err != nil {
		return err
	}
	_, err = d.Pool.Exec(ctx, `DELETE FROM mfa_backup_codes WHERE user_id = $1`, userID)
	return err
}

// MFASecretOrEmpty returns the decrypted-at-rest ciphertext (still sealed);
// empty when no enrollment exists.
func (u *User) MFASecretOrEmpty() string {
	if u.MFASecret == nil {
		return ""
	}
	return *u.MFASecret
}

// ReplaceBackupCodes swaps in a fresh set of hashed backup codes.
func (d *DB) ReplaceBackupCodes(ctx context.Context, userID string, hashes []string) error {
	return d.WithTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM mfa_backup_codes WHERE user_id = $1`, userID); err != nil {
			return err
		}
		for _, h := range hashes {
			if _, err := tx.Exec(ctx,
				`INSERT INTO mfa_backup_codes (user_id, code_hash) VALUES ($1,$2)`,
				userID, h); err != nil {
				return err
			}
		}
		return nil
	})
}

// ConsumeBackupCode marks one code used; returns rows affected.
func (d *DB) ConsumeBackupCode(ctx context.Context, userID, codeHash string) (int64, error) {
	tag, err := d.Pool.Exec(ctx, `
		UPDATE mfa_backup_codes SET used_at = now()
		WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL`,
		userID, codeHash)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// TouchLastLogin records the pseudonymised IP of the most recent successful
// login and reports whether it changed since the previous login.
func (d *DB) TouchLastLogin(ctx context.Context, userID, ipHash string) (previous string, changed bool, err error) {
	err = d.Pool.QueryRow(ctx, `
		WITH old AS (
			SELECT COALESCE(last_login_ip_hash, '') AS prev
			FROM users WHERE id = $1 FOR UPDATE
		)
		UPDATE users u SET last_login_ip_hash = $2
		FROM old
		WHERE u.id = $1
		RETURNING old.prev`,
		userID, ipHash).Scan(&previous)
	if err != nil {
		return "", false, err
	}
	return previous, previous != "" && previous != ipHash, nil
}

// PromoteBootstrapAdmins flags the configured bootstrap admin emails. Used at
// boot to seed the first administrator without a secret-in-URL backdoor.
func (d *DB) PromoteBootstrapAdmins(ctx context.Context, emails []string) (int, error) {
	if len(emails) == 0 {
		return 0, nil
	}
	tag, err := d.Pool.Exec(ctx,
		`UPDATE users SET is_admin = true WHERE email_normalized = ANY($1)`, emails)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

func isUniqueViolation(err error) bool {
	var pgErr interface{ SQLState() string }
	if errors.As(err, &pgErr) {
		return pgErr.SQLState() == "23505"
	}
	return false
}

// ─── OAuth identities ───────────────────────────────────────────────────────

// FindIdentity resolves the user behind a (provider, providerAccountId).
func (d *DB) FindIdentity(ctx context.Context, provider, providerAccountID string) (*User, error) {
	row := d.Pool.QueryRow(ctx, `
		SELECT `+userTableCols+`
		FROM auth_identities i
		JOIN users u ON u.id = i.user_id
		WHERE i.provider = $1 AND i.provider_account_id = $2 AND u.is_active = true`,
		provider, providerAccountID)
	return scanUser(row)
}

// LinkIdentity attaches a provider identity to a user; idempotent.
func (d *DB) LinkIdentity(ctx context.Context, userID, provider, providerAccountID string) error {
	_, err := d.Pool.Exec(ctx, `
		INSERT INTO auth_identities (user_id, provider, provider_account_id)
		VALUES ($1,$2,$3)
		ON CONFLICT (provider, provider_account_id) DO NOTHING`,
		userID, provider, providerAccountID)
	return err
}
