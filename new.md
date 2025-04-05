# Greenhouse Monitoring System - Project Documentation

## Project Overview

This document provides technical details and setup instructions for the greenhouse monitoring system. The system consists of multiple ESP32 nodes monitoring different growth zones:

1.  **Dewasa Node (Master)** - Mature plants section (**Implemented & Tested**)
2.  **Peremajaan Node** - Young plants section (**Implemented & Tested**)
3.  **Penyemaian Node** - Seedling section (**Planned, Not Yet Implemented**)

Each node is designed to have temperature, humidity, and light sensors. The Dewasa node acts as the master, collecting data from satellite nodes (currently Peremajaan) via ESP-NOW and sending aggregated data to an MQTT server.

## Code Structure and Implementation Status

The project uses PlatformIO and is organized into shared libraries and node-specific source files.

### Main Node Files (`src/`)

*   **`DeWasaNode_Master.cpp`**: Main firmware for the Dewasa/Master node. Coordinates sensor reading, ESP-NOW reception, WiFi/MQTT communication. **(Implemented & Tested)**
*   **`PeremajaanNode.cpp`**: Main firmware for the Peremajaan satellite node. Reads local sensors and sends data to the Master via ESP-NOW. **(Implemented & Tested)**
*   **`PenyemaianNode.cpp`**: Placeholder for the Penyemaian satellite node firmware. **(Not Yet Implemented)**
*   **`GetMacAddress.cpp`**: Utility sketch to easily find an ESP32's MAC address.

### Shared Libraries (`lib/`)

*   **`Common/`**:
    *   `NodeConfig.h`: Defines common hardware settings (e.g., `DHT_PIN`).
    *   `SensorData.h`: Defines the `struct SensorData` used for ESP-NOW communication. **Crucial: This file must be identical across all communicating nodes.**
*   **`SensorManager/`**: Class handling DHT22 (temperature/humidity) and BH1750 (light) sensor operations. Includes simulation capabilities.
*   **`ESPNowManager/`**: Class managing ESP-NOW communication (peer registration, sending/receiving data) on the Master node. Stores the latest data from satellite nodes and handles data validity timeouts (`DATA_TIMEOUT` defined in `ESPNowManager.h`).
*   **`MQTTManager/`**: Class handling WiFi connection and MQTT communication (payload generation, publishing) for the Master node.

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

## System Configuration

### 1. MAC Addresses (All Nodes)
*   **Find MACs:** Use the `GetMacAddress.cpp` sketch (or monitor serial output during startup) to find the unique MAC address of each ESP32 board.
*   **Update Master (`DeWasaNode_Master.cpp`):** Set the correct MAC addresses for `peremajaanMac` (and `penyemaianMac` when implemented).
    ```cpp
    // Example:
    uint8_t peremajaanMac[] = {0x4C, 0x11, 0xAE, 0x64, 0xD0, 0x74}; // Use ACTUAL Peremajaan MAC
    uint8_t penyemaianMac[] = {0xXX, 0xXX, 0xXX, 0xXX, 0xXX, 0xXX}; // TBD
    ```
*   **Update Senders (`PeremajaanNode.cpp`, etc.):** Set the correct `masterMac` address.
    ```cpp
    // Example:
    uint8_t masterMac[] = {0xE4, 0x65, 0xB8, 0x83, 0xD1, 0x40}; // Use ACTUAL Master MAC
    ```

### 2. ESP-NOW Channel (All Nodes) - **CRITICAL**
*   To ensure reliable ESP-NOW communication alongside the Master's WiFi connection, all nodes **must** use the same, fixed WiFi channel.
*   **Channel 6** is currently hardcoded in:
    *   `PeremajaanNode.cpp` (`esp_wifi_set_channel(6, ...)` and `peerInfo.channel = 6;`)
    *   `ESPNowManager.cpp` (`peerInfo.channel = 6;` in `addPeer`)
    *   `DeWasaNode_Master.cpp` (`esp_wifi_set_channel(6, ...)` after MQTT connection)
*   If your WiFi AP ("Direktorat Kemendikbud") uses a different channel, you **must** update the channel number (e.g., `6`) in all these locations.

### 3. WiFi & MQTT Credentials (Master Node Only)
*   Update `ssid`, `password`, `mqtt_server`, `mqtt_port`, and `mqtt_topic` in `DeWasaNode_Master.cpp`.
    ```cpp
    const char* ssid = "Direktorat Kemendikbud"; // Your WiFi SSID
    const char* password = "NadiemGantengSih"; // Your WiFi password
    const char* mqtt_server = "broker.emqx.io";
    const int mqtt_port = 1883;
    const char* mqtt_topic = "lokatech/greenhouse/sensors";
    ```

### 4. Simulation Mode (Optional, Per Node)
*   In each node's `.cpp` file (e.g., `PeremajaanNode.cpp`, `DeWasaNode_Master.cpp`), configure sensor simulation if hardware is missing or faulty:
    ```cpp
    #define TEMP_HUMID_SIMULATION_MODE false // true = simulate DHT22
    #define LIGHT_SIMULATION_MODE false      // true = simulate BH1750
    ```
*   Simulation generates random realistic values. See `SensorManager.cpp` for ranges.

## Building and Uploading (PlatformIO)

Ensure you have the correct PlatformIO environments configured in `platformio.ini`.

*   **Dewasa Master Node:**
    *   Build/Upload: `pio run -e dewasa_master -t upload` (Replace `dewasa_master` with your actual environment name)
*   **Peremajaan Node:**
    *   Build/Upload: `pio run -e peremajaan_node -t upload` (Replace `peremajaan_node` with your actual environment name)
*   **Penyemaian Node:**
    *   (Environment TBD)
*   **Monitor Serial Output:** `pio device monitor -b 115200`

## JSON Data Format (MQTT Payload)

The Master node publishes data to the MQTT topic in this format:

```json
{
  "timestamp": 1678886400, // Example Unix timestamp (or millis() if NTP fails)
  "sections": {
    "dewasa": { // Data from Master node's local sensors
      "temp": 28,
      "humidity": 67,
      "light": null, // Example: BH1750 failed on Master
      "trends": { "temp": "equals", "humidity": "down", "light": "equals" }
    },
    "peremajaan": { // Data received via ESP-NOW from Peremajaan
      "temp": 28,
      "humidity": 70,
      "light": 8645,
      "trends": { "temp": "equals", "humidity": "equals", "light": "up" }
    },
    "penyemaian": { // Data received via ESP-NOW from Penyemaian
      "temp": null, // Example: Node not implemented or data timed out
      "humidity": null,
      "light": null,
      "trends": { "temp": "equals", "humidity": "equals", "light": "equals" }
    }
  },
  "averages": { // Average of available sensor readings across sections
    "temp": 28,
    "humidity": 68,
    "light": 8645 // Only averages valid, non-null values
  }
}
```
*   Numeric values are rounded to integers in the final JSON.
*   Light intensity is in lux.
*   `null` values indicate failed sensor reads, simulation mode without a sensor, or timed-out data from satellite nodes (timeout set by `DATA_TIMEOUT` in `ESPNowManager.h`).
*   Trends indicate if the value went up, down, or stayed equal compared to the previous reading.

## Troubleshooting

*   **MQTT Connection Issues:** Check WiFi credentials, broker address/port, network connectivity. See `MQTTManager` logs.
*   **Sensor Reading Failures:** Check wiring (DHT=GPIO4, BH1750=GPIO21/22), power supply. Check `SensorManager` logs. Enable simulation mode to isolate hardware issues.
*   **ESP-NOW Communication Issues:**
    *   **Verify MAC Addresses:** Double-check MACs in all relevant files.
    *   **Verify Channel:** Ensure **Channel 6** (or your AP's channel) is set correctly in *all* nodes (`PeremajaanNode.cpp`, `DeWasaNode_Master.cpp`, `ESPNowManager.cpp`). This is the most common issue when using WiFi + ESP-NOW.
    *   **Check Initialization:** Look for "ESP-NOW initialized successfully" and peer addition logs.
    *   **Check Distance/Obstacles:** ESP-NOW range is limited.
    *   **Check `SensorData.h`:** Ensure the `lib/Common/SensorData.h` file is *identical* in both sender and receiver projects.

## Fuzzy Logic Control System (**Not Yet Implemented**)

### Overview (Planned)

The system is designed to eventually include a fuzzy logic controller on the Dewasa (master) node. This controller will automatically manage actuators like fans and lights based on aggregated environmental conditions to maintain a suitable environment.

*(The following details describe the planned design based on current requirements, not the current implementation)*

### Input Variables and Membership Functions (Planned)

The controller will use the average sensor readings from available nodes.

1.  **Average Temperature (`avgTemp`)**
    *   **Range**: 15-35°C (Adjust range as needed)
    *   **Fuzzy Sets**:
        *   `COLD`: Triangular function, peak at 18°C, zero at 15°C and 22°C.
        *   `OPTIMAL`: Triangular function, peak at 22.5°C, zero at 20°C and 25°C. (Represents the desired 20-25°C range)
        *   `HOT`: Triangular function, peak at 30°C, zero at 25°C and 35°C.

2.  **Average Humidity (`avgHumidity`)**
    *   **Range**: 20-100%
    *   **Fuzzy Sets**:
        *   `DRY`: Trapezoidal function, 100% membership below 70%, zero above 80%.
        *   `OPTIMAL`: Triangular function, peak at 85%, zero at 75% and 95%. (Centered around the desired 85%)
        *   `HUMID`: Trapezoidal function, zero below 90%, 100% membership above 95%.

3.  **Average Light Level (`avgLight`)**
    *   **Range**: 0-1000+ lux (Focus on human operational levels)
    *   **Fuzzy Sets**:
        *   `DARK_FOR_WORK`: Trapezoidal function, 100% membership below 100 lux, zero above 200 lux. (Represents conditions likely too dark for comfortable human work)
        *   `ADEQUATE_FOR_WORK`: Trapezoidal function, zero below 150 lux, 100% membership above 250 lux. (Represents sufficient light for work)

### Output Controls (Planned)

1.  **Fan Speed**: Could be simple ON/OFF or potentially variable speed (LOW/MEDIUM/HIGH) depending on fuzzy output. (Assuming ON/OFF for now).
    *   **Fuzzy Sets**: `FAN_OFF`, `FAN_ON`
2.  **Light State**: ON/OFF.
    *   **Fuzzy Sets**: `LIGHTS_OFF`, `LIGHTS_ON`

### Fuzzy Rules (Conceptual Examples - To Be Refined)

These rules define the control logic:

*   **Fan Control:**
    *   IF `avgTemp` IS HOT THEN Fan IS `FAN_ON`.
    *   IF `avgHumidity` IS HUMID THEN Fan IS `FAN_ON`.
    *   IF `avgTemp` IS OPTIMAL AND `avgHumidity` IS OPTIMAL THEN Fan IS `FAN_OFF`.
    *   IF `avgTemp` IS COLD THEN Fan IS `FAN_OFF`.
*   **Light Control:**
    *   IF `avgLight` IS `DARK_FOR_WORK` THEN Light IS `LIGHTS_ON`.
    *   IF `avgLight` IS `ADEQUATE_FOR_WORK` THEN Light IS `LIGHTS_OFF`.

### Defuzzification (Planned)

The fuzzy outputs (e.g., degree of membership for `FAN_ON`) would need to be converted back into crisp control signals (e.g., digital HIGH/LOW for a relay) using a defuzzification method like Centroid.

*(End of Planned Fuzzy Logic Section)*

## Security Considerations

*   Current implementation uses unencrypted ESP-NOW and MQTT without authentication.
*   For production: Enable ESP-NOW encryption, add MQTT username/password, consider TLS for MQTT.

---
*Document Updated: 2025-04-05*
