# Greenhouse Monitoring System - Project Documentation

## Project Overview

This document provides technical details and setup instructions for the greenhouse monitoring system. The system consists of multiple ESP32 nodes monitoring different growth zones:

1.  **Dewasa Node (Master)** - Mature plants section (**Implemented & Tested**)
2.  **Peremajaan Node (Intermediate)** - Young plants section (**Implemented & Tested**)
3.  **Penyemaian Node (Satellite)** - Seedling section (**Implemented & Tested**)

Each node has temperature, humidity, and light sensors. The data flow uses ESP-NOW in a chain:
`Penyemaian -> Peremajaan -> Dewasa`
The Dewasa node acts as the master, receiving combined data from the Peremajaan node, running a fuzzy logic controller based on average environmental conditions to manage actuators (simulated by LEDs when in "auto" mode), sending the aggregated system status to an MQTT server, and listening for manual override commands via MQTT.

## Code Structure and Implementation Status

The project uses PlatformIO and is organized into shared libraries and node-specific source files.

### Main Node Files (`src/`)

*   **`DeWasaNode_Master.cpp`**: Main firmware for the Dewasa/Master node. Coordinates sensor reading, ESP-NOW reception, Fuzzy Logic control, WiFi/MQTT communication, and actuator (LED) control. **(Implemented & Tested)**
*   **`PeremajaanNode.cpp`**: Main firmware for the Peremajaan intermediate node. Reads local sensors, receives data from Penyemaian via ESP-NOW, combines the data, and sends it to the Master (Dewasa) via ESP-NOW. **(Implemented & Tested)**
*   **`PenyemaianNode.cpp`**: Main firmware for the Penyemaian satellite node. Reads local sensors and sends data to the Peremajaan node via ESP-NOW. **(Implemented & Tested)**
*   **`GetMacAddress.cpp`**: Utility sketch to easily find an ESP32's MAC address.

### Shared Libraries (`lib/`)

*   **`Common/`**:
    *   `NodeConfig.h`: Defines common hardware settings (e.g., `DHT_PIN`).
    *   `SensorData.h`: Defines `struct SensorData` (used between Penyemaian and Peremajaan) and `struct CombinedData` (used between Peremajaan and Dewasa). **Crucial: This file must be identical across all nodes.**
*   **`SensorManager/`**: Class handling DHT22 (temperature/humidity) and BH1750 (light) sensor operations. Includes simulation capabilities. Used by all nodes.
*   **`ESPNowManager/`**: Class managing ESP-NOW communication (peer registration, receiving `CombinedData`) on the Master (Dewasa) node. Stores the latest data extracted from `CombinedData` and handles data validity timeouts (`COMBINED_DATA_TIMEOUT` defined in `ESPNowManager.h`).
*   **`MQTTManager/`**: Class handling WiFi connection and MQTT communication (JSON payload generation including actuator states, publishing sensor data, subscribing to control topic) for the Master node.
*   **`FuzzyController/`**: Class implementing the fuzzy logic control system (using the `eFLL` library) on the Master node. Takes average sensor readings as input and determines ON/OFF states for actuators when in "auto" mode.

## Hardware Requirements

### For Each Node
- 1× ESP32 development board
- 1× DHT22 temperature and humidity sensor
- 1× BH1750 light intensity sensor
- 1× Breadboard
- Jumper wires
- Power supply

### Additional for Master Node (Dewasa)
- WiFi connectivity for MQTT communication
- 2x LEDs (e.g., standard 5mm LEDs) for actuator simulation
- 2x Current-limiting resistors (e.g., 220Ω or 330Ω) for the LEDs

## Pin Connections & Configuration

### Common Pins (`lib/Common/NodeConfig.h`)
*   **DHT22 Data Pin**: Defined as `DHT_PIN 4`. Connect the DHT22 data line to GPIO4 on all nodes using it.

### I2C Pins (BH1750)
*   The BH1750 sensor uses I2C. The `SensorManager` initializes I2C using `Wire.begin();` without specific pins.
*   This uses the **ESP32 default I2C pins**:
    *   **GPIO 21 (SDA)**
    *   **GPIO 22 (SCL)**
*   Connect the BH1750 SDA to GPIO21 and SCL to GPIO22. VCC to 3.3V, GND to GND.

### Wiring Diagrams

**DHT22 Connection**
```
ESP32                DHT22
-----                -----
3.3V    --------    VCC
GPIO4   --------    DATA  (As defined in NodeConfig.h)
GND     --------    GND
```

**BH1750 Connection**
```
ESP32                BH1750
-----                ------
3.3V    --------    VCC
GND     --------    GND
GPIO21  --------    SDA   (Default I2C SDA)
GPIO22  --------    SCL   (Default I2C SCL)
```

**Actuator Simulation LEDs (Master Node Only)**
```
ESP32                Components
-----                ----------
GPIO18  --------    Resistor ---- LED (+) ---- LED (-) ---- GND  (Fan Simulation LED)
GPIO19  --------    Resistor ---- LED (+) ---- LED (-) ---- GND  (Light Simulation LED)
```

## System Configuration

### 1. MAC Addresses (All Nodes)
*   **Find MACs:** Use the `GetMacAddress.cpp` sketch (or monitor serial output during startup) to find the unique MAC address of each ESP32 board.
*   **Update Master (`DeWasaNode_Master.cpp`):** Set the correct MAC address for `peremajaanMac` (the node sending `CombinedData`).
    ```cpp
    // Example: Update with ACTUAL Peremajaan MAC
    uint8_t peremajaanMac[] = {0x4C, 0x11, 0xAE, 0x64, 0xD0, 0x74};
    ```
*   **Update Peremajaan Node (`PeremajaanNode.cpp`):** Set the correct `masterMac` (Dewasa) and `penyemaianMac`.
    ```cpp
    // Example: Update with ACTUAL Master and Penyemaian MACs
    uint8_t masterMac[] = {0xE4, 0x65, 0xB8, 0x83, 0xD1, 0x40};
    uint8_t penyemaianMac[] = {0x30, 0xAE, 0xA4, 0x96, 0xA3, 0x48};
    ```
*   **Update Penyemaian Node (`PenyemaianNode.cpp`):** Set the correct `peremajaanMac`.
    ```cpp
    // Example: Update with ACTUAL Peremajaan MAC
    uint8_t peremajaanMac[] = {0x4C, 0x11, 0xAE, 0x64, 0xD0, 0x74};
    ```

### 2. ESP-NOW Channel (All Nodes) - **CRITICAL**
*   To ensure reliable ESP-NOW communication alongside the Master's WiFi connection, all nodes **must** use the same, fixed WiFi channel.
*   **Channel 6** is currently hardcoded in:
    *   `PenyemaianNode.cpp` (`esp_wifi_set_channel(6, ...)` and `peerInfo.channel = 6;`)
    *   `PeremajaanNode.cpp` (`esp_wifi_set_channel(6, ...)` and `peerInfo.channel = 6;` for both peers)
    *   `ESPNowManager.cpp` (`peerInfo.channel = 6;` in `addPeer` - used for Peremajaan peer on Master)
    *   `DeWasaNode_Master.cpp` (`esp_wifi_set_channel(6, ...)` after MQTT connection)
*   If your WiFi AP (used by the Master node) consistently uses a different channel, you **must** update the channel number (e.g., `6`) in all these locations.

### 3. WiFi & MQTT Credentials (Master Node Only)
*   Update `ssid`, `password`, `mqtt_server`, `mqtt_port`, `mqtt_username`, `mqtt_password`, `mqtt_publish_topic`, and `mqtt_control_topic` in `DeWasaNode_Master.cpp`.
    ```cpp
    const char* ssid = "Direktorat Kemendikbud"; // Your WiFi SSID
    const char* password = "NadiemGantengSih"; // Your WiFi password
    const char* mqtt_server = "d1b364f4ed864e92b1fb464a3201e5ae.s1.eu.hivemq.cloud"; // HiveMQ Cloud server
    const int mqtt_port = 8883; // TLS/SSL MQTT port
    const char* mqtt_username = "LokataniAdmin"; // MQTT username
    const char* mqtt_password = "LokataniAdmin123"; // MQTT password
    const char* mqtt_publish_topic = "lokatech/greenhouse/sensors"; // Topic for publishing sensor data
    const char* mqtt_control_topic = "lokatech/greenhouse/controls/set"; // Topic for receiving commands
    ```
    *   The Master node publishes data to `mqtt_publish_topic` and subscribes to `mqtt_control_topic`.
    *   Note that port 8883 uses TLS/SSL encryption, which is more secure than standard MQTT.

### 4. Simulation Mode (Optional, Per Node)
*   In each node's `.cpp` file (`PenyemaianNode.cpp`, `PeremajaanNode.cpp`, `DeWasaNode_Master.cpp`), configure sensor simulation if hardware is missing or faulty:
    ```cpp
    #define TEMP_HUMID_SIMULATION_MODE false // true = simulate DHT22
    #define LIGHT_SIMULATION_MODE false      // true = simulate BH1750
    ```
*   Simulation generates random realistic values. See `SensorManager.cpp` for ranges.
*   Note: Validity flags are preserved individually even if one sensor fails (e.g., if DHT fails, simulated light validity is still reported correctly).

## Building and Uploading (PlatformIO)

Ensure you have the correct PlatformIO environments configured in `platformio.ini`.

*   **Dewasa Master Node:**
    *   Build/Upload: `pio run -e dewasa_master -t upload` (or use VS Code PlatformIO buttons)
*   **Peremajaan Node:**
    *   Build/Upload: `pio run -e peremajaan_node -t upload`
*   **Penyemaian Node:**
    *   Build/Upload: `pio run -e penyemaian_node -t upload`
*   **Monitor Serial Output:** `pio device monitor -b 115200`

## JSON Data Format (MQTT Payload)

The Master node publishes data to the `mqtt_publish_topic` (`lokatech/greenhouse/sensors`) in this format:

```json
{
  "timestamp": 1678886400, // Example Unix timestamp (actually millis()/1000)
  "sections": {
    "dewasa": { // Data from Master node's local sensors
      "temp": 28.1,
      "humidity": 67,
      "light": null, // Example: BH1750 failed on Master
      "trends": { "temp": "equals", "humidity": "equals", "light": "equals" } // Note: Trends are placeholders
    },
    "peremajaan": { // Data originating from Peremajaan node (via CombinedData)
      "temp": 28.5,
      "humidity": 70,
      "light": 8645, // Value is in lux
      "trends": { "temp": "equals", "humidity": "equals", "light": "equals" } // Note: Trends are placeholders
    },
    "penyemaian": { // Data originating from Penyemaian node (via CombinedData)
      "temp": null, // Example: Sensor failed on Penyemaian node
      "humidity": null,
      "light": 500, // Example: Light sensor worked on Penyemaian
      "trends": { "temp": "equals", "humidity": "equals", "light": "equals" } // Note: Trends are placeholders
    }
  },
  "averages": { // Average of available sensor readings across sections with valid data
    "temp": 28,     // Example: Average of Dewasa and Peremajaan only (rounded)
    "humidity": 68, // Example: Average of Dewasa and Peremajaan only (rounded)
    "light": 4573   // Example: Average of Peremajaan (8645) and Penyemaian (500) -> (8645+500)/2 (rounded)
  },
  "actuators": { // Current state and mode of actuators on the Master node
    "fan": {
      "state": true,   // Current state (true=ON, false=OFF)
      "mode": "auto"   // Current mode ("auto" or "manual")
    },
    "light": {
      "state": false,
      "mode": "manual" // Example: Light is manually turned off via MQTT command
    }
  }
}
```
*   Numeric values are rounded to integers (or one decimal for temp) in the final JSON.
*   Light intensity (`light`) is reported in **lux**.
*   `null` values indicate failed sensor reads on the originating node, or that the data from a satellite node timed out (timeout set by `COMBINED_DATA_TIMEOUT` in `ESPNowManager.h` for Peremajaan/Penyemaian data reception on Master).
*   Trends are currently placeholders (`"equals"`) in the `MQTTManager` implementation and would require storing previous values on the Master node to be calculated properly.
*   The `actuators` object reflects the current state of the fan/light LEDs (as read from the pins) and whether they are being controlled by the fuzzy logic (`auto`) or by a user command (`manual`).

## MQTT Control Commands

The Master node listens on the `mqtt_control_topic` (`lokatech/greenhouse/controls/set`) for commands to manually override actuators. The expected command format is a JSON string:

```json
{
  "device": "fan",   // or "light"
  "state": true,     // true for ON, false for OFF
  "mode": "manual"   // Must be "manual" to trigger override
}
```
*   Receiving a `manual` command for a device will:
    1. Set its corresponding `fanManual` or `lightManual` flag to `true` on the Master node.
    2. Directly set the state of the corresponding LED pin (`FAN_LED_PIN` or `LIGHT_LED_PIN`) via `digitalWrite`.
    3. Prevent the fuzzy logic controller from changing that specific actuator's state while the `...Manual` flag is true.
*   **Note:** There is currently no automatic mechanism implemented to switch a device back from `manual` to `auto` mode (e.g., after a timeout or via a specific "set auto" command). Manual mode persists until the device restarts or potentially receives another command (though only "manual" mode is currently processed).

## Troubleshooting

*   **MQTT Connection Issues:** Check WiFi credentials, broker address/port, network connectivity. See `MQTTManager` logs in the Master node's Serial Monitor.
*   **Sensor Reading Failures:** Check wiring (DHT=GPIO4, BH1750=GPIO21/22), power supply. Check `SensorManager` logs on the relevant node. Enable simulation mode to isolate hardware issues.
*   **ESP-NOW Communication Issues (Penyemaian -> Peremajaan):**
    *   **Verify MAC Addresses:** Check `peremajaanMac` in `PenyemaianNode.cpp` and `penyemaianMac` in `PeremajaanNode.cpp`.
    *   **Verify Channel:** Ensure Channel 6 (or your chosen channel) is set in both `PenyemaianNode.cpp` and `PeremajaanNode.cpp`.
    *   **Check Initialization:** Look for ESP-NOW init and peer addition logs on both nodes.
    *   **Check `SensorData.h`:** Ensure the `struct SensorData` definition is identical.
    *   **Check Distance/Obstacles.**
*   **ESP-NOW Communication Issues (Peremajaan -> Dewasa):**
    *   **Verify MAC Addresses:** Check `masterMac` in `PeremajaanNode.cpp` and `peremajaanMac` in `DeWasaNode_Master.cpp`.
    *   **Verify Channel:** Ensure Channel 6 (or your chosen channel) is set in both `PeremajaanNode.cpp` and `DeWasaNode_Master.cpp`.
    *   **Check Initialization:** Look for ESP-NOW init and peer addition logs on both nodes (`ESPNowManager` logs on Master).
    *   **Check `SensorData.h`:** Ensure the `struct CombinedData` definition is identical.
    *   **Check `COMBINED_DATA_TIMEOUT`:** If data appears missing on the dashboard, check `ESPNowManager.h` timeout and Peremajaan sending interval.
    *   **Check Distance/Obstacles.**
*   **Master Node Crash on Startup:** If the Dewasa node crashes, ensure WiFi/MQTT initialization (`mqttManager->begin()`) happens *before* ESP-NOW initialization (`espNowManager->begin()`) in `DeWasaNode_Master.cpp`'s `setup()` function.
*   **Unexpected Fuzzy Logic Output / Actuator State:**
    *   Check the detailed Fuzzy Control Debug output in the Dewasa node's Serial Monitor (prints every `FUZZY_DEBUG_PRINT_INTERVAL`).
    *   Verify the calculated `avgTemp`, `avgHumidity`, `avgLight` values being fed into the fuzzy system.
    *   Check the membership degrees (e.g., `Temp -> Cold:0.20 Optimal:0.80 Hot:0.00`).
    *   Check the raw defuzzified outputs (`Fan Raw: 0.85`, `Light Raw: 0.10`).
    *   Confirm the final ON/OFF state matches the threshold logic (`> 0.5f`).
    *   Ensure the actuator is not stuck in `manual` mode (check MQTT payload or debug logs).
    *   Verify the fuzzy sets and rules in `lib/FuzzyController/FuzzyController.cpp` match the intended logic.

## Fuzzy Logic Control System (**Implemented**)

### Overview

The Dewasa (master) node includes a fuzzy logic controller implemented using the `eFLL` library (`lib/FuzzyController/`). When actuators are in "auto" mode, this controller automatically determines the desired state (ON/OFF) for the Fan and Light simulation LEDs (GPIO 18 and 19) based on the average environmental conditions calculated from available sensor data (Dewasa, Peremajaan, Penyemaian).

### Input Variables and Membership Functions

The controller uses the average sensor readings calculated by the `calculateAverages` function in `DeWasaNode_Master.cpp`.

1.  **Average Temperature (`avgTemp`)**
    *   **Universe**: 0-40°C
    *   **Fuzzy Sets**:
        *   `tempCold`: Trapezoidal [-1, -1, 5, 8] (Fully Cold below 5°C, drops to 0 at 8°C)
        *   `tempOptimal`: Trapezoidal [5, 10, 25, 30] (Starts rising at 5°C, fully Optimal 10-25°C, drops to 0 at 30°C)
        *   `tempHot`: Trapezoidal [27, 30, 40, 40] (Starts rising at 27°C, fully Hot above 30°C)

2.  **Average Humidity (`avgHumidity`)**
    *   **Universe**: 0-100%
    *   **Fuzzy Sets**:
        *   `humidityDry`: Trapezoidal [-1, -1, 40, 50] (Fully Dry below 40%, drops to 0 at 50%)
        *   `humidityOptimal`: Trapezoidal [40, 55, 75, 90] (Starts rising at 40%, fully Optimal 55-75%, drops to 0 at 90%)
        *   `humidityHumid`: Trapezoidal [80, 90, 100, 100] (Starts rising at 80%, fully Humid above 90%)

3.  **Average Light Level (`avgLight`)**
    *   **Universe**: 0-1000 lux (Note: `generateJsonPayload` uses lux, but fuzzy input range might need adjustment based on typical readings)
    *   **Fuzzy Sets**:
        *   `lightDark`: Trapezoidal [0, 0, 50, 200] (Fully Dark below 50 lux, drops to 0 at 200 lux)
        *   `lightAdequate`: Trapezoidal [150, 500, 1500, 1500] (Starts rising at 150 lux, fully Adequate 500-1500 lux) *Note: upper range extends beyond universe defined above, may need review.*

*(See `fuzzy.py` script and generated `fuzzy_membership_functions.png` for visualization)*

### Output Controls

1.  **Fan State**: Simple ON/OFF control.
    *   **Fuzzy Sets**: `fanOff` (triangular near 0), `fanOn` (triangular near 1)
2.  **Light State**: Simple ON/OFF control.
    *   **Fuzzy Sets**: `lightOff` (triangular near 0), `lightOn` (triangular near 1)

### Fuzzy Rules

The following rules are implemented in `FuzzyController::defineRules()`:

*   **Fan Control:**
    1.  IF `avgTemp` IS `tempHot` THEN Fan IS `fanOn`.
    2.  IF `avgHumidity` IS `humidityHumid` THEN Fan IS `fanOn`.
    3.  IF `avgTemp` IS `tempOptimal` AND `avgHumidity` IS `humidityOptimal` THEN Fan IS `fanOff`.
    4.  IF `avgTemp` IS `tempCold` THEN Fan IS `fanOff`.
*   **Light Control:**
    5.  IF `avgLight` IS `lightDark` THEN Light IS `lightOn`.
    6.  IF `avgLight` IS `lightAdequate` THEN Light IS `lightOff`.

### Defuzzification

*   The `FuzzyController::run()` method calls `_fuzzy->defuzzify(1)` for Fan and `_fuzzy->defuzzify(2)` for Light. This calculates a crisp output value (between 0 and 1) for each actuator, likely using the Centroid method (eFLL default).
*   The `getFanOutput()` and `getLightOutput()` methods then apply a simple threshold: if the defuzzified value is `> 0.5f`, the output is considered ON (true), otherwise OFF (false). This boolean result controls the LEDs when in "auto" mode.

## Security Considerations

*   Current implementation uses unencrypted ESP-NOW.
*   MQTT communication now uses HiveMQ Cloud with TLS encryption and username/password authentication, providing improved security.
*   For production environments, consider:
    *   Enabling ESP-NOW encryption (requires managing keys).
    *   Further hardening by using client certificates for MQTT connections.
    *   Adding security measures to the Flask application (e.g., CSRF protection if forms are added).
    *   Implementing secure credential storage on the ESP32 (avoid hardcoding credentials).

---
*Document Updated: 2025-05-07* (Updated MQTT configuration to use secure HiveMQ Cloud broker)

