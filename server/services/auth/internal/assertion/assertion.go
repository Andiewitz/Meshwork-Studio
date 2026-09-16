// Package assertion issues and verifies short-lived, ed25519-signed session
// assertions. The Node monolith verifies these LOCALLY (public key only) so
// it can authenticate requests without any access to auth_db.
//
// Wire format (compact, dependency-free):
//
//	v1.<base64url(payloadJSON)>.<base64url(sig)>
//
// payload = {"sub","sid","adm","exp","kid","eml","nam"}
//   - sub: user id
//   - sid: session id hash — matches the revocation pub/sub denylist keys
//   - adm: admin flag
//   - exp: unix seconds
//   - kid: key id enabling rotation
//   - eml/nam: display email/name so consumers need no user lookups
package assertion

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

const Version byte = 'v'

var (
	ErrMalformed    = errors.New("assertion: malformed token")
	ErrBadSignature = errors.New("assertion: bad signature")
	ErrExpired      = errors.New("assertion: expired")
)

type Claims struct {
	Sub string `json:"sub"` // user id
	Sid string `json:"sid"` // session id hash (denylist key)
	Adm bool   `json:"adm"`
	Exp int64  `json:"exp"`
	Kid string `json:"kid,omitempty"`
	Eml string `json:"eml,omitempty"` // email (display purposes)
	Nam string `json:"nam,omitempty"` // display name
}

// Identity is what gets baked into an assertion.
type Identity struct {
	UserID        string
	SessionIDHash string
	Admin         bool
	Email         string
	Name          string
}

type Signer struct {
	priv     ed25519.PrivateKey
	pub      ed25519.PublicKey
	kid      string
	ttl      time.Duration
	prevPubs map[string]ed25519.PublicKey // kid → previous accepted key
}

func keyID(pub ed25519.PublicKey) string {
	sum := sha256.Sum256(pub)
	return hex.EncodeToString(sum[:4])
}

// NewSigner builds a signer from a 32-byte ed25519 seed plus optional
// previous public keys (b64 seeds) that remain ACCEPT-FOR-VERIFY during
// rotation.
func NewSigner(seedB64 string, ttl time.Duration, prevSeedsB64 []string) (*Signer, ed25519.PublicKey, error) {
	seed, err := base64.StdEncoding.DecodeString(seedB64)
	if err != nil || len(seed) != ed25519.SeedSize {
		return nil, nil, fmt.Errorf("assertion: private key must be base64 of %d bytes", ed25519.SeedSize)
	}
	priv := ed25519.NewKeyFromSeed(seed)
	pub := priv.Public().(ed25519.PublicKey)

	s := &Signer{
		priv:     priv,
		pub:      pub,
		kid:      keyID(pub),
		ttl:      ttl,
		prevPubs: make(map[string]ed25519.PublicKey),
	}
	for _, p := range prevSeedsB64 {
		if p == "" {
			continue
		}
		raw, err := base64.StdEncoding.DecodeString(p)
		if err != nil || len(raw) != ed25519.SeedSize {
			return nil, nil, fmt.Errorf("assertion: previous public key invalid")
		}
		pk := ed25519.NewKeyFromSeed(raw).Public().(ed25519.PublicKey)
		s.prevPubs[keyID(pk)] = pk
	}
	return s, pub, nil
}

// NewEphemeralSigner creates a random key for development. Production must
// use explicit env keys instead.
func NewEphemeralSigner(ttl time.Duration) (*Signer, ed25519.PublicKey, error) {
	seed := make([]byte, ed25519.SeedSize)
	if _, err := rand.Read(seed); err != nil {
		return nil, nil, err
	}
	return NewSigner(base64.StdEncoding.EncodeToString(seed), ttl, nil)
}

func (s *Signer) KeyID() string { return s.kid }

// Sign mints an assertion for an identity.
func (s *Signer) Sign(id Identity, now time.Time) (string, error) {
	claims := Claims{
		Sub: id.UserID,
		Sid: id.SessionIDHash,
		Adm: id.Admin,
		Eml: id.Email,
		Nam: id.Name,
		Exp: now.Add(s.ttl).Unix(),
		Kid: s.kid,
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	sig := ed25519.Sign(s.priv, payload)

	return "v1." +
		base64.RawURLEncoding.EncodeToString(payload) + "." +
		base64.RawURLEncoding.EncodeToString(sig), nil
}

// Verify checks structure, signature (current or rotation keys) and expiry.
func Verify(token string, s *Signer, now time.Time) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 || parts[0] != "v1" {
		return nil, ErrMalformed
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, ErrMalformed
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, ErrMalformed
	}

	var claims Claims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, ErrMalformed
	}

	// Signature check against current key first; rotation keys second.
	if !s.verifyWith(s.pub, payload, sig) && !s.verifyRotation(&claims, payload, sig) {
		return nil, ErrBadSignature
	}

	// ±30s leeway for clock drift between processes on the same host.
	if now.Unix() > claims.Exp+30 {
		return nil, ErrExpired
	}
	return &claims, nil
}

func (s *Signer) verifyWith(pub ed25519.PublicKey, payload, sig []byte) bool {
	return ed25519.Verify(pub, payload, sig)
}

func (s *Signer) verifyRotation(claims *Claims, payload, sig []byte) bool {
	if claims.Kid == "" || claims.Kid == s.kid {
		return false
	}
	pub, ok := s.prevPubs[claims.Kid]
	if !ok {
		return false
	}
	return s.verifyWith(pub, payload, sig)
}

// LoadSeedFromEnv reads a b64 seed from an env var, returning "" when unset
// (development path).
func LoadSeedFromEnv(key string) string {
	return strings.TrimSpace(os.Getenv(key))
}
