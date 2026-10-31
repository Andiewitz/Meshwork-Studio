// Package password implements password hashing with an Argon2id primary
// format and transparent verification of legacy bcrypt hashes so existing
// users migrate on next successful login.
package password

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

const (
	argonTime    = 3
	argonMemory  = 64 * 1024 // KiB
	argonThreads = 2
	argonKeyLen  = 32
	argonSaltLen = 16
)

var ErrMismatchedHash = errors.New("password does not match hash")

// Hash returns a PHC-formatted argon2id string. It blocks until a hashing
// slot is free; HTTP handlers should prefer HashCtx to shed load fast.
func Hash(plain string) (string, error) {
	return HashCtx(context.Background(), plain)
}

// HashCtx is Hash with a bounded wait for a slot in the hashing pool.
func HashCtx(ctx context.Context, plain string) (string, error) {
	if err := acquire(ctx); err != nil {
		return "", err
	}
	defer release()
	return hashArgon2id(plain)
}

func hashArgon2id(plain string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("read salt: %w", err)
	}
	key := argon2.IDKey([]byte(plain), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

// Verify checks plain against either argon2id or legacy bcrypt hashes. It
// blocks until a hashing slot is free; HTTP handlers should prefer VerifyCtx.
func Verify(plain, encoded string) (bool, error) {
	return VerifyCtx(context.Background(), plain, encoded)
}

// VerifyCtx is Verify with a bounded wait for a slot in the hashing pool.
func VerifyCtx(ctx context.Context, plain, encoded string) (bool, error) {
	if err := acquire(ctx); err != nil {
		return false, err
	}
	defer release()
	return verifyLocked(plain, encoded)
}

func verifyLocked(plain, encoded string) (bool, error) {
	switch {
	case strings.HasPrefix(encoded, "$argon2id$"):
		return verifyArgon2id(plain, encoded)
	case strings.HasPrefix(encoded, "$2a$"), strings.HasPrefix(encoded, "$2b$"), strings.HasPrefix(encoded, "$2y$"):
		err := bcrypt.CompareHashAndPassword([]byte(encoded), []byte(plain))
		if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
			return false, nil
		}
		return err == nil, err
	default:
		return false, fmt.Errorf("unsupported hash format")
	}
}

func verifyArgon2id(plain, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	// ["", "argon2id", "v=19", "m=...,t=...,p=...", salt, hash]
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, errors.New("malformed argon2id hash")
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, fmt.Errorf("parse version: %w", err)
	}
	if version != argon2.Version {
		return false, errors.New("unsupported argon2id version")
	}
	var m uint32
	var t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false, fmt.Errorf("parse params: %w", err)
	}
	// Bound work before deriving a key: malformed stored hashes must not panic
	// or exhaust the small production host's memory and CPU.
	if p == 0 || p > 16 || t == 0 || t > 10 || m < 8*uint32(p) || m > 256*1024 {
		return false, errors.New("invalid argon2id parameters")
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, fmt.Errorf("decode salt: %w", err)
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, fmt.Errorf("decode key: %w", err)
	}
	if len(salt) < 8 || len(salt) > 64 || len(want) != argonKeyLen {
		return false, errors.New("invalid argon2id salt or key length")
	}
	got := argon2.IDKey([]byte(plain), salt, t, m, p, argonKeyLen)
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

// NeedsRehash reports whether encoded is not current-parameter argon2id and
// should be upgraded after a successful verification.
func NeedsRehash(encoded string) bool {
	if !strings.HasPrefix(encoded, "$argon2id$") {
		return true
	}
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 {
		return true
	}
	var m uint32
	var t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return true
	}
	return m != argonMemory || t != argonTime || p != argonThreads
}

// dummy is computed once at process start: a valid argon2id hash of random
// data. Verifying against it when an account does not exist equalises
// response timing whether or not an email is registered (anti-enumeration).
// It deliberately bypasses the pool: initialisation must not depend on
// runtime configuration.
var dummy = func() string {
	h, err := hashArgon2id(base64.RawStdEncoding.EncodeToString([]byte("identity-dummy-" + time.Now().Format(time.RFC3339))))
	if err != nil {
		panic("password: cannot build dummy hash: " + err.Error())
	}
	return h
}()

// VerifyDummy burns exactly one hash verification without touching a real
// account. Callers use it on the user-not-found path.
func VerifyDummy(plain string) {
	_, _ = Verify(plain, dummy)
}

// VerifyDummyCtx is VerifyDummy with a bounded wait for a hashing slot.
func VerifyDummyCtx(ctx context.Context, plain string) error {
	_, err := VerifyCtx(ctx, plain, dummy)
	return err
}
