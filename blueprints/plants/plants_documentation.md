# Plants Feature Documentation

## 1. Overview

The "Plants" feature in the LokaTech Greenhouse Monitoring system serves as an informational guide for users, providing details about different plants that can be cultivated and their optimal growing conditions. It consists of two main parts:
1.  A **listing page** that displays available plants as cards.
2.  A **detail page** for each plant, showing comprehensive information, optimal environmental parameters (temperature, humidity, light), and a real-time comparison with the current average sensor readings from the greenhouse.

This feature aims to help users understand the ideal environment for their crops and how the current greenhouse conditions stack up against these targets.

## 2. Relevant Files

The following files are involved in the "Plants" feature:

*   **Backend (Flask):**
    *   `simpleLogin/blueprints/plants/__init__.py`: Initializes the 'plants' Flask blueprint.
    *   `simpleLogin/blueprints/plants/routes.py`: Defines the routes (`/plants/`, `/plants/<plant_id>`) and contains the static `PLANT_DATA` dictionary. It also fetches initial sensor data using `sensor_manager`.
    *   `simpleLogin/blueprints/sensor/mqtt.py`: Contains the `SensorDataManager` (`sensor_manager`) class, which provides current sensor data and emits real-time updates via Socket.IO.
*   **Frontend (Templates & Static Assets):**
    *   `simpleLogin/templates/plants.html`: Jinja2 template for the plants listing page.
    *   `simpleLogin/templates/plant_detail.html`: Jinja2 template for the individual plant detail page.
    *   `simpleLogin/static/js/plants.js`: JavaScript for the plants listing page (UI enhancements).
    *   `simpleLogin/static/js/plant-detail.js`: JavaScript for the plant detail page, handling real-time data updates and UI logic for condition sliders.
    *   `simpleLogin/static/css/plants.css`: CSS styles specific to the plants and plant detail pages.
    *   `simpleLogin/static/images/plants/`: Directory containing images for each plant (e.g., `bayam.jpg`, `kale.jpg`).
*   **Shared Macros/Components:**
    *   `simpleLogin/templates/macros/card.html`: Used for structuring content in cards.
    *   `simpleLogin/templates/macros/navigation.html`: Provides the bottom navigation bar.

## 3. Core Functionality

### 3.1. Plants Listing Page (`/plants`)

*   **Route:** `/plants/`
*   **Controller:** `plants_page()` in `simpleLogin/blueprints/plants/routes.py`.
*   **Template:** `simpleLogin/templates/plants.html`.
*   **Functionality:**
    *   Displays a header and a grid of "plant cards."
    *   **Note:** Currently, the plant cards (e.g., for Bayam, Kale) are hardcoded directly into the `plants.html` template. To add new plants to this listing, the template itself needs to be modified.
    *   Each card shows a plant image, a brief description, and a "Lihat Detail" button linking to the plant's specific detail page (e.g., `/plants/bayam`).
    *   The `static/js/plants.js` script adds minor UI enhancements like hover effects and makes the entire card clickable to navigate to the detail page. It also supports View Transitions API if available.

### 3.2. Plant Detail Page (`/plants/<plant_id>`)

*   **Route:** `/plants/<plant_id>` (e.g., `/plants/bayam`)
*   **Controller:** `plant_detail(plant_id)` in `simpleLogin/blueprints/plants/routes.py`.
*   **Template:** `simpleLogin/templates/plant_detail.html`.
*   **Functionality:**
    *   **Information Display:** Shows detailed information about the selected plant, including its common name, scientific name, description, growing time, and image. This data is sourced from the `PLANT_DATA` dictionary in `routes.py`.
    *   **Optimal Conditions:** Displays a "Target Kondisi Optimal" card. For each environmental parameter (temperature, humidity, light) defined in `PLANT_DATA` for the plant:
        *   It shows the parameter name (e.g., "Suhu") and an icon.
        *   It displays the current average sensor value for that parameter, updated in real-time via Socket.IO.
        *   It includes a visual slider component.
            *   The slider has a "track" representing a broad range.
            *   An "optimal range" band is highlighted on this track, based on `min` and `max` values from `PLANT_DATA`.
            *   A "current marker" and a "current bubble" indicate the real-time average sensor value on the slider. The marker's color changes if the value is outside the optimal range.
            *   A "target bubble" shows the `min-max` optimal range.
        *   A status message (e.g., "Nilai saat ini dalam rentang optimal") is displayed below the slider, also updated in real-time.
    *   **Real-time Updates:** The `static/js/plant-detail.js` script connects to the backend via Socket.IO and listens for `sensor_update` events. When new sensor data (specifically the `averages` part) is received, the script updates the "current value" text, slider marker positions, and status messages.
    *   **Loading State:** An overlay spinner is shown while waiting for the initial connection to the Socket.IO server.
    *   **Care Suggestions:** A static "Saran Perawatan" card provides general tips for plant care.

## 4. Data Flow

### 4.1. Static Plant Data (`PLANT_DATA`)

*   The primary source of information about each plant (name, description, optimal conditions, image filename) is the `PLANT_DATA` dictionary defined in `simpleLogin/blueprints/plants/routes.py`.
    ```python
    PLANT_DATA = {
        'bayam': {
            'name': 'Bayam',
            'scientific_name': 'Amaranthus spp.',
            'description': '...',
            'growing_time': '21-30 hari',
            'optimal_conditions': {
                'temperature': {'min': 25, 'max': 30, 'unit': '°C', ...},
                'humidity': {'min': 60, 'max': 80, 'unit': '%', ...},
                'light': {'min': 10000, 'max': 25000, 'unit': 'lux', ...},
            },
            'image': 'bayam.jpg'
        },
        # ... other plants
    }
    ```
*   When a user navigates to a plant detail page (e.g., `/plants/bayam`), the `plant_detail` route function retrieves the corresponding entry from `PLANT_DATA` and passes it to the `plant_detail.html` template.

### 4.2. Sensor Data Integration

#### 4.2.1. Initial Load (Flask Context - for Plant Detail Page)

*   When the `plant_detail` route in `simpleLogin/blueprints/plants/routes.py` is accessed, it calls `sensor_manager.get_data()` to fetch the *current* latest sensor readings.
*   This initial `sensor_data` (containing `sections` and `averages`) is passed to the `plant_detail.html` template.
*   While the template receives this initial data, `static/js/plant-detail.js` primarily relies on Socket.IO for updating the display. The initially passed data could be used for a first paint before Socket.IO connects, but the current JS implementation uses a mock display and then updates from Socket.IO.

#### 4.2.2. Real-time Updates (Socket.IO - for Plant Detail Page)

*   The `SensorDataManager` (`sensor_manager` in `simpleLogin/blueprints/sensor/mqtt.py`) is responsible for receiving MQTT messages from the hardware.
*   After processing an MQTT message and updating its internal `latest_data`, `sensor_manager` emits a `sensor_update` event via Socket.IO, broadcasting the `self.latest_data` payload.
    ```python
    # In simpleLogin/blueprints/sensor/mqtt.py (SensorDataManager class)
    if self.socketio:
        self.socketio.emit('sensor_update', self.latest_data)
    ```
*   `static/js/plant-detail.js` connects to this Socket.IO server:
    ```javascript
    const socket = io();
    socket.on('sensor_update', function(data) {
        console.log('Received sensor update:', data);
        updateDisplay(data); // data is self.latest_data from sensor_manager
    });
    ```
*   The `updateDisplay` function in `plant-detail.js` uses the `data.averages` object from the received payload to update the current values for temperature, humidity, and light on the sliders.

## 5. Plant Data Structure

The `PLANT_DATA` dictionary in `simpleLogin/blueprints/plants/routes.py` defines the characteristics and optimal conditions for each plant. Each key in `PLANT_DATA` is a unique plant identifier (e.g., `bayam`), and its value is an object with the following structure:

```
{
    'name': 'Bayam' (String) - Common name of the plant.
    'scientific_name': 'Amaranthus spp.' (String) - Scientific name.
    'description': 'Bayam adalah...' (String) - A brief description.
    'growing_time': '21-30 hari' (String) - Typical time from planting to harvest.
    'optimal_conditions': { (Object) - Defines optimal environmental parameters.
        'temperature': { (Object)
            'min': 25 (Number) - Minimum optimal temperature.
            'max': 30 (Number) - Maximum optimal temperature.
            'unit': '°C' (String) - Unit for temperature.
            'label_min': 'Rendah' (String) - Label for the low end of the slider.
            'label_max': 'Tinggi' (String) - Label for the high end of the slider.
        },
        'humidity': { (Object) - Similar structure for humidity.
            'min': 60,
            'max': 80,
            'unit': '%',
            ...
        },
        'light': { (Object) - Similar structure for light.
            'min': 10000,
            'max': 25000,
            'unit': 'lux',
            ...
        }
        // Potentially other conditions like 'soil_moisture' can be added here.
    },
    'image': 'bayam.jpg' (String) - Filename of the plant's image (located in `static/images/plants/`).
}
```

## 6. User Interface Elements

### 6.1. Plant Cards (`plants.html`)
*   Styled using `simpleLogin/static/css/plants.css`.
*   Each card typically contains an image, name (hardcoded in template currently), description, and a link to the detail page.

### 6.2. Optimal Condition Sliders (`plant_detail.html` & `plant-detail.js`)
*   The HTML structure for each condition (temp, humidity, light) is generated in `plant_detail.html` by iterating through `plant.optimal_conditions`.
*   **Slider Components:**
    *   **Current Value Display (`#current-<condition_key>`):** Shows the numerical real-time average sensor value.
    *   **Target Label (`.target-label`):** Text displaying "Target kondisi rata-rata MIN-MAX UNIT". `plant-detail.js` parses this to get the `min` and `max` for `conditionRanges`.
    *   **Range Slider (`#<condition_key>-slider`):** The main visual bar.
        *   **Optimal Range Band (`.range-optimal`):** A colored band on the slider indicating the `min` to `max` optimal values. Its position and width are set by `plant-detail.js` based on parsed `conditionRanges`.
        *   **Min/Max Markers (`.range-min-marker`, `.range-max-marker`):** Small visual cues at the min and max points of the optimal range.
        *   **Current Value Marker (`#<condition_key>-marker`):** A circular marker that moves along the slider to indicate the current real-time sensor value. Styled differently if `in-range` or `out-of-range`.
        *   **Current Value Bubble (`#<condition_key>-bubble`):** A small popup above the marker showing the precise current value.
        *   **Target Bubble (`#<condition_key>-target`):** A bubble typically positioned over the optimal range band, showing the `min-max` text.
*   **Logic in `plant-detail.js`:**
    *   `conditionRanges` object stores the parsed optimal `min` and `max` for each condition.
    *   `calculateTotalRange()` defines the visual extent of the slider (optimal range +/- 20% padding).
    *   `updateConditionDisplay()` updates the text values, marker/bubble positions, and status messages based on incoming sensor data and the `conditionRanges`.

### 6.3. Status Indicators
*   On the plant detail page, below each slider, a status message (`#status-<condition_key>`) is displayed.
*   This message indicates whether the current value is within, below, or above the optimal range, along with an appropriate icon (e.g., checkmark, exclamation).

## 7. Adding a New Plant

To add a new plant to the system, follow these steps:

1.  **Update `PLANT_DATA`:**
    *   Open `simpleLogin/blueprints/plants/routes.py`.
    *   Add a new entry to the `PLANT_DATA` dictionary. Use a unique key for the plant (e.g., `'pakcoy'`).
    *   Fill in all the required fields: `name`, `scientific_name`, `description`, `growing_time`, `optimal_conditions` (with `min`, `max`, `unit` for temperature, humidity, light), and `image` (filename).
    ```python
    # Example for a new plant:
    'pakcoy': {
        'name': 'Pakcoy',
        'scientific_name': 'Brassica rapa subsp. chinensis',
        'description': 'Pakcoy adalah sayuran daun populer yang mudah tumbuh.',
        'growing_time': '30-45 hari',
        'optimal_conditions': {
            'temperature': {'min': 18, 'max': 22, 'unit': '°C', 'label_min': 'Rendah', 'label_max': 'Tinggi'},
            'humidity': {'min': 60, 'max': 70, 'unit': '%', 'label_min': 'Rendah', 'label_max': 'Tinggi'},
            'light': {'min': 6000, 'max': 15000, 'unit': 'lux', 'label_min': 'Rendah', 'label_max': 'Tinggi'},
        },
        'image': 'pakcoy.jpg' # Ensure this image exists
    }
    ```

2.  **Add Plant Image:**
    *   Create or obtain an image for the new plant.
    *   Save the image to the `simpleLogin/static/images/plants/` directory. The filename must match the `image` value specified in `PLANT_DATA` (e.g., `pakcoy.jpg`).

3.  **Update Plants Listing Page (`plants.html`):**
    *   Open `simpleLogin/templates/plants.html`.
    *   Add a new plant card for the new plant. You can copy and paste an existing `{% call card.card(...) %}` block and modify its content:
        *   Update the card title.
        *   Update the image source (`src="{{ url_for('static', filename='images/plants/your-new-plant-image.jpg') }}"`).
        *   Update the plant description text.
        *   Update the "Lihat Detail" button link (`href="/plants/your-new-plant-key"`) to match the key used in `PLANT_DATA`.
    ```html
    <!-- Example for adding Pakcoy to plants.html -->
    {% call card.card('Pakcoy') %} <!-- Title for the card -->
      <div class="plant-card">
        <div class="plant-card__image">
          <img src="{{ url_for('static', filename='images/plants/pakcoy.jpg') }}" alt="Pakcoy">
        </div>
        <div class="plant-card__content">
          <p>Pakcoy adalah sayuran daun populer yang mudah tumbuh dan bergizi tinggi.</p>
          <a href="/plants/pakcoy" class="button button--primary"> <!-- Link to key_in_PLANT_DATA> -->
            <i class="fas fa-info-circle"></i> Lihat Detail
          </a>
        </div>
      </div>
    {% endcall %}
    ```

4.  **Restart the Flask Application:** After making these changes, restart the Flask server for them to take effect.

The new plant should now appear on the plants listing page, and its detail page should be accessible and display its specific information and optimal conditions.

## 8. Dependencies and Interactions

*   **Sensor Manager (`sensor_manager`):** The plants feature, specifically `plant-detail.js`, relies on `sensor_manager` to provide real-time average sensor data via Socket.IO events (`sensor_update`).
*   **Socket.IO:** Used for the real-time communication between the backend (`sensor_manager`) and the frontend (`plant-detail.js`).
*   **Flask & Jinja2:** Used for serving the HTML pages and rendering dynamic content based on `PLANT_DATA` and initial sensor readings.

This comprehensive guide should provide a clear understanding of the "Plants" feature within the LokaTech Greenhouse Monitoring system.
