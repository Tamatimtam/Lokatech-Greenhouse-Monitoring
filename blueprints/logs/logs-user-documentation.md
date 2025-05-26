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

<details>
<summary><strong>✅ Phase 1: Backend - User Log Foundation & Device Control Migration (Completed)</strong></summary>

> **💡 Objective**: Establish the core backend infrastructure for user activity logging. This includes defining the `UserActionType` Enum, creating the `log_user_activity` function (which writes to the new `user_logs` Firestore collection), and the `get_user_logs` function. Critically, this phase refactored the existing `log_user_action` function to redirect device control logs from `system_logs` to the new `user_logs` collection. This phase also included cleaning up the system logs CSV export.

**Steps:**
1.  **Enhanced `blueprints/logs/firestore_logger.py`:**
    -   **Defined `UserActionType` Enum**: Created a new Enum specifically for user logs:
        ```python
        class UserActionType(Enum):
            DEVICE_CONTROL = "DEVICE_CONTROL"
            PROFILE_UPDATE = "PROFILE_UPDATE"
            ACCOUNT_DELETED = "ACCOUNT_DELETED"
            REGISTRATION_SUCCESS = "REGISTRATION_SUCCESS"
        ```
    -   **Created `log_user_activity()` function**:
        -   Signature: `log_user_activity(username: str, action_type: UserActionType, event_details: dict, source: str, ip_address: Optional[str])`
        -   This function writes structured log data to a **new Firestore collection named `user_logs`**.
        -   It includes `timestamp`, `timestamp_wib`, `username`, `action_type` (from `UserActionType`), `event_details`, `source`, and `ip_address`.
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

**Steps:**
1.  **Update `blueprints/dashboard/routes.py` (Device Control Logging - IP Address):**
    -   Modified calls to the (now refactored) `firestore_logger.log_user_action` to pass `request.remote_addr` as the `ip_address`. (Completed)

2.  **Update `blueprints/profile/routes.py` (Profile & Account Actions Logging):**
    -   **Profile Update (Display Name Change):** In `update_profile()`, on success, call `firestore_logger.log_user_activity` with:
        -   `username=session['user']['email']`
        -   `action_type=UserActionType.PROFILE_UPDATE`
        -   `event_details={"field_updated": "displayName", "old_value": old_display_name, "new_value": new_display_name}` (Ensured `old_display_name` is captured from session before update).
        -   `source="profile_module"`
        -   `ip_address=request.remote_addr` (Completed)
    -   **Account Deletion:** In `delete_account()`:
        -   On successful deletion: Call `firestore_logger.log_user_activity` with `action_type=UserActionType.ACCOUNT_DELETED`, `event_details={"status": "success", "deleted_account_email": email}`, `source="profile_module"`, `ip_address=request.remote_addr`. (Completed)
        -   On failed deletion (e.g., invalid password): Call `firestore_logger.log_user_activity` with `action_type=UserActionType.ACCOUNT_DELETED`, `event_details={"status": "failure", "reason": "invalid_password", "attempted_account_email": email}`, `source="profile_module"`, `ip_address=request.remote_addr`. (Completed)

3.  **Update `blueprints/auth/routes.py` (Registration Logging):**
    -   **New User Registered:** In `register()`, after successful `auth.create_user()`, call `firestore_logger.log_user_activity` with:
        -   `username=email` (the newly registered email)
        -   `action_type=UserActionType.REGISTRATION_SUCCESS`
        -   `event_details={"registered_email": email}`
        -   `source="auth_module"`
        -   `ip_address=request.remote_addr` (Completed)

4.  **Update API Endpoints in `blueprints/logs/routes.py` (User Log Endpoints):**
    -   **Create `GET /logs/user-activities`**:
        -   Calls `firestore_logger.get_user_logs()`.
        -   Protected by `@isloggedin`.
        -   Accepts query parameters for filtering (days, type, username, limit). (Completed)
    -   **Create `GET /logs/export-user-activities-csv`**:
        -   Exports user logs from `firestore_logger.get_user_logs()`.
        -   Protected by `@isloggedin`.
        -   CSV columns: Timestamp (WIB), Username, Action Type, IP Address, Source, Details (flattened `event_details`). (Completed)

5.  **Documentation Updates:**
    -   Update this file (`logs-user-documentation.md`) with final details of Phase 1 & 2. (Completed)
    -   Update `firebase-documentation.md` (Audit & Monitoring section). (Pending - separate task)
    -   Update `profile-documentation.md` (Auditing notes for relevant features). (Pending - separate task)
    -   Update `logs-system-documentation.md` to reflect that user device control actions and the "User" column are removed. (Completed in previous step)

**Files Involved in Phase 2:**
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\dashboard\routes.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\profile\routes.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\auth\routes.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\logs\routes.py`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\logs\firestore_logger.py` (functions called)
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\blueprints\logs\logs-user-documentation.md`

**Outcome of Phase 2:**
*   Logging implemented for profile updates, account deletions, and new user registrations into `user_logs`.
*   IP addresses correctly logged for all user actions, including device control.
*   API endpoints for fetching and exporting these specific user logs are functional.
*   This documentation file (`logs-user-documentation.md`) updated to reflect the changes.
*   `logs-system-documentation.md` updated.

</details>

<details open>
<summary><strong>🎨 Phase 3: Frontend - Building the User Logs Tab & System Logs Cleanup (In Progress)</strong></summary>

> **💡 Objective**: Develop the frontend interface for viewing user activity logs. Clean up the System Logs tab to remove user-specific information.

**Steps:**
1.  **Create `static/css/logs-user.css`:**
    -   Define styles for the User Logs tab, table, filters. Can adapt from `logs-system.css`. (Completed)
2.  **Develop `static/js/logs-user.js`:**
    -   Fetch data from the `/logs/user-activities` API endpoint. (Completed)
    -   Display logs in a table format (Timestamp, Username, Action Type, IP Address, Source, Details). (Completed)
    -   Implement client-side filtering (date range, username, action type for the 4 specified actions). (Completed)
    -   Implement "Export User Logs to CSV" button (calls `/logs/export-user-activities-csv`). (Completed)
    -   Implement auto-refresh. (Completed)
3.  **Modify `templates/logs.html`:**
    -   Include link to `static/css/logs-user.css`. (Completed)
    -   Ensure `<div id="tab-user" class="tab-content"></div>` is ready and add export button. (Completed)
4.  **Modify `static/js/logs-system.js` (System Logs Cleanup):**
    -   **Remove the "User" column** from the System Logs table display. (Completed)
    -   **Remove user-specific log types** (e.g., `USER_FAN_ON`, `USER_CONTROL_ACTION`) from the "Type" filter dropdown. (Completed)
    -   Adjust table `colspan` attributes if necessary due to column removal. (Completed)

**Files Potentially Involved in Phase 3:**
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\static\css\logs-user.css` (new)
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\static\js\logs-user.js` (heavily modified placeholder)
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\templates\logs.html`
*   `d:\Lokatani\Lokatech-Greenhouse-Monitoring\static\js\logs-system.js`

**Expected Outcome of Phase 3:**
*   A functional "User Logs" tab displaying the four specified types of user logs, with filtering and export.
*   The "System Logs" tab and its CSV export are cleaned up, no longer displaying user-specific action details or the "User" column.

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
## 🔧 Backend Implementation Details (Phases 1 & 2)

*(Details for Phase 1, such as the `user_logs` collection structure and `UserActionType` Enum, are defined below and were established in Phase 1. Phase 2 implemented the logging calls in respective modules and added API endpoints for user logs.)*

### 🗄️ Firestore Collection: `user_logs`
**Structure per document:**
```json
{
  "timestamp": "FirebaseServerTimestamp", 
  "timestamp_wib": "YYYY-MM-DDTHH:mm:ss+07:00", 
  "username": "user@example.com",         
  "action_type": "DEVICE_CONTROL", // From UserActionType Enum
  "event_details": { /* Action-specific data */ },
  "source": "dashboard_controls/profile_module/auth_module", 
  "ip_address": "192.168.1.100"
}
```
*(Specific `event_details` examples from previous version of this doc remain valid for `DEVICE_CONTROL`, `PROFILE_UPDATE`, `ACCOUNT_DELETED`, `REGISTRATION_SUCCESS`)*

### 🏷️ `UserActionType` Enum (in `blueprints/logs/firestore_logger.py`)
```python
from enum import Enum

class UserActionType(Enum):
    DEVICE_CONTROL = "DEVICE_CONTROL"
    PROFILE_UPDATE = "PROFILE_UPDATE"
    ACCOUNT_DELETED = "ACCOUNT_DELETED"
    REGISTRATION_SUCCESS = "REGISTRATION_SUCCESS"
```

---
## 🎨 Frontend Implementation Details (Phase 3)

*(This section will be filled in as Phase 3 progresses. Initial implementation includes CSS for user logs, JavaScript for fetching, displaying, filtering, exporting user logs, and auto-refresh functionality. System logs frontend has been cleaned up.)*

---

**📚 This documentation will be updated as each phase is implemented.**
