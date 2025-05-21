# System Logs Feature Documentation

## 1. Overview

The System Logs feature provides a centralized mechanism for recording and viewing important system-level events within the Lokatech Greenhouse Monitoring application. These logs are stored in Firestore and can be accessed via a dedicated "System Logs" tab in the web interface. This allows for easier monitoring, debugging, and understanding of system behavior over time.

The primary goals of this system are:
- To capture critical events, errors, and automated actions.
- To provide a user-friendly interface for viewing and filtering these logs.
- To aid in diagnosing issues and understanding system performance.

## 2. Backend Implementation

The backend is responsible for defining the log structure, providing an interface to record logs, and exposing an API to retrieve logs.

### 2.1. Firestore Logger (`blueprints/logs/firestore_logger.py`)

This module is the core of the logging system on the backend.

**Key Components:**

*   **`LogType` Enum**: Defines the types of events that can be logged:
    *   `SENSOR_ERROR`: An error related to a sensor reading or sensor malfunction.
    *   `CONNECTION_LOST`: The server lost connection to a critical component (e.g., MQTT broker).
    *   `CONNECTION_RESTORED`: The server re-established a lost connection.
    *   `FAN_ON_AUTO`: A fan was turned on automatically by the system.
    *   `FAN_OFF_AUTO`: A fan was turned off automatically by the system.
    *   `LIGHT_ON_AUTO`: A light was turned on automatically by the system.
    *   `LIGHT_OFF_AUTO`: A light was turned off automatically by the system.
*   **`LogLevel` Enum**: Defines the severity of the log entry:
    *   `INFO`: Informational messages about routine operations.
    *   `WARNING`: Potential issues or unusual events that are not critical.
    *   `ERROR`: Errors that occurred but might not have halted the system.
    *   `CRITICAL`: Severe errors that might impact system functionality.
*   **`get_firestore_db()`**: Handles the initialization of the Firebase Admin SDK and returns a Firestore client instance. It ensures that Firebase is initialized only once, using unique application names to prevent conflicts if other parts of the application also initialize Firebase.
*   **`log_event()`**: The main function for writing log entries to Firestore. It takes `log_type`, `level`, and optional `node`, `sensor_type`, `details`, and `source` as arguments.
*   **Convenience Functions**: Wrapper functions around `log_event` for common log types, simplifying logging calls from other parts of the application (e.g., `log_sensor_error()`, `log_fan_auto()`).
*   **`get_system_logs()`**: Retrieves logs from Firestore. It supports filtering by the number of `days` of history, `log_type_filter`, `level_filter`, `node_filter`, and can `limit` the number of results. Logs are ordered by timestamp.

**Firestore Collection:**

*   **Name**: `system_logs`
*   **Document ID Format**: Document IDs are custom-generated based on the event's timestamp in WIB (Western Indonesian Time) to ensure chronological sorting in the Firebase console by default. The format is `YYYY-MM-DD HH:MM:SS.ffffff-xxxxxx` where `xxxxxx` is a short random hex string to prevent collisions.
*   **Document Structure**: Each document in this collection represents a single log entry. The fields include:
    *   `timestamp`: (Firestore Timestamp) The UTC timestamp when the event occurred. This is the primary field used for server-side querying and precise sorting.
    *   `timestamp_wib`: (String) The WIB (Western Indonesian Time) timestamp in ISO 8601 format, for easier display on the frontend and for generating the document ID.
    *   `type`: (String) The type of log event (from `LogType` enum, e.g., "SENSOR_ERROR").
    *   `level`: (String) The severity level of the log (from `LogLevel` enum, e.g., "ERROR").
    *   `node`: (String, optional) The specific greenhouse section or component related to the log (e.g., "penyemaian", "server", "dewasa").
    *   `sensor_type`: (String, optional) For `SENSOR_ERROR` logs, the type of sensor (e.g., "temp", "humidity").
    *   `details`: (String, optional) Additional descriptive information about the event.
    *   `source`: (String) The module or component that generated the log (e.g., "mqtt_processor", "actuator_control").

### 2.1.4 Firestore Logger Integration

The `firestore_logger.py` module is the core logging interface.  
Key points:
- `get_firestore_db()`: Initializes a named Firebase app (`lokatech-system-logs`) or falls back to default, verifying `project_id`.
- `log_event()`:  
  • Formats log entry with UTC `timestamp` (for queries) and WIB `timestamp_wib`.  
  • Generates document ID using WIB time + random hex suffix:  
    ```python
    now_wib = now_utc.astimezone(wib_timezone)
    log_id = f"{now_wib.strftime('%Y-%m-%d %H:%M:%S.%f')}-{os.urandom(3).hex()}"
    db.collection('system_logs').document(log_id).set(log_data)
    ```
  • Convenience wrappers (`log_sensor_error`, `log_fan_auto`, etc.) map events to specific `LogType` and `LogLevel`.  
- `get_system_logs()`: Queries `system_logs` by `timestamp` with optional filters (`type`, `level`, `node`) and returns JSON-serializable entries.

### 2.1.5 Main Application (`app2.py`)

- Initializes Flask, CORS, Socket.IO, and the default Firebase Admin app.
- **Socket.IO handlers** log connection events:
  ```python
  @socketio.on('connect')
  def handle_connect():
      system_log_event(SystemLogType.CONNECTION_RESTORED, SystemLogLevel.INFO,
                       node="socketio_client",
                       details=f"Client connected: {request.sid}",
                       source="flask_socketio_server")
  ```
- Registers the `logs_bp` blueprint under `/logs`.
- Ensures `firestore_logger` is imported after Firebase init to avoid circular imports.

### 2.1.6 MQTT‐to‐Firestore Script (`Hardware/simulation/mqtt_to_firestore.py`)

- Standalone script that aggregates MQTT sensor data and writes to Firestore.
- Imports `log_event`, `LogType`, `LogLevel`, `log_sensor_error` from `firestore_logger`.
- Logs:
  - **Connection events** (`CONNECTION_LOST` / `CONNECTION_RESTORED`) for the MQTT broker.
  - **Payload errors** via `log_sensor_error` when JSON decode or value conversion fails.
- Usage example:
  ```python
  if logger_available:
      log_event(LogType.CONNECTION_RESTORED, LogLevel.INFO,
                node="mqtt_aggregator_script",
                details="Connected to broker",
                source="mqtt_to_firestore.py")
  ```

### 2.1.7 Sensor Manager (`blueprints/sensor/mqtt.py`)

- Manages real-time sensor updates via MQTT in the Flask app.
- Imports `log_event` and `log_sensor_error` from `firestore_logger`.
- Logs:
  - **MQTT connect/disconnect**:  
    ```python
    if rc == 0: log_event(LogType.CONNECTION_RESTORED, LogLevel.INFO, node="server", source=self.source_identifier)
    else:    log_event(LogType.CONNECTION_LOST, LogLevel.WARNING, node="server", source=self.source_identifier)
    ```
  - **Invalid payload structure** (`SENSOR_ERROR`) during `validate_and_store_data`.
  - **Hardware-reported actuator state** when in `auto` mode:
    ```python
    log_event(LogType.FAN_ON_AUTO if state else LogType.FAN_OFF_AUTO,
              LogLevel.INFO,
              node="all_sections",
              details="Fan ON in auto mode",
              source="sensor_manager_hardware_report")
    ```

### 2.2. API Endpoint (`blueprints/logs/routes.py`)

*   **Route**: `/logs/system-logs`
*   **Method**: `GET`
*   **Authentication**: Requires user to be logged in (`@isloggedin` decorator).
*   **Purpose**: Provides an HTTP interface for the frontend to fetch system logs.
*   **Request Query Parameters**:
    *   `days` (integer, optional, default: 7): Number of past days of logs to retrieve.
    *   `type` (string, optional): Filter by a specific `LogType` value.
    *   `level` (string, optional): Filter by a specific `LogLevel` value.
    *   `node` (string, optional): Filter by a specific node/component name.
    *   `limit` (integer, optional, default: 100): Maximum number of log entries to return.
*   **Response**:
    *   **Success (200 OK)**: A JSON array of log objects, where each object matches the structure retrieved by `firestore_logger.get_system_logs()`.
    *   **Error (500 Internal Server Error)**: A JSON object with an "error" message if data retrieval fails.

## 3. Frontend Implementation

The frontend provides the user interface for viewing and interacting with the system logs.

### 3.1. System Logs JavaScript (`static/js/logs-system.js`)

This script manages the "System Logs" tab.

*   **Purpose**: Fetches system logs from the `/logs/system-logs` API, displays them in a filterable and sortable table, and handles user interactions.
*   **Key Functions**:
    *   **`loadSystemLogs(filters = {})`**:
        *   Manages an `isLoading` state to prevent multiple concurrent requests.
        *   Displays a loading indicator while fetching data.
        *   Constructs the API request URL with the specified `filters` (days, type, level, node, limit).
        *   Handles successful API responses by updating the `systemLogs` array and calling `displaySystemLogs()` and `restoreFilterSelections()`.
        *   Manages API errors by displaying an alert message with a retry button.
    *   **`displaySystemLogs()`**:
        *   Dynamically generates the HTML for the filter controls (dropdowns for type, level, node; input for days) and the log table.
        *   Populates the table with log entries using `createLogRow()`.
        *   Displays a "No system logs found" message if the `systemLogs` array is empty.
        *   Attaches event listeners to filter controls and the refresh button.
        *   Displays the count of currently displayed logs.
    *   **`applyFilters()`**: Collects current values from filter controls and calls `loadSystemLogs()` to refresh the data.
    *   **`createLogRow(log)`**: Takes a single log object and returns an HTML table row string (`<tr>...</tr>`) with formatted data (timestamp, level badge, type, node, details).
    *   **`formatLogType(type)`**: Converts `LogType` enum string values (e.g., "SENSOR_ERROR") into more human-readable text (e.g., "Sensor Error").
    *   **`restoreFilterSelections(filters)`**: Ensures that after data is reloaded, the filter controls reflect the currently active filters.
*   **Features**:
    *   **Auto-Refresh**: Logs are automatically refreshed every 30 seconds using `setInterval`. The interval is cleared when the user navigates away from the page.
    *   **Filtering**: Users can filter logs by time range (days), log type, log level, and node.
    *   **Loading State**: Visual feedback (loading spinner, disabled refresh button) is provided during data fetching.
    *   **Error Handling**: Displays user-friendly error messages if the API call fails, with an option to retry.

### 3.2. System Logs CSS (`static/css/logs-system.css`)

This file contains the styles specific to the "System Logs" tab.

*   **Purpose**: To style the filter controls, the log table, log level badges, loading indicators, alerts, and ensure the layout is responsive.
*   **Key Styles**:
    *   Layout for filter controls (`.system-log-controls`).
    *   Styling for the log table (`.system-log-table`), including sticky headers, zebra-striping, and hover effects.
    *   Distinct visual styles for different log levels (`.log-level-INFO`, `.log-level-WARNING`, etc.) using colored badges.
    *   Styles for loading indicators and error alerts.
    *   Responsive adjustments for smaller screens (`@media (max-width: 768px)`).

### 3.3. Logs Page HTML (`templates/logs.html`)

This is the main HTML file for the logs section, including all tabs.

*   **Integration**:
    *   Includes a link to the `logs-system.css` stylesheet in the `<head>`.
    *   Defines the tab structure. The "System Logs" tab button (`<button class="tab-link active" data-tab="tab-system">`) and its corresponding content container (`<div id="tab-system" class="tab-content active">`) are marked as `active` by default to make it the initially visible tab.
    *   The content of `#tab-system` is dynamically populated by `logs-system.js`.
*   **Tab Switching**: General tab switching logic is handled by `static/js/logs.js`, which respects the initially active tab set in the HTML.

## 4. Integration Points (How Logs are Generated)

While the framework for storing and viewing logs is in place, the actual generation of log entries occurs in other parts of the application. Log events are triggered by:

*   **Sensor Data Processing**:
    *   `SENSOR_ERROR`: Logged if sensor data is missing, invalid, or indicates a sensor malfunction. This would typically be integrated into the MQTT message handler or data validation logic.
*   **Connection Monitoring**:
    *   `CONNECTION_LOST`: Logged when the server detects a disconnection from a critical service (e.g., MQTT broker).
    *   `CONNECTION_RESTORED`: Logged when a previously lost connection is re-established.
    *   (These are often handled in MQTT client callbacks or WebSocket event handlers).
*   **Automated Actuator Control**:
    *   `FAN_ON_AUTO`, `FAN_OFF_AUTO`, `LIGHT_ON_AUTO`, `LIGHT_OFF_AUTO`: Logged when the system's automation logic changes the state of fans or lights. This would be integrated into the control scripts that manage these actuators.
*   **Crucial Levels/Thresholds**:
    *   (Future) Could be logged as `INFO`, `WARNING`, or `CRITICAL` events if certain sensor readings cross predefined critical thresholds, requiring attention.

## 5. How to Use/Test

1.  **Access the Logs Page**: Navigate to the "System Logs & Latency" page in the web application. The "System Logs" tab should be active by default.
2.  **View Logs**: The table will display the most recent system logs.
    *   **Timestamp**: Shows the time of the event in local time (WIB).
    *   **Level**: Indicates the severity (INFO, WARNING, ERROR, CRITICAL) with a colored badge.
    *   **Type**: Describes the kind of event (e.g., Sensor Error, Fan On (Auto)).
    *   **Node**: Specifies the relevant greenhouse section or component.
    *   **Details**: Provides more specific information about the log entry.
3.  **Filtering**:
    *   **Days**: Enter a number to see logs from the last N days.
    *   **Type**: Select a specific log type from the dropdown.
    *   **Level**: Select a specific severity level.
    *   **Node**: Select a specific node.
    *   Changes to filters automatically reload the log data.
4.  **Refresh**: Click the "Refresh" button to manually reload the logs.
5.  **Auto-Refresh**: Logs will automatically update every 30 seconds.
6.  **Generate Test Logs**: To test, you would need to trigger conditions in the application that cause logs to be written (e.g., simulate a sensor error if that logging point is implemented, or manually call a logging function from a Python shell within the Flask app context).

This documentation should provide a good overview of the system logs feature.
