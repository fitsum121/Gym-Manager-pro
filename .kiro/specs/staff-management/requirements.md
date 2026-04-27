# Requirements Document

## Introduction

The Staff Management feature extends the Gym Manager app to support multi-user, multi-device operation. Currently the app is fully offline and single-user (one gym owner per device). This feature introduces:

1. **Staff accounts** — gym owners can create staff members who log in with a PIN on their own phones.
2. **API-backed data layer** — member (customer) data migrates from AsyncStorage to the API server so all devices share the same data in real time.
3. **Role-based access control** — staff have a restricted view of the app (view/add members, record payments) while owners retain full access including Settings, data export, and subscription management.
4. **Staff login flow** — a separate login path where a staff member enters the gym's Gym ID and their PIN to authenticate.

The API server (Express 5 + PostgreSQL + Drizzle ORM) already exists and will be extended with new endpoints. The mobile app will be updated to call these endpoints instead of reading/writing AsyncStorage for member data.

---

## Glossary

- **Owner**: The gym owner who registered the gym. Has full access to all app features.
- **Staff_Member**: An employee account created by the Owner. Has limited access to the app.
- **PIN**: A 4–6 digit numeric code used by Staff_Members to authenticate on their device.
- **Gym_ID**: The 6-character alphanumeric identifier that uniquely identifies a gym (already exists in the app).
- **API_Server**: The Express 5 backend server that persists data in PostgreSQL via Drizzle ORM.
- **Auth_Token**: A short-lived JWT or opaque token issued by the API_Server upon successful login, used to authenticate subsequent API requests.
- **Session**: The authenticated state on a device, persisted in AsyncStorage, representing either an Owner or a Staff_Member.
- **Member**: A gym customer record (name, phone, membership type, payment status, etc.).
- **Role**: Either `owner` or `staff`, determining which app features are accessible.
- **Staff_Login_Screen**: The dedicated screen where a Staff_Member enters Gym_ID and PIN to log in.
- **Settings_Screen**: The existing settings tab, accessible only to Owners.

---

## Requirements

### Requirement 1: Staff Account Creation

**User Story:** As an Owner, I want to create staff accounts with a name and PIN, so that my employees can log in on their own phones and help manage the gym.

#### Acceptance Criteria

1. WHEN the Owner navigates to the Staff section in Settings, THE App SHALL display a list of existing Staff_Members for the Owner's gym.
2. WHEN the Owner taps "Add Staff", THE App SHALL present a form requesting a staff name and a 4–6 digit numeric PIN.
3. WHEN the Owner submits the form with a valid name and PIN, THE API_Server SHALL create a Staff_Member record associated with the Owner's Gym_ID and return the created record.
4. IF the submitted PIN contains non-numeric characters or is fewer than 4 or more than 6 digits, THEN THE API_Server SHALL return a 400 error with a descriptive message.
5. IF the submitted staff name is empty or exceeds 100 characters, THEN THE API_Server SHALL return a 400 error with a descriptive message.
6. THE API_Server SHALL store PINs as a cryptographic hash (bcrypt) and SHALL NOT store or return the raw PIN value.
7. WHEN the Owner deletes a Staff_Member, THE API_Server SHALL remove the Staff_Member record and invalidate any active sessions for that Staff_Member.

---

### Requirement 2: Staff Login

**User Story:** As a Staff_Member, I want to log in using my gym's Gym ID and my PIN, so that I can access member data on my own phone.

#### Acceptance Criteria

1. THE App SHALL provide a "Staff Login" option on the login screen that navigates to the Staff_Login_Screen.
2. THE Staff_Login_Screen SHALL accept a Gym_ID and a numeric PIN as inputs.
3. WHEN a Staff_Member submits valid Gym_ID and PIN credentials, THE API_Server SHALL return an Auth_Token and the Staff_Member's name and role.
4. IF the Gym_ID does not exist or the PIN does not match any Staff_Member for that gym, THEN THE API_Server SHALL return a 401 error without revealing which field was incorrect.
5. WHEN authentication succeeds, THE App SHALL persist the Session (Auth_Token, staff name, Gym_ID, role) in AsyncStorage and navigate to the Members screen.
6. WHEN a Staff_Member is logged in, THE App SHALL display the staff member's name in the Members screen header instead of the Owner's name.
7. WHEN a Staff_Member's session Auth_Token expires, THE App SHALL clear the Session and redirect to the login screen.

---

### Requirement 3: Role-Based Access Control

**User Story:** As an Owner, I want staff to have limited access to the app, so that they cannot change settings, export data, or manage subscriptions.

#### Acceptance Criteria

1. WHILE a Staff_Member Session is active, THE App SHALL hide the Settings tab from the tab navigation.
2. WHILE a Staff_Member Session is active, THE App SHALL allow navigation to the Members list screen and the Add Member screen.
3. WHILE a Staff_Member Session is active, THE App SHALL allow recording payments on individual member profiles.
4. WHILE a Staff_Member Session is active, THE App SHALL NOT render the Settings screen even if navigated to directly.
5. WHILE an Owner Session is active, THE App SHALL display all tabs and features without restriction.
6. THE API_Server SHALL enforce role checks on all write endpoints: WHEN a request with a staff role attempts to access owner-only endpoints (staff management, subscription management), THE API_Server SHALL return a 403 error.

---

### Requirement 4: API-Backed Member Data

**User Story:** As an Owner or Staff_Member, I want member data to be stored on the server, so that all devices see the same up-to-date information.

#### Acceptance Criteria

1. THE API_Server SHALL expose endpoints to list, create, update, and delete Member records scoped to a Gym_ID.
2. WHEN an authenticated user (Owner or Staff_Member) requests the member list, THE API_Server SHALL return only the Members belonging to the user's Gym_ID.
3. WHEN an authenticated user creates a Member, THE API_Server SHALL persist the Member in PostgreSQL and return the created record with a server-assigned ID.
4. WHEN an authenticated user updates a Member, THE API_Server SHALL persist the changes and return the updated record.
5. WHEN an authenticated user records a payment for a Member, THE API_Server SHALL update the Member's payment status, payment amount, last payment date, and expiry date atomically.
6. IF a request is made to a member endpoint without a valid Auth_Token, THEN THE API_Server SHALL return a 401 error.
7. IF a request attempts to access or modify a Member belonging to a different Gym_ID, THEN THE API_Server SHALL return a 403 error.
8. THE App SHALL replace all AsyncStorage reads and writes for Member data with API_Server calls.
9. WHEN the API_Server is unreachable, THE App SHALL display an error message and SHALL NOT silently lose data.

---

### Requirement 5: Owner Authentication via API

**User Story:** As an Owner, I want my login to be validated by the API server, so that my account works across devices.

#### Acceptance Criteria

1. WHEN an Owner submits login credentials (email and password), THE API_Server SHALL validate the credentials and return an Auth_Token and Owner profile on success.
2. IF the email or password is incorrect, THEN THE API_Server SHALL return a 401 error.
3. WHEN an Owner registers, THE API_Server SHALL create an Owner account, assign a Gym_ID, and return an Auth_Token.
4. IF an Owner attempts to register with an email that already exists, THEN THE API_Server SHALL return a 409 error.
5. THE API_Server SHALL store Owner passwords as a cryptographic hash (bcrypt) and SHALL NOT store or return the raw password.
6. WHEN an Owner updates their profile (name, gym name, phone), THE API_Server SHALL persist the changes and return the updated profile.
7. WHEN an Owner changes their password, THE API_Server SHALL verify the current password before applying the change.

---

### Requirement 6: Staff Management UI in Settings

**User Story:** As an Owner, I want a dedicated section in Settings to manage my staff, so that I can add, view, and remove staff members easily.

#### Acceptance Criteria

1. THE Settings_Screen SHALL include a "Staff" section visible only to Owners.
2. WHEN the Owner views the Staff section, THE App SHALL fetch and display the current list of Staff_Members from the API_Server, showing each member's name.
3. THE App SHALL display an "Add Staff" button in the Staff section.
4. WHEN the Owner taps a Staff_Member in the list, THE App SHALL offer an option to delete that Staff_Member.
5. WHEN the Owner confirms deletion, THE App SHALL call the API_Server to delete the Staff_Member and remove the entry from the displayed list.
6. IF the API_Server returns an error during staff operations, THE App SHALL display a user-friendly error message.

---

### Requirement 7: Session Persistence and Logout

**User Story:** As any user (Owner or Staff_Member), I want my session to persist across app restarts, so that I do not have to log in every time I open the app.

#### Acceptance Criteria

1. WHEN a user (Owner or Staff_Member) successfully logs in, THE App SHALL persist the Auth_Token and role in AsyncStorage.
2. WHEN the App starts, THE App SHALL read the persisted Session from AsyncStorage and restore the authenticated state without requiring re-login, provided the Auth_Token is still valid.
3. WHEN a user taps "Sign Out", THE App SHALL clear the Session from AsyncStorage and navigate to the login screen.
4. WHILE a Staff_Member is logged in, THE App SHALL display a "Sign Out" option accessible from the Members screen (since Settings is hidden).
5. IF the persisted Auth_Token is expired or invalid when the App starts, THEN THE App SHALL clear the Session and redirect to the login screen.
