# Implementation Plan: Staff Management

## Overview

This plan migrates the Gym Manager app from a fully offline, single-device architecture to an API-backed, multi-device system. Every existing feature — add member, edit member, record payment, search/filter, auto-delete expired members, CSV export, SMS reminders, subscription activation, and settings — must continue to work identically, now backed by PostgreSQL via the API server.

The plan is ordered **server-first, then mobile**, so each mobile task can immediately call a working endpoint. Tasks build incrementally: database schema → server middleware → server routes → mobile API client → mobile auth → mobile data layer → mobile UI updates.

## Tasks

- [x] 1. Extend the database schema with `owners`, `staff`, and `members` tables
  - Create `lib/db/src/schema/owners.ts` with the `ownersTable` definition (uuid PK, gymId unique text, name, gymName, phone, email, passwordHash, timestamps)
  - Create `lib/db/src/schema/staff.ts` with the `staffTable` definition (uuid PK, gymId FK → owners.gymId with cascade delete, name, pinHash, createdAt)
  - Create `lib/db/src/schema/members.ts` with the `membersTable` definition (uuid PK, gymId FK → owners.gymId with cascade delete, name, phone, email, membershipType enum, startDate, expiryDate, lastPaymentDate, isPaid, paymentAmount, notes, timestamps)
  - Export all three tables from `lib/db/src/schema/index.ts` alongside the existing `licensesTable`
  - Add Drizzle insert/select schemas and TypeScript types for each table using `drizzle-zod`
  - _Requirements: 1.3, 4.1, 4.3, 5.3_

- [x] 2. Add JWT utilities and bcrypt helpers to the API server
  - Install `jsonwebtoken`, `bcrypt`, and their `@types/*` packages in `artifacts/api-server`
  - Create `artifacts/api-server/src/lib/jwt.ts` — exports `signToken(payload: JwtPayload): string` and `verifyToken(token: string): JwtPayload | null` using `JWT_SECRET` env var; tokens expire in 30 days
  - Create `artifacts/api-server/src/lib/hash.ts` — exports `hashPassword(plain: string): Promise<string>` and `comparePassword(plain: string, hash: string): Promise<boolean>` using bcrypt (cost factor 12); also exports `hashPin` and `comparePin` aliases
  - Create `artifacts/api-server/src/lib/gymId.ts` — exports `generateGymId(): string` that returns a random 6-character uppercase alphanumeric string (matches the existing mobile `generateGymId` logic)
  - _Requirements: 1.6, 2.3, 5.3, 5.5_

- [x] 3. Implement JWT authentication middleware and role guard
  - Create `artifacts/api-server/src/middlewares/authenticate.ts` — reads `Authorization: Bearer <token>` header, calls `verifyToken`, attaches `req.user = { userId, gymId, role, name }` to the request; returns 401 if missing, malformed, or expired
  - Create `artifacts/api-server/src/middlewares/requireRole.ts` — exports `requireRole(...roles: Role[])` factory that returns middleware checking `req.user.role`; returns 403 if role is not in the allowed list
  - Extend Express `Request` type in `artifacts/api-server/src/types/express.d.ts` to include the `user` field
  - _Requirements: 3.6, 4.6, 5.1_

- [ ]* 3.1 Write property test for JWT middleware (Property 11)
  - **Property 11: Unauthenticated requests to member endpoints return 401**
  - For any member endpoint, a request with no `Authorization` header or an invalid token SHALL return 401
  - Use fast-check to generate arbitrary invalid token strings and verify each returns 401
  - **Validates: Requirements 4.6**

- [ ]* 3.2 Write property test for role guard (Property 7)
  - **Property 7: Staff role cannot access owner-only endpoints**
  - For any valid staff JWT, requests to `POST /api/staff`, `DELETE /api/staff/:id`, `PATCH /api/auth/owner/profile`, and `POST /api/auth/owner/change-password` SHALL return 403
  - **Validates: Requirements 3.6**

- [x] 4. Implement the Auth router (`/api/auth`)
  - Create `artifacts/api-server/src/routes/auth.ts` with all five owner auth endpoints:
    - `POST /api/auth/owner/register` — validate body with Zod, check for duplicate email (409), hash password, generate unique gymId via `generateGymId`, insert into `ownersTable`, return `{ token, owner }` (201); token payload: `{ sub: id, gymId, role: 'owner', name }`
    - `POST /api/auth/owner/login` — find owner by email, compare password hash, return `{ token, owner }` (200) or 401
    - `GET /api/auth/owner/me` — requires JWT; return owner profile from DB
    - `PATCH /api/auth/owner/profile` — requires JWT + `requireRole('owner')`; update name, gymName, phone; return updated profile
    - `POST /api/auth/owner/change-password` — requires JWT + `requireRole('owner')`; verify current password, hash new password, update DB
  - Register the auth router in `artifacts/api-server/src/routes/index.ts` under `/auth`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [ ]* 4.1 Write property test for owner registration (Property 12)
  - **Property 12: Owner registration never exposes the raw password**
  - For any valid registration payload with any password value, the API response body SHALL NOT contain the raw password string
  - Use `fc.string({ minLength: 8 })` to generate arbitrary passwords
  - **Validates: Requirements 5.5**

- [ ]* 4.2 Write property test for owner registration (Property 13)
  - **Property 13: Owner registration assigns a unique Gym ID**
  - For any valid registration payload, `POST /api/auth/owner/register` SHALL return a `gymId` that is exactly 6 alphanumeric characters and is unique across all existing owners
  - Integration test against test DB; use `fc.array` to register multiple owners and verify all gymIds are distinct
  - **Validates: Requirements 5.3**

- [ ]* 4.3 Write property test for duplicate email (Property 14)
  - **Property 14: Duplicate email registration returns 409**
  - For any email address already registered, a second `POST /api/auth/owner/register` with that email SHALL return 409
  - **Validates: Requirements 5.4**

- [x] 5. Implement the Staff router (`/api/staff`)
  - Create `artifacts/api-server/src/routes/staff.ts` with four endpoints:
    - `POST /api/staff/login` — public; find staff by gymId, compare PIN hash; return `{ token, staff: { id, gymId, name, role: 'staff' } }` (200) or 401 with the same generic message regardless of which field was wrong
    - `GET /api/staff` — requires JWT + `requireRole('owner')`; return all staff for `req.user.gymId`
    - `POST /api/staff` — requires JWT + `requireRole('owner')`; validate name (non-empty, ≤100 chars) and PIN (4–6 numeric digits) with Zod; hash PIN; insert into `staffTable`; return created record (201) without the pinHash field
    - `DELETE /api/staff/:staffId` — requires JWT + `requireRole('owner')`; verify staff belongs to `req.user.gymId`; delete record; return 204
  - Register the staff router in `artifacts/api-server/src/routes/index.ts` under `/staff`
  - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 2.3, 2.4_

- [ ]* 5.1 Write property test for PIN validation (Property 2)
  - **Property 2: PIN validation rejects all invalid formats**
  - For any string that is non-numeric, fewer than 4 characters, or more than 6 characters, `POST /api/staff` SHALL return 400
  - Use `fc.oneof(fc.string().filter(s => !/^\d{4,6}$/.test(s)))` to generate invalid PINs
  - **Validates: Requirements 1.4**

- [ ]* 5.2 Write property test for staff name validation (Property 3)
  - **Property 3: Staff name validation rejects empty and oversized names**
  - For any name that is empty (zero length after trimming) or longer than 100 characters, `POST /api/staff` SHALL return 400
  - Use `fc.oneof(fc.constant(''), fc.string({ minLength: 101 }))` to generate invalid names
  - **Validates: Requirements 1.5**

- [ ]* 5.3 Write property test for staff creation (Property 1)
  - **Property 1: Staff creation never exposes the raw PIN**
  - For any valid staff creation request with any PIN value, the API response body SHALL NOT contain the raw PIN string
  - Use `fc.stringMatching(/^\d{4,6}$/)` to generate valid PINs; verify response body does not contain the PIN
  - **Validates: Requirements 1.6**

- [ ]* 5.4 Write property test for staff login response (Property 5)
  - **Property 5: Staff login response always contains token, name, and role**
  - For any valid (gymId, PIN) credential pair, `POST /api/staff/login` SHALL return a non-empty `token`, non-empty `name`, and `role === 'staff'`
  - **Validates: Requirements 2.3**

- [ ]* 5.5 Write property test for invalid staff credentials (Property 6)
  - **Property 6: Invalid staff credentials always return the same generic 401**
  - For any (gymId, pin) pair where either the gymId does not exist or the pin does not match, `POST /api/staff/login` SHALL return 401 with the same response body regardless of which field was wrong
  - Use `fc.tuple(fc.string(), fc.string())` to generate arbitrary invalid credential pairs
  - **Validates: Requirements 2.4**

- [ ]* 5.6 Write property test for staff deletion (Property 4)
  - **Property 4: Staff deletion removes the record**
  - For any staff member that has been created, after a successful `DELETE /api/staff/:id`, a subsequent `GET /api/staff` SHALL NOT include that staff member
  - Integration test against test DB
  - **Validates: Requirements 1.7**

- [x] 6. Implement the Members router (`/api/members`)
  - Create `artifacts/api-server/src/routes/members.ts` with six endpoints, all requiring JWT (any role):
    - `GET /api/members` — return members for `req.user.gymId`; before returning, delete any members whose `expiryDate` is more than 7 days in the past (server-side auto-delete, replacing the existing client-side logic)
    - `POST /api/members` — validate body with Zod; insert into `membersTable` scoped to `req.user.gymId`; return created member (201)
    - `GET /api/members/:memberId` — return single member; verify `gymId` matches `req.user.gymId` or return 403
    - `PATCH /api/members/:memberId` — partial update; verify gymId ownership; return updated member
    - `DELETE /api/members/:memberId` — verify gymId ownership; delete; return 204
    - `POST /api/members/:memberId/payment` — validate `{ amount: number }` (positive); atomically update `isPaid`, `paymentAmount`, `lastPaymentDate`, and compute new `expiryDate` using the same membership-type extension logic as the current `GymContext.recordPayment`; return updated member
  - Register the members router in `artifacts/api-server/src/routes/index.ts` under `/members`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ]* 6.1 Write property test for member list gym scoping (Property 8)
  - **Property 8: Member list is scoped to the requesting gym**
  - For any two distinct gymIds A and B each with at least one member, `GET /api/members` authenticated as gymId A SHALL NOT return any member whose `gymId` is B
  - Integration test against test DB; use `fc.uniqueArray` to generate distinct gymIds
  - **Validates: Requirements 4.2, 4.7**

- [ ]* 6.2 Write property test for member creation round-trip (Property 9)
  - **Property 9: Member creation round-trip**
  - For any valid member payload, after `POST /api/members` succeeds, `GET /api/members/:id` SHALL return a member with equivalent field values
  - Use `fc.record` to generate valid member payloads
  - **Validates: Requirements 4.3**

- [ ]* 6.3 Write property test for payment atomicity (Property 10)
  - **Property 10: Payment recording atomically updates all four fields**
  - For any member and any positive payment amount, after `POST /api/members/:id/payment`, the returned member SHALL have `isPaid === true`, `paymentAmount === amount`, a non-null `lastPaymentDate`, and an `expiryDate` strictly greater than the pre-payment `expiryDate`
  - Use `fc.float({ min: 0.01, max: 999999 })` to generate payment amounts
  - **Validates: Requirements 4.5**

- [x] 7. Checkpoint — verify all server routes work end-to-end
  - Ensure all server-side tests pass
  - Manually verify the full owner registration → login → create member → record payment → list members flow using a REST client (e.g., curl or Postman)
  - Verify cross-gym isolation: two owners cannot see each other's members
  - Ask the user if any questions arise before proceeding to mobile changes

- [x] 8. Create the `apiClient` utility in the mobile app
  - Create `artifacts/gym-manager/context/apiClient.ts`
  - Implement `apiRequest<T>(path: string, options?: RequestInit): Promise<T>` that:
    - Prepends `API_BASE_URL` from `expo-constants` / `process.env.EXPO_PUBLIC_API_URL`
    - Reads the JWT from AsyncStorage key `gym_session_v2` and attaches `Authorization: Bearer <token>` header
    - On 401 response: clears `gym_session_v2` from AsyncStorage and throws an `ApiError` with `status: 401` (the `AuthContext` will handle the redirect)
    - On network failure (`TypeError`): throws `ApiError` with `status: null`
    - On non-2xx response: throws `ApiError` with the response status and parsed `error` field from the JSON body
  - Define and export the `ApiError` class with `status: number | null`, `message: string`, and optional `code: string`
  - _Requirements: 4.6, 4.9_

- [x] 9. Rewrite `AuthContext` to use the API
  - Rewrite `artifacts/gym-manager/context/AuthContext.tsx` to replace all AsyncStorage owner reads/writes with API calls
  - Replace the `GymOwner` type and `owner` state with the new `SessionUser` type and `session` state as defined in the design
  - Implement `loginOwner(email, password)` — calls `POST /api/auth/owner/login`, stores the full `SessionUser` (including token) in AsyncStorage under `gym_session_v2`, sets `session` state
  - Implement `loginStaff(gymId, pin)` — calls `POST /api/staff/login`, stores session in `gym_session_v2`, sets `session` state
  - Implement `register(data)` — calls `POST /api/auth/owner/register`, stores session, sets state
  - Implement `logout()` — removes `gym_session_v2` from AsyncStorage, clears `session` state
  - Implement `updateProfile(data)` — calls `PATCH /api/auth/owner/profile`, updates session in AsyncStorage and state
  - Implement `changePassword(current, next)` — calls `POST /api/auth/owner/change-password`
  - Implement `verifyIdentity(email, phone)` — calls `POST /api/auth/owner/verify-identity` (add this endpoint to the auth router) or implement locally by calling `GET /api/auth/owner/me` with a temporary token approach; see design for the exact flow
  - Implement `resetPassword(email, newPassword)` — calls `POST /api/auth/owner/reset-password` (add this endpoint to the auth router)
  - On app startup: read `gym_session_v2` from AsyncStorage; decode the JWT to check expiry; if expired or invalid, clear the key and leave `session` as null; if valid, restore `session` state without calling the login endpoint
  - Add a backward-compatibility shim: `const owner = session` exported alongside `session` so existing screens that read `owner?.name`, `owner?.gymId`, etc. continue to work without modification
  - _Requirements: 2.5, 5.1, 5.2, 5.3, 5.6, 5.7, 7.1, 7.2, 7.3, 7.5_

- [ ]* 9.1 Write property test for session persistence (Property 15)
  - **Property 15: Session persistence round-trip**
  - For any successful login (owner or staff), the session written to AsyncStorage SHALL contain a non-empty `token` and a `role` field equal to `'owner'` or `'staff'`; on subsequent app initialization with that session in storage, the authenticated state SHALL be restored without calling the login endpoint
  - Mock `apiRequest` and AsyncStorage; use `fc.oneof(fc.constant('owner'), fc.constant('staff'))` for roles
  - **Validates: Requirements 7.1, 7.2**

- [ ]* 9.2 Write property test for logout (Property 16)
  - **Property 16: Logout clears the session completely**
  - For any active session (owner or staff), after `logout()` is called, AsyncStorage SHALL NOT contain the `gym_session_v2` key
  - **Validates: Requirements 7.3**

- [ ]* 9.3 Write property test for expired token on startup (Property 17)
  - **Property 17: Expired token on startup clears session and redirects**
  - For any `gym_session_v2` entry whose token is expired or has an invalid signature, app initialization SHALL remove the entry from AsyncStorage
  - Use `fc.string()` to generate arbitrary invalid token strings; use a real expired JWT for the expiry case
  - **Validates: Requirements 7.5**

- [x] 10. Update the login screen and add the staff login screen
  - Update `artifacts/gym-manager/app/(auth)/login.tsx`:
    - Change the `login` call to `loginOwner` from the new `AuthContext`
    - Add a "Staff Login" link/button below the sign-in form that navigates to `/(auth)/staff-login`
  - Create `artifacts/gym-manager/app/(auth)/staff-login.tsx`:
    - Two inputs: Gym ID (uppercase, 6-char) and PIN (numeric, 4–6 digits)
    - On submit: call `loginStaff(gymId, pin)` from `AuthContext`
    - On success: navigate to `/(tabs)`
    - On failure: show the generic error message from the API (do not reveal which field was wrong)
    - Include a back button to return to the owner login screen
  - Update `artifacts/gym-manager/app/(auth)/register.tsx`:
    - Change the `register` call to use the new `AuthContext.register` signature (returns `{ ok, error? }` instead of `boolean`)
    - Display the `error` string inline when registration fails (e.g., "An account with this email already exists.")
  - Update `artifacts/gym-manager/app/(auth)/forgot.tsx`:
    - Update `verifyIdentity` and `resetPassword` calls to match the new `AuthContext` API signatures
  - _Requirements: 2.1, 2.2, 2.5, 5.1, 5.2, 5.4_

- [x] 11. Update `app/index.tsx` and `SubscriptionContext` to use the new session shape
  - Update `artifacts/gym-manager/app/index.tsx`:
    - Replace `owner` with `session` from `useAuth()` (or use the `owner` shim)
    - The redirect logic remains identical: no session → login, no active subscription → activate, otherwise → tabs
  - Update `artifacts/gym-manager/context/SubscriptionContext.tsx`:
    - Replace `owner?.gymId` reads with `session?.gymId` (or keep using the `owner` shim if it exposes `gymId`)
    - No other logic changes — subscription activation remains fully client-side
  - _Requirements: 7.1, 7.2_

- [x] 12. Rewrite `GymContext` to use the API
  - Rewrite `artifacts/gym-manager/context/GymContext.tsx` to replace all AsyncStorage reads/writes with `apiRequest` calls
  - Add an `error: string | null` field to `GymState` and expose `clearError: () => void`
  - Implement `refresh` / initial load — calls `GET /api/members`; on success sets `customers`; on `ApiError` sets `error`; the auto-delete logic now runs server-side so the client no longer needs to filter expired members
  - Implement `addCustomer(data)` — calls `POST /api/members`; on success appends the returned member to state; on error sets `error` and does NOT update local state
  - Implement `updateCustomer(id, data)` — calls `PATCH /api/members/:id`; on success replaces the member in state; on error sets `error`
  - Implement `deleteCustomer(id)` — calls `DELETE /api/members/:id`; on success removes from state; on error sets `error`
  - Implement `recordPayment(id, amount)` — calls `POST /api/members/:id/payment`; on success replaces the member in state with the returned record; on error sets `error`
  - Photo URIs remain local: after any successful create/update, read `gym_photo_{member.id}` from AsyncStorage and merge `photoUri` into the in-memory customer object; when `addCustomer` receives a `photoUri`, store it in AsyncStorage under `gym_photo_{returnedId}` after the API call succeeds
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8, 4.9_

- [x] 13. Add the error banner to the Members screen
  - Update `artifacts/gym-manager/app/(tabs)/index.tsx`:
    - Read `error` and `clearError` from `useGym()`
    - Render a dismissible error banner at the top of the screen when `error` is non-null: "Could not connect to server. Check your internet connection and try again."
    - Replace `owner?.name` and `owner?.gymName` reads with `session?.name` and `session?.gymName` (or use the `owner` shim)
    - Add a "Sign Out" button accessible from the header for staff users (since Settings tab is hidden for staff); show it only when `session?.role === 'staff'`
  - _Requirements: 2.6, 3.2, 4.9, 7.4_

- [ ] 14. Update the tab layout for role-based access
  - Update `artifacts/gym-manager/app/(tabs)/_layout.tsx`:
    - Read `session` from `useAuth()`
    - When `session?.role === 'staff'`, omit the Settings tab from both `NativeTabLayout` and `ClassicTabLayout`
    - The Members tab remains visible for all roles
  - Update `artifacts/gym-manager/app/(tabs)/settings.tsx`:
    - Add a top-level guard at the start of the component: if `session?.role === 'staff'`, immediately return a `<Redirect href="/(tabs)" />` to prevent direct navigation
    - Replace all `owner?.X` reads with `session?.X` (or use the `owner` shim)
    - Update `updateOwner` calls to `updateProfile` from the new `AuthContext`
    - Update `changePassword` calls to match the new `AuthContext` signature (returns `{ ok, error? }` instead of `boolean`)
    - Add the Staff Management section (see Task 15)
  - _Requirements: 3.1, 3.4, 3.5_

- [x] 15. Add the Staff Management section to the Settings screen
  - Within `artifacts/gym-manager/app/(tabs)/settings.tsx`, add a "Staff" section visible only when `session?.role === 'owner'`:
    - On mount (and on focus), fetch staff list via `GET /api/staff` using `apiRequest`
    - Display each staff member's name in a list
    - Include an "Add Staff" button that opens an inline form (or modal) with two inputs: Name and PIN (4–6 numeric digits)
    - On submit: call `POST /api/staff` via `apiRequest`; on success append to the local staff list; on error display the API error message inline
    - Tapping a staff member shows a delete confirmation; on confirm: call `DELETE /api/staff/:id` via `apiRequest`; on success remove from the local list
    - Display a user-friendly error message if any staff API call fails
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 16. Update the customer add and detail screens
  - Update `artifacts/gym-manager/app/customer/add.tsx`:
    - The `addCustomer` call signature is unchanged — no modifications needed to the form logic
    - Add error handling: if `addCustomer` throws or the `GymContext` sets an error, display the error inline and keep the form open (do not navigate back on failure)
  - Update `artifacts/gym-manager/app/customer/[id].tsx`:
    - The `updateCustomer`, `deleteCustomer`, and `recordPayment` call signatures are unchanged
    - Replace `owner?.gymName` and `owner?.phone` reads (used in the SMS reminder) with `session?.gymName` and `session?.phone` (or use the `owner` shim)
    - Add error handling: if any mutation fails, show an `Alert` with the error message
  - _Requirements: 4.3, 4.4, 4.5, 4.9_

- [x] 17. Implement the data migration screen
  - Create `artifacts/gym-manager/app/migrate.tsx`:
    - On mount, check if the old `gym_customers` key exists in AsyncStorage
    - If it does, read the array, filter by `ownerId === session?.userId`, and display: "We found X members stored on this device. Would you like to import them to your account?"
    - Include an "Import" button and a "Skip" button
    - On "Import": iterate through the members and call `POST /api/members` for each; track progress (e.g., "Importing 3 of 10..."); if a call returns 200 with `{ skipped: true }` (duplicate phone), count it as skipped; if a network error occurs mid-import, show how many were imported and offer a "Retry" button
    - Display the warning: "Note: member photos are stored on this device and cannot be transferred."
    - On completion (or "Skip"): remove `gym_session`, `gym_owner`, and `gym_customers` from AsyncStorage; navigate to `/(tabs)`
  - Register the `migrate` screen in `artifacts/gym-manager/app/_layout.tsx` as a full-screen stack route
  - Update `artifacts/gym-manager/app/index.tsx`: after a successful login, check if `gym_customers` exists in AsyncStorage; if so, redirect to `/migrate` instead of `/(tabs)`
  - _Requirements: 4.8_

- [x] 18. Checkpoint — verify all features work identically to the offline version
  - Ensure all tests pass (server unit tests, property tests, mobile unit tests)
  - Verify the following flows work end-to-end:
    - Owner registration → subscription activation → add member → edit member → record payment → delete member
    - Search and filter (all, active, expired, unpaid) return correct results
    - Auto-delete: members expired 7+ days are removed on the next `GET /api/members` call
    - CSV export still works (reads from `GymContext.customers` which is now API-backed)
    - SMS reminder still works (reads `session.gymName` and `session.phone`)
    - Staff creation → staff login → view members → record payment → sign out
    - Settings tab is hidden for staff; Settings screen redirects staff away
    - Session persists across app restarts for both owner and staff
    - Expired/invalid token on startup clears session and redirects to login
    - Error banner appears when the server is unreachable; no data is silently lost
  - Ask the user if any questions arise before considering the feature complete

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- The `owner` backward-compatibility shim in `AuthContext` minimizes the diff across existing screens — screens that already work with `owner?.X` do not need to be touched until Task 14–16
- Photo URIs remain local-only (AsyncStorage keyed by server-assigned member ID) — no file upload infrastructure is needed
- Subscription activation remains fully client-side — `SubscriptionContext` is unchanged except for the `gymId` source
- Property tests use **fast-check** at 100 iterations for pure/mocked tests and 25 iterations for integration tests against a test PostgreSQL instance
- The server-side auto-delete on `GET /api/members` replaces the client-side auto-delete loop in the old `GymContext`
