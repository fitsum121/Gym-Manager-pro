# Design Document: Staff Management

## Overview

This feature migrates the Gym Manager app from a fully offline, single-device architecture to a multi-device, API-backed system. Every existing feature — add member, edit member, record payment, search/filter, auto-delete expired members, CSV export, SMS reminders, subscription activation, and settings — must continue to work exactly as it does today, but with data persisted in PostgreSQL via the API server instead of AsyncStorage.

The change introduces three new concerns:

1. **Authentication via API** — Owner login/register moves from local AsyncStorage to the Express server. Staff members get a new PIN-based login path.
2. **API-backed member data** — `GymContext` replaces all AsyncStorage reads/writes with HTTP calls to the server.
3. **Role-based access** — The tab layout and screen guards enforce what owners vs. staff can see and do.

The API server already exists (Express 5, PostgreSQL, Drizzle ORM, Zod validation). The `licenses` table already exists. This design extends the server with new tables and routes.

---

## Architecture

```mermaid
graph TD
    subgraph Mobile App (Expo React Native)
        AC[AuthContext] -->|JWT in AsyncStorage| AS[(AsyncStorage)]
        GC[GymContext] -->|HTTP calls| API
        SC[SubscriptionContext] -->|reads gymId from AuthContext| AC
        TL[Tab Layout] -->|reads role from AuthContext| AC
    end

    subgraph API Server (Express 5)
        API[/api/] --> AR[Auth Routes]
        API --> MR[Members Routes]
        API --> SR[Staff Routes]
        API --> LR[License Routes - existing]
        AR --> MW[JWT Middleware]
        MR --> MW
        SR --> MW
    end

    subgraph Database (PostgreSQL)
        OT[(owners)]
        ST[(staff)]
        MT[(members)]
        LT[(licenses - existing)]
    end

    AR --> OT
    SR --> ST
    MR --> MT
    LR --> LT
```

### Key Architectural Decisions

**Decision 1: JWT tokens, not opaque tokens.**
JWTs allow the mobile app to decode the role and gymId from the token payload without an extra round-trip. The token payload carries `{ sub: userId, gymId, role: 'owner' | 'staff', name }`. Tokens expire in 30 days (long-lived to avoid forcing re-login on mobile).

**Decision 2: AsyncStorage still holds the session token.**
The token is stored under the key `gym_session_v2` (new key to avoid conflicts with the old local session). The old `gym_session` and `gym_owner` keys are left untouched during migration — they are simply ignored once the user logs in via the API.

**Decision 3: No offline queue.**
Requirement 4.9 says the app must show an error and not silently lose data when the server is unreachable. The app will surface a clear error message on every failed API call. A full offline queue is out of scope.

**Decision 4: Photo URIs are local-only.**
Member photos are stored as local device URIs (from the camera/gallery). They are not uploaded to the server. The `photoUri` field is stored in AsyncStorage per-device as a separate key (`gym_photo_{memberId}`), keyed by the server-assigned member ID. This preserves the existing photo UX without requiring file upload infrastructure.

**Decision 5: Subscription activation stays client-side.**
The existing `SubscriptionContext` reads the license code from AsyncStorage and validates it locally using `parseAndVerifyCode`. This flow is unchanged. The `licenses` table on the server is used only by the admin panel to generate codes — the mobile app does not call it directly.

---

## Components and Interfaces

### Server-Side Components

#### 1. Auth Router (`/api/auth`)

Handles owner registration, owner login, owner profile updates, and password changes.

```
POST   /api/auth/owner/register
POST   /api/auth/owner/login
GET    /api/auth/owner/me          (requires JWT)
PATCH  /api/auth/owner/profile     (requires JWT, role=owner)
POST   /api/auth/owner/change-password  (requires JWT, role=owner)
```

#### 2. Staff Router (`/api/staff`)

Handles staff creation, listing, deletion, and staff login.

```
POST   /api/staff/login            (public — gymId + PIN)
GET    /api/staff                  (requires JWT, role=owner)
POST   /api/staff                  (requires JWT, role=owner)
DELETE /api/staff/:staffId         (requires JWT, role=owner)
```

#### 3. Members Router (`/api/members`)

Handles all member CRUD and payment recording. Accessible to both owners and staff.

```
GET    /api/members                (requires JWT, any role)
POST   /api/members                (requires JWT, any role)
GET    /api/members/:memberId      (requires JWT, any role)
PATCH  /api/members/:memberId      (requires JWT, any role)
DELETE /api/members/:memberId      (requires JWT, any role)
POST   /api/members/:memberId/payment  (requires JWT, any role)
```

#### 4. JWT Middleware

A reusable Express middleware that:
- Reads the `Authorization: Bearer <token>` header
- Verifies the JWT signature using `JWT_SECRET` env var
- Attaches `req.user = { userId, gymId, role, name }` to the request
- Returns 401 if the token is missing, malformed, or expired

#### 5. Role Guard Middleware

A factory function `requireRole(...roles)` that returns middleware checking `req.user.role` against the allowed roles. Returns 403 if the role is not permitted.

### Mobile App Components

#### 1. `AuthContext` (rewritten)

The context is extended to support both owner and staff sessions. The `owner` field is replaced by a unified `session` object:

```typescript
type SessionUser = {
  userId: string;
  gymId: string;
  role: 'owner' | 'staff';
  name: string;
  gymName?: string;   // only for owners
  email?: string;     // only for owners
  phone?: string;     // only for owners
  token: string;
};

type AuthState = {
  session: SessionUser | null;
  isLoading: boolean;
  loginOwner: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginStaff: (gymId: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
  register: (data: RegisterPayload) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<ProfileUpdate>) => Promise<{ ok: boolean; error?: string }>;
  changePassword: (current: string, next: string) => Promise<{ ok: boolean; error?: string }>;
  verifyIdentity: (email: string, phone: string) => Promise<boolean>;
  resetPassword: (email: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
};
```

**Backward compatibility note:** All existing screens that read `owner?.name`, `owner?.gymName`, `owner?.gymId` are updated to read from `session`. A thin compatibility shim `const owner = session` is used in screens that are not yet refactored, to minimize diff size.

#### 2. `GymContext` (rewritten data layer)

The `GymContext` interface is unchanged — all screens continue to call `addCustomer`, `updateCustomer`, `deleteCustomer`, `recordPayment`, `refresh`. Only the implementation changes: every function now calls the API instead of AsyncStorage.

The auto-delete logic (remove members expired 7+ days) moves to the server. On `GET /api/members`, the server filters out and deletes members whose `expiryDate` is more than 7 days in the past before returning the list. This keeps the behavior identical to the current client-side logic.

#### 3. `apiClient` utility (`context/apiClient.ts`)

A thin wrapper around `fetch` that:
- Prepends the `API_BASE_URL` (from `expo-constants` / env)
- Attaches the `Authorization: Bearer <token>` header from AsyncStorage
- On 401 response: clears the session and triggers a redirect to login
- On network error: throws a typed `NetworkError` that `GymContext` catches and surfaces

```typescript
export async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T>
```

#### 4. Tab Layout (updated)

The `_layout.tsx` reads `session.role` from `AuthContext`. When `role === 'staff'`, the Settings tab is omitted from the tab bar. The Settings screen also has a top-level guard that redirects staff away even on direct navigation.

#### 5. Staff Login Screen (`app/(auth)/staff-login.tsx`)

New screen with two inputs: Gym ID and PIN. Calls `loginStaff` from `AuthContext`. On success, navigates to `/(tabs)`.

---

## Data Models

### Database Schema

#### `owners` table

```typescript
export const ownersTable = pgTable("owners", {
  id: uuid("id").primaryKey().defaultRandom(),
  gymId: text("gym_id").notNull().unique(),
  name: text("name").notNull(),
  gymName: text("gym_name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### `staff` table

```typescript
export const staffTable = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  gymId: text("gym_id").notNull().references(() => ownersTable.gymId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  pinHash: text("pin_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### `members` table

```typescript
export const membersTable = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  gymId: text("gym_id").notNull().references(() => ownersTable.gymId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  membershipType: text("membership_type", {
    enum: ["weekly", "monthly", "quarterly", "yearly"],
  }).notNull(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  expiryDate: timestamp("expiry_date", { withTimezone: true }).notNull(),
  lastPaymentDate: timestamp("last_payment_date", { withTimezone: true }),
  isPaid: boolean("is_paid").notNull().default(false),
  paymentAmount: numeric("payment_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### JWT Payload

```typescript
type JwtPayload = {
  sub: string;       // userId (owner id or staff id)
  gymId: string;
  role: 'owner' | 'staff';
  name: string;
  iat: number;
  exp: number;
};
```

### AsyncStorage Keys (mobile)

| Key | Value | Purpose |
|-----|-------|---------|
| `gym_session_v2` | JSON `SessionUser` (includes token) | Active session |
| `gym_photo_{memberId}` | URI string | Local photo per member |
| `gym_subscription_{gymId}` | JSON `Subscription` | Subscription code (unchanged) |
| `gym_backup_fingerprint` | string | CSV export fingerprint (unchanged) |
| `gym_backup_date` | ISO string | Last backup date (unchanged) |

The old keys `gym_session`, `gym_owner`, `gym_customers` are ignored after migration. They are not deleted automatically (to allow rollback), but the app no longer reads or writes them.

### API Request/Response Shapes

#### `POST /api/auth/owner/register`
```typescript
// Request
{ name: string; gymName: string; phone: string; email: string; password: string }
// Response 201
{ token: string; owner: { id: string; gymId: string; name: string; gymName: string; phone: string; email: string } }
// Error 409: email already exists
```

#### `POST /api/auth/owner/login`
```typescript
// Request
{ email: string; password: string }
// Response 200
{ token: string; owner: { id: string; gymId: string; name: string; gymName: string; phone: string; email: string } }
// Error 401: invalid credentials
```

#### `POST /api/staff/login`
```typescript
// Request
{ gymId: string; pin: string }
// Response 200
{ token: string; staff: { id: string; gymId: string; name: string; role: 'staff' } }
// Error 401: invalid credentials (same message regardless of which field is wrong)
```

#### `POST /api/staff`
```typescript
// Request (owner JWT required)
{ name: string; pin: string }  // pin: 4–6 digit numeric string
// Response 201
{ id: string; gymId: string; name: string; createdAt: string }
// Error 400: validation failure
```

#### `GET /api/members`
```typescript
// Response 200
{ members: Member[] }
// Member shape mirrors the Customer type in GymContext, with id as UUID string
```

#### `POST /api/members`
```typescript
// Request
{ name; phone; email; membershipType; startDate; expiryDate; lastPaymentDate; isPaid; paymentAmount; notes }
// Response 201
{ member: Member }
```

#### `PATCH /api/members/:id`
```typescript
// Request: partial member fields
// Response 200
{ member: Member }
```

#### `DELETE /api/members/:id`
```typescript
// Response 204 No Content
```

#### `POST /api/members/:id/payment`
```typescript
// Request
{ amount: number }
// Response 200
{ member: Member }  // with updated isPaid, paymentAmount, lastPaymentDate, expiryDate
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Staff creation never exposes the raw PIN

*For any* valid staff creation request with any PIN value, the API response body SHALL NOT contain the raw PIN string.

**Validates: Requirements 1.6**

---

### Property 2: PIN validation rejects all invalid formats

*For any* string that is either non-numeric, fewer than 4 characters, or more than 6 characters, submitting it as a PIN to `POST /api/staff` SHALL return a 400 error.

**Validates: Requirements 1.4**

---

### Property 3: Staff name validation rejects empty and oversized names

*For any* name that is either empty (zero length after trimming) or longer than 100 characters, submitting it to `POST /api/staff` SHALL return a 400 error.

**Validates: Requirements 1.5**

---

### Property 4: Staff deletion removes the record

*For any* staff member that has been created, after a successful `DELETE /api/staff/:id`, a subsequent `GET /api/staff` for that gym SHALL NOT include that staff member in the list.

**Validates: Requirements 1.7**

---

### Property 5: Staff login response always contains token, name, and role

*For any* valid (gymId, PIN) credential pair, `POST /api/staff/login` SHALL return a response containing a non-empty `token`, a non-empty `name`, and `role === 'staff'`.

**Validates: Requirements 2.3**

---

### Property 6: Invalid staff credentials always return the same generic 401

*For any* (gymId, pin) pair where either the gymId does not exist or the pin does not match, `POST /api/staff/login` SHALL return 401 with the same response body regardless of which field was wrong.

**Validates: Requirements 2.4**

---

### Property 7: Staff role cannot access owner-only endpoints

*For any* valid staff JWT, requests to `POST /api/staff`, `DELETE /api/staff/:id`, `PATCH /api/auth/owner/profile`, and `POST /api/auth/owner/change-password` SHALL return 403.

**Validates: Requirements 3.6**

---

### Property 8: Member list is scoped to the requesting gym

*For any* two distinct gymIds A and B, each with at least one member, a `GET /api/members` request authenticated as gymId A SHALL NOT return any member whose `gymId` is B.

**Validates: Requirements 4.2, 4.7**

---

### Property 9: Member creation round-trip

*For any* valid member payload, after `POST /api/members` succeeds, a subsequent `GET /api/members/:id` using the returned `id` SHALL return a member record with equivalent field values.

**Validates: Requirements 4.3**

---

### Property 10: Payment recording atomically updates all four fields

*For any* member and any positive payment amount, after `POST /api/members/:id/payment` succeeds, the returned member record SHALL have `isPaid === true`, `paymentAmount === amount`, a non-null `lastPaymentDate`, and an `expiryDate` strictly greater than the pre-payment `expiryDate`.

**Validates: Requirements 4.5**

---

### Property 11: Unauthenticated requests to member endpoints return 401

*For any* member endpoint (`GET /api/members`, `POST /api/members`, `GET /api/members/:id`, `PATCH /api/members/:id`, `DELETE /api/members/:id`, `POST /api/members/:id/payment`), a request with no `Authorization` header or an invalid token SHALL return 401.

**Validates: Requirements 4.6**

---

### Property 12: Owner registration never exposes the raw password

*For any* valid owner registration request with any password value, the API response body SHALL NOT contain the raw password string.

**Validates: Requirements 5.5**

---

### Property 13: Owner registration assigns a unique Gym ID

*For any* valid registration payload, `POST /api/auth/owner/register` SHALL return a response containing a `gymId` that is exactly 6 alphanumeric characters and is unique across all existing owners.

**Validates: Requirements 5.3**

---

### Property 14: Duplicate email registration returns 409

*For any* email address that has already been registered, a second `POST /api/auth/owner/register` with that email SHALL return 409.

**Validates: Requirements 5.4**

---

### Property 15: Session persistence round-trip

*For any* successful login (owner or staff), the session written to AsyncStorage SHALL contain a non-empty `token` and a `role` field equal to either `'owner'` or `'staff'`. On subsequent app initialization with that session in storage, the authenticated state SHALL be restored without calling the login endpoint.

**Validates: Requirements 7.1, 7.2**

---

### Property 16: Logout clears the session completely

*For any* active session (owner or staff), after `logout()` is called, AsyncStorage SHALL NOT contain the `gym_session_v2` key.

**Validates: Requirements 7.3**

---

### Property 17: Expired token on startup clears session and redirects

*For any* `gym_session_v2` entry in AsyncStorage whose `token` is expired or whose signature is invalid, app initialization SHALL remove the entry from AsyncStorage and navigate to the login screen.

**Validates: Requirements 7.5**

---

## Error Handling

### Network Errors (server unreachable)

Every `apiClient` call wraps `fetch` in a try/catch. On `TypeError` (network failure) or any non-2xx response, the client throws a structured error:

```typescript
class ApiError extends Error {
  constructor(
    public status: number | null,  // null = network failure
    public message: string,
    public code?: string
  ) { super(message); }
}
```

`GymContext` catches `ApiError` and sets an `error` string in its state. The Members screen renders a dismissible error banner when `error` is non-null. The banner reads: "Could not connect to server. Check your internet connection and try again."

Data mutation operations (`addCustomer`, `updateCustomer`, `deleteCustomer`, `recordPayment`) do not update local state on failure — the list remains unchanged, satisfying the "SHALL NOT silently lose data" requirement.

### 401 Handling (token expired mid-session)

The `apiClient` intercepts 401 responses globally. It calls `AuthContext.logout()` and navigates to `/(auth)/login`. This handles the case where a token expires while the app is in use.

### 403 Handling

403 responses are surfaced as an `ApiError` with `status: 403`. The calling screen shows an alert: "You don't have permission to perform this action."

### Validation Errors (400)

The server returns `{ error: string; details?: ZodIssue[] }` for 400 responses. The mobile app reads `error` and displays it inline in the form.

### Conflict Errors (409)

409 on registration is caught and displayed as "An account with this email already exists."

---

## Testing Strategy

### Unit Tests

Unit tests cover pure logic that does not require a running server or database:

- `apiClient`: mock `fetch`, verify header injection, 401 interception, error shaping
- `AuthContext`: mock `apiClient`, verify state transitions for login/logout/register
- `GymContext`: mock `apiClient`, verify each CRUD operation calls the correct endpoint and updates state correctly
- Payment expiry calculation: the `recordPayment` logic that computes the new `expiryDate` based on `membershipType` — this is pure date arithmetic and should be extracted into a testable utility function
- Tab layout role guard: render with owner session vs. staff session, verify Settings tab presence/absence
- Settings screen guard: render with staff session, verify redirect behavior

### Property-Based Tests

Use **fast-check** (TypeScript-compatible, works in Jest/Vitest) for all properties listed in the Correctness Properties section.

Each property test runs a minimum of **100 iterations**.

Tag format for each test: `// Feature: staff-management, Property N: <property text>`

Key generators needed:
- `fc.string({ minLength: 1, maxLength: 100 })` — valid staff names
- `fc.stringMatching(/^\d{4,6}$/)` — valid PINs
- `fc.oneof(fc.string().filter(s => !/^\d{4,6}$/.test(s)))` — invalid PINs
- `fc.record({ name, phone, membershipType, ... })` — valid member payloads
- `fc.float({ min: 0.01, max: 999999 })` — valid payment amounts

Properties 8, 9, 10, 11, 14 require a running database. These are implemented as **integration property tests** that run against a test PostgreSQL instance (seeded fresh per test run). They use fast-check with a reduced iteration count (25) due to I/O cost.

Properties 1, 2, 3, 5, 6, 7, 12, 13, 15, 16, 17 are pure logic or use mocked I/O and run at full 100 iterations.

### Integration Tests

- Full owner registration → login → create member → record payment → list members flow
- Staff creation → staff login → list members (verify same data as owner sees)
- Cross-gym isolation: two owners, verify neither can see the other's members
- Token expiry: issue a token with 1-second TTL, wait, verify 401 is returned and app redirects

### Migration Path Testing

- Install old app version (AsyncStorage data present), upgrade to new version, verify old data is not corrupted
- Verify new login flow works even when old `gym_session` key exists in AsyncStorage

---

## Migration Path for Existing AsyncStorage Data

Existing users have owner accounts and member data stored locally in AsyncStorage. The migration is **manual and opt-in** — the app does not attempt to auto-migrate on first launch.

### Migration Flow

1. On first launch after update, the app detects the old `gym_session` key in AsyncStorage.
2. The login screen shows a banner: "Welcome to the new version! Please sign in with your email and password to continue. Your data will be available after signing in."
3. The owner registers (or logs in if already registered on another device) via the API.
4. After successful login, a one-time migration screen appears: "We found X members stored on this device. Would you like to import them to your account?"
5. If the owner taps "Import", the app reads `gym_customers` from AsyncStorage, filters by `ownerId`, and calls `POST /api/members` for each record in sequence.
6. After import completes (or is skipped), the old keys (`gym_session`, `gym_owner`, `gym_customers`) are removed from AsyncStorage.

### Migration Constraints

- Photo URIs are local and cannot be migrated to the server. After migration, member photos are lost and must be re-taken. The migration screen warns: "Note: member photos are stored on this device and cannot be transferred."
- If the import fails partway through (network error), the app shows how many records were imported and offers to retry. Already-imported records are not duplicated (the server checks for duplicate phone numbers within a gym and skips them, returning a 200 with `{ skipped: true }` instead of 201).
- The old AsyncStorage keys are only deleted after a fully successful import or explicit skip.
