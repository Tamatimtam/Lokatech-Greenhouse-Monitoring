# 🌱 LokaTech Greenhouse Monitoring - Hardware System Documentation

## 🎯 1. Project Overview

This document provides technical details and setup instructions for the LokaTech Greenhouse Monitoring System's hardware components. The system employs multiple ESP32 nodes to monitor environmental conditions across different greenhouse sections. It uses ESP-NOW for sensor data transmission from satellite nodes to a gateway, and Serial communication for data aggregation to a master node. The master node handles Fuzzy Logic control and communicates with the backend via MQTT.

### 🏆 Primary Goals
- 📊 **Monitor Environment**: Track temperature, humidity, and light across multiple greenhouse sections
- 🔗 **Wireless Communication**: Use ESP-NOW for reliable node-to-node communication
- 🧠 **Intelligent Control**: Implement fuzzy logic for automated actuator control
- 📡 **Cloud Integration**: Send data to backend via MQTT for web interface access

### 🏗️ Current Hardware Architecture

The **updated hardware architecture** consists of four main components:

#### 🌱 **1. Penyemaian Node (Seedling Section)**
- 📍 **Purpose**: Monitors the seedling growing area
- 🌡️ **Sensors**: Temperature, humidity, light (DHT22 + BH1750)
- 📡 **Communication**: Transmits `SensorData` via ESP-NOW to Gateway Node
- ⚡ **Power**: Standalone ESP32 with sensor power

#### 🌿 **2. Dewasa Node (Mature Plants Section)**
> **📝 Note**: This is the physical board previously designated as "Peremajaan Node"

- 📍 **Purpose**: Monitors the mature plants growing area
- 🌡️ **Sensors**: Temperature, humidity, light (DHT22 + BH1750)
- 💡 **Actuators**: Fan and light LEDs for local control
- 📡 **Communication**: 
  - Sends `SensorData` via ESP-NOW to Gateway Node
  - Receives `ActuatorCommand` from Gateway Node via ESP-NOW

#### 🌉 **3. Gateway Node (Communication Bridge)**
- 📍 **Purpose**: Acts as a communication hub between nodes
- 📡 **ESP-NOW**: Receives sensor data from Penyemaian & Dewasa nodes
- 🔗 **Serial**: Forwards aggregated data to Remaja Master via UART
- 🎛️ **Control Relay**: Reads GPIO signals from Remaja Master and sends commands to Dewasa Node
- ⚡ **Features**: Implements ACK/retry mechanism for reliable command delivery

#### 🧠 **4. Remaja Node (Master) (Young Plants + System Controller)**
> **📝 Note**: This is the physical board previously designated as "Dewasa Node"

- 📍 **Purpose**: Monitors young plants section AND acts as system master
- 🌡️ **Local Sensors**: Temperature, humidity, light (DHT22 + BH1750)
- 💡 **Local Actuators**: Fan and light LEDs (also used as GPIO signals to Gateway)
- 🧠 **Intelligence**: Runs Fuzzy Logic Controller for automated decisions
- 📡 **MQTT**: Publishes sensor data and subscribes to control commands
- 🔗 **Serial**: Receives aggregated sensor data from Gateway
- 🌐 **WiFi**: Connects to internet for MQTT and NTP time sync

---

<details>
<summary><strong>🔧 2. Code Structure</strong></summary>

> **💡 Note**: The codebase is organized into main firmware files and shared libraries for modularity.

<details>
<summary><strong>📄 2.1. Main Node Files (`src/`)</strong></summary>

#### 🌱 **Penyemaian Node**
- **`PenyemaianNode.cpp`**: Firmware for the seedling satellite node
  - 📊 Reads local sensors (DHT22, BH1750)
  - 📡 Sends `SensorData` to Gateway via ESP-NOW
  - ⏰ Configurable read/send intervals

#### 🌿 **Dewasa Node** 
- **`DewasaNode.cpp`**: Firmware for the mature plants node
  - 📊 Reads local sensors (DHT22, BH1750)
  - 📡 Sends `SensorData` to Gateway via ESP-NOW
  - 🎛️ Receives `ActuatorCommand` from Gateway via ESP-NOW
  - 💡 Controls local fan and light LEDs
  - > **📝 Note**: This was previously `PeremajaanNode.cpp`

#### 🌉 **Gateway Node**
- **`GatewayNode.cpp`**: Firmware for the communication bridge
  - 📡 Receives sensor data from Penyemaian & Dewasa (ESP-NOW)
  - 🔗 Forwards aggregated JSON to Remaja Master (Serial)
  - 🎛️ Reads GPIO signals from Remaja Master for Dewasa commands
  - 📤 Sends commands to Dewasa Node with ACK/retry mechanism

#### 🧠 **Remaja Node (Master)**
- **`RemajaNode_Master.cpp`**: Firmware for the system controller
  - 📊 Reads local Remaja sensors
  - 🔗 Receives aggregated data from Gateway (Serial)
  - 🧠 Runs Fuzzy Logic Controller
  - 📡 Handles MQTT pub/sub
  - 🎛️ Signals Dewasa commands via GPIO to Gateway
  - > **📝 Note**: This was previously `DeWasaNode_Master.cpp`

#### 🛠️ **Utility Files**
- **`GetMacAddress.cpp`**: 🆔 Utility to find ESP32 MAC addresses
- **`HX711_Reader.cpp`**: ⚖️ Load cell reader (standalone example)
- **`Test.cpp`**: 🔍 ESP-NOW communication testing sketch

</details>

<details>
<summary><strong>📚 2.2. Shared Libraries (`lib/`)</strong></summary>

#### 🔧 **Common Configuration**
- **`Common/NodeConfig.h`**: 🛠️ Central configuration hub
  - 🆔 MAC addresses for all nodes (updated for new roles)
  - 📡 WiFi channel for ESP-NOW
  - ⏰ Data validity timeouts and intervals
  - 🔌 Pin definitions for sensors and actuators
  - 🌐 NTP server configuration
  - 🔧 ESP-NOW command parameters (ACK/retry)
  - 🐛 Debug flags

- **`Common/SensorData.h`**: 📊 Data structure definitions
  - 📈 `struct SensorData`: Standard sensor readings format
  - 🎛️ `struct ActuatorCommand`: Gateway-to-Dewasa control commands
  - 📦 `struct CombinedData`: Legacy compatibility structure

#### 📡 **Communication Managers**
- **`ESPNowManager/`**: 📶 ESP-NOW communication handler
  - 🔗 Manages peer connections and data transmission
  - 📨 Handles sending and receiving callbacks
  - > **📝 Note**: Current version optimized for `CombinedData` legacy support

- **`MQTTManager/`**: ☁️ MQTT and WiFi communication
  - 🌐 WiFi connection management
  - 📡 MQTT publish/subscribe functionality
  - 📊 JSON payload generation for sensor data
  - 🔐 TLS/MQTTS support

#### 🌡️ **Sensor & Control Managers**
- **`SensorManager/`**: 📊 Local sensor reading
  - 🌡️ DHT22 temperature/humidity interface
  - 💡 BH1750 light sensor interface
  - ✅ Data validation and error handling

- **`FuzzyController/`**: 🧠 Intelligent decision making
  - 🎯 Fuzzy logic implementation for actuator control
  - 📈 Environmental condition analysis
  - ⚙️ Automatic fan/light state determination

</details>
</details>


---

<details>
<summary><strong>🛠️ 3. Hardware Requirements</strong></summary>

> **💡 Note**: Physical hardware for each ESP32 board remains the same, but their logical roles have been reassigned.

| Node Type | Hardware Components | Purpose |
|-----------|-------------------|---------|
| 🌱 **Penyemaian** | ESP32, DHT22, BH1750 | Seedling monitoring |
| 🌿 **Dewasa** | ESP32, DHT22, BH1750, 2x LEDs + Resistors | Mature plants monitoring + actuators |
| 🌉 **Gateway** | ESP32 | Communication bridge |
| 🧠 **Remaja Master** | ESP32, DHT22, BH1750, 2x LEDs + Resistors, WiFi | Young plants + system controller |

### 📋 **Detailed Requirements**

#### 🌱 **Penyemaian Node**
- **ESP32 DevKit**: Main microcontroller
- **DHT22**: Temperature and humidity sensor
- **BH1750**: Digital light sensor
- **Power Supply**: 5V adapter or USB power
- **Enclosure**: Weatherproof housing for greenhouse environment

#### 🌿 **Dewasa Node**
> **📝 Using the board previously designated as "Peremajaan Node"**

- **ESP32 DevKit**: Main microcontroller
- **DHT22**: Temperature and humidity sensor
- **BH1750**: Digital light sensor
- **2x LEDs + Resistors**: Fan and light actuator simulation
- **Power Supply**: 5V adapter or USB power
- **Enclosure**: Weatherproof housing

#### 🌉 **Gateway Node**
- **ESP32 DevKit**: Main microcontroller
- **Jumper Wires**: For serial connection to Remaja Master
- **Power Supply**: 5V adapter or USB power
- **Enclosure**: Basic protection housing

#### 🧠 **Remaja Node (Master)**
> **📝 Using the board previously designated as "Dewasa Node"**

- **ESP32 DevKit**: Main microcontroller with WiFi capability
- **DHT22**: Temperature and humidity sensor
- **BH1750**: Digital light sensor
- **2x LEDs + Resistors**: Fan and light actuator simulation + GPIO signaling
- **Power Supply**: 5V adapter or USB power
- **Internet Access**: WiFi connection for MQTT and NTP

</details>

---

<details>
<summary><strong>🔌 4. Pin Connections & Configuration</strong></summary>

> **💡 Note**: Proper pin configuration is critical for system functionality. Double-check all connections before powering on.

<details>
<summary><strong>🌡️ 4.1. Common Sensor Pins</strong></summary>

**Applied to**: Penyemaian, Dewasa, and Remaja Master nodes

#### 📊 **Sensor Connections**
| Sensor | Pin | GPIO | Description |
|--------|-----|------|-------------|
| 🌡️ **DHT22 Data** | `DHT_PIN` | GPIO4 | Temperature/humidity data line |
| 💡 **BH1750 SDA** | I2C SDA | GPIO21 | Light sensor data line |
| 💡 **BH1750 SCL** | I2C SCL | GPIO22 | Light sensor clock line |
| 💡 **BH1750 ADDR** | - | GND/VCC | I2C address selection |

#### ⚡ **Power Connections**
- **DHT22**: VCC to 3.3V, GND to GND
- **BH1750**: VCC to 3.3V, GND to GND
- **Pull-up Resistors**: 4.7kΩ on DHT22 data line (often built-in on modules)

</details>

<details>
<summary><strong>💡 4.2. Actuator & Signal Pins</strong></summary>

#### 🧠 **Remaja Node (Master) - Dual Purpose Pins**
| Function | Pin Name | GPIO | Description |
|----------|----------|------|-------------|
| 🌀 **Fan LED/Signal** | `REMAJA_FAN_LED_PIN` | GPIO18 | Local actuator + Gateway signal |
| 💡 **Light LED/Signal** | `REMAJA_LIGHT_LED_PIN` | GPIO19 | Local actuator + Gateway signal |

> **🔄 Dual Purpose**: These pins control local LEDs AND serve as digital signals to the Gateway Node

#### 🌿 **Dewasa Node - Local Actuators**
| Function | Pin Name | GPIO | Description |
|----------|----------|------|-------------|
| 🌀 **Fan LED** | `DEWASA_FAN_PIN` | GPIO18 | Fan simulation LED |
| 💡 **Light LED** | `DEWASA_LIGHT_PIN` | GPIO19 | Light simulation LED |

#### 🌉 **Gateway Node - Command Inputs**
| Function | Pin Name | GPIO | Connected To |
|----------|----------|------|--------------|
| 🌀 **Fan Command** | `GATEWAY_CMD_FAN_INPUT_PIN` | GPIO18 | Remaja Master GPIO18 |
| 💡 **Light Command** | `GATEWAY_CMD_LIGHT_INPUT_PIN` | GPIO19 | Remaja Master GPIO19 |

</details>

<details>
<summary><strong>↔️ 4.3. Serial Connection (Gateway ↔ Remaja Master)</strong></summary>

#### 🔗 **UART Configuration**
- **Baud Rate**: `SERIAL_BAUD_RATE` (115200 by default)
- **Interface**: `Serial2` on both devices
- **Buffer**: Hardware serial for reliable communication

#### 📋 **Wiring Diagram**
```
Gateway ESP32          Remaja Master ESP32
-------------          -------------------
GPIO17 (TX2) --------> GPIO16 (RX2)
GPIO16 (RX2) <-------- GPIO17 (TX2)
GPIO18       <-------- GPIO18 (LED/Signal)
GPIO19       <-------- GPIO19 (LED/Signal)
GND          <-------> GND
```

#### ⚠️ **Connection Notes**
- 🔄 **Cross Connection**: TX of one connects to RX of other
- 🌍 **Common Ground**: Essential for proper communication
- 📏 **Wire Length**: Keep serial wires as short as possible (<30cm recommended)
- 🔧 **Pin Verification**: Confirm `Serial2` pin mapping for your specific ESP32 variant

</details>
</details>

---

<details>
<summary><strong>⚙️ 5. System Configuration (Critical Setup Steps)</strong></summary>

> **💡 Note**: Proper configuration is essential for system functionality. Follow these steps carefully.

<details>
<summary><strong>🆔 5.1. MAC Address Configuration</strong></summary>

#### 📋 **Step-by-Step Process**

1. **🔍 Find MAC Addresses**
   - Upload `GetMacAddress.cpp` to each ESP32 board
   - Note down the unique MAC address displayed in Serial Monitor
   - Label each board with its MAC address for future reference

2. **📝 Update Configuration**
   - Open `Hardware/lib/Common/NodeConfig.h`
   - Update the following arrays with correct MACs:

```cpp
// 🆔 MAC Address Assignments (Updated for New Logical Roles)
const uint8_t MAC_ADDR_PENYEMAIAN[] = {0xXX, 0xXX, 0xXX, 0xXX, 0xXX, 0xXX};  // 🌱 Seedling section
const uint8_t MAC_ADDR_DEWASA[] = {0xXX, 0xXX, 0xXX, 0xXX, 0xXX, 0xXX};      // 🌿 Mature plants (former Peremajaan)
const uint8_t MAC_ADDR_GATEWAY[] = {0xXX, 0xXX, 0xXX, 0xXX, 0xXX, 0xXX};     // 🌉 Communication bridge
const uint8_t MAC_ADDR_REMAJA_MASTER[] = {0xXX, 0xXX, 0xXX, 0xXX, 0xXX, 0xXX}; // 🧠 System controller (former Dewasa)
```

#### ⚠️ **Important Notes**
- 🏷️ **Board Labels**: Physically label boards with their new logical roles
- 🔄 **Role Mapping**: Former "Peremajaan" board → New "Dewasa" role
- 🔄 **Role Mapping**: Former "Dewasa" board → New "Remaja Master" role

</details>

<details>
<summary><strong>📡 5.2. ESP-NOW Channel Configuration</strong></summary>

#### 🔧 **Channel Settings**
- **Location**: `Hardware/lib/Common/NodeConfig.h`
- **Setting**: `#define WIFI_CHANNEL 1` (or your preferred channel)
- **Scope**: Must be identical for Penyemaian, Dewasa, and Gateway nodes

#### ⚠️ **Critical Requirements**
- 📶 **Same Channel**: Penyemaian, Dewasa, and Gateway MUST use identical channel
- 🌐 **WiFi Separation**: Remaja Master uses standard WiFi (different from ESP-NOW channel)
- 🏠 **Environment Check**: Ensure chosen channel isn't crowded in your area

```cpp
// 📡 ESP-NOW Communication Channel
#define WIFI_CHANNEL 1  // Must match on Penyemaian, Dewasa, and Gateway
```

</details>

<details>
<summary><strong>🌐 5.3. WiFi & MQTT Configuration (Remaja Master Only)</strong></summary>

#### 📝 **Configuration Location**
Open `Hardware/src/RemajaNode_Master.cpp` and update:

```cpp
// 🌐 WiFi Credentials
const char* ssid = "YOUR_WIFI_NETWORK";
const char* password = "YOUR_WIFI_PASSWORD";

// 📡 MQTT Broker Configuration
const char* mqtt_server = "your-mqtt-broker.cloud.hivemq.com";
const int mqtt_port = 8883;  // 🔐 TLS/MQTTS port
const char* mqtt_username = "your_username";
const char* mqtt_password = "your_password";

// 📊 MQTT Topics
const char* mqtt_publish_topic = "lokatech/greenhouse/sensors";
const char* mqtt_control_topic = "lokatech/greenhouse/controls/set";
```

#### 🔐 **Security Considerations**
- ✅ **Use MQTTS**: Port 8883 for encrypted communication
- 🔑 **Strong Credentials**: Use complex passwords
- 🛡️ **ACL Setup**: Configure broker access controls

</details>

<details>
<summary><strong>⏰ 5.4. Timing & Interval Configuration</strong></summary>

#### 📋 **Key Timing Parameters**
Located in `Hardware/lib/Common/NodeConfig.h`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| 🌱 `PENYEMAIAN_ESP_NOW_TIMEOUT` | 30000ms | Gateway freshness timeout for Penyemaian data |
| 🌿 `DEWASA_ESP_NOW_TIMEOUT` | 30000ms | Gateway freshness timeout for Dewasa data |
| 🔗 `GATEWAY_SERIAL_TIMEOUT` | 45000ms | Remaja Master timeout for Gateway data |
| 📊 `SENSOR_READ_INTERVAL` | 5000ms | How often nodes read sensors |
| 📡 `SEND_INTERVAL` | 10000ms | ESP-NOW transmission frequency |
| ☁️ `MQTT_PUBLISH_INTERVAL` | 30000ms | MQTT publishing frequency |

#### 🎛️ **Command Control Parameters**
| Parameter | Default | Description |
|-----------|---------|-------------|
| ⏱️ `COMMAND_ACK_TIMEOUT_MS` | 1000ms | ESP-NOW command acknowledgment timeout |
| 🔄 `MAX_COMMAND_SEND_RETRIES` | 3 | Maximum retry attempts |
| ⏸️ `COMMAND_RETRY_DELAY_MS` | 500ms | Delay between retry attempts |

</details>

<details>
<summary><strong>🕰️ 5.5. NTP Time Synchronization (Remaja Master)</strong></summary>

#### 🌐 **NTP Server Configuration**
```cpp
// 🕰️ Time Synchronization Settings
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.google.com";
const long GMT_OFFSET_SEC = 7 * 3600;    // 🌍 WIB (UTC+7)
const int DAYLIGHT_OFFSET_SEC = 0;       // No daylight saving in Indonesia
```

#### ⚙️ **Sync Parameters**
- 🔄 **Sync Interval**: `NTP_SYNC_INTERVAL_MS` (default: 3600000ms = 1 hour)
- ⏰ **Timeout**: `NTP_SYNC_TIMEOUT_MS` (default: 10000ms)
- 🎯 **Accuracy**: Ensures accurate timestamps in MQTT messages

</details>

<details>
<summary><strong>🐛 5.6. Debug Configuration</strong></summary>

#### 🔧 **Debug Flags**
Enable/disable in `Hardware/lib/Common/NodeConfig.h`:

```cpp
// 🐛 Debug Output Controls
#define DEBUG_PENYEMAIAN     // 🌱 Penyemaian node debug messages
#define DEBUG_DEWASA         // 🌿 Dewasa node debug messages  
#define DEBUG_GATEWAY        // 🌉 Gateway node debug messages
#define DEBUG_REMAJA_MASTER  // 🧠 Remaja Master debug messages
```

#### 📊 **Serial Monitor Settings**
- **Baud Rate**: 115200
- **Line Ending**: Both NL & CR
- **Buffer**: Monitor output for troubleshooting

</details>
</details>

---

<details>
<summary><strong>🌊 6. Data Flow & Structures</strong></summary>

> **💡 Note**: Understanding the data flow is crucial for troubleshooting and system optimization.

<details>
<summary><strong>📡 6.1. ESP-NOW Communication</strong></summary>

#### 🌱 **Penyemaian Node → Gateway Node**
- **Protocol**: ESP-NOW
- **Structure**: `SensorData`
- **Content**: Temperature, humidity, light readings with validity flags
- **Frequency**: Every `SEND_INTERVAL` (default: 10 seconds)

#### 🌿 **Dewasa Node → Gateway Node**
- **Protocol**: ESP-NOW  
- **Structure**: `SensorData`
- **Content**: Temperature, humidity, light readings with validity flags
- **Frequency**: Every `SEND_INTERVAL` (default: 10 seconds)

#### 🎛️ **Gateway Node → Dewasa Node (Commands)**
- **Protocol**: ESP-NOW with ACK/Retry
- **Structure**: `ActuatorCommand`
```cpp
struct ActuatorCommand {
    char device[10]; // "fan" or "light"
    bool state;      // true for ON, false for OFF
};
```
- **Reliability**: ACK confirmation with up to 3 retries

</details>

<details>
<summary><strong>🔗 6.2. Serial Communication</strong></summary>

#### 📊 **Gateway Node → Remaja Master (Sensor Data)**
- **Protocol**: UART (Serial2)
- **Format**: JSON string
- **Frequency**: When ESP-NOW data received or periodically

**Example JSON Structure**:
```json
{
  "penyemaian": {
    "isValid": true,           // 📶 Fresh data received via ESP-NOW
    "nodeName": "penyemaian",
    "temp": 26.1, "hum": 62.3, "light": 6800,
    "tempValid": true, "humValid": true, "lightValid": true,
    "timestamp_node": 12345000,     // ⏰ Node's millis() when sent
    "espnow_latency_ms": 30        // 📡 Simulated ESP-NOW latency
  },
  "dewasa": {
    "isValid": true,
    "nodeName": "dewasa", 
    "temp": 25.5, "hum": 60.1, "light": 7500,
    "tempValid": true, "humValid": true, "lightValid": true,
    "timestamp_node": 12345100,
    "espnow_latency_ms": 35
  },
  "timestamp_gateway_ms": 12345678  // ⏰ Gateway's millis() when created
}
```

#### 🎛️ **Remaja Master → Gateway (Control Signals)**
- **Protocol**: GPIO Digital Signals
- **Method**: Remaja Master sets `REMAJA_FAN_LED_PIN` & `REMAJA_LIGHT_LED_PIN`
- **Reading**: Gateway reads via `GATEWAY_CMD_FAN_INPUT_PIN` & `GATEWAY_CMD_LIGHT_INPUT_PIN`
- **Trigger**: State changes detected by Gateway polling

</details>

<details>
<summary><strong>☁️ 6.3. MQTT Communication</strong></summary>

#### 📤 **Remaja Master → MQTT Broker (Sensor Data)**
- **Topic**: `lokatech/greenhouse/sensors`
- **Format**: JSON with NTP-synchronized timestamp
- **Frequency**: Every `MQTT_PUBLISH_INTERVAL` (default: 30 seconds)

**Example MQTT Payload**:
```json
{
  "hardware_send_timestamp_str": "2023-10-27T10:30:00.123Z", // 🕰️ NTP timestamp
  "sections": {
    "remaja": {           // 🧠 Local Remaja Master data
      "temp": 27.5, "humidity": 65, "light": 9000,
      "trends": {"temp": "increasing", "humidity": "stable"}
    },
    "penyemaian": {       // 🌱 From Gateway
      "temp": 26.1, "humidity": 62.3, "light": 6800,
      "espnow_latency_ms": 30,
      "trends": {"temp": "stable", "humidity": "decreasing"}
    },
    "dewasa": {           // 🌿 From Gateway
      "temp": 25.5, "humidity": 60.1, "light": 7500,
      "espnow_latency_ms": 35,
      "trends": {"temp": "decreasing", "humidity": "stable"}
    }
  },
  "averages": { "temp": 26.4, "humidity": 62, "light": 7767 },
  "actuators": {          // 🎛️ Remaja Master's local actuators only
    "fan": { "state": true, "mode": "auto" },
    "light": { "state": false, "mode": "manual" }
  }
}
```

#### 📥 **MQTT Broker → Remaja Master (Control Commands)**
- **Topic**: `lokatech/greenhouse/controls/set`
- **Format**: JSON control commands
- **Source**: Web UI via Flask API

**Example Control Commands**:
```json
// 🧠 For Remaja Master's local actuators
{"device":"fan", "node":"remaja", "state":true, "mode":"manual"}

// 🌿 For Dewasa Node's actuators (relayed via Gateway)
{"device":"light", "node":"dewasa", "state":false, "mode":"manual"}
```

#### 🔄 **Command Processing Logic**
- **`node: "remaja"`**: Controls local Remaja actuators directly
- **`node: "dewasa"`**: Sets GPIO signals for Gateway to relay to Dewasa Node

</details>
</details>

---

<details>
<summary><strong>📤 7. Building and Uploading (PlatformIO)</strong></summary>

> **💡 Note**: Ensure you have PlatformIO Core CLI or VS Code Extension installed. Open the `Hardware` folder in PlatformIO.

#### 📋 **Upload Commands**

| Node Type | Environment | Command | Source File |
|-----------|-------------|---------|-------------|
| 🌱 **Penyemaian** | `penyemaian_node` | `pio run -e penyemaian_node -t upload` | `PenyemaianNode.cpp` |
| 🌿 **Dewasa** | `dewasa_node` | `pio run -e dewasa_node -t upload` | `DewasaNode.cpp` |
| 🌉 **Gateway** | `gateway_node` | `pio run -e gateway_node -t upload` | `GatewayNode.cpp` |
| 🧠 **Remaja Master** | `remaja_master` | `pio run -e remaja_master -t upload` | `RemajaNode_Master.cpp` |

#### 🔧 **Build Process**
1. **📁 Open Project**: Open `Hardware` folder in PlatformIO
2. **📝 Configure**: Ensure `platformio.ini` has correct environment settings
3. **🔨 Build**: `pio run -e [environment_name]`
4. **📤 Upload**: `pio run -e [environment_name] -t upload`
5. **📺 Monitor**: `pio device monitor -b 115200` (for debugging)

#### ⚠️ **Pre-Upload Checklist**
- ✅ **MAC Addresses**: Updated in `NodeConfig.h`
- ✅ **WiFi/MQTT**: Configured in `RemajaNode_Master.cpp`
- ✅ **Pin Connections**: Verified wiring matches code
- ✅ **Serial Port**: Correct port selected in IDE

</details>

---

<details>
<summary><strong>🕹️ 8. Actuator Control Path</strong></summary>

> **💡 Note**: Different control paths exist for Remaja (local) and Dewasa (remote) actuators.

<details>
<summary><strong>🧠 8.1. Remaja Actuators (Local Control)</strong></summary>

#### 🤖 **Auto Mode**
```
🌡️ Sensors → 🧠 Fuzzy Logic → 💡 LED Control
```
1. **📊 Data Collection**: Remaja Master reads local sensors + receives data from Gateway
2. **📈 Averaging**: Calculates system-wide averages (Remaja + Penyemaian + Dewasa)
3. **🧠 Fuzzy Logic**: Determines optimal actuator states based on environmental conditions
4. **💡 Direct Control**: Sets `REMAJA_FAN_LED_PIN` and `REMAJA_LIGHT_LED_PIN` directly

#### 👤 **Manual Mode**
```
🌐 Web UI → 📡 Flask API → ☁️ MQTT → 🧠 Remaja Master → 💡 LED Control
```
1. **🖱️ User Action**: User clicks control in web interface
2. **📡 API Call**: Frontend calls `/dashboard/controls/api/set_state`
3. **☁️ MQTT Publish**: Flask publishes to `lokatech/greenhouse/controls/set`
4. **📥 MQTT Receive**: Remaja Master receives command with `node: "remaja"`
5. **🎛️ Mode Switch**: Sets manual mode flag and applies user command
6. **💡 Direct Control**: Sets LED pins according to user command

</details>

<details>
<summary><strong>🌿 8.2. Dewasa Actuators (Remote Control)</strong></summary>

#### 🤖 **Auto Mode** (Indirect via Remaja Master)
```
🧠 Fuzzy Logic → 🔌 GPIO Signal → 🌉 Gateway → 📡 ESP-NOW → 🌿 Dewasa LEDs
```
1. **🧠 Decision Making**: Remaja Master runs fuzzy logic (same as local)
2. **🔌 Signal Output**: Sets GPIO pins that Gateway monitors
3. **👁️ Signal Detection**: Gateway detects state changes on input pins
4. **📡 Command Transmission**: Gateway sends `ActuatorCommand` via ESP-NOW
5. **✅ ACK/Retry**: Ensures reliable delivery with acknowledgment
6. **💡 Remote Control**: Dewasa Node controls its local LEDs

#### 👤 **Manual Mode**
```
🌐 Web UI → 📡 Flask API → ☁️ MQTT → 🧠 Remaja Master → 🔌 GPIO → 🌉 Gateway → 📡 ESP-NOW → 🌿 Dewasa LEDs
```
1. **🖱️ User Action**: User clicks control for Dewasa section
2. **📡 API Call**: Frontend calls Flask API
3. **☁️ MQTT Publish**: Flask publishes command with `node: "dewasa"`
4. **📥 MQTT Receive**: Remaja Master receives Dewasa command
5. **🔌 GPIO Signal**: Sets local LEDs (which also act as signals to Gateway)
6. **👁️ Signal Detection**: Gateway reads GPIO state change
7. **📡 ESP-NOW Command**: Gateway transmits to Dewasa Node
8. **💡 Remote Control**: Dewasa Node applies command to its actuators

</details>
</details>

---

<details>
<summary><strong>🔍 9. Troubleshooting</strong></summary>

> **💡 Note**: Always check Serial Monitor output at 115200 baud for all nodes involved.

<details>
<summary><strong>📡 9.1. ESP-NOW Communication Issues</strong></summary>

#### 🚫 **Penyemaian/Dewasa Not Sending to Gateway**
**Symptoms**: Gateway not receiving ESP-NOW data  
**Solutions**:
- ✅ **MAC Verification**: Confirm `MAC_ADDR_GATEWAY` in sender nodes
- ✅ **Channel Match**: Ensure `WIFI_CHANNEL` identical (Penyemaian, Dewasa, Gateway)
- ✅ **Serial Debug**: Check sender logs for "Sent successfully" vs "Failed to send"
- ✅ **Distance**: Reduce physical distance between nodes
- ✅ **Power Supply**: Ensure stable power to all nodes

#### 🚫 **Gateway Not Receiving from Satellites**
**Symptoms**: No "Received data from..." messages in Gateway serial monitor  
**Solutions**:
- ✅ **Peer Setup**: Verify `MAC_ADDR_PENYEMAIAN` and `MAC_ADDR_DEWASA` in Gateway code
- ✅ **Callback**: Ensure `OnDataRecv` callback is properly registered
- ✅ **Memory**: Check for memory issues preventing ESP-NOW initialization

#### 🚫 **Dewasa Not Responding to Commands**
**Symptoms**: Commands sent but no actuator response  
**Solutions**:
- ✅ **Command Reception**: Check Dewasa serial monitor for "Received control command"
- ✅ **Pin Configuration**: Verify `DEWASA_FAN_PIN` and `DEWASA_LIGHT_PIN` definitions
- ✅ **LED Wiring**: Check physical LED connections and resistors
- ✅ **ACK Response**: Ensure Dewasa sends acknowledgment back to Gateway

</details>

<details>
<summary><strong>🔗 9.2. Serial Communication Issues</strong></summary>

#### 🚫 **Remaja Master Not Receiving from Gateway**
**Symptoms**: No sensor data from satellite nodes  
**Solutions**:
- ✅ **Wiring Check**: Verify TX/RX cross-connection and common GND
- ✅ **Baud Rate**: Confirm `SERIAL_BAUD_RATE` matches on both ends
- ✅ **JSON Format**: Check Gateway logs for JSON structure validity
- ✅ **Buffer Overflow**: Monitor for serial buffer issues
- ✅ **Cable Length**: Keep serial cables under 30cm

#### 🚫 **GPIO Command Signaling Issues**
**Symptoms**: Gateway not detecting Remaja Master command signals  
**Solutions**:
- ✅ **Pin Mapping**: Confirm GPIO connections between Remaja Master and Gateway
- ✅ **Logic Levels**: Verify 3.3V logic compatibility
- ✅ **Polling Rate**: Check Gateway polling frequency for signal detection
- ✅ **Debouncing**: Ensure commands are held long enough for detection

</details>

<details>
<summary><strong>☁️ 9.3. MQTT & Network Issues</strong></summary>

#### 🚫 **WiFi Connection Failures**
**Symptoms**: Remaja Master can't connect to WiFi  
**Solutions**:
- ✅ **Credentials**: Verify SSID and password in `RemajaNode_Master.cpp`
- ✅ **Signal Strength**: Check WiFi signal strength at device location
- ✅ **Router Settings**: Ensure 2.4GHz band is enabled (ESP32 doesn't support 5GHz)
- ✅ **DHCP**: Verify router has available IP addresses

#### 🚫 **MQTT Broker Issues**
**Symptoms**: Can't publish/subscribe to MQTT topics  
**Solutions**:
- ✅ **Broker Credentials**: Verify `mqtt_server`, `mqtt_username`, `mqtt_password`
- ✅ **TLS Certificates**: Check if MQTTS certificates are valid
- ✅ **Topic Permissions**: Verify ACL settings allow publish/subscribe access
- ✅ **Connection Logs**: Monitor MQTT connection status messages

#### 🚫 **NTP Sync Failures**
**Symptoms**: Timestamps incorrect in MQTT messages  
**Solutions**:
- ✅ **Internet Access**: Ensure Remaja Master has internet connectivity
- ✅ **NTP Servers**: Try alternative NTP servers if defaults fail
- ✅ **Timezone**: Verify `GMT_OFFSET_SEC` is correct for your location
- ✅ **Firewall**: Check if NTP port 123 is blocked

</details>

<details>
<summary><strong>🔧 9.4. General Debugging Tips</strong></summary>

#### 🐛 **Enable Debug Output**
```cpp
// In Hardware/lib/Common/NodeConfig.h
#define DEBUG_PENYEMAIAN     // Enable for Penyemaian node
#define DEBUG_DEWASA         // Enable for Dewasa node
#define DEBUG_GATEWAY        // Enable for Gateway node
#define DEBUG_REMAJA_MASTER  // Enable for Remaja Master
```

#### 📊 **Serial Monitor Setup**
- **Baud Rate**: 115200
- **Line Ending**: Both NL & CR
- **Filter**: Look for keywords like "ERROR", "FAILED", "TIMEOUT"

#### 🔄 **Systematic Testing**
1. **🌱 Test Penyemaian**: Verify sensor readings and ESP-NOW sending
2. **🌿 Test Dewasa**: Verify sensor readings, ESP-NOW sending, and command reception
3. **🌉 Test Gateway**: Verify ESP-NOW reception and serial forwarding
4. **🧠 Test Remaja Master**: Verify local sensors, MQTT, and fuzzy logic

</details>
</details>

---

<details>
<summary><strong>🛡️ 10. Security Considerations</strong></summary>

> **💡 Note**: Security is crucial for production deployments. Consider these measures for enhanced protection.

<details>
<summary><strong>📡 10.1. ESP-NOW Security</strong></summary>

#### 🔓 **Current State**
- **Encryption**: Currently disabled (`encrypt = false`)
- **Authentication**: MAC address-based peer validation only
- **Vulnerability**: Data transmitted in plaintext over ESP-NOW

#### 🔐 **Recommended Improvements**
- **Enable Encryption**: Set `encrypt = true` and share Primary Master Key (PMK)
- **Key Management**: Implement secure key distribution and rotation
- **Physical Security**: Secure device locations to prevent tampering

```cpp
// Enhanced security example
esp_now_peer_info_t peerInfo;
peerInfo.encrypt = true;  // Enable encryption
// Set Local Master Key (LMK) for this peer
memcpy(peerInfo.lmk, your_lmk_key, 16);
```

</details>

<details>
<summary><strong>☁️ 10.2. MQTT Security</strong></summary>

#### ✅ **Current Security Measures**
- **TLS Encryption**: Uses MQTTS on port 8883
- **Authentication**: Username/password credentials
- **Broker**: HiveMQ Cloud with built-in security

#### 🔐 **Best Practices**
- **Strong Passwords**: Use complex, unique passwords
- **Certificate Validation**: Implement proper TLS certificate verification
- **ACL Configuration**: Restrict topic access by client
- **Connection Monitoring**: Log and monitor connection attempts

```cpp
// Enhanced MQTT security
WiFiClientSecure espClient;
espClient.setCACert(ca_cert);     // Validate server certificate
espClient.setCertificate(client_cert);  // Client certificate auth
espClient.setPrivateKey(private_key);   // Client private key
```

</details>

<details>
<summary><strong>🔗 10.3. Serial Communication Security</strong></summary>

#### ⚠️ **Current Vulnerabilities**
- **Plaintext**: Serial data transmitted without encryption
- **Physical Access**: Anyone with device access can intercept data
- **No Authentication**: No verification of data source

#### 🔐 **Mitigation Strategies**
- **Physical Security**: Secure device housings and access points
- **Data Validation**: Implement checksums and data integrity checks
- **Access Control**: Restrict physical access to serial connections
- **Enclosure**: Use tamper-evident housings for production

</details>

<details>
<summary><strong>🏠 10.4. Physical Security</strong></summary>

#### 🔒 **Device Protection**
- **Weatherproof Enclosures**: Protect from environmental factors
- **Tamper Evidence**: Use security seals on device housings
- **Mounting Security**: Secure mounting to prevent theft
- **Cable Protection**: Protect wiring from damage and tampering

#### 🔑 **Access Control**
- **Firmware Protection**: Use secure boot and encrypted firmware
- **Debug Access**: Disable or secure debug interfaces in production
- **Update Security**: Implement secure OTA update mechanisms
- **Recovery**: Plan for secure device recovery and re-provisioning

</details>

<details>
<summary><strong>🔄 10.5. Update & Maintenance Security</strong></summary>

#### 📦 **Firmware Updates**
- **Secure OTA**: Implement encrypted over-the-air updates
- **Version Control**: Track firmware versions and security patches
- **Rollback Capability**: Ensure ability to revert problematic updates
- **Update Authentication**: Verify update source and integrity

#### 🕰️ **Ongoing Security**
- **Regular Updates**: Keep all components updated with security patches
- **Security Audits**: Periodically review and test security measures
- **Incident Response**: Plan for security incident detection and response
- **Documentation**: Maintain security configuration documentation

</details>
</details>

**📚 This documentation provides a comprehensive guide to the LokaTech Greenhouse Monitoring System's hardware components, designed to be accessible for junior developers while maintaining full technical detail.**

<style>
/* Add some styling for better drawer appearance */
details {
    margin: 1rem 0;
    padding: 0.5rem;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background-color: #fafafa;
}

details[open] {
    background-color: #ffffff;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

summary {
    cursor: pointer;
    padding: 0.5rem;
    margin: -0.5rem;
    border-radius: 4px;
    background-color: #f5f5f5;
    font-weight: 600;
    transition: background-color 0.2s ease;
}

summary:hover {
    background-color: #e8e8e8;
}

details[open] > summary {
    margin-bottom: 1rem;
    border-bottom: 1px solid #e0e0e0;
}

/* Nested details styling */
details details {
    margin-left: 1rem;
    border-left: 3px solid #007acc;
    border-radius: 4px;
    background-color: #f9f9f9;
}

details details summary {
    background-color: #f0f8ff;
    font-weight: 500;
}

details details[open] summary {
    background-color: #e6f3ff;
}
</style>
