# Greenhouse Monitoring: History Page Implementation

## 1. Introduction

This document details the implementation of the "Data Riwayat" (History Page) for the Lokatani Greenhouse Monitoring system. This page allows users to visualize and analyze historical sensor data, including temperature, humidity, and light intensity, collected from various sections of the greenhouse.

**Key Features:**

*   **Multi-Sensor Visualization:** Displays separate, interactive line charts for Temperature, Humidity, and Light Intensity.
*   **Time Range Selection:** Users can select predefined time ranges:
    *   1 Jam (1 Hour)
    *   24 Jam (24 Hours / 1 Day)
    *   7 Hari (7 Days)
    *   30 Hari (30 Days)
*   **Data Insights:** For each sensor type and selected range, the page displays:
    *   Minimum value (with section and timestamp)
    *   Maximum value (with section and timestamp)
    *   Overall average value for the period.
*   **Responsive Design:** Charts and layout adapt to different screen sizes.
*   **Localization:** UI elements are partially localized to Bahasa Indonesia.
*   **Dynamic Data Loading:** Data is fetched asynchronously from a backend API.
*   **Sleek UI Polish:** Subtle visual enhancements like distinct card headers, improved hover effects, and value update animations for a more refined user experience.

## 2. System Architecture & Data Flow

The history feature involves several components working together:

```mermaid
sequenceDiagram
    participant User
    participant Browser (Frontend)
    participant Flask App (Backend)
    participant Firestore DB
    participant MQTT Broker
    participant Sensor/Simulator

    Sensor/Simulator->>MQTT Broker: Publishes sensor data (JSON)
    Note over MQTT Broker, Firestore DB: Data Ingestion (mqtt_to_firestore.py)
    MQTT Broker-->>Firestore DB: Aggregated data stored

    User->>Browser (Frontend): Navigates to History Page
    Browser (Frontend)->>Flask App (Backend): GET /history/
    Flask App (Backend)-->>Browser (Frontend): Serves history.html

    Browser (Frontend)->>Flask App (Backend): GET /history/data?days=X (on load/range change)
    Flask App (Backend)->>Firestore DB: Queries greenhouse_data collection
    Firestore DB-->>Flask App (Backend): Returns historical documents
    Flask App (Backend)-->>Browser (Frontend): Responds with JSON data

    Browser (Frontend)->>Browser (Frontend): Processes data & renders charts (Chart.js)
```

### 2.1. Data Ingestion (External Script)

*   **Source:** `Hardware/simulation/mqtt_to_firestore.py`
*   **Process:**
    1.  Subscribes to an MQTT topic where raw sensor data is published.
    2.  Aggregates readings (temperature, humidity, light) for each greenhouse section (`penyemaian`, `remaja`, `dewasa`, `averages`) over a defined interval (e.g., 1 minute).
    3.  Calculates statistics (average, min, max, median, count) for the aggregated data.
    4.  Saves these statistics as a new document in the `greenhouse_data` collection in Firestore. Each document is timestamped (UTC).

### 2.2. Backend (Flask Application)

*   **Relevant Files:**
    *   `blueprints/history/routes.py`: Defines API endpoints and page rendering logic.
    *   `blueprints/history/firestore.py`: Handles interaction with Firestore for fetching data.
*   **API Endpoint: `GET /history/data`**
    *   **Purpose:** Provides historical sensor data to the frontend.
    *   **Query Parameters:**
        *   `days` (integer, optional, default: `7`): Specifies the number of past days of data to retrieve. The "1hour" frontend range still requests 1 day of data from this API, with client-side filtering.
    *   **Processing:**
        1.  Queries the `greenhouse_data` collection in Firestore.
        2.  Filters documents based on the `days` parameter (timestamps within the range).
        3.  Converts UTC timestamps from Firestore to WIB (Asia/Jakarta) ISO 8601 strings.
    *   **Response:** Returns a JSON object:
        ```json
        {
          "success": true,
          "data": [
            {
              "timestamp": "YYYY-MM-DDTHH:MM:SS+07:00", // WIB
              "data": { // Contains 'stats' from Firestore document
                "dewasa": {
                  "temps": { "avg": 25.5, "min": 24.0, ... },
                  "humidities": { "avg": 60.1, ... },
                  "lights": { "avg": 5000, ... }
                },
                "remaja": { /* ... */ },
                "penyemaian": { /* ... */ },
                "averages": { /* ... */ }
              }
            }
            // ... more data points
          ]
        }
        ```

### 2.3. Frontend (Browser)

*   **Relevant Files:**
    *   `templates/history.html`: Main HTML structure for the page.
    *   `static/js/history.js`: Core JavaScript logic for interactivity, data fetching, processing, and chart rendering.
    *   `static/css/history.css`: Styles specific to the history page, including UI polish elements like distinct card header borders, enhanced hover states for insight items, and animations for value updates.
*   **Process:**
    1.  **Page Load:** Renders `history.html`.
    2.  **Initialization (`history.js`):**
        *   Sets up event listeners for time range buttons.
        *   Initializes empty Chart.js instances for temperature, humidity, and light.
        *   Triggers an initial data load for the default time range (24 Hours).
    3.  **Data Fetching & Processing:**
        *   `loadHistoricalData()`:
            *   Requests data from the `/history/data` API.
            *   Displays loading indicators.
        *   `processSensorData()`:
            *   Receives raw API data and processes it for each sensor type (`temps`, `humidities`, `lights`).
            *   Handles client-side filtering for the "1hour" range.
            *   Performs downsampling for the "1day" range.
            *   Ensures that data points corresponding to true Min/Max values (for insights) are included in the data sent to the chart, especially for "1day", "7day", and "30day" ranges.
            *   Calculates insights (min, max, overall average).
    4.  **Chart Rendering & Insight Display:**
        *   `updateGenericChart()`: Updates the respective Chart.js instance with processed data, configuring datasets, labels, colors, and X-axis time scale.
        *   `updateGenericInsights()`: Populates the HTML elements with calculated min, max, and average values.

## 3. Detailed Frontend Implementation (`static/js/history.js`)

### 3.1. Core Components & Variables

*   **Chart Instances:** `temperatureChart`, `humidityChart`, `lightChart` (global Chart.js objects).
*   **`currentSelectedRange`:** String variable tracking the active time range (e.g., "1hour", "1day").
*   **`chartColors`:** Object mapping greenhouse section names (e.g., `dewasa`) to specific colors for chart lines.

### 3.2. Initialization (`DOMContentLoaded`)

1.  `setupTimeRangeButtons()`: Attaches click event listeners to time range buttons. On click:
    *   Updates the active button's style.
    *   Sets `currentSelectedRange`.
    *   Calls `loadHistoricalData()` to refresh charts.
2.  `initTemperatureChart()`, `initHumidityChart()`, `initLightChart()`:
    *   Get the canvas context for each chart.
    *   Create a new `Chart` instance with initial (empty) data and options.
    *   Configure:
        *   `type: 'line'`.
        *   `responsive: true`, `maintainAspectRatio: false`.
        *   X-axis: `type: 'time'`, title "Waktu".
        *   Y-axis: Specific titles (e.g., "Suhu (°C)", "Kelembaban (%)", "Intensitas Cahaya (lux)") and `beginAtZero` settings where appropriate (e.g., `true` for light).
        *   Plugins: Legend position, tooltip behavior.
3.  `loadHistoricalData(currentSelectedRange)`: Initiates the first data load.

### 3.3. Data Loading and Orchestration (`loadHistoricalData`)

1.  Displays a global loading indicator.
2.  Clears any previously displayed insights for all three charts using `update<Sensor>Insights(null)`.
3.  Determines `daysToFetchAPI` based on `selectedRange` (1 day for "1hour", or the number of days for "Xday").
4.  Fetches data from `/history/data?days=<daysToFetchAPI>`.
5.  Upon receiving a successful API response:
    *   For each sensor type (`temps`, `humidities`, `lights`):
        *   Calls `processSensorData(apiResponse.data, selectedRange, <sensorType>)` to get processed chart data and insights.
        *   Calls `update<Sensor>Chart()` to render the chart.
        *   Calls `update<Sensor>Insights()` to display min/max/avg.
        *   Calls `checkAndShowNoDataError()` to display a "no data" message if applicable for that specific chart.
6.  Handles API errors or unsuccessful responses by showing an error message.

### 3.4. Data Processing (`processSensorData`)

This is a crucial generic function responsible for transforming raw API data into a format suitable for charting and insights display.

*   **Parameters:** `apiData` (array from backend), `selectedRange` (string), `sensorType` (string: 'temps', 'humidities', 'lights').
*   **Steps:**
    1.  **Insight Calculation Data (`dataForInsightCalculation`):**
        *   If `selectedRange` is "1hour", filters `apiData` to include only data points from the last 60 minutes.
        *   Otherwise, uses the full `apiData` for the selected period.
        *   This dataset is used to find the true min, max, and calculate the overall average for the insights display.
    2.  **True Min/Max Identification:** Iterates through `dataForInsightCalculation` to find the absolute minimum and maximum average values for the given `sensorType` across all sections, along with their timestamps, sections, and original data point objects.
    3.  **Chart Display Data Preparation (`dataForChartDisplayPoints`):**
        *   **"1hour":** Uses the client-side filtered data (last 60 minutes).
        *   **"1day":**
            *   Downsamples `apiData` to roughly 15-minute intervals to reduce the number of points on the chart.
            *   The first and last points of the `apiData` are always included.
        *   **"7day" / "30day":** Starts with the full `apiData` for the period.
    4.  **Ensuring Min/Max Point Visibility (for "1day", "7day", "30day"):**
        *   The `originalPoint` objects corresponding to the `trueMin` and `trueMax` (identified in step 2) are explicitly added to `dataForChartDisplayPoints`.
        *   This list is then de-duplicated (based on timestamp) and sorted chronologically. This ensures that the exact data points shown in the insights are always plotted and interactive on the chart.
    5.  **Final Chart Data Construction:**
        *   Iterates through the `finalDataForChartDisplay` (which is `dataForChartDisplayPoints` after potential modifications).
        *   For each point and each valid section (`dewasa`, `remaja`, `penyemaian`, `averages`), extracts the `avg` value for the current `sensorType`.
        *   Formats these as `{ x: DateObject, y: value }` and pushes them into the appropriate arrays within the `chartData` object (e.g., `chartData.dewasa`, `chartData.remaja`).
    6.  **Return Value:** Returns an object `{ chartData, insightsData }`.
        *   `chartData`: Data structured for Chart.js datasets.
        *   `insightsData`: Object containing `{ min, max, overallAverage }`.

### 3.5. Chart Rendering (`updateGenericChart`)

*   **Parameters:** `chartInstance`, `chartData` (from `processSensorData`), `selectedRange`, `sensorLabel` (e.g., "Suhu").
*   **Steps:**
    1.  Clears previous datasets from `chartInstance.data.datasets`.
    2.  Iterates through each section in `chartData` (e.g., `dewasa`, `remaja`).
    3.  If data exists for the section:
        *   Creates a new Chart.js dataset object with:
            *   `label`: e.g., "Dewasa Suhu".
            *   `data`: The array of `{x, y}` points.
            *   `borderColor`, `backgroundColor` (derived from `chartColors`).
            *   `tension`, `borderWidth`, `pointRadius` (adjusted based on `selectedRange` - smaller/no points for longer ranges).
            *   `fill` (e.g., `true` for 'averages' line).
            *   `order` (to ensure 'averages' line might render on top or bottom as desired).
        *   Pushes the dataset to `chartInstance.data.datasets`.
    4.  **X-axis Time Scale Configuration:** Dynamically adjusts the X-axis `time.unit`, `time.tooltipFormat`, and `time.displayFormats` based on `selectedRange` to optimize label readability (e.g., 'minute' for "1hour", 'hour' for "1day", 'day' for "7day"/"30day").
    5.  Calls `chartInstance.update()` to re-render the chart.

### 3.6. Insights Display (`updateGenericInsights`)

*   **Parameters:** `insights` (from `processSensorData`), `sensorPrefix` (e.g., "Temp", "Humidity", "Light"), `unit` (e.g., "°C", "%", " lux"), and localized label prefixes.
*   **Steps:**
    1.  Gets references to the HTML elements for min value, min subtext, max value, max subtext, avg value, and avg subtext using the `sensorPrefix`.
    2.  If `insights.min` exists, formats and displays the min value and subtext (section and formatted timestamp).
    3.  If `insights.max` exists, formats and displays the max value and subtext.
    4.  If `insights.overallAverage` exists, formats and displays the average value.
    5.  If data is not available for any insight, displays "--" and "Tidak ada data".
    *   Triggers a brief CSS animation on an `.insight-value` element when its text content changes, providing visual feedback for data updates.

### 3.7. UI Feedback

*   `showLoadingState(containerId)`, `hideLoadingState(containerId)`, `showErrorState(containerId, message)`: Helper functions to manage the display of loading messages ("Memuat data...") and error messages within the specified chart container.
*   `checkAndShowNoDataError(containerId, chartData, insightsData)`: Checks if `chartData` is empty for a specific chart and calls `showErrorState` with "Tidak ada data untuk periode terpilih." if needed. Also clears insights for that chart.

## 4. Future Considerations / Potential Enhancements

*   **Per-Chart Loading/Error States:** Currently, a global loading message is shown. Individual loading states for each chart could improve UX.
*   **Custom Date Range Picker:** Allow users to select custom date ranges instead of predefined ones.
*   **Data Export:** Option to export chart data (e.g., as CSV).
*   **Performance for Very Large Datasets:** For extremely long time ranges or very high-frequency data, further backend aggregation or more sophisticated downsampling might be needed.
*   **Unit Testing:** Implementing unit tests for `processSensorData` and other key logic.

---
*This documentation provides a comprehensive guide to the current history page implementation.*
