# Dashboard Frontend JavaScript Documentation

This documentation explains the structure and functionality of the JavaScript modules responsible for the greenhouse monitoring dashboard's frontend logic, located in `/static/js/dashboard/`.

## Overview

The dashboard frontend uses ES Modules to separate concerns, making the code more organized and maintainable. The core responsibilities are divided into:

*   **Configuration (`config.js`):** Shared settings and constants.
*   **State Management (`state.js`):** Tracking the current status of the system (connection, nodes, sensors, actuators).
*   **UI Updates (`ui.js`):** Handling all direct manipulation of the HTML DOM (displaying values, animations, status messages).
*   **Data Fetching (`data.js`):** Retrieving sensor and actuator data from the backend API.
*   **User Controls (`controls.js`):** Handling user interactions with control elements (like switches).
*   **Main Entry Point (`main.js`):** Initializing all modules and starting the data polling loop.
*   **Mock Data (`dashboard-mock.js`):** A separate script for simulating data during development or for demos (not used in production).

## Module Breakdown

### 1. `config.js`

*   **Purpose:** Stores shared constants used across different modules. This centralizes configuration values like sensor names, optimal thresholds, and timing intervals.
*   **Exports:**
    *   `SECTIONS`: Array of section names (`['penyemaian', 'peremajaan', 'dewasa']`).
    *   `SENSOR_TYPES`: Array of sensor types (`['temp', 'humidity', 'light']`).
    *   `ANIMATION_DURATION`: Duration (ms) for number animations in the UI.
    *   `POLLING_INTERVAL`: How often (ms) to fetch new data from the API.
    *   `CONNECTION_TIMEOUT_DURATION`: Time (ms) without receiving data before considering the connection lost.
    *   `THRESHOLDS`: An object defining the optimal ranges (low, high, dark) and display names for each sensor type, used for generating status messages.

### 2. `state.js`

*   **Purpose:** Manages the internal state of the dashboard application. It keeps track of whether the system is connected, the status of each node and its sensors, and the current state and mode of the actuators (fan, light). It relies on the UI module to reflect these state changes visually.
*   **Exports:**
    *   `SystemMonitor`: An object containing:
        *   `status`: The core state object (includes `connected`, `nodes`, `actuators`).
        *   `updateConnectionStatus()`: Updates connection state and triggers UI updates/timeouts.
        *   `updateNodeStatus()`: Updates the online/offline status of nodes and sensors based on incoming data, including actuator state and mode.

### 3. `ui.js`

*   **Purpose:** Handles all direct interactions with the HTML elements on the dashboard. It's responsible for displaying data, updating gauges, showing status messages, managing animations, and reflecting the state of controls. It reads state information from `SystemMonitor` and gets data via `DataManager`.
*   **Exports:**
    *   `UI`: An object containing methods for:
        *   `initialize()`: Gets references to necessary DOM elements. Sets up event listeners (like the status details toggle).
        *   `updateConnectionStatusUI()`: Updates the connection status indicator.
        *   `showError()` / `hideError()`: Manages the main error message display.
        *   `animateValue()`: Helper function for smooth number transitions.
        *   `resetDisplay()`: Resets all gauges and section values to a default state.
        *   `updateGauge()`: Updates a specific gauge's value and appearance (uses `animateValue`).
        *   `updateSectionDisplay()`: Updates the display for a specific sensor in a specific section (uses `animateValue`).
        *   `updateStatusSummary()`: Calculates and displays the overall system status (Optimal, Warning, Error) and manages the collapsible details section based on thresholds and sensor/node health.
        *   `updateControlsUI()`: Updates the visual state (checked/unchecked) and mode indicator (Auto/Manual) of the control switches.
        *   `translateSection()` / `translateSensor()`: Helper functions for localization/display names.

### 4. `data.js`

*   **Purpose:** Responsible for communication with the backend API and orchestrating the update flow.
*   **Exports:**
    *   `DataManager`: An object containing:
        *   `latestDataPayload`: Stores the most recent valid data received from the API.
        *   `fetchData()`: Asynchronously fetches data from the `/api/sensor/data` endpoint. Handles network errors and non-OK responses.
        *   `getLatestData()`: A getter used by `ui.js` to access the raw data for threshold checks.
        *   `updateDashboard()`: The main orchestrator function. Takes data from `fetchData`, calls `SystemMonitor` to update the internal state, and then calls `UI` functions (`updateGauge`, `updateSectionDisplay`, `updateStatusSummary`, `updateControlsUI`) to update the visuals.

### 5. `controls.js`

*   **Purpose:** Handles user interactions specifically with the control switches (fan, light).
*   **Exports:**
    *   `initializeControls()`: Sets up event listeners on the switch elements. When a switch is changed by the user:
        *   It checks the connection status via `SystemMonitor`.
        *   If connected, it calls `sendControlCommand`.
        *   If the command fails, it reverts the switch's visual state.
        *   If the command succeeds, it performs an optimistic UI update (setting mode to Manual).
*   **Internal:**
    *   `sendControlCommand()`: Sends a `fetch` POST request to the `/controls/api/set_state` backend endpoint with the device name and desired state. Handles API errors and provides basic user feedback via `alert`.

### 6. `main.js`

*   **Purpose:** The main entry point for the dashboard script. It imports necessary modules and coordinates the initialization process.
*   **Functionality:**
    *   Waits for the DOM to be fully loaded (`DOMContentLoaded`).
    *   Calls `UI.initialize()` to set up UI elements and listeners.
    *   Calls `initializeControls()` to set up switch listeners.
    *   Sets the initial connection status to disconnected.
    *   Processes any `initialSensorData` passed from the server-side template.
    *   Starts a `setInterval` loop that calls `DataManager.fetchData()` and then `DataManager.updateDashboard()` at the interval defined in `config.js`.

### 7. `dashboard-mock.js`

*   **Purpose:** A standalone script used for development and demonstration purposes when the actual hardware or backend API is unavailable. It simulates realistic, fluctuating sensor data and actuator states.
*   **Usage:** To use it, change the `<script>` tag in `templates/dashboard.html` to point to this file instead of `main.js`. **It should not be used in production.**

## Data Flow

1.  **Initialization (`main.js`):** UI and controls are initialized. Initial data (if provided by Flask) is processed.
2.  **Polling (`main.js`):** `setInterval` calls `DataManager.fetchData()` periodically.
3.  **API Call (`data.js`):** `fetchData()` requests data from `/api/sensor/data`.
4.  **Data Processing (`data.js`):** `updateDashboard()` receives the fetched data (or null on error).
5.  **State Update (`state.js`):** `updateDashboard()` calls `SystemMonitor.updateNodeStatus()` and `SystemMonitor.updateConnectionStatus()` to update the internal application state based on the received data.
6.  **UI Update (`ui.js`):** `updateDashboard()` calls various `UI` methods (`updateGauge`, `updateSectionDisplay`, `updateStatusSummary`, `updateControlsUI`) which read the updated state from `SystemMonitor` and the latest raw data from `DataManager` to update the HTML DOM elements visually, including animations.

## Control Flow (User Override)

1.  **User Interaction (`controls.js`):** User clicks a switch. The `change` event listener in `initializeListeners()` is triggered.
2.  **API Request (`controls.js`):** `sendControlCommand()` sends a POST request to `/controls/api/set_state` with the device and new state.
3.  **Backend Handling (`controls/routes.py`):** The Flask endpoint receives the request, constructs a command payload (`{..., "mode": "manual"}`), and publishes it to the `lokatech/greenhouse/controls/set` MQTT topic.
4.  **Hardware Action (`DeWasaNode_Master.cpp`):** The ESP32 receives the MQTT command via its `mqttCallback`, sets the corresponding `...Manual` flag to true, and directly controls the actuator pin.
5.  **State Reporting (Hardware -> Backend -> Frontend):** On its next publish cycle, the hardware includes the actuator's new `state` and `mode` ("manual") in the payload sent to `lokatech/greenhouse/sensors`. This data flows back through the regular data polling mechanism (Steps 2-6 in Data Flow above), eventually causing `UI.updateControlsUI()` to update the switch's appearance and mode indicator text.
