# History Page Documentation (New Implementation)

## 1. Overview

The History page allows users to visualize historical sensor data (temperature, humidity, light) from the greenhouse. Data is fetched from a backend API and displayed using Chart.js. Users can select different time ranges (1 Hour, 24 Hours, 7 Days, 30 Days) to view the data. The page also provides key insights such as minimum, maximum, and average values for the selected period, presented in a refined UI. Chart X-axis labels are optimized for readability across different time ranges. The UI is partially localized to Bahasa Indonesia.

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

## 3. Frontend Implementation Details (Temperature & Humidity Chart Example)

This section details the frontend components responsible for fetching, processing, and displaying the temperature and humidity history. Similar logic will apply to light levels when implemented.

### 3.1. HTML Structure (`templates/history.html`)

*   Extends `base.html`.
*   UI text is partially localized to Bahasa Indonesia (e.g., "Data Riwayat", "Pilih Rentang Waktu", "Riwayat Suhu", "Riwayat Kelembaban").
*   **Time Range Selector:**
    *   A `div.time-range-selector-container` contains buttons for "1 Jam", "24 Jam", "7 Hari", and "30 Hari".
    *   Each button has a `data-range` attribute (e.g., `"1hour"`, `"1day"`, `"7day"`, `"30day"`) and an icon.
*   **Temperature Chart Card:**
    *   A `div.card` contains the chart and insights for temperature.
    *   Chart Canvas: `<canvas id="temperatureChart"></canvas>` within `div.chart-container#temperatureChartContainer`.
    *   Insights Section: `div.chart-insights#temperatureInsights` with items for Min, Max, and Avg temperature (e.g., `#minTempInsightValue`).
*   **Humidity Chart Card:**
    *   A similar `div.card` structure for humidity.
    *   Chart Canvas: `<canvas id="humidityChart"></canvas>` within `div.chart-container#humidityChartContainer`.
    *   Insights Section: `div.chart-insights#humidityInsights` with items for Min, Max, and Avg humidity (e.g., `#minHumidityInsightValue`).

### 3.2. CSS Styling (`static/css/history.css`)

*   Styles for the time range selector, buttons (including active state), and icons.
*   Styles for chart containers, ensuring responsiveness.
*   Refined styling for the "Insights" section:
    *   Uses CSS Grid for a responsive layout of individual insight items.
    *   Each `.insight-item` is styled as a distinct "card" or "box" with borders, rounded corners, and hover effects.
    *   Typography and spacing are optimized for labels, values, and sub-texts.
*   Styles for loading and error messages within chart containers.
*   Includes styling for humidity insight values (e.g., `#minHumidityInsightValue`).

### 3.3. JavaScript Logic (`static/js/history.js`)

*   **Global Variables:**
    *   `temperatureChart`, `humidityChart`: Hold Chart.js instances.
    *   `currentSelectedRange`: Stores the active time range.
    *   `chartColors`: Maps greenhouse section names to colors.
*   **Initialization (`DOMContentLoaded` event):**
    *   `setupTimeRangeButtons()`: Attaches click listeners.
    *   `initTemperatureChart()`: Initializes the temperature chart with Indonesian axis labels ("Waktu", "Suhu (°C)").
    *   `initHumidityChart()`: Initializes the humidity chart with Indonesian axis labels ("Waktu", "Kelembaban (%)").
    *   `loadHistoricalData(currentSelectedRange)`: Called to load initial data.
*   **Data Fetching (`loadHistoricalData(selectedRange)`):**
    *   Displays a global loading state (currently tied to the temperature chart container).
    *   Clears previous insights for both temperature and humidity.
    *   Makes a single `fetch` request to `/history/data?days=${daysToFetchAPI}` (API returns all sensor types).
    *   On successful response:
        *   Calls `processSensorData(apiResponse.data, selectedRange, 'temps')` for temperature.
        *   Calls `processSensorData(apiResponse.data, selectedRange, 'humidities')` for humidity.
        *   Calls `updateTemperatureChart()` and `updateTemperatureInsights()`.
        *   Calls `updateHumidityChart()` and `updateHumidityInsights()`.
        *   Calls `checkAndShowNoDataError()` for each chart container to display specific "no data" messages if applicable.
    *   Handles API errors.
*   **Data Processing (`processSensorData(apiData, selectedRange, sensorType)`):**
    *   This generic function processes data for a given `sensorType` ('temps' or 'humidities').
    *   **Insight Calculation Data:** Filters for "1hour" or uses full `apiData` for other ranges. This data is used to calculate the true min, max, and average values for the insights display.
    *   **True Min/Max Identification:** Identifies absolute min/max values (and their original data points) for the `sensorType` from `dataForInsightCalculation`.
    *   **Chart Display Data (`dataForChartDisplay`):**
        *   If `selectedRange` is `"1hour"`, `dataForChartDisplay` is the same as `dataForInsightCalculation` (last 60 minutes, no further downsampling).
        *   If `selectedRange` is `"1day"` (24 Hours):
            *   `apiData` is initially downsampled to approximately 15-minute intervals.
            *   The original data point objects corresponding to the true Min and true Max values (identified above) are then explicitly added to this downsampled list.
            *   The list is then de-duplicated (by timestamp) and sorted chronologically to form the final `dataForChartDisplay`.
        *   For `"7day"` and `"30day"` ranges:
            *   `dataForChartDisplay` starts with the full `apiData` received for that period.
            *   Similar to the "1day" range, the original data point objects corresponding to the true Min and true Max values are explicitly added to this list.
            *   The list is then de-duplicated (by timestamp) and sorted chronologically.
        *   This unified approach for "1day", "7day", and "30day" ensures the key Min/Max points are always visible and interactive on the chart, aligning with the insight values.
    *   Populates `chartData` for the `sensorType` (e.g., `chartData.dewasa = [{x: Date, y: value}, ...]`) using the final `dataForChartDisplay`.
    *   Calculates insights (min, max, overallAverage) for the `sensorType` using the values derived from `dataForInsightCalculation`.
    *   Returns an object `{ chartData, insightsData }`.
*   **Chart Rendering (`updateTemperatureChart`, `updateHumidityChart`, `updateGenericChart`):**
    *   `updateTemperatureChart` and `updateHumidityChart` call a common `updateGenericChart(chartInstance, chartData, selectedRange, sensorLabel)` function.
    *   `updateGenericChart` clears previous datasets, creates new datasets for each section with appropriate labels (e.g., "Dewasa Suhu", "Remaja Kelembaban"), data, and colors.
    *   Configures the X-axis `time` scale based on `selectedRange` (common for all charts).
    *   Calls `chartInstance.update()`.
*   **Insights Display (`updateTemperatureInsights`, `updateHumidityInsights`, `updateGenericInsights`):**
    *   `updateTemperatureInsights` and `updateHumidityInsights` call a common `updateGenericInsights(insights, sensorPrefix, unit, minLabelPrefix, maxLabelPrefix, avgLabelSubtext)` function.
    *   `updateGenericInsights` populates the respective HTML elements for min, max, and average values, using the correct unit ("°C" or "%") and localized labels (e.g., "Terendah di", "Tertinggi di").
*   **UI Feedback (`showLoadingState`, `hideLoadingState`, `showErrorState`):**
    *   Functions to manage loading/error messages. "Memuat data..." is used for loading. `checkAndShowNoDataError` handles "Tidak ada data untuk periode terpilih."

---
*Further phases will be documented here as development progresses.*
