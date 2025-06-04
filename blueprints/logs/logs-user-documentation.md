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

    -   **Password Reset Requested:** In `request_password_reset()`, after successful validation and before client calls Firebase, `firestore_logger.log_user_activity` is called with:
        -   `action_type`: `UserActionType.PASSWORD_RESET_REQUESTED`
        -   `event_details`: `{"action": "password_reset_request_allowed", "email_provided": "user@example.com"}`
        -   `source`: `"auth_module"`
        -   `ip_address`: `request.remote_addr`

    -   **Rate Limit Exceeded:** In `login()`, `register()`, and `request_password_reset()` when a rate limit is hit, `firestore_logger.log_user_activity` is called with:
        -   `username`: `ip_address` (since user might not be identifiable yet)
        -   `action_type`: `UserActionType.RATE_LIMIT_EXCEEDED`
        -   `event_details`: `{"action": "login/register/reset-password", "limit": "X requests per Ys"}`
        -   `source`: `"auth_rate_limiter"`
        -   `ip_address`: `request.remote_addr`

4.  **Created `blueprints/logs/routes.py` (User Log API Endpoints):**
    -   **`GET /logs/user-activities`**:
        -   Fetches user logs based on query parameters: `days`, `type` (action_type), `username`, `limit`.
        -   Uses `get_user_logs()` from `firestore_logger.py`.
        -   Returns JSON data.
    -   **`GET /logs/export-user-activities-csv`**:
        -   Exports user logs to a CSV file based on query parameters: `days`, `type`, `username`.
        -   Uses `get_user_logs()` and generates a CSV response.

5.  **Created `static/js/logs-user.js` (Frontend User Log Display):**
    -   Handles fetching user logs from `/logs/user-activities`.
    -   Dynamically populates an HTML table with log data.
    -   Includes client-side filtering controls (days, action type, username).
    -   Provides a "Refresh" button.
    -   Manages loading states and error display.
    -   Handles CSV export button functionality.

6.  **Updated `templates/logs.html` (User Log Tab Structure):**
    -   Added a basic structure for the "User Logs" tab, including placeholders for controls and the log table.
    -   Included `logs-user.js`.

7.  **Created `static/css/logs-user.css` (Styling for User Logs Tab):**
    -   Basic styling for the user logs table, filters, and buttons.

**Files Involved in Phase 2:**
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\dashboard\routes.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\profile\routes.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\auth\routes.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\logs\routes.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\static\js\logs-user.js`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\templates\logs.html`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\static\css\logs-user.css`

**Outcome of Phase 2:**
*   Comprehensive logging for device control, profile updates, account deletion, and new user registration is implemented, writing to `user_logs`.
*   Rate limiting events are also logged to `user_logs`.
*   A functional "User Logs" tab in the UI allows viewing and filtering these logs.
*   Users can export the filtered user logs to a CSV file.

</details>

<details open>
<summary><strong>✅ Phase 3: UI/UX Refinements - Column Sizing & Pagination (Completed)</strong></summary>

> **💡 Objective**: Enhance the User Logs tab's user experience by implementing better column width management and a "Load More" pagination system to handle large datasets more effectively.

**Steps & Outcomes:**
1.  **CSS Adjustments for Column Sizing (`static/css/logs-user.css`):**
    -   Defined `max-width` for "Username" and "Details" columns to prevent them from excessively stretching and pushing other columns out of view.
        -   "Username": Uses `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap` for truncation.
        -   "Details": Uses `word-break: break-word` to allow content to wrap within its `max-width`.
    -   Assigned `min-width` to "IP Address" and "Source" columns to ensure their visibility.

2.  **Backend Pagination Support (`blueprints/logs/firestore_logger.py` & `blueprints/logs/routes.py`):**
    -   Modified `get_user_logs()` in `firestore_logger.py`:
        -   Added an optional `last_doc_id` parameter.
        -   If `last_doc_id` is provided, the Firestore query uses `start_after()` with the snapshot of the document corresponding to `last_doc_id` to fetch the next set of logs.
        -   The function now returns both the list of logs and the ID of the last document fetched in the current batch (`last_doc_id_returned`).
    -   Updated `GET /logs/user-activities` API endpoint in `routes.py`:
        -   Accepts `last_doc_id` as a query parameter.
        -   Passes `last_doc_id` to `get_user_logs()`.
        -   The JSON response now includes `logs` and `last_doc_id_returned`.
        -   The `limit` parameter now defaults to 50 (matching the frontend's page size).

3.  **Frontend Pagination Implementation (`static/js/logs-user.js`):**
    -   **Logs Per Page**: Introduced `logsPerPage = 50`.
    -   **State Management**:
        -   `allUserLogs`: Array to accumulate all logs displayed on the client.
        -   `lastFetchedLogId`: Stores the ID of the last log from the most recent fetch, used for subsequent "Load More" requests.
        -   `currentFilters`: Stores the currently applied filter values.
    -   **`loadUserLogs()` Function Enhancement**:
        -   Accepts an `isLoadMore` boolean flag.
        -   If `isLoadMore` is `false` (initial load or filter change), `allUserLogs` is cleared, and `lastFetchedLogId` is reset.
        -   The `limit` sent to the backend is always `logsPerPage`.
        -   If `isLoadMore` is `true`, the `last_doc_id` (from `lastFetchedLogId`) is included in the API request.
        -   On data fetch:
            -   If not `isLoadMore`, `allUserLogs` is replaced.
            -   If `isLoadMore`, new logs are appended to `allUserLogs`.
            -   `lastFetchedLogId` is updated from the API response.
            -   The log table is re-rendered.
    -   **"Load More" Button**:
        -   A "Load More Logs" button is dynamically added below the log table.
        -   It's shown if `last_doc_id_returned` is present and the number of logs fetched in the last batch equals `logsPerPage`. Otherwise, it's hidden.
        -   Clicking it calls `loadUserLogs()` with `isLoadMore = true`.
    -   **Filter Changes**: When filters are changed, `loadUserLogs()` is called with `isLoadMore = false` to fetch a fresh set of data based on the new criteria, resetting `allUserLogs` and `lastFetchedLogId`.
    -   **UI Updates**:
        -   The log count display now reflects the total number of logs *shown* on the client.
        -   CSS classes were added to table cells for "Username" and "Details" to enable specific width styling.

4.  **HTML Structure (`templates/logs.html`):**
    -   No major structural changes were required for pagination itself, as the "Load More" button and its container are managed by `logs-user.js`. The existing structure for the user logs tab was sufficient.

**Files Involved in Phase 3:**
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\static\css\logs-user.css`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\logs\firestore_logger.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\logs\routes.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\static\js\logs-user.js`

**Outcome of Phase 3:**
*   The User Logs table now has better-defined column widths, improving readability and ensuring important columns like IP Address and Source remain visible.
*   Logs are displayed in pages of 50.
*   A "Load More Logs" button allows users to progressively load older log entries, significantly improving performance and usability when dealing with a large number of logs.
*   The vertical scroll of the log table is managed per page, making it easier to navigate.

</details>

<details>
<summary><strong>✅ Phase 4: Bug Fix - CSV Export for User Logs (Completed)</strong></summary>

> **💡 Objective**: Resolve a bug in the "Export User Logs to CSV" functionality where an `AttributeError` occurred due to incorrect handling of the return value from `get_user_logs`.

**Problem Description:**
The `export_user_activities_csv` function in `blueprints/logs/routes.py` was assigning the entire tuple `(logs_list, last_doc_id_returned)` (returned by `firestore_logger.get_user_logs`) to its `logs` variable. When iterating over this tuple, if `log_entry` became the `last_doc_id_returned` (a string or None), calling `log_entry.get(...)` resulted in an `AttributeError: '...' object has no attribute 'get'`.

**Steps & Outcomes:**
1.  **Modified `blueprints/logs/routes.py`:**
    -   In the `export_user_activities_csv` function, the call to `firestore_logger.get_user_logs` has been updated to correctly unpack the returned tuple. The `logs` variable now exclusively holds the list of log documents, and the `last_doc_id_returned` is ignored as it's not needed for the export operation.
        ```python
        # Before
        # logs = firestore_logger.get_user_logs(...)

        # After
        logs, _ = firestore_logger.get_user_logs(
            days=days,
            log_type_filter=log_type,
            username_filter=username,
            limit=limit 
        )
        ```

**Files Involved in Phase 4:**
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\logs\routes.py`

**Outcome of Phase 4:**
*   The "Export User Logs to CSV" feature now functions correctly, generating a CSV file of the user activity logs without encountering the `AttributeError`.

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
