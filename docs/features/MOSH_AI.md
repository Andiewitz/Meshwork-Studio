# Mosh (Meshwork AI) Architecture & Security

**Mosh** (formerly Meshwork AI) is the embedded cloud architecture co-pilot inside Meshwork Studio. It interprets natural language prompts and translates them directly into structural canvas modifications (ReactFlow nodes and edges) using state-of-the-art LLMs.

---

## 🏗️ System Architecture

Mosh operates on a **dual-tier provider model**:

1. **Free Tier (default):** Every user gets Mosh working out of the box — no API key required. Powered by a single app-owned OpenRouter key (GPT OSS 120B) configured via the `OPENROUTER_API_KEY` environment variable.
2. **BYOK Upgrade (optional):** Users can add their own API keys (Anthropic, OpenAI, OpenRouter) to unlock different models on their own dollar.

### Provider Resolution

All AI requests flow through a single **resolver** (`resolveProviderForRequest`) that determines which key and provider to use:

```
POST /api/v1/ai/chat
        │
        ▼
resolveProviderForRequest(userId, provider?, model?)
        │
   ┌────┴─────────────────────────┐
   ▼                              ▼
BYOK path                   Free-tier fallback
(user has active key         (no provider specified,
for requested provider)      or provider is default)
   │                              │
   ▼                              ▼
decrypt stored key           read OPENROUTER_API_KEY
from database                from environment
   │                              │
   └──────────┬───────────────────┘
              ▼
   dispatch to provider adapter
   (openai.ts / anthropic.ts / openrouter.ts)
              ▼
       return response
```

**Key design rules:**

- The free-tier fallback **never queries the database** — it works from env alone.
- BYOK failures (bad decrypt, missing key) **never silently fall back** to the free tier. The user gets a specific error.
- The `source` field (`"byok"` or `"fallback"`) is logged with every request for observability.

### Resilience & Rate Limiting

Because external LLMs frequently rate limit or temporarily drop connections, Mosh implements a robust client-side retry mechanism:

- If a request fails (e.g., HTTP 429 Too Many Requests), the AI engine enters a retry loop with **exponential backoff** (e.g., waiting 2s, 4s, 8s).
- During generations, Mosh uses a "pseudo-node" (a visual loading indicator placed spatially on the canvas) to indicate where new architecture will appear, providing immediate feedback while the system retries requests in the background.

Default Rate Limits (per user):

- **BYOK:** 30 requests/min
- **Free tier:** 10 requests/min (tighter cap — app-owned key spending)

---

## 🔐 Security Model (BYOK)

Because users supply their own highly sensitive API keys (which can incur severe financial costs if leaked), Mosh employs a zero-trust, defense-in-depth storage model.

### 1. AES-256-GCM Encryption

API keys are never stored in plaintext. They are encrypted before database insertion using **AES-256-GCM**, an authenticated encryption algorithm.

- **Master Key:** The server requires an `ENCRYPTION_KEY` environment variable (32-byte Base64 string).
- **IV (Initialization Vector):** A cryptographically random 16-byte IV is generated _for every single encryption operation_.
- **Auth Tag:** GCM generates a 16-byte authentication tag ensuring the ciphertext cannot be tampered with.

### 2. Database Schema (`user_api_keys`)

When a key is stored, the database records:

- `encrypted_key`: The ciphertext (Base64)
- `iv`: The random initialization vector used (Base64)
- `auth_tag`: The GCM authentication tag (Base64)
- `key_hint`: Only the last 4 characters of the plaintext key (e.g., `...a1b2`) for UI identification.

A **partial unique index** enforces that at most one active key exists per user+provider:

```sql
CREATE UNIQUE INDEX idx_user_api_keys_one_active_per_provider
ON user_api_keys (user_id, provider) WHERE is_active = true;
```

Key creation uses a **transactional deactivate-then-insert** pattern to prevent race conditions.

### 3. In-Memory Decryption

Keys are decrypted strictly on-the-fly inside the provider resolver.

- The plaintext key exists in Node.js RAM only for the duration of the external HTTP request.
- It is never logged, printed, or returned to the client.

---

## 🧠 System Prompt & Ground Truth

Mosh relies on a heavily engineered **System Prompt** to understand Meshwork Studio's proprietary node structure.

### The Ground Truth Injector

Because node types, categories, and dimensions frequently update, the prompt dynamically injects `nodeTypesList` and `dimensions.ts` data at runtime. Mosh uses this to:

- Guarantee it only requests valid `type` strings (e.g., `genericNode`, `databaseNode`).
- Accurately calculate X/Y coordinates to prevent nodes from overlapping on the canvas.

### The Feedback Loop

Mosh has full context of the _current_ canvas. When modifying an architecture, Mosh reads the existing JSON layout and calculates topological insertions, ensuring new services route correctly to existing API gateways or databases.

---

## API Endpoints

### Managing Keys

```http
# Save a key (deactivates any previous key for the same provider)
POST /api/ai/keys
{ "provider": "openai", "apiKey": "sk-..." }

# See what keys are stored (just hints, not actual keys)
GET /api/ai/keys

# Delete one
DELETE /api/ai/keys/:id

# Test a key without saving it
POST /api/ai/keys/test
{ "provider": "openai", "apiKey": "sk-..." }
```

The list endpoint returns something like:

```json
[{ "id": "uuid", "provider": "openai", "keyHint": "...wxyz", "isActive": true }]
```

### Making AI Requests

```http
# Free tier (omit provider/model — resolver uses defaults)
POST /api/ai/chat
{
  "messages": [{ "role": "user", "content": "yo" }]
}

# BYOK (specify provider and model)
POST /api/ai/chat
{
  "provider": "anthropic",
  "model": "claude-3-opus",
  "messages": [{ "role": "user", "content": "yo" }],
  "temperature": 0.7,
  "maxTokens": 1000
}

# See available providers and models
GET /api/ai/providers
```

---

## Supported Providers

| Provider   | Key          | Adapter                   | BYOK Required?         |
| ---------- | ------------ | ------------------------- | ---------------------- |
| OpenRouter | `openrouter` | `providers/openrouter.ts` | No (free tier default) |
| OpenAI     | `openai`     | `providers/openai.ts`     | Yes                    |
| Anthropic  | `anthropic`  | `providers/anthropic.ts`  | Yes                    |

---

## Errors

| Code                      | HTTP | What happened                                 | Fix                                                  |
| ------------------------- | ---- | --------------------------------------------- | ---------------------------------------------------- |
| `BYOK_DECRYPT_FAILED`     | 500  | Stored key exists but decryption failed       | Remove and re-add the key                            |
| `NO_ACTIVE_KEY`           | 404  | No stored key for the requested BYOK provider | Add a key in settings, or use the default provider   |
| `FALLBACK_NOT_CONFIGURED` | 503  | `OPENROUTER_API_KEY` env var not set          | Set it in server configuration                       |
| `PROVIDER_ERROR`          | 502  | Upstream provider rejected the request        | Check the provider's status page                     |
| `RATE_LIMIT_EXCEEDED`     | 429  | Too many requests                             | Wait for cooldown, or add BYOK key for higher limits |
