# File: Hardware/new.md
# LokaTech Greenhouse Monitoring - Hardware System Documentation

## 1. Project Overview

This document provides technical details and setup instructions for the LokaTech Greenhouse Monitoring System's hardware components. The system employs multiple ESP32 nodes to monitor environmental conditions across different greenhouse sections and uses a combination of ESP-NOW and Serial communication for data aggregation, culminating in MQTT communication from a master node to the backend.

The **NEW** hardware architecture consists of:

1.  **Penyemaian Node**: Monitors the seedling section. Reads local sensors (temperature, humidity, light) and transmits `SensorData` via ESP-NOW to the **Gateway Node**.
2.  **Dewasa Node (formerly Peremajaan Node)**: Monitors the mature plants section. Reads local sensors and transmits its `SensorData` via ESP-NOW to the **Gateway Node**.
3.  **Gateway Node**: Acts as a bridge. Receives `SensorData` independently from both the Penyemaian Node and the Dewasa Node via ESP-NOW. It then forwards this data (for both nodes) as a single JSON string over a Serial connection to the **Remaja Node (Master)**.
4.  **Remaja Node (Master) (formerly Dewasa Node)**: Monitors the young plants (remaja) section using its *own local sensors*. It receives JSON data (containing Penyemaian and Dewasa sensor readings) from the Gateway Node via Serial. It calculates overall average environmental conditions from all three sources (local Remaja, Penyemaian, Dewasa), runs a Fuzzy Logic Controller to determine actuator states (simulated by LEDs for its own Remaja section), and publishes aggregated sensor data (Remaja, Penyemaian, Dewasa) and its (Remaja) actuator states to an MQTT broker. It also subscribes to an MQTT topic to receive manual control commands for its (Remaja) actuators.

## 2. Code Structure

### 2.1. Main Node Files (`src/`)

*   **`PenyemaianNode.cpp`**: Firmware for the Penyemaian (seedling) satellite node. (Sends to Gateway)
*   **`PeremajaanNode.cpp`**: Firmware for the node *acting as* the **Dewasa Node**. (Reads local sensors, sends to Gateway)
*   **`GatewayNode.cpp`**: Firmware for the ESP-NOW to Serial gateway node. (Receives from Penyemaian & Dewasa, sends Serial to Remaja Master)
*   **`DeWasaNode_Master.cpp`**: Firmware for the node *acting as* the **Remaja Node (Master)**. (Reads local Remaja sensors, gets Penyemaian/Dewasa data via Serial, runs Fuzzy, does MQTT)
*   ... (other utility files remain)

### 2.2. Shared Libraries (`lib/`)
*   **`Common/NodeConfig.h`**: Defines common settings, **MAC addresses (comments updated for new logical roles)**, timeouts.
*   **`Common/SensorData.h`**: Defines `struct SensorData`. `CombinedData` is no longer used for ESP-NOW between Peremajaan->Gateway.
*   ... (SensorManager, MQTTManager, FuzzyController remain largely the same in their core logic, but how they are used or what data they process in the master node changes).

## 3. Hardware Requirements
(Hardware requirements for each physical board remain the same, but their logical roles change)

*   **Penyemaian Node:** ESP32, DHT22, BH1750
*   **Dewasa Node (Old Peremajaan Hardware):** ESP32, DHT22, BH1750
*   **Gateway Node:** ESP32
*   **Remaja Node (Master) (Old Dewasa Hardware):** ESP32, DHT22, BH1750, 2x LEDs + Resistors, WiFi.

## 4. Pin Connections & Configuration

### 4.1. Common Sensor Pins (Penyemaian, new Dewasa, new Remaja Master)
*   DHT22: `DHT_PIN 4` (GPIO4)
*   BH1750: SDA to GPIO21, SCL to GPIO22.

### 4.2. Actuator Simulation LEDs (Remaja Node (Master) Only)
*   Pins defined in `lib/Common/NodeConfig.h` (e.g., `REMAJA_FAN_LED_PIN = 18`, `REMAJA_LIGHT_LED_PIN = 19`).
    *   These are on the physical board that *is now* the Remaja Master (formerly Dewasa Master).

### 4.3. Serial Connection (Gateway Node <-> Remaja Node (Master))
*   **Gateway Node (`GatewayNode.cpp`):** `SERIAL_TO_REMAJA_MASTER Serial2` (TX2=GPIO17, RX2=GPIO16)
*   **Remaja Node (Master) (`DeWasaNode_Master.cpp`):** `Serial2` (TX2=GPIO17, RX2=GPIO16 for receiving from Gateway)
*   Wiring:
    ```
    Gateway ESP32        Remaja Master ESP32
    -------------        -------------------
    GPIO17 (TX2) ------> GPIO16 (RX2)
    GPIO16 (RX2) <------ GPIO17 (TX2)
    GND          -------- GND
    ```

## 5. System Configuration (Critical Setup Steps)

### 5.1. MAC Addresses
*   Find MACs using `GetMacAddress.cpp`.
*   Update `lib/Common/NodeConfig.h`:
    *   `MAC_ADDR_PENYEMAIAN`: Actual MAC of Penyemaian board.
    *   `MAC_ADDR_DEWASA`: Actual MAC of the board that *was* Peremajaan (now acting as Dewasa).
    *   `MAC_ADDR_GATEWAY`: Actual MAC of Gateway board.
    *   `MAC_ADDR_REMAJA_MASTER`: Actual MAC of the board that *was* Dewasa Master (now acting as Remaja Master).

### 5.2. ESP-NOW WiFi Channel
*   Defined in `lib/Common/NodeConfig.h` (e.g., `#define WIFI_CHANNEL 1`).
*   Must be the same for **Penyemaian Node, (new) Dewasa Node, and Gateway Node**.
*   The Remaja Node (Master) uses standard WiFi for MQTT, its AP channel is separate.

### 5.3. WiFi & MQTT Credentials (Remaja Node (Master) Only)
*   In `Hardware/src/DeWasaNode_Master.cpp` (which is now Remaja Master).
    *   Update `ssid`, `password`, `mqtt_server`, etc.

### 5.4. Serial Baud Rate (Gateway & Remaja Master Nodes)
*   Both use `SERIAL_BAUD_RATE` from `NodeConfig.h` (e.g., 115200).

### 5.5. Sensor Simulation Mode (Optional, Per Node)
*   Can be enabled in `PenyemaianNode.cpp`, `PeremajaanNode.cpp` (for new Dewasa), `DeWasaNode_Master.cpp` (for new Remaja Master).

### 5.6. Data Timeouts
*   Defined in `lib/Common/NodeConfig.h`:
    *   `PENYEMAIAN_ESP_NOW_TIMEOUT`: For Gateway receiving from Penyemaian.
    *   `DEWASA_ESP_NOW_TIMEOUT`: For Gateway receiving from new Dewasa node.
    *   `GATEWAY_SERIAL_TIMEOUT`: For Remaja Master receiving from Gateway.

## 6. Data Flow & Structures

1.  **Penyemaian Node to Gateway Node (ESP-NOW):**
    *   Structure: `SensorData` (for Penyemaian)

2.  **(New) Dewasa Node (Old Peremajaan) to Gateway Node (ESP-NOW):**
    *   Structure: `SensorData` (for Dewasa)

3.  **Gateway Node to Remaja Node (Master) (Serial):**
    *   Format: JSON string.
    *   Example structure generated by `GatewayNode.cpp`:
        ```json
        {
          "penyemaian": {
            "nodeName": "penyemaian",
            "temp": 26.1, "hum": 62.3, "light": 6800, // or null
            "tempValid": true, "humValid": true, "lightValid": true,
            "timestamp_node": 12345000, // millis from Penyemaian
            "isValid": true // Overall validity when Gateway received it
          },
          "dewasa": {
            "nodeName": "dewasa",
            "temp": 25.5, "hum": 60.1, "light": 7500, // or null
            "tempValid": true, "humValid": true, "lightValid": true,
            "timestamp_node": 12345100, // millis from Dewasa
            "isValid": true // Overall validity when Gateway received it
          },
          "timestamp_gateway_ms": 12345678 // millis from Gateway when packet was created
        }
        ```
    *   `DeWasaNode_Master.cpp` (Remaja Master) parses this JSON.

4.  **Remaja Node (Master) to MQTT Broker (MQTT):**
    *   Topic: `lokatech/greenhouse/sensors`
    *   Format: JSON string, generated by `MQTTManager::generateJsonPayload()`.
    *   Structure (example):
        ```json
        {
          "timestamp": 1678886400, // Unix epoch seconds
          "sections": {
            "remaja": { "temp": 27.5, "humidity": 65, "light": 9000, "trends": {...} }, // Local Remaja data
            "penyemaian": { "temp": 26.1, "humidity": 62.3, "light": 6800, "trends": {...} }, // From Gateway
            "dewasa": { "temp": 25.5, "humidity": 60.1, "light": 7500, "trends": {...} }  // From Gateway
          },
          "averages": { "temp": 26.4, "humidity": 62, "light": 7767 },
          "actuators": { // Actuators on Remaja Node
            "fan": { "state": true, "mode": "auto" },
            "light": { "state": false, "mode": "manual" }
          }
        }
        ```

5.  **Backend/Web UI to Remaja Node (Master) (MQTT Control Command):**
    *   Topic: `lokatech/greenhouse/controls/set`
    *   Example: `{"device":"fan", "node":"remaja", "state":true, "mode":"manual"}`
        *   The `node` field in the command should now specify `"remaja"` if controlling the Remaja Master's actuators.
    *   The `DeWasaNode_Master.cpp` (Remaja Master) `mqttCallback` parses these.

## 7. Fuzzy Logic Control System (Remaja Node (Master))

*   The Fuzzy Logic controller now runs on the **Remaja Node (Master)**.
*   **Inputs:** Average Temperature, Humidity, Light calculated from:
    1.  Local Remaja sensors.
    2.  Penyemaian sensor data (via Gateway).
    3.  Dewasa sensor data (via Gateway).
*   **Outputs:** Controls actuators (simulated LEDs) on the Remaja Node (Master).
*   Membership functions and rules in `FuzzyController.cpp` remain the same.

## 8. Building and Uploading (PlatformIO)
*   **Penyemaian Node:** `pio run -e penyemaian_node -t upload`
*   **(New) Dewasa Node (Old Peremajaan):** `pio run -e peremajaan_node -t upload` (The environment name still refers to the physical board type/original role).
*   **Gateway Node:** `pio run -e gateway_node -t upload`
*   **(New) Remaja Node (Master) (Old Dewasa):** `pio run -e deewasa_master -t upload` (Environment name refers to physical board).

## 9. Actuator Control Path
*   Web UI -> Flask API (`/dashboard/controls/api/set_state`) -> MQTT command (e.g., for `remaja` node) -> Remaja Node (Master) receives MQTT -> Controls local Remaja actuators.
*   Control for (new) Dewasa node actuators is not directly implemented in this change. If needed, Remaja Master would have to send a command back via Gateway to Dewasa node.

## 10. Troubleshooting
*   **Gateway Not Receiving from Penyemaian/Dewasa:**
    *   Verify MAC addresses in `NodeConfig.h` for `MAC_ADDR_PENYEMAIAN`, `MAC_ADDR_DEWASA` (old Peremajaan's MAC), and `MAC_ADDR_GATEWAY`.
    *   Ensure `WIFI_CHANNEL` is identical for these three nodes.
    *   Check serial monitors of sender and Gateway.
*   **Remaja Master Not Receiving from Gateway (Serial):**
    *   Verify Serial wiring (TX-RX, RX-TX, GND).
    *   Ensure `SERIAL_BAUD_RATE` matches.
    *   Check Gateway's serial monitor for JSON sending logs.
    *   Check Remaja Master's serial monitor for JSON parsing logs.
*   ... (other troubleshooting points similar to before, adapted for new roles).

## 11. Security Considerations
*   ... (ESP-NOW encryption, MQTT security, Serial physical security considerations remain).
---
