# History Page Documentation (New Implementation)

This document details the design and implementation of the revamped History page.

## Overview

The History page allows users to visualize historical sensor data (temperature, humidity, light) from the greenhouse. Data is fetched from the backend API and displayed using Chart.js. It also provides key insights such as minimum, maximum, and average values for the selected period, presented in a refined UI. Chart X-axis labels are optimized for readability across different time ranges.

## Backend API and Data Flow

The frontend interacts with the `/history/data` API endpoint to retrieve historical data. Here's a summary of the data flow:

1.  **Data Ingestion (`Hardware/simulation/mqtt_to_firestore.py`):**
    *   Sensor data (JSON) is published to an MQTT topic.
    *   The `mqtt_to_firestore.py` script subscribes to this topic.
    *   It aggregates data over `COLLECTION_INTERVAL_MINUTES`.
    *   Calculates statistics (avg, min, max, median, count) for each sensor type (`temps`, `humidities`, `lights`) and section (`penyemaian`, `remaja`, `dewasa`, `averages`).
    *   Saves these aggregated statistics as a document (ID: timestamp string) into the **`greenhouse_data`** collection in Firestore. Each document includes a Firestore `timestamp` field (UTC).

2.  **Frontend API Request (`static/js/history.js`):**
    *   When a time range is selected, `loadHistoricalData(days)` calls `fetch('/history/data?days=<selected_days>')`.

3.  **Backend API Processing:**
    *   **Route (`blueprints/history/routes.py`):** The `/history/data` endpoint receives the request.
    *   **Firestore Logic (`blueprints/history/firestore.py`):**
        *   The `get_historical_data(days=...)` function is called.
        *   It queries the **`greenhouse_data`** collection for documents where the `timestamp` is within the requested range.
        *   It processes these documents, converting UTC timestamps to WIB (Asia/Jakarta) ISO strings.
    *   **Response:** The endpoint returns a JSON object: `{"success": true, "data": [...]}`.

4.  **Frontend Rendering (`static/js/history.js`):**
    *   `processTemperatureData` (and similar functions for other types) parses the API response.
    *   `updateTemperatureChart` (and others) uses this data to render the charts.

### API Endpoint Details

*   **Endpoint:** `GET /history/data`
    *   **Purpose:** Fetches historical data series.
    *   **Query Parameters:**
        *   `days` (integer, optional, default: `7`): Number of past days of data to retrieve.
        *   `section` (string, optional): Filter by section (e.g., `dewasa`, `remaja`, `penyemaian`, `averages`).
        *   `type` (string, optional): Filter by data type (e.g., `temps`, `humidities`, `lights`).
    *   **Data Source:** The backend currently queries the `greenhouse_data` collection in Firestore.
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
                  "humidities": { "avg": 60.1, ... },
                  "lights": { "avg": 5000, ... }
                },
                "remaja": { /* ...similar structure... */ },
                "penyemaian": { /* ...similar structure... */ },
                "averages": { /* ...similar structure... */ }
              }
            },
            // ... more data points ...
          ]
        }
        ```

## Phase 1: Basic Data Fetching & Single Chart Display (Temperature)

**Objective:** Implement the core logic to fetch data and display temperature data for all greenhouse sections on a single chart, along with key insights in an improved UI. X-axis time labels are optimized.

**HTML (`templates/history.html`):**
*   Time range selector (buttons for 24 Hours, 7 Days, 30 Days) with icons.
*   Container and canvas for the temperature chart.
*   An "Insights" section below the chart, structured with individual items for Min, Max, and Average temperature, each including a value and a sub-text area. Icons are added to insight labels.

**CSS (`static/css/history.css`):**
*   Enhanced styling for the time range selector.
*   Basic styling for the chart container.
*   Refined styling for the "Insights" section:
    *   Uses CSS Grid for responsive layout of insight items.
    *   Each insight item is styled as a distinct "card" or "box" with borders, rounded corners, and hover effects.
    *   Improved typography and spacing for insight labels, values, and sub-texts.
*   Styles for loading/error messages.

**JavaScript (`static/js/history.js`):**
*   **Global Variables:** `temperatureChart` instance, `currentDays` selection, `chartColors` for sections.
*   **Initialization (`DOMContentLoaded`):**
    *   Set up event listeners for time range buttons.
    *   Initialize an empty temperature chart.
    *   Load initial data (default 1 day).
*   **Time Range Logic:**
    *   Update `currentDays` on button click.
    *   Trigger data reloading.
*   **Chart Initialization (`initTemperatureChart`):**
    *   Configures X-axis ticks with `source: 'auto'` and `autoSkipPadding` for optimal readability.
*   **Data Fetching (`loadHistoricalData`):**
    *   Call `/history/data` API with the selected `days`.
    *   Handle API response (success/failure).
*   **Data Processing (`processTemperatureData`):**
    *   Extract `avg` temperature for each section (`dewasa`, `remaja`, `penyemaian`, `averages`) from API data for chart datasets.
    *   Calculate overall insights for the selected period:
        *   **Minimum Temperature:** The lowest `avg` temperature recorded across all sections, including its timestamp and section name.
        *   **Maximum Temperature:** The highest `avg` temperature recorded across all sections, including its timestamp and section name.
        *   **Overall Average Temperature:** The average of all `avg` temperature values from the `averages` section data points within the selected period.
    *   Convert timestamps to JavaScript `Date` objects.
    *   Return structured data for Chart.js datasets and the calculated insights.
*   **Chart Update (`updateTemperatureChart`):**
    *   Update the temperature chart with new datasets.
    *   Configure X-axis as a time scale. For the 24-hour view (`currentDays <= 1`), `time.unit` is set to `'hour'` and `time.displayFormats` to `'HH:mm'`, relying on Chart.js's automatic tick generation for clear time indication across the axis. Explicit `stepSize` for ticks is avoided to allow for better automatic scaling. For 7-day and 30-day views, `time.unit` is set to `'day'`.
*   **Insights Update (`updateTemperatureInsights`):**
    *   Populate the HTML elements in the "Insights" section with improved wording.
    *   Min/Max insights display: "Lowest/Highest in [Section] at [Time, Date]" (e.g., "Lowest in Dewasa at 16:20, May 12").
    *   Average insight displays: "Period average".
    *   Handles cases where no data is available by showing "No data available" in sub-texts.
*   **UI Feedback:** Implement functions for displaying loading and error states, and for resetting insights when no data is available.

---
*Further phases will be documented here as development progresses.*
