<!--
Section Naming Convention Update (as of recent changes):
- 'Penyemaian' is now referred to as 'Peremajaan'.
- 'Remaja' is now referred to as 'Meja Apung'.
This document reflects these updated names.
-->
# Greenhouse Monitoring: History Page Implementation

## 1. Introduction

This document details the implementation of the "Data Riwayat" (History Page) for the Lokatani Greenhouse Monitoring system. This page allows users to visualize and analyze historical sensor data, including temperature, humidity, and light intensity, collected from various sections of the greenhouse: `Peremajaan` (Seedling/Rejuvenation), `Meja Apung` (Floating Table/Young Plants), and `Dewasa` (Mature Plants), as well as overall `Averages`.

**Key Features:**

*   **Multi-Sensor Visualization:** Displays separate, interactive line charts for Temperature, Humidity, and Light Intensity.
*   **Time Range Selection for Charts:** Users can select predefined time ranges for chart display:
    *   1 Jam (1 Hour): Shows data at approximately 1-minute intervals.
    *   24 Jam (24 Hours / 1 Day): Shows data at approximately 15-minute intervals.
    *   7 Hari (7 Days): Shows data at approximately 1-hour intervals.
    *   30 Hari (30 Days): Shows data at approximately 3-hour intervals.
*   **Data Insights:** For each sensor type and selected chart range, the page displays:
    *   Minimum value (with section and timestamp).
    *   Maximum value (with section and timestamp).
    *   Overall average value for the period, calculated from the 'averages' data stream.
*   **Responsive Design:** Charts and layout adapt to different screen sizes.
*   **Localization:** UI elements are primarily in Bahasa Indonesia.
*   **Dynamic Data Loading:** Data is fetched asynchronously from a backend API.
*   **Data Export to Excel:** Users can export historical data for selected time ranges (1 Hour, 24 Hours, 7 Days, and 30 Days). Aggregation for export differs from chart display for longer ranges (see section 4).

## 2. System Architecture & Data Flow

The history feature involves several components working together:

```mermaid
sequenceDiagram
    participant User
    participant Browser (Frontend - history.js)
    participant Flask App (Backend - routes.py, firestore.py)
    participant Firestore DB (greenhouse_data collection)
    participant MQTT Broker
    participant Sensor/Simulator (publishes to MQTT)
    participant Data Aggregator (mqtt_to_firestore.py)

    Sensor/Simulator->>MQTT Broker: Publishes raw sensor data (JSON)
    Data Aggregator->>MQTT Broker: Subscribes to sensor data topic
    Data Aggregator->>Data Aggregator: Aggregates data (1-min intervals, stats)
    Data Aggregator->>Firestore DB: Stores 1-minute aggregated stats

    User->>Browser (Frontend - history.js): Navigates to History Page
    Browser (Frontend - history.js)->>Flask App (Backend - routes.py, firestore.py): GET /history/
    Flask App (Backend - routes.py, firestore.py)-->>Browser (Frontend - history.js): Serves history.html

    User->>Browser (Frontend - history.js): Selects Time Range (e.g., 7 Days)
    Browser (Frontend - history.js)->>Flask App (Backend - routes.py, firestore.py): GET /history/data?days=X
    Flask App (Backend - routes.py, firestore.py)->>Firestore DB (greenhouse_data collection): Queries 1-min aggregated data (with sampling for longer ranges)
    Firestore DB (greenhouse_data collection)-->>Flask App (Backend - routes.py, firestore.py): Returns sampled/raw 1-min data
    Flask App (Backend - routes.py, firestore.py)-->>Browser (Frontend - history.js): Responds with JSON data (timestamps converted to WIB)

    Browser (Frontend - history.js)->>Browser (Frontend - history.js): Processes data (client-side filtering/downsampling for charts) & renders charts (Chart.js)

    Note over User, Browser (Frontend - history.js): User clicks "Export to Excel"
    Browser (Frontend - history.js)->>Flask App (Backend - routes.py, firestore.py): GET /history/export_excel?range=X
    Flask App (Backend - routes.py, firestore.py)->>Firestore DB (greenhouse_data collection): Queries 1-min aggregated data
    Firestore DB (greenhouse_data collection)-->>Flask App (Backend - routes.py, firestore.py): Returns 1-min data
    Flask App (Backend - routes.py, firestore.py)->>Flask App (Backend - routes.py, firestore.py): Performs specific aggregation for 7/30 day Excel export
    Flask App (Backend - routes.py, firestore.py)-->>Browser (Frontend - history.js): Sends Excel file as download
```

### 2.1. Data Ingestion & Storage

*   **Source:** `Hardware/simulation/mqtt_to_firestore.py` (Data Aggregator)
*   **Process:**
    1.  Subscribes to an MQTT topic (`lokatech/greenhouse/sensors`) where sensor data is published.
    2.  Collects readings over a **1-minute interval**.
    3.  For each section (`peremajaan`, `meja_apung`, `dewasa`) and overall `averages`, calculates statistics (average, min, max, median, count of raw readings within that minute).
    4.  Saves these 1-minute aggregated statistics as a new document in the `greenhouse_data` collection in Firestore. Each document is timestamped (UTC).

### 2.2. Backend (Flask Application)

*   **Relevant Files:**
    *   `blueprints/history/routes.py`: Defines API endpoints and page rendering logic.
    *   `blueprints/history/firestore.py`: Handles interaction with Firestore for fetching data.
*   **API Endpoint: `GET /history/data`**
    *   **Purpose:** Provides historical sensor data to the frontend for chart display.
    *   **Query Parameters:**
        *   `days` (integer, optional, default: `7`): Specifies the number of past days of data to retrieve.
    *   **Processing (`blueprints/history/firestore.py` - `get_historical_data`):**
        *   If `days <= 1`: Fetches up to 1500 of the most recent 1-minute aggregated documents from Firestore.
        *   If `days > 1`: Employs a sampling strategy:
            *   For `days <= 7` (e.g., 7-day range): Targets `days * 24` points (approx. 1 point per hour).
            *   For `days > 7` (e.g., 30-day range): Targets `days * 8` points (approx. 1 point per 3 hours).
        *   Converts UTC timestamps from Firestore to WIB (Asia/Jakarta) ISO 8601 strings.
    *   **Response:** Returns a JSON object:
        ```json
        {
          "success": true,
          "data": [
            {
              "timestamp": "YYYY-MM-DDTHH:MM:SS+07:00", // WIB
              "data": { // Contains 'stats' from the 1-minute aggregated Firestore document
                "dewasa": {
                  "temps": { "avg": 25.5, "min": 24.0, "max": 26.0, "median": 25.5, "count": 30 }, // Example 'count' from 1-min aggregation
                  "humidities": { /* ... */ },
                  "lights": { /* ... */ }
                },
                "meja_apung": { /* ... */ },
                "peremajaan": { /* ... */ },
                "averages": { /* ... */ }
              }
            }
            // ... more data points
          ]
        }
        ```

### 2.3. Frontend (Browser)

*   **Relevant Files:**
    *   `templates/history.html`: Main HTML structure.
    *   `static/js/history.js`: Core JavaScript logic.
    *   `static/js/history_export.js`: Handles Excel export button interactions.
    *   `static/css/history.css`: Page-specific styles.
*   **Process:**
    1.  **Page Load & Initialization (`history.js`):** Sets up UI, Chart.js instances, and triggers initial data load (default: 24 Hours).
    2.  **Data Fetching (`loadHistoricalData`):** Requests data from `/history/data` based on selected range.
    3.  **Data Processing for Charts (`processSensorData`):**
        *   Receives data from the backend (which is already sampled for 7/30 day ranges).
        *   **1 Hour Chart:** Filters the 1-day backend data to the last 60 minutes. Uses these 1-minute interval points.
        *   **24 Hour (1 Day) Chart:** Downsamples the 1-day backend data to approximately 15-minute intervals.
        *   **7 Day Chart:** Uses the backend-provided data (approx. 1-hour intervals).
        *   **30 Day Chart:** Uses the backend-provided data (approx. 3-hour intervals).
        *   For all ranges, ensures data points corresponding to true Min/Max values (for insights) are included in the chart data.
        *   Calculates insights (min, max, overall average from the 'averages' stream).
    4.  **Chart Rendering & Insight Display:** Updates Chart.js instances and insight display elements.

## 3. Detailed Frontend Implementation (`static/js/history.js`)

### 3.1. Core Components & Variables

*   **Chart Instances:** `temperatureChart`, `humidityChart`, `lightChart`.
*   **`currentSelectedRange`:** Tracks active time range (e.g., "1hour", "1day").
*   **`chartColors`:** Maps section names (`dewasa`, `meja_apung`, `peremajaan`, `averages`) to chart line colors.

### 3.2. Initialization (`DOMContentLoaded`)

*   `setupTimeRangeButtons()`: Attaches listeners to time range buttons.
*   `initTemperatureChart()`, `initHumidityChart()`, `initLightChart()`: Initializes Chart.js instances with configurations (axes, titles, tooltips).
*   `loadHistoricalData(currentSelectedRange)`: Initiates the first data load.

### 3.3. Data Loading and Orchestration (`loadHistoricalData`)

*   Manages loading indicators and fetches data from `/history/data`.
*   Orchestrates calls to `processSensorData`, chart update functions, and insight display functions for each sensor type.

### 3.4. Data Processing for Charts (`processSensorData`)

This is a crucial generic function responsible for transforming raw API data into a format suitable for charting and insights display.

*   **Parameters:** `apiData` (array from backend), `selectedRange` (string), `sensorType` (string: 'temps', 'humidities', 'lights').
*   **Key Steps for Chart Data Preparation:**
    1.  **Data for Insight Calculation:**
        *   For "1hour" range: Uses data from the last 60 minutes.
        *   For other ranges: Uses the data as provided by the backend (which is already sampled for 7/30 days).
        *   This subset is used to find the true min/max values for the insight boxes.
    2.  **Data for Chart Display Points (`dataForChartDisplayPoints`):**
        *   **"1hour":** Uses the client-side filtered data (last 60 minutes, effectively 1-minute intervals).
        *   **"1day":** Downsamples the full day of 1-minute data from the backend to approximately 15-minute intervals.
        *   **"7day":** Uses the data directly from the backend (which was sampled to approx. 1-hour intervals).
        *   **"30day":** Uses the data directly from the backend (which was sampled to approx. 3-hour intervals).
    3.  **Min/Max Point Inclusion:** Ensures that the specific data points representing the true minimum and maximum values (for insights) are included in the `dataForChartDisplayPoints` to be plotted. This makes insights visually verifiable on the chart.
    4.  **Chart.js Formatting:** Transforms `dataForChartDisplayPoints` into the `{x: DateObject, y: value}` format required by Chart.js for each section.
*   **Return Value:** `{ chartData, insightsData }`.

### 3.5. Chart Rendering (`updateGenericChart`)

*   Updates the Chart.js instance with new data.
*   Sets dataset properties (labels, colors, point radius based on range).
*   Configures X-axis time scale units and formats dynamically based on `selectedRange` for optimal readability.

### 3.6. Insights Display (`updateGenericInsights`)

*   Populates HTML elements with min, max, and average values, including section names (e.g., "Meja Apung") and timestamps.
*   Uses `formatSectionNameForDisplay` to correctly show "Meja Apung" and "Peremajaan".

### 3.7. UI Feedback

*   Functions like `showLoadingState`, `hideLoadingState`, `showErrorState`, and `checkAndShowNoDataError` manage user feedback during data operations.

## 4. Excel Data Export Feature

This section details the functionality for exporting historical sensor data to Microsoft Excel (`.xlsx`) format.

### 4.1. Overview

Dedicated buttons allow users to export data. Aggregation for export is distinct from chart display for longer ranges to provide comprehensive summaries.

### 4.2. Available Export Ranges & Data Aggregation for Excel

*   **Export 1 Jam:**
    *   **Data:** Sensor data from the **last one hour**.
    *   **Interval:** Original 1-minute aggregated data from Firestore.
    *   **Aggregation:** None beyond the initial 1-minute aggregation.
*   **Export 1 Hari:**
    *   **Data:** Sensor data from the **last 24 hours**.
    *   **Interval:** Original 1-minute aggregated data from Firestore.
    *   **Aggregation:** None beyond the initial 1-minute aggregation.
*   **Export 1 Minggu:**
    *   **Data:** Sensor data for the **last 7 days**.
    *   **Interval:** Data is **aggregated by the backend into 10-minute intervals** for the Excel file.
    *   **Aggregation:** Average, Minimum, Maximum, and total Count (of underlying 1-minute records) are calculated for each 10-minute interval. Median is **not** calculated.
*   **Export 30 Hari:**
    *   **Data:** Sensor data for the **last 30 days**.
    *   **Interval:** Data is **aggregated by the backend into hourly intervals** for the Excel file.
    *   **Aggregation:** Average, Minimum, Maximum, and total Count (of underlying 1-minute records) are calculated for each hourly interval. Median is **not** calculated.

### 4.3. How to Use

1.  Navigate to the "Riwayat Data" page.
2.  Under "Ekspor Data ke Excel", click the desired export button.
3.  The browser will download the generated Excel file.

### 4.4. Excel File Structure and Column Explanation

| Column Header     | Description                                                                                                                                                              | Data Type     | Notes                                                                                                                                       |
| :---------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------ | :------------------------------------------------------------------------------------------------------------------------------------------ |
| **Timestamp (WIB)** | The date and time (WIB, UTC+7). For 1-hour/1-day exports, it's the timestamp of the 1-minute aggregated record. For 7-day/30-day exports, it's the start of the 10-minute/hourly aggregation interval. | Date/Time     |                                                                                                                                             |
| **Section**         | Greenhouse section: `Dewasa`, `Meja Apung`, `Peremajaan`, or `Averages`.                                                                                                | Text          |                                                                                                                                             |
| **Sensor Type**     | `Suhu` (Temperature), `Kelembaban` (Humidity), or `Intensitas Cahaya` (Light Intensity).                                                                                 | Text          |                                                                                                                                             |
| **Average**         | For 1-hour/1-day exports: the 'avg' from the 1-minute Firestore record. For 7-day/30-day exports: the calculated average over the 10-minute/hourly interval.             | Number        | Units: Suhu (°C), Kelembaban (%), Intensitas Cahaya (lux).                                                                    |
| **Min**             | For 1-hour/1-day exports: the 'min' from the 1-minute Firestore record. For 7-day/30-day exports: the minimum 'min' observed among the 1-minute records within the interval. | Number        | Units match sensor type.                                                                                                                |
| **Max**             | For 1-hour/1-day exports: the 'max' from the 1-minute Firestore record. For 7-day/30-day exports: the maximum 'max' observed among the 1-minute records within the interval. | Number        | Units match sensor type.                                                                                                                |
| **Median**          | For 1-hour/1-day exports: the 'median' from the 1-minute Firestore record. **BLANK** for 7-day/30-day exports.                                                          | Number        |                                                                                                                                             |
| **Count**           | For 1-hour/1-day exports: the 'count' from the 1-minute Firestore record (number of raw readings in that minute). For 7-day/30-day exports: the sum of 'counts' from all 1-minute Firestore records aggregated into that 10-minute/hourly interval. | Integer       | Reflects data density.                                                                                                                                             |

### 4.5. Technical Implementation Details for Export

*   **Backend Endpoint:** `GET /history/export_excel` (in `blueprints/history/routes.py`).
    *   Fetches 1-minute aggregated data using `get_historical_data`.
    *   Performs further aggregation for 7-day (10-minute intervals) and 30-day (hourly intervals) ranges in Python.
    *   Uses `openpyxl` to create the Excel file.
*   **Frontend Interaction:** `static/js/history_export.js` handles button clicks, `fetch` requests, and file download initiation or error display.

## 5. Future Considerations / Potential Enhancements

*   **Per-Chart Loading/Error States:** Enhance UX with individual loading indicators for each chart.
*   **Custom Date Range Picker:** Allow users to select arbitrary date/time ranges.
*   **Advanced Export Options:**
    *   Option to choose raw vs. aggregated data for longer export ranges.
    *   CSV export option.
*   **Performance Optimization:** For very large datasets, further optimize backend queries or consider pre-aggregated summary collections in Firestore for extremely long ranges.
---
*This documentation provides a comprehensive guide to the current history page implementation.*
