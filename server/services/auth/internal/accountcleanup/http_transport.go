package accountcleanup

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// HTTPTransport calls the Node-only internal bridge; failures never include
// response bodies, credentials, or the destination URL in their error text.
type HTTPTransport struct {
	endpoint, key string
	client        *http.Client
}

func NewHTTPTransport(baseURL, key string) (*HTTPTransport, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || key == "" {
		return nil, errors.New("invalid cleanup bridge configuration")
	}
	return &HTTPTransport{endpoint: strings.TrimRight(baseURL, "/") + "/internal/v1/account-cleanup/deliver", key: key, client: &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}
func (t *HTTPTransport) Execute(ctx context.Context, service string, claim *Claim) (Receipt, error) {
	if service != "workspace" && service != "team" && service != "ai" {
		return Receipt{}, errors.New("invalid cleanup service")
	}
	body, err := json.Marshal(map[string]string{"operationId": claim.OperationID, "userId": claim.UserID, "claimToken": claim.Token, "service": service})
	if err != nil {
		return Receipt{}, errors.New("cleanup request encoding failed")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.endpoint, bytes.NewReader(body))
	if err != nil {
		return Receipt{}, errors.New("cleanup request construction failed")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", t.key)
	res, err := t.client.Do(req)
	if err != nil {
		return Receipt{}, errors.New("cleanup bridge unavailable")
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return Receipt{}, fmt.Errorf("cleanup bridge rejected request (status %d)", res.StatusCode)
	}
	payload, err := io.ReadAll(io.LimitReader(res.Body, 65537))
	if err != nil || len(payload) > 65536 {
		return Receipt{}, errors.New("invalid cleanup bridge receipt")
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	var response struct {
		OperationID string `json:"operationId"`
		Status      string `json:"status"`
	}
	if err := decoder.Decode(&response); err != nil {
		return Receipt{}, errors.New("invalid cleanup bridge receipt")
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return Receipt{}, errors.New("invalid cleanup bridge receipt")
	}
	if response.OperationID != claim.OperationID || (response.Status != "published" && response.Status != "completed") {
		return Receipt{}, errors.New("invalid cleanup bridge receipt")
	}
	return Receipt{OperationID: response.OperationID, Status: response.Status}, nil
}
