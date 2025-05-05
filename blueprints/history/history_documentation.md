# History Page Documentation

This document provides a detailed overview of the history page functionality, including data flow, Firebase integration, data structure, and relevant files.

## Overview

The history page allows users to view historical sensor data from the greenhouse in graphical format. It retrieves data from a Firestore database, processes it, and displays it using Chart.js.

## Relevant Files

*   `blueprints/history/routes.py`: Defines the Flask routes for the history page (`/history`) and the API endpoints for fetching historical data (`/history/data`) and the latest data (`/history/latest`).
*   `blueprints/history/firestore.py`: Contains the Python functions for interacting with the Firestore database, including initializing the Firebase app, getting the Firestore client, and retrieving historical and latest data.
*   `templates/history.html`: The Jinja2 template for the history page, including the structure for the time range selector and the chart containers. It links to the necessary CSS and JavaScript files.
*   `static/css/history.css`: Provides specific styling for the history page elements, such as the time range buttons and chart containers.
*   `static/js/history.js`: The frontend JavaScript file responsible for handling user interactions (time range selection), fetching data from the backend API, processing the received data, and rendering the charts using Chart.js.
*   `Hardware/simulation/mqtt_to_firestore.py`: A script that simulates receiving sensor data via MQTT and saving aggregated data to the Firestore database. This script demonstrates how data gets into the database that the history page reads from.
*   `requirements.txt`: Lists the Python dependencies required for the application, including `firebase-admin` and `paho-mqtt`, which are essential for the history and data collection features.

## Data Flow

1.  **Data Collection:** Sensor data is collected (e.g., from hardware via MQTT).
2.  **MQTT to Firestore (`Hardware/simulation/mqtt_to_firestore.py`):** The `mqtt_to_firestore.py` script subscribes to an MQTT topic (`lokatech/greenhouse/sensors`). When a message is received, it processes the JSON payload, aggregates data points over a defined interval (`COLLECTION_INTERVAL_MINUTES`), calculates statistics (average, min, max, median, count) for temperature, humidity, and light for different sections (`dewasa`, `peremajaan`, `penyemaian`, `averages`), and saves this aggregated data as a document in the `greenhouse_data` collection in Firestore.
3.  **Frontend Request (`static/js/history.js`):** When the history page loads or a user selects a time range, the `static/js/history.js` script makes a `fetch` request to the backend API endpoint `/history/data`, specifying the desired number of `days`.
4.  **Backend Processing (`blueprints/history/routes.py`, `blueprints/history/firestore.py`):** The `/history/data` route in `blueprints/history/routes.py` receives the request, extracts the `days` parameter, and calls the `get_historical_data` function from `blueprints/history/firestore.py`. This function queries the Firestore database for documents in the `greenhouse_data` collection within the specified time range, ordered by timestamp.
5.  **Data Retrieval from Firestore (`blueprints/history/firestore.py`):** The `get_historical_data` function uses the `firebase-admin` library to connect to Firestore (initializing the app if necessary using credentials) and retrieves the relevant documents.
6.  **Data Response (`blueprints/history/routes.py`):** The retrieved data is returned as a JSON response by the `/history/data` endpoint.
7.  **Frontend Rendering (`static/js/history.js`):** The `static/js/history.js` script receives the JSON data, processes it to format it for Chart.js, and updates the temperature, humidity, and light charts with the historical data.

## Firebase Setup

The application uses Firebase Firestore as the database for storing historical sensor data.

1.  **Firebase Project:** A Firebase project needs to be set up in the Google Cloud Console.
2.  **Service Account:** A service account must be created for the project to allow the backend Python application to authenticate and interact with Firestore.
3.  **Credentials File:** After creating the service account, download the private key as a JSON file. This is the `firebase-credentials.json` file.
4.  **File Location:** The `firebase-credentials.json` file must be placed in the `secrets` directory at the project root (`/home/timtam/Documents/code/simpleLogin/secrets/firebase-credentials.json`).
5.  **Initialization (`blueprints/history/firestore.py`, `Hardware/simulation/mqtt_to_firestore.py`):** The `firebase-admin` library is used to initialize the Firebase app using the credentials file. This is done in the `get_firestore_db()` function in `firestore.py` (used by the Flask app) and directly in `mqtt_to_firestore.py`. The `get_firestore_db()` function implements a singleton pattern to ensure the Firebase app is initialized only once.

## Firestore Data Structure

Historical data is stored in a collection named `greenhouse_data`. Each document in this collection represents an aggregation of sensor data over a specific interval (defined by `COLLECTION_INTERVAL_MINUTES` in `mqtt_to_firestore.py`). The document ID is a timestamp string (`YYYY-MM-DD HH:MM:SS`).

Each document has the following structure:

```json
{
  "timestamp": "<Firestore Timestamp Object>", // Timestamp of the data aggregation
  "stats": {
    "dewasa": {
      "temps": {
        "avg": <float>,
        "min": <float>,
        "max": <float>,
        "median": <float>,
        "count": <integer>
      },
      "humidities": {
        "avg": <float>,
        "min": <float>,
        "max": <float>,
        "median": <float>,
        "count": <integer>
      },
      "lights": {
        "avg": <float>,
        "min": <float>,
        "max": <float>,
        "median": <float>,
        "count": <integer>
      }
    },
    "peremajaan": {
      // Similar structure for temps, humidities, lights
    },
    "penyemaian": {
      // Similar structure for temps, humidities, lights
    },
    "averages": {
      // Similar structure for temps, humidities, lights (aggregated averages)
    }
  },
  "metadata": {
    "collection_minutes": <integer>, // The interval over which data was collected
    "samples_count": <integer>       // Number of raw samples included in the aggregation
  }
}
```

-   `timestamp`: A Firestore Timestamp object indicating when the data aggregation was saved.
-   `stats`: An object containing aggregated statistics for each greenhouse section (`dewasa`, `peremajaan`, `penyemaian`) and overall `averages`.
-   Within each section (`dewasa`, `peremajaan`, `penyemaian`, `averages`), there are sub-objects for `temps`, `humidities`, and `lights`.
-   Each data type (`temps`, `humidities`, `lights`) contains calculated statistics: `avg`, `min`, `max`, `median`, and `count` of the raw sensor readings within the collection interval.
-   `metadata`: Contains additional information about the data collection process, such as the `collection_minutes` interval and the total `samples_count` used for the aggregation.

## How it Works (Detailed)

1.  **Backend (`blueprints/history/routes.py` & `blueprints/history/firestore.py`):**
    *   The `/history` route simply renders the `history.html` template.
    *   The `/history/data` route is an API endpoint. It expects optional query parameters `section`, `days`, and `type`.
    *   It calls `get_historical_data` from `firestore.py`, passing the parsed query parameters.
    *   `get_historical_data` initializes Firebase if it hasn't been already. It constructs the path to `firebase-credentials.json` relative to the script's location.
    *   It calculates a `date_limit` based on the current time and the requested number of `days`.
    *   It queries the `greenhouse_data` collection in Firestore, filtering by `timestamp >= date_limit` and ordering by `timestamp`.
    *   It iterates through the query results (documents), extracts the `timestamp` and `stats` data.
    *   It filters the `stats` data based on the requested `section` and `data_type` parameters. If no section or type is specified, it includes all available data.
    *   It returns a list of processed data points, each containing a timestamp and the filtered data, as a JSON response.
    *   The `/history/latest` route is another API endpoint that retrieves only the single most recent document from the `greenhouse_data` collection, ordered by timestamp descending.

2.  **Frontend (`static/js/history.js` & `templates/history.html`):**
    *   `templates/history.html` includes the necessary CSS (`history.css`, `dashboard.css`) and JavaScript (`chart.js`, `chartjs-adapter-date-fns`, `history.js`). It sets up the basic HTML structure with card containers for the time range selector and charts.
    *   `static/js/history.js` runs when the DOM is loaded.
    *   It sets up event listeners for the time range buttons (`24 Hours`, `7 Days`, `30 Days`). Clicking a button updates the `currentDays` variable and triggers `loadHistoricalData`.
    *   `initCharts` initializes three Chart.js instances (`temperatureChart`, `humidityChart`, `lightChart`) with basic configurations and empty datasets. It initially sets the x-axis scale to 'category', which will be updated to 'time' once data is loaded.
    *   `loadHistoricalData(days)` fetches data from the `/history/data` endpoint using the specified number of `days`. It shows a "Loading data..." message while fetching.
    *   Upon receiving a successful response, it calls `processHistoricalData`.
    *   `processHistoricalData(data)` takes the raw data from the backend, iterates through each data point, and organizes the average values (`avg`) for temperature, humidity, and light into separate arrays for each section (`dewasa`, `peremajaan`, `penyemaian`, `averages`), associating them with their timestamps.
    *   `updateCharts(chartData)` calls `updateSingleChart` for each of the three charts.
    *   `updateSingleChart(chart, data, label)` clears the existing datasets in the Chart.js instance. It then adds new datasets for each section that has data, using the organized data points. It sets the label, border color (using `chartColors`), background color, and other styling options. It dynamically switches the x-axis scale to 'time' with an appropriate unit ('hour' for 1 day, 'day' for more) if data is present. Finally, it calls `chart.update()` to re-render the chart.
    *   Error handling functions (`showLoadingState`, `hideLoadingState`, `showError`) manage the display of loading indicators and error messages on the page.

## Important Information to Remember

*   **Firebase Credentials:** The `firebase-credentials.json` file is critical for authentication. Its path is calculated dynamically in `firestore.py` and `mqtt_to_firestore.py`. Ensure this file is present and correctly located in the `secrets` directory at the project root.
*   **Firestore Data Structure:** The frontend (`history.js`) and backend (`firestore.py`) rely on the specific structure of documents in the `greenhouse_data` collection. Any changes to this structure (e.g., field names like `stats`, `averages`, `temps`, `avg`) will require corresponding updates in the code.
*   **Data Aggregation:** The data stored in Firestore is *aggregated* data (averages, min, max, etc.) over a set interval, not raw, real-time sensor readings. The `COLLECTION_INTERVAL_MINUTES` in `mqtt_to_firestore.py` determines this interval.
*   **Timezones:** Be mindful of how timestamps are handled. Firestore stores timestamps as UTC. The Python code uses `datetime.datetime.now()`, which is timezone-aware if configured, but the display on the frontend might depend on the browser's local timezone and how Chart.js handles the time scale.
*   **Error Handling:** Basic error handling is present (checking for file existence, catching exceptions during Firestore operations and data processing), but robust error reporting and logging might be needed for production environments.
*   **Dependencies:** Ensure all dependencies listed in `requirements.txt` are installed (`firebase-admin`, `paho-mqtt`).
*   **MQTT Broker:** The `mqtt_to_firestore.py` script connects to a specific MQTT broker (`broker.emqx.io`). This needs to be running and accessible, and sensor data needs to be published to the configured topic (`lokatech/greenhouse/sensors`).

This documentation provides a comprehensive overview of the history page's implementation and dependencies.
