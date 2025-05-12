# Legacy History Page Documentation (Reference Only)

**IMPORTANT NOTICE:** The information contained in this document describes a **previous implementation** of the History page. It is preserved for reference purposes only during the transition to a new, revamped History feature. This documentation **does not reflect the current or future state** of the History page once the new implementation is complete.

## 1. Overview (Legacy Implementation)

This document provides a detailed overview of the legacy history page functionality, which allowed users to view historical sensor data from the greenhouse in graphical format. It retrieved pre-aggregated data from a Firestore database, processed it, and displayed it using Chart.js.

## 2. Relevant Files (Legacy Implementation)

*   **Data Ingestion (MQTT to Firestore):**
    *   `Hardware/simulation/mqtt_to_firestore.py`: Standalone Python script that subscribed to an MQTT topic, aggregated sensor readings (temperature, humidity, light for sections: `penyemaian`, `remaja`, `dewasa`, and `averages`), calculated statistics, and saved them to Firestore.
*   **Backend (Flask & Firestore Logic):**
    *   `app2.py`: The main Flask application file; registered the history blueprint.
    *   `blueprints/history/routes.py`: Defined Flask routes:
        *   `/history/`: Served the main history page HTML.
        *   `/history/data`: API endpoint for fetching historical data series.
        *   `/history/latest`: API endpoint for fetching the most recent data point.
    *   `blueprints/history/firestore.py`: Contained Python functions for:
        *   Initializing Firebase Admin and getting a Firestore client instance.
        *   Retrieving and filtering historical data from Firestore (`get_historical_data`).
        *   Retrieving the latest data point from Firestore (`get_latest_data`).
    *   `blueprints/decorators.py`: Contained the `@isloggedin` decorator used to protect history routes.
*   **Frontend (User Interface & Charting):**
    *   `templates/history.html`: Jinja2 template for the history page structure, including chart canvases and time range selectors.
    *   `static/css/history.css`: Specific CSS styles for the history page elements (time range buttons, chart containers).
    *   `static/js/history.js`: Frontend JavaScript for handling user interactions, fetching data from the backend API, processing the API response, and rendering charts using Chart.js.
*   **Configuration & Dependencies:**
    *   `secrets/firebase-credentials.json`: Service account key for Firebase authentication.
    *   `requirements.txt`: Listed Python dependencies (e.g., `firebase-admin`, `paho-mqtt`, `Flask`).

## 3. Chronological Data Flow & System Architecture (Legacy)

The system operated in several stages, from data generation to its display on the user's screen.

**Phase 1: Data Generation and Storage (MQTT to Firestore)**

1.  **Sensor Data Publication:** External sensors (or a simulator) published JSON data to an MQTT broker (e.g., `d1b364f4ed864e92b1fb464a3201e5ae.s1.eu.hivemq.cloud`) on the topic `lokatech/greenhouse/sensors`. This JSON payload contained temperature, humidity, and light readings for different greenhouse sections (`penyemaian`, `remaja`, `dewasa`) and overall `averages`.
2.  **MQTT Listener (`Hardware/simulation/mqtt_to_firestore.py`):**
    *   This script connected to the MQTT broker using credentials (`MQTT_USER`, `MQTT_PASSWORD`) and subscribed to `MQTT_SUBSCRIBE_TOPIC`.
    *   The `on_message` callback received incoming MQTT messages.
3.  **Data Aggregation:**
    *   The `process_mqtt_data` function parsed the JSON payload.
    *   Readings for each sensor type (`temps`, `humidities`, `lights`) within each section were appended to lists in the `collection_data` dictionary.
    *   This collection happened over an interval defined by `COLLECTION_INTERVAL_MINUTES` (e.g., 1 minute).
4.  **Statistical Calculation:**
    *   After the interval, `save_data_to_firestore` was called.
    *   The `calculate_stats` function computed average (`avg`), minimum (`min`), maximum (`max`), median (`median`), and count for each list of collected readings.
5.  **Firestore Storage:**
    *   A Firestore document was prepared with a UTC `timestamp`, the calculated `stats` (nested by section and data type), and `metadata`.
    *   This document was saved to two Firestore collections: `greenhouse_data` and `lokatech_db`, using a formatted timestamp string as the document ID.
    *   `reset_collection_data` then cleared the in-memory `collection_data` for the next interval.

**Phase 2: User Accesses History Page**

1.  **Navigation:** User navigated to the `/history` URL in their browser.
2.  **Flask Routing (`blueprints/history/routes.py`):**
    *   The `@history.route('/')` decorator matched the URL.
    *   The `@isloggedin` decorator ensured the user was authenticated.
    *   The `history_page()` function was executed.
3.  **HTML Rendering:** Flask rendered and returned the `templates/history.html` template to the user's browser. This HTML file contained the basic page structure, placeholders for charts, and links to CSS and JavaScript files.

**Phase 3: Frontend Requests Data**

1.  **DOM Ready (`static/js/history.js`):** Once `history.html` loaded, the `DOMContentLoaded` event fired.
2.  **Initialization:**
    *   `setupTimeRangeButtons()`: Event listeners were attached to the "24 Hours", "7 Days", "30 Days" buttons.
    *   `initCharts()`: Three Chart.js instances (`temperatureChart`, `humidityChart`, `lightChart`) were initialized with empty data and basic configurations. The chart canvases (`<canvas id="...">`) were defined in `history.html`.
    *   `loadHistoricalData(currentDays)`: This function was called (initially with `currentDays = 1`) to fetch the default data.
3.  **API Call:**
    *   Inside `loadHistoricalData(days)`, a `fetch` request was made to the backend API endpoint `/history/data?days=<selected_days>`.
    *   A loading indicator was shown via `showLoadingState()`.

**Phase 4: Backend Processes Data Request**

1.  **Flask Routing (`blueprints/history/routes.py`):**
    *   The `@history.route('/data')` decorator matched the API request URL.
    *   The `@isloggedin` decorator verified authentication.
    *   The `history_data()` function was executed.
2.  **Parameter Extraction:** Query parameters `section` (optional), `days` (default 7), and `type` (optional) were extracted from the request URL.
3.  **Firestore Interaction (`blueprints/history/firestore.py`):**
    *   `get_historical_data(section, days, data_type)` was called.
    *   `get_firestore_db()`: Ensured Firebase Admin SDK was initialized (using `secrets/firebase-credentials.json`) and returned a Firestore client instance.
    *   A `date_limit_utc` was calculated based on the `days` parameter (converted to UTC from WIB).
    *   A query was made to the `greenhouse_data` collection for documents where `timestamp >= date_limit_utc`, ordered by `timestamp`.
    *   The function iterated through the results, converting Firestore timestamps to WIB ISO strings. It filtered the `stats` data based on the optional `section` and `data_type` parameters.
4.  **API Response:**
    *   The `history_data()` route in `routes.py` received the list of processed data points.
    *   It returned a JSON response to the frontend: `{"success": true, "data": [...]}`.

**Phase 5: Frontend Renders Data**

1.  **Response Handling (`static/js/history.js`):**
    *   The `fetch` promise in `loadHistoricalData` resolved.
    *   `processHistoricalData(apiData.data)` was called with the array of data points from the API.
    *   Loading state was hidden via `hideLoadingState()`.
2.  **Data Transformation:**
    *   `processHistoricalData` iterated through each data point from the API.
    *   It extracted `avg` values for `temps`, `humidities`, and `lights` for each section (`dewasa`, `remaja`, `penyemaian`, `averages`).
    *   These values were organized into separate arrays for each chart type and section, with timestamps converted to JavaScript `Date` objects (e.g., `chartData.temperature.dewasa = [{x: Date, y: value}, ...]`).
3.  **Chart Update:**
    *   `updateCharts(chartData)` was called.
    *   This, in turn, called `updateSingleChart(chartInstance, dataForChart, label)` for each of the three charts.
    *   `updateSingleChart`:
        *   Cleared existing datasets in the Chart.js instance.
        *   For each section that had data, a new dataset was created with appropriate labels (e.g., "Dewasa Temperature"), data points, and colors (from `chartColors`).
        *   The X-axis scale was configured as a `'time'` scale, with `unit` ('hour' or 'day') and `tooltipFormat` adjusted based on `currentDays`.
        *   `chart.update()` was called to re-render the chart with the new data.
4.  **User Interaction (Time Range Change):**
    *   When a user clicked a time range button:
        *   The `active` class was updated on the buttons.
        *   `currentDays` was updated.
        *   `loadHistoricalData(currentDays)` was called again, restarting the data fetching and rendering cycle (Phases 3-5).

**Error Handling:**
*   `showError(message)` was used to display error messages in the chart containers if API calls failed or data processing encountered issues.

## 4. Firebase Setup (Legacy)

*   **Project:** A Firebase project was required.
*   **Firestore Database:** Firestore was enabled in Native mode.
*   **Service Account:** A service account was created in the Firebase project settings.
*   **Credentials File:** The private key JSON file for the service account was downloaded, renamed to `firebase-credentials.json`, and placed in the `secrets/` directory at the project root.
*   **Initialization:** The `firebase-admin` SDK was initialized using these credentials in `blueprints/history/firestore.py` (via `get_firestore_db()`) and directly in `Hardware/simulation/mqtt_to_firestore.py`.

## 5. Firestore Data Structure (Legacy)

Data was stored in a Firestore collection named `greenhouse_data`. Each document represented an aggregation of sensor data.

**Collection:** `greenhouse_data` (and a duplicate in `lokatech_db`)

**Document ID:** Timestamp string (e.g., `YYYY-MM-DD HH:MM:SS.sssZ`)

**Document Fields:**

```json
{
  "timestamp": "<Firestore Timestamp Object>", // UTC timestamp of aggregation
  "stats": {
    "dewasa": { // Greenhouse section
      "temps": { "avg": 25.5, "min": 24.0, "max": 26.5, "median": 25.6, "count": 60 },
      "humidities": { /* ...similar structure... */ },
      "lights": { /* ...similar structure... */ }
    },
    "remaja": { /* ...similar structure for this section... */ },
    "penyemaian": { /* ...similar structure for this section... */ },
    "averages": { // Overall averages
      "temps": { /* ...similar structure... */ },
      "humidities": { /* ...similar structure... */ },
      "lights": { /* ...similar structure... */ }
    }
  },
  "metadata": {
    "collection_minutes": 1,
    "samples_count_avg_temp": 60 // Example
  }
}
```
*   `timestamp`: Firestore Timestamp object (stored in UTC).
*   `stats`: Nested object containing statistics for each section and data type.
*   `metadata`: Information about the aggregation process.

## 6. API Endpoints (Legacy - defined in `blueprints/history/routes.py`)

All endpoints were prefixed with `/history` and required user login (`@isloggedin`).

**A. Get Historical Data Series**

*   **Route:** `GET /history/data`
*   **Purpose:** Fetched time series data for charts.
*   **Query Parameters:**
    *   `days` (integer, optional, default: `7`): Number of past days.
    *   `section` (string, optional): Filter by section (e.g., `dewasa`, `remaja`).
    *   `type` (string, optional): Filter by data type (e.g., `temps`, `humidities`).
*   **Successful JSON Response:**
    ```json
    {
      "success": true,
      "data": [
        {
          "timestamp": "<ISO String Timestamp in WIB>", 
          "data": { /* Filtered stats based on query params */
            "dewasa": { "temps": { "avg": 25.0, ... } } 
          }
        }
        // ... more data points ...
      ]
    }
    ```

**B. Get Latest Data Point**

*   **Route:** `GET /history/latest`
*   **Purpose:** Fetched the single most recent aggregated data point.
*   **Successful JSON Response:**
    ```json
    {
      "success": true,
      "data": {
        "timestamp": "<ISO String Timestamp in WIB>",
        "data": { /* 'stats' object from Firestore */ },
        "metadata": { /* 'metadata' object from Firestore */ }
      }
    }
    ```

## 7. Frontend Implementation Details (Legacy)

**A. HTML Structure (`templates/history.html`)**

*   Extended `base.html`.
*   Imported `macros/navigation.html` for bottom navigation.
*   Included a page header (`<h1>History Data</h1>`).
*   **Time Range Selector:** A `div` with class `time-range-selector` contained three `<button>` elements with `data-days` attributes (1, 7, 30).
*   **Chart Containers:** Three main cards, one for each chart type:
    *   Temperature: `<canvas id="temperatureChart"></canvas>`
    *   Humidity: `<canvas id="humidityChart"></canvas>`
    *   Light: `<canvas id="lightChart"></canvas>`
    *   Each canvas was wrapped in a `div` with class `chart-container`.
*   Included CDN links for Chart.js and `chartjs-adapter-date-fns`.
*   Linked to `static/js/history.js`.

**B. JavaScript Logic (`static/js/history.js`)**

*   **Global Variables:**
    *   `temperatureChart`, `humidityChart`, `lightChart`: To hold Chart.js instances.
    *   `currentDays`: To track the selected time range (default 1).
    *   `chartColors`: An object mapping section names (`dewasa`, `remaja`, `penyemaian`, `averages`) to RGBA color strings for chart lines.
*   **`DOMContentLoaded` Listener:**
    *   Called `setupTimeRangeButtons()`, `initCharts()`, and `loadHistoricalData(currentDays)`.
*   **`setupTimeRangeButtons()`:**
    *   Attached click event listeners to time range buttons.
    *   On click, updated the `active` class, set `currentDays`, and called `loadHistoricalData()`.
*   **`initCharts()`:**
    *   Created new `Chart` instances for temperature, humidity, and light.
    *   Defined common chart options (responsiveness, interaction modes, plugins).
    *   Set specific Y-axis titles and scales (e.g., min/max for humidity).
    *   X-axis initially set to `type: 'category'`.
*   **`loadHistoricalData(days)`:**
    *   Called `showLoadingState()`.
    *   Made a `fetch` GET request to `/history/data?days=${days}`.
    *   Handled the promise: on success, called `processHistoricalData()`; on failure, called `showError()`.
*   **`processHistoricalData(data)`:**
    *   Called `hideLoadingState()`.
    *   Initialized `chartData` object to store processed points for each chart type and section.
    *   Iterated through the `data` array from the API.
        *   Converted `point.timestamp` (ISO string from backend) to a JavaScript `Date` object.
        *   For each `section` in `point.data`:
            *   Extracted `avg` values for `temps`, `humidities`, `lights`.
            *   Pushed `{x: timestamp_date_obj, y: avg_value}` to the corresponding array in `chartData`.
    *   Called `updateCharts(chartData)`.
*   **`updateCharts(chartData)`:**
    *   Called `updateSingleChart()` for each of the three chart types.
*   **`updateSingleChart(chart, data, label)`:**
    *   Cleared `chart.data.datasets`.
    *   Iterated through sections in `data` (e.g., `dewasa`, `remaja` for temperature).
    *   If data existed for a section, created a new dataset object:
        *   `label`: e.g., "Dewasa Temperature".
        *   `data`: Array of `{x, y}` points.
        *   `borderColor`, `backgroundColor` from `chartColors`.
        *   Other styling options (tension, pointRadius).
    *   Pushed the new dataset to `chart.data.datasets`.
    *   Dynamically changed X-axis `type` to `'time'` if data was present, configuring `time.unit` and `time.tooltipFormat` based on `currentDays`. Reverted to `'category'` if no data.
    *   Called `chart.update()`.
*   **`showLoadingState()` / `hideLoadingState()` / `showError(message)`:**
    *   DOM manipulation functions to add/remove "Loading data..." text or error messages within the `.chart-container` divs.

**C. CSS Styling (`static/css/history.css`)**

*   Styled `.time-range-selector` and `.time-range-btn` (including `.active` state).
*   Defined dimensions and basic styling for `.chart-container`.
*   Included styles for `.card`, `.card__header`, `.card__title`, `.card__content` (similar to `dashboard.css`).
*   Styles for `.loading` and `.error-message` elements.
*   Responsive adjustments using media queries for smaller screen sizes.

## 8. Key Considerations (Legacy)

*   **Data Aggregation:** The history page displayed *aggregated* data, not raw real-time sensor readings. Granularity was determined by `COLLECTION_INTERVAL_MINUTES` in `mqtt_to_firestore.py`.
*   **Timezones:** Firestore stored timestamps in UTC. The backend (`firestore.py`) converted these to WIB (Asia/Jakarta) ISO strings for the API response. The frontend (`history.js`) parsed these ISO strings into JavaScript `Date` objects, which Chart.js then typically displayed in the user's local timezone.
*   **"Remaja" Section:** The code (especially in `firestore.py`, `mqtt_to_firestore.py`, and `history.js`) showed handling for a "remaja" section, which was a newer addition compared to an even earlier version that might have only had "peremajaan".
*   **Dependencies:** Required Python packages (`Flask`, `firebase-admin`, `paho-mqtt`, `pytz`) and frontend libraries (Chart.js, chartjs-adapter-date-fns).

This documentation should serve as a comprehensive reference for the legacy history feature.
