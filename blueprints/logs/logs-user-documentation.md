# 👤 User Activity Logs Feature Documentation

## 🎯 1. Overview

The User Activity Logs feature provides a dedicated audit trail for specific actions performed by users within the Lokatech Greenhouse Monitoring application. These logs are crucial for security monitoring, understanding user behavior, and troubleshooting user-specific issues. Logs are stored in a Firestore collection (`user_logs`) and are accessible via a "User Logs" tab in the web interface.

### 🏆 Primary Goals
- 🔒 **Security Auditing**: Track key user actions: device control, profile display name changes, new user account registration, and user-initiated account deletion.
- 📝 **Accountability**: Maintain a record of who performed which action and when, including their IP address.
- 🧹 **System Log Clarity**: Ensure `system_logs` are free of user-specific control actions, improving their focus on system-level events.
- 🔍 **Troubleshooting**: Assist in diagnosing issues related to these specific user activities.

---

## 🗺️ Phased Implementation Plan

This feature is being implemented in multiple phases:

<details open>
<summary><strong>✅ Phase 1: Backend - User Log Foundation & Device Control Migration (Completed)</strong></summary>

> **💡 Objective**: Establish the core backend infrastructure for user activity logging. This includes defining the `UserActionType` Enum, creating the `log_user_activity` function (which writes to the new `user_logs` Firestore collection), and the `get_user_logs` function. Critically, this phase refactored the existing `log_user_action` function to redirect device control logs from `system_logs` to the new `user_logs` collection. This phase also included cleaning up the system logs CSV export.

**Steps & Outcomes:**
1.  **Enhanced `blueprints/logs/firestore_logger.py`:**
    -   **Defined `UserActionType` Enum**: Created a new Enum specifically for user logs:
        ```python
        class UserActionType(Enum):
            DEVICE_CONTROL = "DEVICE_CONTROL"
            PROFILE_UPDATE = "PROFILE_UPDATE"
            ACCOUNT_DELETED = "ACCOUNT_DELETED"
            REGISTRATION_SUCCESS = "REGISTRATION_SUCCESS"
            RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
            PASSWORD_RESET_REQUESTED = "PASSWORD_RESET_REQUESTED"
        ```
    -   **Created `log_user_activity()` function**:
        -   Signature: `log_user_activity(username: str, action_type: UserActionType, event_details: dict, source: str, ip_address: Optional[str])`
        -   This function writes structured log data to a **new Firestore collection named `user_logs`**.
        -   It includes `timestamp`, `timestamp_wib`, `username`, `action_type` (from `UserActionType`), `event_details`, `source`, and `ip_address`.
        -   Log documents in `user_logs` use a custom ID format: `YYYY-MM-DD HH:MM:SS.ffffff-randomhex` (based on WIB time).
    -   **Refactored `log_user_action()` function (IMPORTANT MIGRATION STEP)**:
        -   The existing `log_user_action(username, action_description, device, node_affected, source)` function **was refactored**.
        -   Its signature was updated to: `log_user_action(username: str, action_description: str, device: Optional[str], node_affected: Optional[str], source: str, ip_address: Optional[str])`.
        -   Instead of calling `log_event` (which logs to `system_logs`), it now **exclusively calls `log_user_activity()`**.
        -   It maps its parameters to `event_details` for `log_user_activity`. For example, `action_description`, `device`, `node_affected` become part of `event_details`.
        -   The `action_type` passed to `log_user_activity` is `UserActionType.DEVICE_CONTROL`.
        -   The `ip_address` parameter is passed through to `log_user_activity`.
        -   **This change ensures that all user-initiated device control actions are logged to `user_logs` and *no longer to `system_logs`*.**
    -   **Created `get_user_logs()` function**:
        -   Signature: `get_user_logs(days: int = 7, log_type_filter: Optional[str] = None, username_filter: Optional[str] = None, limit: int = 100)`
        -   Queries the `user_logs` collection.
        -   Supports filtering by `username_filter` (for `username` field), `log_type_filter` (for `action_type` field), date range (`days`), and `limit`.
        -   Implemented with a ThreadPoolExecutor and a 10-second timeout for Firestore queries to prevent indefinite hangs.

2.  **Updated `blueprints/logs/routes.py` (System Log CSV Cleanup):**
    -   **Modified `GET /logs/export-system-logs-csv`**:
        -   **Removed the "Username" column** from the CSV export headers and data rows, as user-specific device control actions will no longer be in `system_logs`.

**Files Involved in Phase 1:**
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\logs\firestore_logger.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\logs\routes.py`

**Outcome of Phase 1:**
*   `user_logs` collection schema defined and `log_user_activity` function ready to populate it.
*   `get_user_logs` function available for querying user logs.
*   User device control actions are logged *exclusively* to `user_logs` via the refactored `log_user_action`. `system_logs` no longer receive these.
*   The "Username" column is removed from the System Logs CSV export.

</details>

<details open>
<summary><strong>✅ Phase 2: Backend - Implementing Specific User Action Logging & API Endpoints (Completed)</strong></summary>

> **💡 Objective**: Integrate the `log_user_activity` function into various application routes to log specific user actions (profile updates, account deletion, new user registration). This phase also involves creating API endpoints for fetching and exporting user logs.

**Steps & Outcomes:**
1.  **Update `blueprints/dashboard/routes.py` (Device Control Logging - IP Address):**
    -   Modified calls to the (now refactored) `firestore_logger.log_user_action` in `set_control_state()` to pass `request.remote_addr` as the `ip_address`.

2.  **Update `blueprints/profile/routes.py` (Profile & Account Actions Logging):**
    -   **Profile Update (Display Name Change):** In `update_profile()`, on success, `firestore_logger.log_user_activity` is called with:
        -   `username=session['user']['email']`
        -   `action_type=UserActionType.PROFILE_UPDATE`
        -   `event_details={"field_updated": "displayName", "old_value": old_display_name, "new_value": new_display_name}`.
        -   `source="profile_module"`
        -   `ip_address=request.remote_addr`.
    -   **Account Deletion:** In `delete_account()`:
        -   On successful deletion: `firestore_logger.log_user_activity` called with `action_type=UserActionType.ACCOUNT_DELETED`, `event_details={"status": "success", "deleted_account_email": email}`, `source="profile_module"`, `ip_address=request.remote_addr`.
        -   On failed deletion (e.g., invalid password or Firebase error): `firestore_logger.log_user_activity` called with `action_type=UserActionType.ACCOUNT_DELETED`, `event_details` indicating failure reason (e.g., `{"status": "failure", "reason": "invalid_password", ...}` or `{"status": "failure", "reason": "firebase_error: ...", ...}`), `source="profile_module"`, `ip_address=request.remote_addr`.

3.  **Update `blueprints/auth/routes.py` (Registration Logging):**
    -   **New User Registered:** In `register()`, after successful `auth.create_user()`, `firestore_logger.log_user_activity` is called with:
        -   `username=email` (the newly registered email)
        -   `action_type=UserActionType.REGISTRATION_SUCCESS`
        -   `event_details={"registered_email": email}`
        -   `source="auth_module"`
        -   `ip_address=request.remote_addr`.

4.  **Update API Endpoints in `blueprints/logs/routes.py` (User Log Endpoints):**
    -   **Created `GET /logs/user-activities`**:
        -   Calls `firestore_logger.get_user_logs()`.
        -   Protected by `@isloggedin`.
        -   Accepts query parameters for filtering (days, type, username, limit).
    -   **Created `GET /logs/export-user-activities-csv`**:
        -   Exports user logs from `firestore_logger.get_user_logs()`.
        -   Protected by `@isloggedin`.
        -   CSV columns: Timestamp (WIB), Username, Action Type, IP Address, Source, Details (flattened `event_details` as JSON string).

5.  **Documentation Updates:**
    -   This file (`logs-user-documentation.md`) updated with details of Phase 1 & 2.
    -   `logs-system-documentation.md` updated to reflect that user device control actions and the "User" column are removed.

**Files Involved in Phase 2:**
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\dashboard\routes.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\profile\routes.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\auth\routes.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\logs\routes.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\logs\firestore_logger.py` (functions called)
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\logs\logs-user-documentation.md`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\logs\logs-system-documentation.md`

**Outcome of Phase 2:**
*   Logging implemented for profile updates, account deletions, and new user registrations into `user_logs`.
*   IP addresses correctly logged for all user actions, including device control.
*   API endpoints for fetching and exporting these specific user logs are functional.
*   Relevant documentation files updated.

</details>

<details open>
<summary><strong>🎨 Phase 3: Frontend - Building the User Logs Tab & System Logs Cleanup (Completed - UI/Filtering Refinements Ongoing)</strong></summary>

> **💡 Objective**: Develop the frontend interface for viewing user activity logs. Clean up the System Logs tab to remove user-specific information. Improve UI consistency.

**Steps & Outcomes:**
1.  **Created `static/css/logs-user.css`:**
    -   Defined styles for the User Logs tab, table, filters, and log details.
    -   Styles aim to align with `logs-system.css` for consistency, including control heights, padding, and hover effects on table rows.
    -   Improved styling for `<pre>` block in `event_details` for better readability (monospaced font, background, padding).

2.  **Developed `static/js/logs-user.js`:**
    -   Fetches data from the `/logs/user-activities` API endpoint.
    -   Displays logs in a table format (Timestamp, Username, Action Type, IP Address, Source, Details).
    -   `event_details` are JSON.stringified with indentation and HTML escaped for safe rendering within `<pre>` tags.
    -   Implemented client-side controls for filtering (date range, username, action type).
        -   Username filter sends `null` if empty to backend.
        -   Debounce added for username text input to reduce API calls.
    -   Implemented "Export User Logs to CSV" button (calls `/logs/export-user-activities-csv`).
    -   Implemented auto-refresh (every 30 seconds when tab is active).
    -   Handles loading states and error messages, preserving export button on error.

3.  **Modified `templates/logs.html`:**
    -   Included link to `static/css/logs-user.css`.
    -   Ensured `<div id="tab-user" class="tab-content"></div>` is present and includes a container for the "Export User Logs to CSV" button, which is then managed by `logs-user.js`.

4.  **Modified `static/js/logs-system.js` (System Logs Cleanup):**
    -   **Removed the "User" column** from the System Logs table display (HTML structure in `createLogRow` and `displaySystemLogsUI`).
    -   **Removed user-specific log types** (e.g., `USER_FAN_ON`, `USER_CONTROL_ACTION`) from the "Type" filter dropdown in `displaySystemLogsUI`.
    -   Adjusted table `colspan` attributes in `populateTableBody` (for "No logs found" message and time group headers) to `6` to match the new column count.
    -   Corrected a `ReferenceError: username is not defined` by completely removing the commented-out `<td>${username}</td>` line from the template literal in `createLogRow`.

**Files Involved in Phase 3:**
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\static\css\logs-user.css` (new)
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\static\js\logs-user.js`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\templates\logs.html`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\static\js\logs-system.js`

**Outcome of Phase 3:**
*   A functional "User Logs" tab displaying the four specified types of user logs, with filtering controls and export functionality.
*   UI for User Logs tab refined for better consistency with System Logs.
*   The "System Logs" tab and its CSV export are cleaned up, no longer displaying user-specific action details or the "User" column.
*   System Logs tab is free of the `username` reference error.

</details>

<details>
<summary><strong>🛡️ Phase 4: Advanced Features & Security Enhancements (Future)</strong></summary>

> **💡 Objective**: Introduce more advanced logging capabilities for other user actions if deemed necessary later, enhance security aspects related to logging, and potentially add analytical features.

**Potential Steps:**
*   Log failed login attempts (if security requirements change).
*   Log changes to user roles or permissions (if applicable in the future).
*   Implement rate limiting for log-generating actions if abuse is a concern.

**Files Potentially Involved in Phase 4:**
*   Dependent on the features chosen. Likely to involve `blueprints/logs/firestore_logger.py` and relevant route files.

</details>

---
## ❗ Known Issues / To-Do

*   **Filtering Reliability**:
    *   Username filtering relies on a `username_lowercase` field in Firestore for case-insensitive searches.
    *   **Data Migration for `username_lowercase` (IMPORTANT FOR OLD LOGS)**: Logs created *before* the `username_lowercase` field was implemented **will not have this field**. Therefore, the username filter **will not find these older logs**. If filtering older logs by username is critical, a one-time data migration script must be run to add the `username_lowercase` field to all existing documents in the `user_logs` collection.
    *   **Crucial for `action_type` and `username` filters (NEW AND OLD LOGS)**: For these filters to work correctly in conjunction with the date range (`timestamp`), **Composite Indexes in Firestore are ABSOLUTELY REQUIRED**.
        1.  **After deploying backend changes:** Test the filters in your application by trying to filter by "Days" and "Action Type", then "Days" and "Username", and finally "Days", "Action Type", and "Username" together.
        2.  **Check for Firestore Index Suggestions:** Go to your Firebase Console -> Firestore Database -> Indexes tab. Firestore *may* display an error message or a direct link to create the necessary missing index. If so, click this link and create the suggested index(es).
        3.  **Manual Index Creation (If No Suggestions Appear):** If Firestore does not provide a suggestion link, you must create the indexes manually. Click "Add index" and configure them as follows for the `user_logs` collection:

            *   **Index 1: For `timestamp` AND `action_type` filtering**
                *   Collection ID: `user_logs`
                *   Fields:
                    1.  `timestamp` (Descending)
                    2.  `action_type` (Ascending)
                *   Query Scope: Collection

            *   **Index 2: For `timestamp` AND `username_lowercase` filtering**
                *   Collection ID: `user_logs`
                *   Fields:
                    1.  `timestamp` (Descending)
                    2.  `username_lowercase` (Ascending)
                *   Query Scope: Collection

            *   **Index 3: For `timestamp` AND `action_type` AND `username_lowercase` filtering**
                *   Collection ID: `user_logs`
                *   Fields:
                    1.  `timestamp` (Descending)
                    2.  `action_type` (Ascending)
                    3.  `username_lowercase` (Ascending)
                *   Query Scope: Collection

        4.  **Index Building Time:** Indexes can take a few minutes (or longer for large collections) to build. Wait until their status is "Enabled" in the Firebase console.
        5.  **Retest Filtering:** After indexes are enabled, test your application's filters again.

---
## 🔧 Backend Implementation Details (Phases 1 & 2)

### 🗄️ Firestore Collection: `user_logs`
**Structure per document:**
```json
{
  "timestamp": "FirebaseServerTimestamp (UTC)", 
  "timestamp_wib": "YYYY-MM-DDTHH:mm:ss.ffffff+07:00 (ISO Format String)", 
  "username": "User@Example.com", // Original username
  "username_lowercase": "user@example.com", // For case-insensitive filtering      
  "action_type": "DEVICE_CONTROL", // String value from UserActionType Enum
  "event_details": { /* Action-specific data, e.g., {"action_summary": "Set fan to ON", "device": "fan"} */ },
  "source": "dashboard_controls", // e.g., "profile_module", "auth_module"
  "ip_address": "192.168.1.100" // User's IP address
}
```

**Example `event_details` for `DEVICE_CONTROL`:**
```json
{
  "action_summary": "Set fan to ON, mode to manual.",
  "device": "fan_1", // or "light_1"
  "node_affected": "remaja"
}
```

**Example `event_details` for `PROFILE_UPDATE`:**
```json
{
  "field_updated": "displayName",
  "old_value": "Old Name",
  "new_value": "New Name"
}
```

**Example `event_details` for `ACCOUNT_DELETED` (Success):**
```json
{
  "status": "success",
  "deleted_account_email": "user@example.com"
}
```

**Example `event_details` for `ACCOUNT_DELETED` (Failure):**
```json
{
  "status": "failure",
  "reason": "invalid_password", // or "firebase_error: <description>"
  "attempted_account_email": "user@example.com"
}
```

**Example `event_details` for `REGISTRATION_SUCCESS`:**
```json
{
  "registered_email": "newuser@example.com"
}
```

**Example `event_details` for `PASSWORD_RESET_REQUESTED`:**
```json
{
  "action": "password_reset_request_allowed",
  "email_provided": "user@example.com"
}
```

**Example `event_details` for `RATE_LIMIT_EXCEEDED`:**
```json
{
  "action": "login", // Can be "register" or "reset-password"
  "limit": "10 requests per 60s" // Example, actual limit string varies
}
```

### 🏷️ `UserActionType` Enum (in `blueprints/logs/firestore_logger.py`)
```python
from enum import Enum

class UserActionType(Enum):
    DEVICE_CONTROL = "DEVICE_CONTROL"
    PROFILE_UPDATE = "PROFILE_UPDATE"
    ACCOUNT_DELETED = "ACCOUNT_DELETED"
    REGISTRATION_SUCCESS = "REGISTRATION_SUCCESS"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    PASSWORD_RESET_REQUESTED = "PASSWORD_RESET_REQUESTED"
```

---
## 🎨 Frontend Implementation Details (Phase 3)

### 📊 User Logs Tab (`static/js/logs-user.js`)
-   **Data Fetching**: Calls `/logs/user-activities` with filter parameters.
-   **Display**: Renders logs in a table with columns: Timestamp (WIB), Username, Action Type, Details, IP Address, Source.
-   **Details Column**: `event_details` are displayed using a custom formatter (`formatEventDetailsForDisplay`) which generates human-readable HTML.
    -   `DEVICE_CONTROL`: Shows summary, device, and node.
    -   `PROFILE_UPDATE`: Shows field updated, old value, and new value.
    -   `ACCOUNT_DELETED`: Shows status (success/failure), reason (if failure), and account email.
    -   `REGISTRATION_SUCCESS`: Shows registered email.
    -   `PASSWORD_RESET_REQUESTED`: Shows action (e.g., "password reset request allowed") and email provided.
    -   `RATE_LIMIT_EXCEEDED`: Shows the blocked action (e.g., "login") and the limit string (e.g., "10 requests per 60s").
    -   For unrecognized action types or complex data, it falls back to a pretty-printed JSON string within a `<pre>` tag. HTML within string values of the JSON is escaped.
-   **Filtering**:
    -   Days: Number input (1-90).
    -   Action Type: Dropdown with `DEVICE_CONTROL`, `PROFILE_UPDATE`, `ACCOUNT_DELETED`, `REGISTRATION_SUCCESS`, `PASSWORD_RESET_REQUESTED`, `RATE_LIMIT_EXCEEDED`.
    -   Username: Text input (debounced).
-   **Export**: Button triggers download from `/logs/export-user-activities-csv` with current filters.
-   **Auto-Refresh**: Fetches new logs every 30 seconds if the tab is active.

### 🎨 Styling (`static/css/logs-user.css`)
-   Provides specific styles for the user logs table, controls, and layout.
-   Aims for visual consistency with the system logs tab (e.g., button styles, input heights, table row hover effects).
-   Styles for the `<pre>` tag in the details column ensure readability of JSON.

### 🧹 System Logs Cleanup (`static/js/logs-system.js`)
-   The "User" column has been removed from the table display.
-   User-specific log types (like `USER_FAN_ON`) have been removed from the "Type" filter dropdown.
-   Table `colspan` attributes updated to `6` to reflect the reduced number of columns.

---

**📚 This documentation will be updated as each phase is implemented and issues are resolved.**
