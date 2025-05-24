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
    *   `SENSOR_ERROR`: An error related to a sensor reading or sensor malfunction (e.g., sensor reporting 0).
    *   `SENSOR_OPERATIONAL`: A sensor that was previously in an error state (reporting 0) is now working correctly and reporting a valid value.
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
*   **Convenience Functions**: Wrapper functions around `log_event` for common log types, simplifying logging calls from other parts of the application. These include:
    *   `log_sensor_error()`: For logging sensor errors.
    *   `log_sensor_operational()`: **NEW!** For logging when a sensor becomes operational after an error.
    *   `log_connection_lost()`: For logging lost connections.
    *   `log_connection_restored()`: For logging restored connections.
    *   `log_fan_auto()`: For logging automated fan actions.
    *   `log_light_auto()`: For logging automated light actions.
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
    *   `sensor_type`: (String, optional) For `SENSOR_ERROR` and `SENSOR_OPERATIONAL` logs, the type of sensor (e.g., "temp", "humidity").
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
- **Socket.IO handlers**:
  - **BIG CHANGE**: The logging of client connection (`CONNECTION_RESTORED`) and disconnection (`CONNECTION_LOST`) events via Socket.IO handlers has been **removed (commented out)**.
  - **Why was it removed?** These logs were very frequent and often filled up the system logs with non-critical information, making it harder to find important events like sensor errors or actuator actions. By removing them, the logs become much cleaner and more focused on actionable system events.
  ```python
  @socketio.on('connect')
  def handle_connect():
      logger.info(f"Client connected: {request.sid}")
      # if app_system_logger_available: # Disabled WebSocket connection logging
          # system_log_event(SystemLogType.CONNECTION_RESTORED, SystemLogLevel.INFO, node="socketio_client", details=f"Client connected with SID: {request.sid}", source="flask_socketio_server")
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
- Imports `log_event`, `log_sensor_error`, and **NEW!** `log_sensor_operational` from `firestore_logger`.
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
  - **NEW! Sensor Error/Operational Logging**:
    -   The `validate_and_store_data` function now actively monitors sensor values (temperature, humidity, light) for "penyemaian", "remaja", and "dewasa" sections.
    -   If a sensor's value **transitions from a non-zero (working) state to 0 (error state)**, a `SENSOR_ERROR` log is created using `log_sensor_error`.
    -   If a sensor's value **transitions from 0 (error state) to a non-zero (working) state**, a `SENSOR_OPERATIONAL` log is created using `log_sensor_operational`.
    -   It also logs a `SENSOR_ERROR` if a sensor appears in the data for the first time and is already reporting 0.
    -   This provides much better visibility into sensor health and recovery.
    ```python
    # Example of new sensor logging logic in validate_and_store_data
    if new_value_is_error and not old_value_was_error:
        log_sensor_error(
            node=section_name,
            sensor_type=sensor_key,
            details=f"Sensor {sensor_key} in {section_name} started reporting 0 (error state).",
            source=self.source_identifier + "_data_monitor"
        )
    elif not new_value_is_error and old_value_was_error:
        log_sensor_operational(
            node=section_name,
            sensor_type=sensor_key,
            details=f"Sensor {sensor_key} in {section_name} is now operational. Value: {new_value}",
            source=self.source_identifier + "_data_monitor"
        )
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
    *   **`displaySystemLogsUI()`**:
        *   Dynamically generates the HTML for the filter controls (dropdowns for type, level, node; input for days) and the log table.
        *   Populates the table with log entries using `populateTableBody()`.
        *   Displays a "No system logs found" message if the `systemLogs` array is empty.
        *   Attaches event listeners to filter controls and the refresh button.
        *   Displays the count of currently displayed logs.
    *   **`populateTableBody()`**:
        *   **NEW! 10-Minute Interval Separators**: This function now iterates through the `systemLogs` and determines if a log entry marks the start of a new 10-minute interval (or a new hour/day).
        *   If it's a new interval, it adds the `log-interval-start` class to the table row (`<tr>`). This class is then used by the CSS to add a visual separator.
        *   It also adds a `time-group-header` row to visually group logs by 10-minute intervals, making it easier to scan through logs chronologically.
    *   **`createLogRow(log, isNewIntervalStart)`**: Takes a single log object and returns an HTML table row string (`<tr>...</tr>`).
        *   **NEW! Visual Enhancements**:
            *   It now accepts an `isNewIntervalStart` boolean to apply the `log-interval-start` class.
            *   It uses `getLogTypeIcon()` to display a relevant icon next to the log type.
            *   It uses `formatDetails()` to format the log details, including highlighting numbers and attempting to pretty-print JSON, making the details easier to read.
    *   **`getLogTypeIcon(type, sensorType)`**: **NEW!** This function maps log types and sensor types to appropriate Font Awesome icons and CSS classes. It provides specific icons for sensor errors (grayscale, pulsing effect) and operational sensors, as well as general icons for connection, fan, and light events.
    *   **`formatDetails(details)`**: **NEW!** This function takes the raw log details string and formats it for better readability in the UI. It escapes HTML, attempts to pretty-print JSON strings, and highlights numerical values.
    *   **`formatLogType(type)`**: Converts `LogType` enum string values (e.g., "SENSOR_ERROR") into more human-readable text (e.g., "Sensor Error") and makes "ON AUTO" / "OFF AUTO" more concise.
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
    *   **NEW! 10-Minute Interval Separator Styles**:
        *   `.system-log-table tr.log-interval-start td`: Adds a dashed top border to rows that start a new 10-minute interval, visually separating log groups.
        *   `.system-log-table tr.log-interval-start:first-child td`: Prevents the top border from appearing on the very first row of the table.
        *   `.time-group-header`: Styles for the new time group header rows, providing a clear visual marker for time intervals.
    *   **NEW! Log Type Icon Styles**:
        *   `.log-type-icon`: Base styling for the new icons, including circular background and basic alignment.
        *   `.log-type-icon.sensor-error`: Specific styles for sensor error icons (grayscale, pulsing animation) to make them stand out.
        *   `.log-type-icon.sensor-operational`: Styles for operational sensor icons.
        *   Type-specific background and icon colors (e.g., `connection-lost`, `fan`, `light`, `sensor-temp`, `sensor-humidity`, etc.) for quick visual identification.
    *   **NEW! Log Details Formatting**:
        *   `.log-details`: Styles for the details column, including `pre-wrap` for multi-line content, a monospace font, and a subtle background/border.
        *   `:hover` effect on `.log-details` to show full content if truncated and change background.

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
    *   `SENSOR_ERROR`: Logged if sensor data is missing, invalid, or indicates a sensor malfunction (e.g., value 0).
    *   `SENSOR_OPERATIONAL`: **NEW!** Logged when a sensor recovers from an error state (value 0 to non-zero).
    *   (These are now specifically integrated into `blueprints/sensor/mqtt.py`'s data validation logic).
*   **Connection Monitoring**:
    *   `CONNECTION_LOST`: Logged when the server detects a disconnection from a critical service (e.g., MQTT broker).
    *   `CONNECTION_RESTORED`: Logged when a previously lost connection is re-established.
    *   (These are handled in MQTT client callbacks in `blueprints/sensor/mqtt.py`).
*   **Automated Actuator Control**:
    *   `FAN_ON_AUTO`, `FAN_OFF_AUTO`, `LIGHT_ON_AUTO`, `LIGHT_OFF_AUTO`: Logged when the system's automation logic changes the state of fans or lights. This is integrated into the `SensorDataManager` in `blueprints/sensor/mqtt.py` based on hardware reports.
*   **Crucial Levels/Thresholds**:
    *   (Future) Could be logged as `INFO`, `WARNING`, or `CRITICAL` events if certain sensor readings cross predefined critical thresholds, requiring attention.

## 5. How to Use/Test

1.  **Access the Logs Page**: Navigate to the "System Logs & Latency" page in the web application. The "System Logs" tab should be active by default.
2.  **View Logs**: The table will display the most recent system logs.
    *   **Timestamp**: Shows the time of the event in local time (WIB).
    *   **Level**: Indicates the severity (INFO, WARNING, ERROR, CRITICAL) with a colored badge.
    *   **Type**: Describes the kind of event (e.g., Sensor Error, Fan On (Auto)), now with a relevant icon.
    *   **Node**: Specifies the relevant greenhouse section or component.
    *   **Source**: The module or component that generated the log.
    *   **Details**: Provides more specific information about the log entry, now formatted for better readability. Hover over details to see the full text if truncated.
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
