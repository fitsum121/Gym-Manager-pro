# Requirements Document

## Introduction

The Admin Panel is a standalone React + Vite web application that gives the gym platform administrator a secure, browser-based interface for managing gym owner subscriptions. The administrator can log in, browse all registered gym owners, generate time-limited activation codes for any owner, copy those codes for delivery, and review the full history of issued licenses — including which gyms are currently active versus expired.

The panel communicates exclusively with the existing Express API server (`artifacts/api-server`) via HTTP. All authentication uses the existing HTTP Basic Auth mechanism already implemented in the admin routes. New API endpoints will be added to the admin router to expose owner listings, code generation with persistence, and license history.

## Glossary

- **Admin**: The single privileged operator who manages the gym platform. Credentials are stored in `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables on the API server.
- **Admin_Panel**: The React + Vite web application described in this document.
- **API_Server**: The existing Express 5 server at `artifacts/api-server`.
- **Owner**: A registered gym owner record stored in the `owners` table. Fields include `id`, `gymId`, `name`, `gymName`, `phone`, `email`, `createdAt`.
- **License**: A generated activation code record stored in the `licenses` table. Fields include `id`, `gymId`, `code`, `expiryDate`, `createdAt`.
- **Activation_Code**: A string in the format `GYM-{GYMID}-{YYMMDD}-{SIG}` produced by `makeActivationCode(gymId, expiryDate)`.
- **Duration**: The number of days added to today's date to compute an expiry date. Valid values: 30, 90, 180, 365.
- **Active_License**: A License whose `expiryDate` is on or after the current date.
- **Expired_License**: A License whose `expiryDate` is before the current date.
- **Session**: A browser-side authenticated state maintained via stored Basic Auth credentials for the duration of the browser session.

---

## Requirements

### Requirement 1: Admin Authentication

**User Story:** As an admin, I want to log in with my email and password, so that only I can access the admin panel.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a login screen as the initial view when no valid Session exists.
2. WHEN the admin submits valid credentials, THE Admin_Panel SHALL store the credentials in the browser Session and navigate to the Dashboard.
3. WHEN the admin submits invalid credentials, THE Admin_Panel SHALL display an error message indicating authentication failed.
4. IF the API_Server returns a 401 response on any authenticated request, THEN THE Admin_Panel SHALL clear the Session and redirect the admin to the login screen.
5. THE Admin_Panel SHALL provide a logout action that clears the Session and returns the admin to the login screen.
6. WHILE no Session exists, THE Admin_Panel SHALL prevent navigation to any screen other than the login screen.

---

### Requirement 2: Gym Owner Dashboard

**User Story:** As an admin, I want to see a list of all registered gym owners, so that I can identify which owner needs an activation code.

#### Acceptance Criteria

1. WHEN the admin reaches the Dashboard, THE Admin_Panel SHALL fetch and display all Owner records from the API_Server.
2. THE Admin_Panel SHALL display for each Owner: the owner's name, gym name, gym ID, email, and registration date.
3. WHEN the owner list is loading, THE Admin_Panel SHALL display a loading indicator.
4. IF the API_Server returns an error when fetching owners, THEN THE Admin_Panel SHALL display a descriptive error message and a retry action.
5. THE Admin_Panel SHALL display the total count of registered owners on the Dashboard.
6. THE Admin_Panel SHALL allow the admin to search the owner list by owner name, gym name, or gym ID using a text input that filters results in real time.

---

### Requirement 3: Activation Code Generation

**User Story:** As an admin, I want to generate an activation code for a specific gym owner with a chosen duration, so that I can grant them a subscription.

#### Acceptance Criteria

1. WHEN the admin selects an Owner from the Dashboard, THE Admin_Panel SHALL open a code generation form pre-filled with that owner's gym ID.
2. THE Admin_Panel SHALL present exactly four Duration options: 30 days, 90 days, 180 days, and 365 days.
3. WHEN the admin submits the code generation form, THE Admin_Panel SHALL send a request to the API_Server to generate and persist an Activation_Code for the selected gym ID and chosen Duration.
4. WHEN the API_Server returns a generated Activation_Code, THE Admin_Panel SHALL display the code prominently in a dedicated result area.
5. THE Admin_Panel SHALL provide a one-click copy action that copies the Activation_Code to the clipboard.
6. WHEN the copy action succeeds, THE Admin_Panel SHALL display a confirmation indicator for at least 2 seconds.
7. IF the API_Server returns an error during code generation, THEN THE Admin_Panel SHALL display a descriptive error message without navigating away from the form.
8. THE Admin_Panel SHALL display the expiry date corresponding to the generated Activation_Code alongside the code.

---

### Requirement 4: License History

**User Story:** As an admin, I want to view all previously generated activation codes, so that I can audit what has been issued and to whom.

#### Acceptance Criteria

1. THE Admin_Panel SHALL provide a License History view accessible from the main navigation.
2. WHEN the admin navigates to the License History view, THE Admin_Panel SHALL fetch and display all License records from the API_Server, ordered by creation date descending.
3. THE Admin_Panel SHALL display for each License: the gym ID, the Activation_Code, the expiry date, and the creation date.
4. THE Admin_Panel SHALL visually distinguish Active_Licenses from Expired_Licenses in the License History view.
5. WHEN the license list is loading, THE Admin_Panel SHALL display a loading indicator.
6. IF the API_Server returns an error when fetching licenses, THEN THE Admin_Panel SHALL display a descriptive error message and a retry action.
7. THE Admin_Panel SHALL display the total count of Active_Licenses and the total count of Expired_Licenses as summary statistics in the License History view.

---

### Requirement 5: Active vs Expired Status on Dashboard

**User Story:** As an admin, I want to see at a glance whether each gym owner has an active subscription, so that I can quickly identify who needs a renewal.

#### Acceptance Criteria

1. WHEN displaying the Owner list, THE Admin_Panel SHALL show a status badge for each Owner indicating whether the owner has an Active_License, an Expired_License, or no license at all.
2. THE Admin_Panel SHALL derive the status badge by comparing the most recent License for that gym ID against the current date.
3. WHEN an Owner has no License records, THE Admin_Panel SHALL display a "No License" status badge.
4. WHEN an Owner's most recent License has an `expiryDate` on or after the current date, THE Admin_Panel SHALL display an "Active" status badge.
5. WHEN an Owner's most recent License has an `expiryDate` before the current date, THE Admin_Panel SHALL display an "Expired" status badge.

---

### Requirement 6: API Server Extensions

**User Story:** As a developer, I want the API server to expose the necessary admin endpoints, so that the Admin Panel can retrieve and persist the data it needs.

#### Acceptance Criteria

1. THE API_Server SHALL expose a `GET /api/admin/owners` endpoint that returns all Owner records, excluding the `passwordHash` field, protected by the existing `requireAdmin` middleware.
2. THE API_Server SHALL expose a `GET /api/admin/licenses` endpoint that returns all License records ordered by `createdAt` descending, protected by the existing `requireAdmin` middleware.
3. WHEN the `POST /api/admin/generate-code` endpoint is called with a valid `gymId` and `days` parameter, THE API_Server SHALL generate an Activation_Code, persist a License record to the `licenses` table, and return the code and expiry date.
4. IF the `gymId` parameter does not match `^[A-Z0-9]{6}$`, THEN THE API_Server SHALL return a 400 response with a descriptive error message.
5. IF the `days` parameter is not one of 30, 90, 180, or 365, THEN THE API_Server SHALL return a 400 response with a descriptive error message.
6. THE API_Server SHALL accept `days` as the duration parameter on `POST /api/admin/generate-code` (replacing the existing `months` parameter) to allow exact day-based expiry calculation.
