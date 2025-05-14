# History Page Documentation (New Implementation)

## 1. Overview

The History page allows users to visualize historical sensor data (temperature, humidity, light) from the greenhouse. Data is fetched from a backend API and displayed using Chart.js. Users can select different time ranges (1 Hour, 24 Hours, 7 Days, 30 Days) to view the data. The page also provides key insights such as minimum, maximum, and average values for the selected period, presented in a refined UI. Chart X-axis labels are optimized for readability across different time ranges.

## 2. Backend API and Data Flow

The frontend interacts with the `/history/data` API endpoint to retrieve historical data.

1.  **Data Ingestion (`Hardware/simulation/mqtt_to_firestore.py`):**
    *   Sensor data (JSON) is published to an MQTT topic.
    *   The `mqtt_to_firestore.py` script subscribes to this topic.
    *   It aggregates data over `COLLECTION_INTERVAL_MINUTES`.
    *   Calculates statistics (avg, min, max, median, count) for each sensor type (`temps`, `humidities`, `lights`) and section (`penyemaian`, `remaja`, `dewasa`, `averages`).
    *   Saves these aggregated statistics as a document (ID: timestamp string) into the **`greenhouse_data`** collection in Firestore. Each document includes a Firestore `timestamp` field (UTC).

2.  **Frontend API Request (`static/js/history.js`):**
    *   When a time range is selected, `loadHistoricalData(selectedRange)` is called.
    *   For "1hour" range, it requests 1 day of data. For other ranges, it requests data for the specified number of days.
    *   Example API call: `fetch('/history/data?days=<days_to_fetch>')`.

3.  **Backend API Processing (`blueprints/history/routes.py` & `blueprints/history/firestore.py`):**
    *   The `/history/data` endpoint queries the `greenhouse_data` collection for documents where the `timestamp` is within the requested range (based on `days` parameter).
    *   It processes these documents, converting UTC timestamps to WIB (Asia/Jakarta) ISO strings.
    *   Returns a JSON object: `{"success": true, "data": [...]}`.

4.  **Frontend Rendering (`static/js/history.js`):**
    *   `processTemperatureData` (and similar functions for other types) parses the API response. If "1hour" range was selected, it filters the received 1-day data on the client-side to the last 60 minutes.
    *   `updateTemperatureChart` (and others) uses this processed data to render the charts.
    *   `updateTemperatureInsights` displays calculated min, max, and average values.

### API Endpoint Details

*   **Endpoint:** `GET /history/data`
    *   **Purpose:** Fetches historical data series.
    *   **Query Parameters:**
        *   `days` (integer, optional, default: `7`): Number of past days of data to retrieve.
        *   `section` (string, optional): Filter by section (e.g., `dewasa`, `remaja`, `penyemaian`, `averages`).
        *   `type` (string, optional): Filter by data type (e.g., `temps`, `humidities`, `lights`).
    *   **Successful JSON Response Structure (example for `?days=1`):**
        ```json
        {
          "success": true,
          "data": [
            {
              "timestamp": "2023-10-27T10:00:00+07:00", // ISO 8601 format, WIB
              "data": {
                "dewasa": {
                  "temps": { "avg": 25.5, "min": 24.0, ... },
                  // ... other data types and sections
                }
              }
            }
            // ... more data points ...
          ]
        }
        ```

## 3. Frontend Implementation Details (Temperature Chart Example)

This section details the frontend components responsible for fetching, processing, and displaying the temperature history. Similar logic applies to other sensor types (humidity, light) when implemented.

### 3.1. HTML Structure (`templates/history.html`)

*   Extends `base.html`.
*   **Time Range Selector:**
    *   A `div.time-range-selector-container` contains buttons for "1 Hour", "24 Hours", "7 Days", and "30 Days".
    *   Each button has a `data-range` attribute (e.g., `"1hour"`, `"1day"`, `"7day"`, `"30day"`) and an icon.
*   **Temperature Chart Card:**
    *   A `div.card` contains the chart and insights.
    *   Chart Canvas: `<canvas id="temperatureChart"></canvas>` within `div.chart-container`.
    *   Insights Section: `div.chart-insights` with child `div.insight-item` for Min, Max, and Avg. Each item has:
        *   `span.insight-label` (with icon)
        *   `span.insight-value` (e.g., `id="minTempInsightValue"`)
        *   `span.insight-subtext` (e.g., `id="minTempInsightSubtext"`)

### 3.2. CSS Styling (`static/css/history.css`)

*   Styles for the time range selector, buttons (including active state), and icons.
*   Styles for chart containers, ensuring responsiveness.
*   Refined styling for the "Insights" section:
    *   Uses CSS Grid for a responsive layout of individual insight items.
    *   Each `.insight-item` is styled as a distinct "card" or "box" with borders, rounded corners, and hover effects.
    *   Typography and spacing are optimized for labels, values, and sub-texts.
*   Styles for loading and error messages within chart containers.

### 3.3. JavaScript Logic (`static/js/history.js`)

*   **Global Variables:**
    *   `temperatureChart`: Holds the Chart.js instance for the temperature chart.
    *   `currentSelectedRange`: Stores the currently active time range (e.g., `"1hour"`, `"1day"`). Default is `"1day"`.
    *   `chartColors`: Maps greenhouse section names to colors for chart lines.
*   **Initialization (`DOMContentLoaded` event):**
    *   `setupTimeRangeButtons()`: Attaches click listeners to time range buttons. These listeners update `currentSelectedRange` and call `loadHistoricalData()`.
    *   `initTemperatureChart()`: Initializes an empty Chart.js line chart for temperature with basic options (responsiveness, tooltips, legend) and X/Y axis configurations.
    *   `loadHistoricalData(currentSelectedRange)`: Called to load initial data.
*   **Data Fetching (`loadHistoricalData(selectedRange)`):**
    *   Displays a loading state.
    *   Determines `daysToFetchAPI`:
        *   If `selectedRange` is `"1hour"`, `daysToFetchAPI` is set to `1` (fetches the last 24 hours of data from the API).
        *   If `selectedRange` ends with `"day"` (e.g., `"1day"`, `"7day"`), `daysToFetchAPI` is parsed from the string.
    *   Makes a `fetch` request to `/history/data?days=${daysToFetchAPI}`.
    *   On successful response:
        *   Calls `processTemperatureData(apiResponse.data, selectedRange)` to process and filter the data.
        *   Calls `updateTemperatureChart(processedData.chartData, selectedRange)` to render the chart.
        *   Calls `updateTemperatureInsights(processedData.insightsData)` to display summary statistics.
        *   Handles cases where no data is available for the selected range.
    *   Handles API errors and displays an error message.
*   **Data Processing (`processTemperatureData(apiData, selectedRange)`):**
    *   **Insight Calculation Data:**
        *   If `selectedRange` is `"1hour"`, `apiData` is first filtered to the last 60 minutes. This filtered data (`dataForInsightCalculation`) is used for insight calculations.
        *   For `"1day"`, `"7day"`, and `"30day"`, the full `apiData` received for the period is used as `dataForInsightCalculation`.
    *   **True Min/Max Identification:** The absolute minimum and maximum temperature points (value, timestamp, section, and the original data point object) are identified from `dataForInsightCalculation`.
    *   **Chart Display Data (`dataForChartDisplay`):**
        *   If `selectedRange` is `"1hour"`, `dataForChartDisplay` is the same as `dataForInsightCalculation` (last 60 minutes, no further downsampling).
        *   If `selectedRange` is `"1day"` (24 Hours):
            *   `apiData` is initially downsampled to approximately 15-minute intervals (selecting the first point, last point, and points in between).
            *   The original data point objects corresponding to the true Min and true Max temperatures (identified above) are then explicitly added to this downsampled list.
            *   The list is then de-duplicated (by timestamp) and sorted chronologically to form the final `dataForChartDisplay`. This ensures the key Min/Max points are visible on the chart while keeping it relatively uncluttered.
        *   For `"7day"` and `"30day"` ranges, `dataForChartDisplay` is the full `apiData` received for that period.
    *   Iterates through `dataForChartDisplay` to populate `chartData` (e.g., `chartData.dewasa = [{x: Date, y: value}, ...]`) for each section.
    *   Calculates overall insights (min, max, average temperature) using the `trueMinTemp`, `trueMaxTemp`, and averages calculated from `dataForInsightCalculation`.
    *   Returns an object `{ chartData, insightsData }`.
*   **Chart Rendering (`updateTemperatureChart(chartData, selectedRange)`):**
    *   Clears previous datasets from `temperatureChart`.
    *   For each section in `chartData` with data points:
        *   Creates a new Chart.js dataset with appropriate labels, data, colors, and styling (e.g., `pointRadius` is larger for "1hour" and "1day" views).
    *   Configures the X-axis `time` scale based on `selectedRange`:
        *   **"1hour"**: `unit: 'minute'`, `displayFormats: { minute: 'HH:mm' }`, `tooltipFormat: 'HH:mm:ss'`. `ticks.stepSize` (e.g., 5 minutes) is set for appropriate tick intervals.
        *   **"1day"**: `unit: 'hour'`, `displayFormats: { hour: 'HH:mm' }`, `tooltipFormat: 'HH:mm'`. `ticks.stepSize` is set to `undefined` to allow Chart.js auto-scaling.
        *   **"7day" / "30day"**: `unit: 'day'`, `displayFormats: { day: 'MMM d' }`. `ticks.stepSize` is `undefined`.
    *   Calls `temperatureChart.update()` to re-render the chart.
*   **Insights Display (`updateTemperatureInsights(insights)`):**
    *   Updates the content of HTML elements (`#minTempInsightValue`, `#minTempInsightSubtext`, etc.) with the calculated min, max, and average temperatures.
    *   Formats timestamps for min/max insights (e.g., "Lowest in Dewasa at 16:20, May 12").
    *   Provides descriptive sub-text (e.g., "Period average").
    *   Handles cases where no insight data is available.
*   **UI Feedback (`showLoadingState`, `hideLoadingState`, `showErrorState`):**
    *   Functions to manage the display of loading and error messages within the chart container.

---
*Further phases will be documented here as development progresses.*
