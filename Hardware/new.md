# LokaTech Greenhouse Monitoring - Hardware System Documentation

## 1. Project Overview

This document provides technical details and setup instructions for the LokaTech Greenhouse Monitoring System's hardware components. The system employs multiple ESP32 nodes to monitor environmental conditions across different greenhouse sections and uses a combination of ESP-NOW and Serial communication for data aggregation, culminating in MQTT communication from a master node to the backend.

The primary hardware architecture consists of the following nodes:

1.  **Penyemaian Node**: Monitors the seedling section. Reads local sensors (temperature, humidity, light) and transmits `SensorData` via ESP-NOW to the Peremajaan Node.
2.  **Peremajaan Node**: Monitors the young plants section. Reads local sensors, receives `SensorData` from the Penyemaian Node, combines this into `CombinedData`, and transmits it via ESP-NOW to the Gateway Node.
3.  **Gateway Node**: Acts as a bridge. Receives `CombinedData` from the Peremajaan Node via ESP-NOW and forwards this data as a JSON string over a Serial connection to the Dewasa Node.
4.  **Dewasa Node (Master)**: Monitors the mature plants section. Reads local sensors, receives JSON data from the Gateway Node via Serial, calculates overall average environmental conditions, runs a Fuzzy Logic Controller to determine actuator states (simulated by LEDs), and publishes aggregated sensor data and actuator states to an MQTT broker. It also subscribes to an MQTT topic to receive manual control commands from the backend.

## 2. Code Structure

The PlatformIO project in the `Hardware/` directory is organized as follows:

### 2.1. Main Node Files (`src/`)

*   **`PenyemaianNode.cpp`**: Firmware for the Penyemaian (seedling) satellite node.
*   **`PeremajaanNode.cpp`**: Firmware for the Peremajaan (young plant) intermediate node.
*   **`GatewayNode.cpp`**: Firmware for the ESP-NOW to Serial gateway node.
*   **`DeWasaNode_Master.cpp`**: Firmware for the Dewasa (mature plant) master node.
*   **`GetMacAddress.cpp`**: Utility sketch to find an ESP32's MAC address.
*   *(Other files like `RemajaNode_Master.cpp`, `SensorPeremajaanNode.cpp`, `HX711_Reader.cpp`, `Test.cpp` are not part of the primary documented system at this time.)*

### 2.2. Shared Libraries (`lib/`)

*   **`Common/`**:
    *   `NodeConfig.h`: Defines common hardware settings (e.g., `DHT_PIN`, `WIFI_CHANNEL`), MAC addresses for all nodes, and data validity timeouts. **Crucial: This file must be configured correctly for all nodes.**
    *   `SensorData.h`: Defines `struct SensorData` (used by Penyemaian and Peremajaan) and `struct CombinedData` (used by Peremajaan and Gateway).
*   **`SensorManager/`**: (`SensorManager.h`, `SensorManager.cpp`)
    *   Class handling DHT22 (temperature/humidity) and BH1750 (light) sensor operations.
    *   Includes sensor reading, validity checking, and optional simulation capabilities.
    *   Used by Penyemaian, Peremajaan, and Dewasa nodes.
*   **`MQTTManager/`**: (`MQTTManager.h`, `MQTTManager.cpp`)
    *   Class handling WiFi connection and MQTT communication for the Dewasa Node.
    *   Manages JSON payload generation (sensor data, actuator states), publishing to MQTT, and subscribing to control topics.
*   **`FuzzyController/`**: (`FuzzyController.h`, `FuzzyController.cpp`)
    *   Class implementing the fuzzy logic control system (using the `eFLL` library) on the Dewasa Node.
    *   Takes average sensor readings as input and determines ON/OFF states for actuators (simulated by LEDs) when in "auto" mode.
*   *(The `lib/ESPNowManager/` library is not actively used by the Dewasa node in the current primary system architecture.)*

## 3. Hardware Requirements

### 3.1. Penyemaian Node
*   1x ESP32 development board
*   1x DHT22 temperature and humidity sensor
*   1x BH1750 light intensity sensor
*   Breadboard, jumper wires, power supply

### 3.2. Peremajaan Node
*   1x ESP32 development board
*   1x DHT22 temperature and humidity sensor
*   1x BH1750 light intensity sensor
*   Breadboard, jumper wires, power supply

### 3.3. Gateway Node
*   1x ESP32 development board
*   Breadboard, jumper wires, power supply
    *   *Note: The Gateway Node does not require its own sensors as its primary role is data forwarding.*

### 3.4. Dewasa Node (Master)
*   1x ESP32 development board
*   1x DHT22 temperature and humidity sensor
*   1x BH1750 light intensity sensor
*   2x LEDs (e.g., standard 5mm LEDs) for actuator simulation (Fan & Light)
*   2x Current-limiting resistors (e.g., 220Ω or 330Ω) for the LEDs
*   WiFi connectivity for MQTT communication
*   Breadboard, jumper wires, power supply

## 4. Pin Connections & Configuration

### 4.1. Common Sensor Pins (Penyemaian, Peremajaan, Dewasa)

*   **DHT22 Data Pin**:
    *   Defined in `lib/Common/NodeConfig.h` as `DHT_PIN 4`.
    *   Connect the DHT22 data line to **GPIO4** on each ESP32 using it.
    *   Wiring:
        ```
        ESP32                DHT22
        -----                -----
        3.3V    --------    VCC
        GPIO4   --------    DATA
        GND     --------    GND
        ```

*   **BH1750 I2C Pins**:
    *   The `SensorManager` uses default ESP32 I2C pins:
        *   **GPIO21 (SDA)**
        *   **GPIO22 (SCL)**
    *   Connect BH1750 SDA to GPIO21 and SCL to GPIO22. VCC to 3.3V, GND to GND.
    *   Wiring:
        ```
        ESP32                BH1750
        -----                ------
        3.3V    --------    VCC
        GND     --------    GND
        GPIO21  --------    SDA
        GPIO22  --------    SCL
        ```

### 4.2. Actuator Simulation LEDs (Dewasa Node Only)

*   Pins defined in `DeWasaNode_Master.cpp`:
    *   Fan Simulation LED: `FAN_LED_PIN = 18` (GPIO18)
    *   Light Simulation LED: `LIGHT_LED_PIN = 19` (GPIO19)
*   Wiring:
    ```
    ESP32 (Dewasa)       Components
    --------------       ----------
    GPIO18  --------    Resistor ---- LED (+) ---- LED (-) ---- GND  (Fan LED)
    GPIO19  --------    Resistor ---- LED (+) ---- LED (-) ---- GND  (Light LED)
    ```

### 4.3. Serial Connection (Gateway Node <-> Dewasa Node)

*   Both nodes use `Serial2` for this communication.
*   **Gateway Node (`GatewayNode.cpp`):**
    *   `#define SERIAL_TO_DEWASA Serial2`
    *   `SERIAL_TO_DEWASA.begin(SERIAL_BAUD_RATE, SERIAL_8N1, 16, 17);` (RX2=GPIO16, TX2=GPIO17)
*   **Dewasa Node (`DeWasaNode_Master.cpp`):**
    *   `Serial2.begin(115200, SERIAL_8N1, 16, 17);` (RX2=GPIO16, TX2=GPIO17)
*   **Wiring:**
    ```
    Gateway ESP32        Dewasa ESP32
    -------------        -------------
    GPIO17 (TX2) ------> GPIO16 (RX2)
    GPIO16 (RX2) <------ GPIO17 (TX2)
    GND          -------- GND (Essential for reliable serial communication)
    ```
    *   **Important:** Ensure baud rates match (currently 115200 in both files).

## 5. System Configuration (Critical Setup Steps)

### 5.1. MAC Addresses

*   **Find MACs:** Use the `GetMacAddress.cpp` sketch (PlatformIO environment: `get_mac_address`) to find the unique MAC address of each ESP32 board. Upload the sketch and monitor the serial output.
*   **Update `lib/Common/NodeConfig.h`:**
    *   Open `Hardware/lib/Common/NodeConfig.h`.
    *   Replace the placeholder MAC addresses with the actual MAC addresses for your ESP32 boards:
        ```c++
        // MAC Address of the Penyemaian Node
        const uint8_t MAC_ADDR_PENYEMAIAN[] = {0xXX, 0xXX, 0xXX, 0xXX, 0xXX, 0xXX}; // Replace with actual

        // MAC Address of the Peremajaan Node
        const uint8_t MAC_ADDR_PEREMAJAAN[] = {0xXX, 0xXX, 0xXX, 0xXX, 0xXX, 0xXX}; // Replace with actual

        // MAC Address of the NEW Gateway Node
        const uint8_t MAC_ADDR_GATEWAY[]    = {0xXX, 0xXX, 0xXX, 0xXX, 0xXX, 0xXX}; // Replace with actual

        // MAC Address of the Dewasa/Master Node
        const uint8_t MAC_ADDR_DEWASA[]     = {0xXX, 0xXX, 0xXX, 0xXX, 0xXX, 0xXX}; // Replace with actual
        ```
    *   This file is shared, so these definitions will be used by all relevant nodes.

### 5.2. ESP-NOW WiFi Channel

*   All nodes participating in ESP-NOW communication (Penyemaian, Peremajaan, Gateway) **must** operate on the same WiFi channel.
*   This channel is defined in `lib/Common/NodeConfig.h`:
    ```c++
    #define WIFI_CHANNEL 1 // Define the operating channel (1-11 recommended)
    ```
    *   Currently set to **Channel 1**. If you need to change this (e.g., due to interference), modify it here. All ESP-NOW nodes will use this value.
*   The Dewasa Node connects to a standard WiFi Access Point for MQTT. Its operating channel will be determined by that AP. Since the Dewasa node no longer directly participates in ESP-NOW communication (it receives data via Serial from the Gateway), its AP channel does not need to match `WIFI_CHANNEL`.

### 5.3. WiFi & MQTT Credentials (Dewasa Node Only)

*   Open `Hardware/src/DeWasaNode_Master.cpp`.
*   Update the following constants with your WiFi network and MQTT broker details:
    ```c++
    // const char* ssid = "padahal katanya uangtakan kemana";
    // const char* password = "jika memang rejeki akan ditransfer juga";

    const char* ssid = "Direktorat Kemendikbud"; // Your WiFi SSID
    const char* password = "NadiemGantengSih";   // Your WiFi password

    const char* mqtt_server = "d1b364f4ed864e92b1fb464a3201e5ae.s1.eu.hivemq.cloud"; // HiveMQ Cloud server
    const int mqtt_port = 8883;                // TLS MQTT port
    const char* mqtt_username = "LokataniAdmin"; // MQTT username
    const char* mqtt_password = "LokataniAdmin123"; // MQTT password
    const char* mqtt_publish_topic = "lokatech/greenhouse/sensors";
    const char* mqtt_control_topic = "lokatech/greenhouse/controls/set";
    ```
    *   The system uses HiveMQ Cloud with TLS encryption (port 8883) and username/password authentication.

### 5.4. Serial Baud Rate (Gateway & Dewasa Nodes)

*   The serial communication baud rate between the Gateway Node and the Dewasa Node must match.
*   **Gateway Node (`GatewayNode.cpp`):** `const long SERIAL_BAUD_RATE = 115200;`
*   **Dewasa Node (`DeWasaNode_Master.cpp`):** `Serial2.begin(115200, ...);`
*   Both are currently set to **115200**.

### 5.5. Sensor Simulation Mode (Optional, Per Node)

*   For testing without physical sensors, simulation mode can be enabled in the respective node's `.cpp` file:
    *   `PenyemaianNode.cpp`
    *   `PeremajaanNode.cpp`
    *   `DeWasaNode_Master.cpp`
    ```c++
    #define TEMP_HUMID_SIMULATION_MODE false // true = simulate DHT22
    #define LIGHT_SIMULATION_MODE false      // true = simulate BH1750
    ```
*   When enabled, `SensorManager` generates random realistic values.

### 5.6. Data Timeouts

*   Various data validity timeouts are defined in `lib/Common/NodeConfig.h` (e.g., `PENYEMAIAN_DATA_TIMEOUT`, `COMBINED_DATA_TIMEOUT`, `GATEWAY_DATA_TIMEOUT`). These determine how long data from a preceding node is considered fresh.

## 6. Data Flow & Structures

1.  **Penyemaian Node to Peremajaan Node (ESP-NOW):**
    *   Structure: `SensorData` (defined in `SensorData.h`)
        ```c++
        struct SensorData {
            char nodeName[16];
            float temperature;
            float humidity;
            float lightIntensity;
            bool temperatureValid;
            bool humidityValid;
            bool lightValid;
            unsigned long timestamp; // millis() from sending node
        };
        ```

2.  **Peremajaan Node to Gateway Node (ESP-NOW):**
    *   Structure: `CombinedData` (defined in `SensorData.h`)
        ```c++
        struct CombinedData {
            SensorData peremajaanData;    // Data from Peremajaan node's sensors
            SensorData penyemaianData;    // Data received from Penyemaian node
            bool isPenyemaianDataValid; // Flag: was penyemaianData recent when Peremajaan sent?
            unsigned long timestamp;    // millis() when this packet was created by Peremajaan
        };
        ```

3.  **Gateway Node to Dewasa Node (Serial):**
    *   Format: JSON string, sent over `Serial2`.
    *   Example structure generated by `GatewayNode.cpp`:
        ```json
        {
          "timestamp_ms": 12345678, // Original Peremajaan packet timestamp
          "isPenyemaianValid": true,
          "peremajaan": {
            "temp": 25.5, "hum": 60.1, "light": 7500 // or null if invalid
          },
          "penyemaian": {
            "temp": 26.1, "hum": 62.3, "light": 6800 // or null if invalid
          }
        }
        ```
    *   `DeWasaNode_Master.cpp` parses this JSON to update `gatewayPenyemaianData` and `gatewayPeremajaanData`.

4.  **Dewasa Node to MQTT Broker (MQTT):**
    *   Topic: `lokatech/greenhouse/sensors` (defined in `DeWasaNode_Master.cpp`)
    *   Format: JSON string, generated by `MQTTManager::generateJsonPayload()`.
    *   Structure (example):
        ```json
        {
          "timestamp": 1678886400, // Unix epoch seconds
          "sections": {
            "dewasa": { "temp": 28.1, "humidity": 67, "light": null, "trends": {"temp": "equals", ...} },
            "peremajaan": { "temp": 28.5, "humidity": 70, "light": 8645, "trends": {...} }, // From Gateway
            "penyemaian": { "temp": null, "humidity": null, "light": 500, "trends": {...} }  // From Gateway
          },
          "averages": { "temp": 28.3, "humidity": 68, "light": 4573 },
          "actuators": {
            "fan": { "state": true, "mode": "auto" },
            "light": { "state": false, "mode": "manual" }
          }
        }
        ```
    *   `null` values indicate invalid or timed-out sensor data.
    *   Trends are currently placeholders.
    *   Light intensity is in **lux**.

5.  **Backend/Web UI to Dewasa Node (MQTT Control Command):**
    *   Topic: `lokatech/greenhouse/controls/set` (subscribed by `DeWasaNode_Master.cpp`)
    *   Format: JSON string.
    *   Example:
        ```json
        {"device":"fan", "state":true, "mode":"manual"}
        ```
        or
        ```json
        {"device":"light", "mode":"auto"}
        ```
    *   The `DeWasaNode_Master.cpp`'s `mqttCallback` function parses these commands to switch actuator modes (auto/manual) and set manual states.

## 7. Fuzzy Logic Control System (Dewasa Node)

The Dewasa Node implements a fuzzy logic controller for automated environmental management when actuators are in "auto" mode.

### 7.1. Inputs
The fuzzy system takes three average environmental readings as input, calculated by `DeWasaNode_Master.cpp::calculateAverages()` from all available valid sensor data (local Dewasa, and data from Peremajaan & Penyemaian via Gateway):
*   Average Temperature
*   Average Humidity
*   Average Light Intensity

### 7.2. Membership Functions
Defined in `Hardware/lib/FuzzyController/FuzzyController.cpp`:

*   **Temperature (`temp_range`: 0-40°C):**
    *   `tempCold`: Trapezoidal `[-1, -1, 5, 8]`
    *   `tempOptimal`: Trapezoidal `[5, 10, 29, 31]`
    *   `tempHot`: Trapezoidal `[29, 31, 40, 40]`
*   **Humidity (`hum_range`: 0-100%):**
    *   `humidityDry`: Trapezoidal `[-1, -1, 40, 50]`
    *   `humidityOptimal`: Trapezoidal `[40, 55, 75, 90]`
    *   `humidityHumid`: Trapezoidal `[80, 90, 100, 100]`
*   **Light (`light_range`: 0-1000 lux for MFs, actual sensor range can be higher):**
    *   `lightDark`: Trapezoidal `[0, 0, 150, 350]`
    *   `lightAdequate`: Trapezoidal `[150, 350, 1000, 1000]`

*(Refer to `fuzzy.py` for a script to visualize these membership functions. The generated `fuzzy_membership_functions.png` and `fuzzy_transition_detail.png` show these plots.)*

### 7.3. Output Controls (Simulated by LEDs)
*   **Fan State**: ON/OFF (Controls `FAN_LED_PIN`)
    *   Fuzzy Sets: `fanOff` (triangular near 0), `fanOn` (triangular near 1)
*   **Light State**: ON/OFF (Controls `LIGHT_LED_PIN`)
    *   Fuzzy Sets: `lightOff` (triangular near 0), `lightOn` (triangular near 1)

### 7.4. Fuzzy Rules
Implemented in `FuzzyController::defineRules()`:
*   **Fan Control:**
    1.  IF `avgTemp` IS `tempHot` THEN Fan IS `fanOn`.
    2.  IF `avgHumidity` IS `humidityHumid` THEN Fan IS `fanOn`.
    3.  IF `avgTemp` IS `tempOptimal` AND `avgHumidity` IS `humidityOptimal` THEN Fan IS `fanOff`.
    4.  IF `avgTemp` IS `tempCold` THEN Fan IS `fanOff`.
*   **Light Control:**
    5.  IF `avgLight` IS `lightDark` THEN Light IS `lightOn`.
    6.  IF `avgLight` IS `lightAdequate` THEN Light IS `lightOff`.

### 7.5. Defuzzification & Output Logic
*   `FuzzyController::run()` calculates crisp output values (0-1) for Fan and Light.
*   `FuzzyController::getFanOutput()`: Implements hysteresis. Turns ON if crisp output `> 0.9f`, turns OFF if crisp output `<= 0.1f`.
*   `FuzzyController::getLightOutput()`: Turns ON if `lightDark` membership `> 0.9f`, turns OFF if `lightDark` membership `< 0.1f`.

## 8. Building and Uploading (PlatformIO)

Ensure PlatformIO Core CLI or VS Code Extension is installed.

1.  **Navigate** to the `Hardware/` directory.
2.  **Select Environment:** Use the PlatformIO interface or CLI to select the target environment.
3.  **Build & Upload Commands:**
    *   **Penyemaian Node:** `pio run -e penyemaian_node -t upload`
    *   **Peremajaan Node:** `pio run -e peremajaan_node -t upload`
    *   **Gateway Node:** `pio run -e gateway_node -t upload`
    *   **Dewasa Node (Master):** `pio run -e deewasa_master -t upload`
    *   **Get MAC Address Utility:** `pio run -e get_mac_address -t upload`
4.  **Monitor Serial Output:** `pio device monitor -b 115200` (or use PlatformIO's built-in serial monitor).

## 9. Actuator Control Path (Web UI to Hardware)

*   The frontend dashboard (`static/js/dashboard/controls.js`) sends HTTP POST requests to `/controls/api/set_state` for manual actuator control.
*   The Dewasa Node (`DeWasaNode_Master.cpp`) listens for MQTT commands on `lokatech/greenhouse/controls/set` to change actuator states/modes.
*   **Current Status (TODO):** The Flask backend route that receives the HTTP POST from the web UI and publishes the corresponding command to the MQTT topic is **not yet implemented**. Manual control from the web UI will not function until this backend bridge is created.

## 10. Troubleshooting

*   **No Data on Dewasa Node from Gateway:**
    *   Verify Serial wiring (TX on Gateway to RX on Dewasa, RX to TX, GND to GND).
    *   Ensure `SERIAL_BAUD_RATE` matches in `GatewayNode.cpp` and `DeWasaNode_Master.cpp`.
    *   Check `GatewayNode.cpp` serial monitor for ESP-NOW reception from Peremajaan and JSON forwarding logs.
    *   Check `DeWasaNode_Master.cpp` serial monitor for JSON parsing logs from Serial2.
*   **Gateway Not Receiving from Peremajaan (ESP-NOW):**
    *   Verify `MAC_ADDR_PEREMAJAAN` in `NodeConfig.h` matches Peremajaan's actual MAC.
    *   Verify `MAC_ADDR_GATEWAY` in `NodeConfig.h` matches Gateway's actual MAC.
    *   Ensure `WIFI_CHANNEL` in `NodeConfig.h` is identical for both Peremajaan and Gateway.
    *   Check `PeremajaanNode.cpp` serial monitor for send status (ACKs).
    *   Check `GatewayNode.cpp` serial monitor for receive callbacks.
    *   Check distance/obstacles.
*   **Peremajaan Not Receiving from Penyemaian (ESP-NOW):**
    *   Similar checks as above, but for `MAC_ADDR_PENYEMAIAN`, `MAC_ADDR_PEREMAJAAN`, and `WIFI_CHANNEL` between these two nodes.
*   **MQTT Connection Issues (Dewasa Node):**
    *   Verify WiFi credentials (`ssid`, `password`) in `DeWasaNode_Master.cpp`.
    *   Verify MQTT broker details (`mqtt_server`, `mqtt_port`, `mqtt_username`, `mqtt_password`) in `DeWasaNode_Master.cpp`.
    *   Check network connectivity of the Dewasa Node's WiFi.
    *   Monitor `MQTTManager` logs in Dewasa Node's serial output.
*   **Sensor Reading Failures (Any Node):**
    *   Check sensor wiring (DHT to `DHT_PIN`, BH1750 I2C to GPIO21/22).
    *   Check power supply to sensors.
    *   Monitor `SensorManager` logs on the relevant node. Enable simulation mode to isolate hardware issues.
*   **Unexpected Fuzzy Logic Output / Actuator State (Dewasa Node):**
    *   Check detailed Fuzzy Control Debug output in Dewasa Node's serial monitor.
    *   Verify calculated `avgTemp`, `avgHumidity`, `avgLight` values.
    *   Ensure actuators are not stuck in `manual` mode (check MQTT payload or debug logs).

## 11. Security Considerations

*   **ESP-NOW:** Communication is currently unencrypted. For production, consider enabling ESP-NOW encryption (requires key management).
*   **Serial (Gateway to Dewasa):** This communication is unencrypted and typically short-range. Physical security of the nodes is important.
*   **MQTT:** Communication with HiveMQ Cloud uses TLS encryption and username/password authentication, which is a good security baseline.
*   **Credentials:** WiFi and MQTT credentials are currently hardcoded in `DeWasaNode_Master.cpp`. For production, explore more secure methods like provisioning or secure storage if available on ESP32.

---
