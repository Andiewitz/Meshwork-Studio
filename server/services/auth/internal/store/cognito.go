package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// ResolveCognitoIdentity never joins accounts solely by email. Linking requires
// an already-authenticated local user and the same verified upstream address.
// Existing local IDs and admin/workspace permissions remain unchanged.
func (d *DB) ResolveCognitoIdentity(ctx context.Context, account, email string, first, last *string, linkID string) (*User, error) {
	var id string
	err := d.WithTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "cognito:"+account); err != nil {
			return err
		}
		err := tx.QueryRow(ctx, `SELECT user_id FROM auth_identities WHERE provider='cognito' AND provider_account_id=$1`, account).Scan(&id)
		if err == nil {
			if linkID != "" && linkID != id {
				return ErrConflict
			}
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if linkID != "" {
			if err := tx.QueryRow(ctx, `SELECT id FROM users WHERE id=$1 AND email_normalized=$2 AND is_active=true`, linkID, email).Scan(&id); err != nil {
				return ErrConflict
			}
		} else {
			if err := tx.QueryRow(ctx, `INSERT INTO users (email,email_normalized,first_name,last_name,auth_provider,password_algo,email_verified_at) VALUES ($1,$1,$2,$3,'cognito','none',now()) RETURNING id`, email, first, last).Scan(&id); err != nil {
				if isUniqueViolation(err) {
					return ErrConflict
				}
				return err
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO auth_identities (user_id,provider,provider_account_id) VALUES ($1,'cognito',$2)`, id, account); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1`, id)
		return err
	})
	if err != nil {
		return nil, err
	}
	return d.FindUserByID(ctx, id)
}
