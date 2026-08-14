# Settings Page Documentation

> Comprehensive user account management with security-first design.

## Overview

The Settings page provides users with complete control over their account, profile, security, and data. Built with a focus on **security**, **data privacy**, and **user experience**.

## Features

### 📝 Profile Management

Users can update their personal information while maintaining data integrity constraints.

**Editable Fields:**

- **First Name** - Free text, optional
- **Last Name** - Free text, optional
- **Email** - Read-only (linked to authentication identity)

**UX Features:**

- Avatar displays user's first initial or email initial
- Profile updates immediately reflect in dashboard greeting
- Loading states prevent double-submission

**Implementation:**

```typescript
PATCH /api/user/profile
{
  firstName: string | null,
  lastName: string | null
}
```

---

### 🔐 Security (Email Users Only)

Password change functionality is **conditionally available** based on authentication method.

**Password Requirements:**

- Minimum 8 characters
- Must match confirmation field
- Current password verification required

**Edge Case: OAuth Users**
Users who signed up via Google OAuth don't have passwords stored locally. The Security card is **hidden** for these users:

```typescript
{user?.authProvider === "email" && (
  <Card className="...">
    {/* Password change UI */}
  </Card>
)}
```

**Implementation:**

```typescript
POST /api/user/change-password
{
  currentPassword: string,
  newPassword: string
}
```

---

### 🗂️ Data & Privacy

Three-tier data management system with escalating confirmation requirements.

#### 1. Export Data

**Status:** Placeholder implementation

- Button triggers toast notification
- Future: GDPR-compliant data export (JSON format)
- Will include: workspaces, nodes, edges, collections, account metadata

#### 2. Delete All Data

**Severity:** High | **Confirmation:** "DELETE ALL"

Deletes all project data while **preserving account**:

- All workspaces
- All nodes and edges
- All collections
- Keeps: email, password, profile info

**Use Case:** Fresh start without losing account history

**Implementation Details:**

- Confirmation dialog with type-to-confirm pattern
- Atomic database transaction (all-or-nothing)
- Uses `inArray()` for proper single/multi-workspace handling
- Success toast with clear messaging

```typescript
DELETE / api / user / data;
// Requires confirmation text: "DELETE ALL"
```

#### 3. Delete Account

**Severity:** Critical | **Confirmation:** "DELETE"

**Permanent deletion** of:

- User account (email, password, OAuth links)
- All workspaces and project data
- All collections
- Sessions and authentication state

**Implementation Details:**

- Most destructive action in the system
- Multi-step confirmation (dialog + text input)
- Atomic transaction ensures complete removal
- Automatic logout after deletion
- No recovery possible (by design)

```typescript
DELETE / api / user / account;
// Requires confirmation text: "DELETE"
// Response: { message: "Account deleted successfully" }
// Side effect: User logged out
```

---

## Technical Architecture

### Database Transactions

Both delete operations use **atomic transactions** to prevent partial deletions:

```typescript
await db.transaction(async (tx) => {
  // 1. Get workspace IDs
  const userWorkspaces = await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.userId, userId));

  const workspaceIds = userWorkspaces.map((w) => w.id);

  if (workspaceIds.length > 0) {
    // 2. Delete edges (referencing nodes)
    await tx.delete(edges).where(inArray(edges.workspaceId, workspaceIds));

    // 3. Delete nodes (referencing workspaces)
    await tx.delete(nodes).where(inArray(nodes.workspaceId, workspaceIds));

    // 4. Delete workspaces
    await tx.delete(workspaces).where(eq(workspaces.userId, userId));
  }

  // 5. Delete collections
  await tx.delete(collections).where(eq(collections.userId, userId));

  // 6. Delete user (account deletion only)
  await tx.delete(users).where(eq(users.id, userId));
});
```

**Why Transactions Matter:**

- If step 4 fails, steps 2-3 are rolled back
- No orphaned edges referencing deleted nodes
- Data integrity maintained even on errors
- Prevents "half-deleted" user state

### Single vs Multiple Workspace Handling

Drizzle ORM's `and()` requires 2+ conditions. Using `inArray()` handles both cases:

```typescript
// ✅ Works for 1 workspace OR 100 workspaces
await tx.delete(edges).where(inArray(edges.workspaceId, workspaceIds));

// ❌ Fails with only 1 workspace
await tx
  .delete(edges)
  .where(and(...workspaceIds.map((id) => eq(edges.workspaceId, id))));
```

---

## UI/UX Design Patterns

### Type-to-Confirm Pattern

Destructive actions require explicit text confirmation:

```typescript
const [deleteConfirmText, setDeleteConfirmText] = useState("");

// User must type exactly "DELETE"
<AlertDialogAction
  disabled={deleteConfirmText !== "DELETE"}
  onClick={handleDeleteAccount}
>
  Delete Account
</AlertDialogAction>
```

**Benefits:**

- Prevents accidental clicks
- Forces user to read warning
- Creates cognitive pause before destruction

### Confirmation Reset on Cancel

When user cancels a destructive dialog, confirmation text is cleared:

```typescript
<AlertDialogCancel
  onClick={() => setDeleteConfirmText("")}
>
  Cancel
</AlertDialogCancel>
```

This prevents stale confirmation text if user reopens dialog later.

### Brutalist Design Language

Settings page maintains app-wide aesthetic:

- **Border emphasis:** 2px borders on all cards
- **Sharp corners:** `rounded-none` everywhere
- **Uppercase typography:** All labels and headers
- **Destructive color coding:** Red borders/backgrounds for dangerous actions
- **Icon integration:** Visual cues with Lucide icons

---

## Security Considerations

### 1. Authentication Required

All settings endpoints use `isAuthenticated` middleware:

```typescript
app.delete("/api/user/account", isAuthenticated, async (req, res) => {
  // Only reachable if logged in
});
```

### 2. No Email Changes

Email is read-only in UI and backend ignores email in profile updates:

- Email = identity anchor for OAuth linking
- Changing email would break Google OAuth association
- Security risk: account takeover via email change

### 3. Password Verification

Password changes require current password:

```typescript
const isValid = await verifyPassword(currentPassword, user.passwordHash);
if (!isValid) {
  return res.status(401).json({ message: "Current password is incorrect" });
}
```

### 4. OAuth Account Protection

Backend prevents password changes for OAuth accounts:

```typescript
if (!user.passwordHash) {
  return res
    .status(400)
    .json({ message: "Cannot change password for OAuth accounts" });
}
```

### 5. Session Invalidation

Account deletion logs user out immediately:

```typescript
req.logout(() => {
  res.json({ message: "Account deleted successfully" });
});
```

---

## Edge Cases Handled

| Edge Case                      | Solution                                               |
| ------------------------------ | ------------------------------------------------------ |
| Single workspace deletion      | Uses `inArray()` instead of `and()`                    |
| OAuth users see password UI    | Conditional rendering based on `authProvider`          |
| Profile update doesn't reflect | `queryClient.setQueryData()` updates cache immediately |
| Delete confirmation persists   | Reset on dialog cancel                                 |
| Partial deletion failure       | Database transactions ensure atomicity                 |
| Empty first/last name          | Sends `null` instead of empty string                   |

---

## API Reference

### Update Profile

```http
PATCH /api/user/profile
Authorization: Cookie (session)
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe"
}

Response 200:
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "profileImageUrl": "...",
  "authProvider": "email",
  "createdAt": "2026-01-01T00:00:00Z"
}
```

### Change Password

```http
POST /api/user/change-password
Authorization: Cookie (session)
Content-Type: application/json

{
  "currentPassword": "oldpass",
  "newPassword": "newpass123"
}

Response 200:
{ "message": "Password changed successfully" }

Response 401:
{ "message": "Current password is incorrect" }
```

### Delete All Data

```http
DELETE /api/user/data
Authorization: Cookie (session)

Response 200:
{ "message": "All data deleted successfully" }

Response 500:
{ "message": "Failed to delete user data" }
```

### Delete Account

```http
DELETE /api/user/account
Authorization: Cookie (session)

Response 200:
{ "message": "Account deleted successfully" }

Response 500:
{ "message": "Failed to delete account" }
```

---

## Testing Checklist

- [ ] Profile update reflects immediately in dashboard greeting
- [ ] Password change works for email users
- [ ] Password section hidden for OAuth users
- [ ] Single workspace deletion works (no Drizzle error)
- [ ] Multiple workspace deletion works
- [ ] Delete data preserves account
- [ ] Delete account removes everything
- [ ] Confirmation text clears on cancel
- [ ] Transaction rollback on partial failure
- [ ] Cannot delete account without session

---

_Built with security and user agency in mind._
