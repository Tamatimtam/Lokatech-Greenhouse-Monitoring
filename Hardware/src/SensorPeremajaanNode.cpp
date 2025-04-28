#include <Arduino.h>
#include <ArduinoJson.h> // For Serial communication JSON parsing/serialization
#include <WiFi.h> // For MQTTManager
#include <esp_wifi.h> // For setting WiFi channel (needed by MQTTManager?)

// Include shared libraries
#include "SensorManager.h" // Includes DHT, Wire, BH1750
#include "MQTTManager.h" // Includes WiFi, PubSubClient
#include "FuzzyController.h"
#include "NodeConfig.h" // Includes MQTT config, Serial pins, Relay pins, Timeouts
#include "SensorData.h" // Includes SensorData and ControlCommand structs

// --- Configuration Flags ---
#define TEMP_HUMID_SIMULATION_MODE false // Set to true to simulate DHT22 readings
#define LIGHT_SIMULATION_MODE false      // Set to true to simulate BH1750 readings

// --- Serial Communication ---
#define SERIAL_TO_GATEWAY Serial1 // Define which Serial port to use (Serial1 or Serial2)
// SERIAL_BAUD_RATE, SERIAL_A_RX_PIN, SERIAL_A_TX_PIN defined in NodeConfig.h

// --- Timing Variables ---
unsigned long lastSensorReadTime = 0;
unsigned long lastMqttPublishTime = 0;
// SENSOR_READ_INTERVAL, MQTT_PUBLISH_INTERVAL defined in NodeConfig.h

// --- Data Storage from Gateway B (via Serial) ---
SensorData receivedPenyemaianData;
SensorData receivedDewasaData;
unsigned long lastPenyemaianSerialTime = 0; // Timestamp of last valid Penyemaian data from B
unsigned long lastDewasaSerialTime = 0;     // Timestamp of last valid Dewasa data from B
// SERIAL_DATA_TIMEOUT_B_TO_A defined in NodeConfig.h

// --- Actuator Control Mode and Desired States ---
bool peremajaanLightManual = false; // Tracks if peremajaan light is in manual override mode
bool desiredManualPeremajaanLightState = false; // Desired state when in manual mode

bool dewasaFanManual = false;       // Tracks if dewasa fan is in manual override mode (commanded from here)
bool desiredManualDewasaFanState = false; // Desired state when in manual mode

bool dewasaLightManual = false;     // Tracks if dewasa light is in manual override mode (commanded from here)
bool desiredManualDewasaLightState = false; // Desired state when in manual mode

// --- Auto States (Determined by Fuzzy Logic) ---
bool autoPeremajaanLightState = false;
bool autoDewasaFanState = false;
bool autoDewasaLightState = false;

// --- Track Last Sent Dewasa States (to avoid redundant commands) ---
static bool lastSentDewasaFanState = false;
static bool lastSentDewasaLightState = false;


// --- Managers ---
SensorManager* sensorManager;
MQTTManager* mqttManager;
FuzzyController* fuzzyController;

// --- Function Prototypes ---
void mqttCallback(char* topic, byte* payload, unsigned int length); // MQTT message callback
void runFuzzyLogic(); // Function to calculate averages and run fuzzy logic, setting auto states
void calculateAverages(float &avgTemp, float &avgHumidity, float &avgLight, bool &averagesValid, int &tempCount, int &humidityCount, int &lightCount); // Calculate averages from all sources
void sendDewasaControlCommand(const char* device, bool state); // Send control command to Dewasa via Serial to B

void setup() {
    // Initialize serial communication for debugging
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n\n[MasterPeremajaanNode] Starting Master Peremajaan Node (ESP32-A)...");

    // Initialize Serial communication with Gateway B
    SERIAL_TO_GATEWAY.begin(SERIAL_BAUD_RATE, SERIAL_8N1, SERIAL_A_RX_PIN, SERIAL_A_TX_PIN);
    Serial.printf("[MasterPeremajaanNode] Serial communication with Gateway B initialized on pins RX:%d, TX:%d at %lu baud.\n", SERIAL_A_RX_PIN, SERIAL_A_TX_PIN, SERIAL_BAUD_RATE);

    // Initialize local Sensor Manager
    sensorManager = new SensorManager(DHT_PIN, TEMP_HUMID_SIMULATION_MODE, LIGHT_SIMULATION_MODE);
    sensorManager->begin();
    Serial.println("[MasterPeremajaanNode] Local Sensor Manager initialized.");

    // Initialize WiFi and MQTT
    // MQTTManager handles WiFi connection internally
    mqttManager = new MQTTManager(WIFI_SSID, WIFI_PASSWORD, MQTT_SERVER, MQTT_PORT, MQTT_PUBLISH_TOPIC);
    if (!mqttManager->begin()) {
        Serial.println("[MasterPeremajaanNode] ERROR: Failed to initialize MQTT (and WiFi)");
        // Consider halting or retrying
    } else {
        Serial.println("[MasterPeremajaanNode] MQTT Manager initialized.");
        if (mqttManager->connect()) {
            Serial.println("[MasterPeremajaanNode] Connected to MQTT broker");
            mqttManager->getClient().setCallback(mqttCallback);
            if (mqttManager->getClient().subscribe(MQTT_CONTROL_TOPIC)) {
                 Serial.printf("[MasterPeremajaanNode] Subscribed to control topic: %s\n", MQTT_CONTROL_TOPIC);
            } else {
                 Serial.println("[MasterPeremajaanNode] ERROR: Failed to subscribe to control topic!");
            }
        } else {
           Serial.println("[MasterPeremajaanNode] WARNING: Failed to connect to MQTT broker initially.");
        }
    }

    // Initialize Fuzzy Controller
    fuzzyController = new FuzzyController();
    fuzzyController->begin(); // Initialize sets, rules etc.
    Serial.println("[MasterPeremajaanNode] Fuzzy Controller initialized.");

    // Initialize Peremajaan Light relay pin
    pinMode(PEREMAJAAN_LIGHT_RELAY_PIN, OUTPUT);
    digitalWrite(PEREMAJAAN_LIGHT_RELAY_PIN, LOW); // Start OFF
    Serial.printf("[MasterPeremajaanNode] Peremajaan Light Relay pin %d initialized.\n", PEREMAJAAN_LIGHT_RELAY_PIN);

    // Initialize received data structures with default invalid states
    memset(&receivedPenyemaianData, 0, sizeof(SensorData));
    strncpy(receivedPenyemaianData.nodeName, "penyemaian", sizeof(receivedPenyemaianData.nodeName) - 1);
    receivedPenyemaianData.nodeName[sizeof(receivedPenyemaianData.nodeName) - 1] = '\0';
    receivedPenyemaianData.temperatureValid = false; receivedPenyemaianData.humidityValid = false; receivedPenyemaianData.lightValid = false;

    memset(&receivedDewasaData, 0, sizeof(SensorData));
    strncpy(receivedDewasaData.nodeName, "dewasa", sizeof(receivedDewasaData.nodeName) - 1);
    receivedDewasaData.nodeName[sizeof(receivedDewasaData.nodeName) - 1] = '\0';
    receivedDewasaData.temperatureValid = false; receivedDewasaData.humidityValid = false; receivedDewasaData.lightValid = false;

    Serial.println("[MasterPeremajaanNode] Setup completed.");
}

void loop() {
    unsigned long currentTime = millis();

    // --- Read Local Sensors ---
    if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
        lastSensorReadTime = currentTime;
        Serial.println("\n[MasterPeremajaanNode] Reading local sensors...");
        sensorManager->readSensors(); // Reads into internal SensorManager buffers
    }

    // --- Process Incoming Serial Data from Gateway B ---
    if (SERIAL_TO_GATEWAY.available()) {
        String line = SERIAL_TO_GATEWAY.readStringUntil('\n');
        line.trim();

        if (line.length() > 0) {
            Serial.printf("[MasterPeremajaanNode] Received Serial data from B: %s\n", line.c_str());
            StaticJsonDocument<512> doc; // Adjust size as needed
            DeserializationError error = deserializeJson(doc, line);

            if (!error) {
                const char* type = doc["type"];
                const char* node = doc["node"];

                if (type && node) {
                    if (strcmp(type, "sensor") == 0) {
                        // Received sensor data from Penyemaian or Dewasa (forwarded by B)
                        bool isRecent = doc["isRecent"] | false; // Get validity flag from B

                        if (strcmp(node, "penyemaian") == 0) {
                            // Update Penyemaian data
                            receivedPenyemaianData.temperature = doc["temp"] | -999.0f;
                            receivedPenyemaianData.humidity = doc["hum"] | -999.0f;
                            receivedPenyemaianData.lightIntensity = doc["light"] | -999.0f;
                            // Use validity flags from the original node, but also check B's isRecent flag
                            receivedPenyemaianData.temperatureValid = (doc["valid"]["temp"] | false) && isRecent;
                            receivedPenyemaianData.humidityValid = (doc["valid"]["hum"] | false) && isRecent;
                            receivedPenyemaianData.lightValid = (doc["valid"]["light"] | false) && isRecent;
                            receivedPenyemaianData.timestamp = millis(); // Timestamp when A received it
                            lastPenyemaianSerialTime = millis(); // Update last received time
                            Serial.println("[MasterPeremajaanNode] Updated Penyemaian data from Serial.");

                        } else if (strcmp(node, "dewasa") == 0) {
                            // Update Dewasa data
                            receivedDewasaData.temperature = doc["temp"] | -999.0f;
                            receivedDewasaData.humidity = doc["hum"] | -999.0f;
                            receivedDewasaData.lightIntensity = doc["light"] | -999.0f;
                             // Use validity flags from the original node, but also check B's isRecent flag
                            receivedDewasaData.temperatureValid = (doc["valid"]["temp"] | false) && isRecent;
                            receivedDewasaData.humidityValid = (doc["valid"]["hum"] | false) && isRecent;
                            receivedDewasaData.lightValid = (doc["valid"]["light"] | false) && isRecent;
                            receivedDewasaData.timestamp = millis(); // Timestamp when A received it
                            lastDewasaSerialTime = millis(); // Update last received time
                            Serial.println("[MasterPeremajaanNode] Updated Dewasa data from Serial.");

                        } else {
                            Serial.printf("[MasterPeremajaanNode] WARNING: Received sensor data for unknown node '%s' via Serial.\n", node);
                        }
                    } else if (strcmp(type, "command") == 0) {
                         // Received control command from B (originally from MQTT via A, forwarded by B)
                         // This is for A's local light
                         if (strcmp(node, "peremajaan_A") == 0) {
                             const char* device = doc["device"];
                             bool state = doc["state"];
                             if (device && strcmp(device, "light") == 0) {
                                 // This command originated from MQTT and was sent to B, then forwarded back to A
                                 // Assume manual mode is implied for commands received this way
                                 peremajaanLightManual = true;
                                 desiredManualPeremajaanLightState = state;
                                 Serial.printf("[MasterPeremajaanNode] Peremajaan Light manual state set to %s (via Serial from B)\n", state ? "ON" : "OFF");
                                 // Pin control happens in loop based on final state
                             } else {
                                 Serial.printf("[MasterPeremajaanNode] WARNING: Received unknown command device '%s' for node '%s' via Serial.\n", device, node);
                             }
                         } else {
                             Serial.printf("[MasterPeremajaanNode] WARNING: Received command for unexpected node '%s' via Serial.\n", node);
                         }
                    } else {
                        Serial.printf("[MasterPeremajaanNode] WARNING: Received unknown message type '%s' via Serial.\n", type);
                    }
                } else {
                    Serial.println("[MasterPeremajaanNode] WARNING: Received Serial JSON missing 'type' or 'node'.");
                }
            } else {
                Serial.printf("[MasterPeremajaanNode] ERROR: Failed to parse Serial JSON from B: %s\n", error.c_str());
            }
        }
    }

    // --- Check Data Validity (Timeouts) ---
    // Validity flags within received data are set by B based on its ESP-NOW timeouts.
    // Here, we check if the Serial data from B itself is recent.
    bool isPenyemaianSerialRecent = (currentTime - lastPenyemaianSerialTime) < SERIAL_DATA_TIMEOUT_B_TO_A;
    bool isDewasaSerialRecent = (currentTime - lastDewasaSerialTime) < SERIAL_DATA_TIMEOUT_B_TO_A;

    // Note: The validity flags inside receivedPenyemaianData and receivedDewasaData
    // already reflect the original sensor validity AND B's ESP-NOW timeout check.
    // We only need to check if the Serial message from B is recent.
    // The calculateAverages function will use the validity flags within the structs.


    // --- Run Fuzzy Logic and Determine Auto States ---
    runFuzzyLogic(); // This function calculates averages and sets auto states


    // --- Determine Final Actuator States ---
    bool finalPeremajaanLightState = peremajaanLightManual ? desiredManualPeremajaanLightState : autoPeremajaanLightState;
    bool finalDewasaFanState = dewasaFanManual ? desiredManualDewasaFanState : autoDewasaFanState;
    bool finalDewasaLightState = dewasaLightManual ? desiredManualDewasaLightState : autoDewasaLightState;

    // --- Control Local Peremajaan Light ---
    digitalWrite(PEREMAJAAN_LIGHT_RELAY_PIN, finalPeremajaanLightState ? HIGH : LOW);


    // --- Send Commands to Dewasa (via Serial to B) if State Changes (only in auto mode) ---
    // Manual commands are sent immediately from mqttCallback.
    // Auto commands are sent here if the determined state changes.
    if (!dewasaFanManual && finalDewasaFanState != lastSentDewasaFanState) {
      sendDewasaControlCommand("fan", finalDewasaFanState);
      lastSentDewasaFanState = finalDewasaFanState;
      Serial.printf("[MasterPeremajaanNode] Dewasa Fan command sent via Serial: %s (Auto)\n", finalDewasaFanState ? "ON" : "OFF");
    }
    if (!dewasaLightManual && finalDewasaLightState != lastSentDewasaLightState) {
      sendDewasaControlCommand("light", finalDewasaLightState);
      lastSentDewasaLightState = finalDewasaLightState;
      Serial.printf("[MasterPeremajaanNode] Dewasa Light command sent via Serial: %s (Auto)\n", finalDewasaLightState ? "ON" : "OFF");
    }


    // --- Publish Data to MQTT ---
    if (currentTime - lastMqttPublishTime >= MQTT_PUBLISH_INTERVAL) {
        lastMqttPublishTime = currentTime;

        Serial.println("\n[MasterPeremajaanNode] Preparing MQTT payload...");

        // Aggregate data from all sources (local, Penyemaian, Dewasa)
        StaticJsonDocument<768> doc; // Adjust size as needed

        // Local Peremajaan A data
        JsonObject peremajaan_A = doc.createNestedObject("peremajaan_A");
        peremajaan_A["temp"] = sensorManager->getTemperature();
        peremajaan_A["hum"] = sensorManager->getHumidity();
        peremajaan_A["light"] = sensorManager->getLightIntensity();
        JsonObject peremajaan_A_valid = peremajaan_A.createNestedObject("valid");
        peremajaan_A_valid["temp"] = sensorManager->isTemperatureValid();
        peremajaan_A_valid["hum"] = sensorManager->isHumidityValid();
        peremajaan_A_valid["light"] = sensorManager->isLightValid();
        peremajaan_A["timestamp"] = lastSensorReadTime; // Use the time the local sensors were read
        peremajaan_A["light_state"] = digitalRead(PEREMAJAAN_LIGHT_RELAY_PIN) == HIGH; // Report actual pin state
        peremajaan_A["light_mode"] = peremajaanLightManual ? "manual" : "auto";


        // Penyemaian data (received via Serial from B)
        JsonObject penyemaian = doc.createNestedObject("penyemaian");
        penyemaian["temp"] = receivedPenyemaianData.temperature;
        penyemaian["hum"] = receivedPenyemaianData.humidity;
        penyemaian["light"] = receivedPenyemaianData.lightIntensity;
        JsonObject penyemaian_valid = penyemaian.createNestedObject("valid");
        penyemaian_valid["temp"] = receivedPenyemaianData.temperatureValid; // Validity from original node + B's ESP-NOW timeout
        penyemaian_valid["hum"] = receivedPenyemaianData.humidityValid;
        penyemaian_valid["light"] = receivedPenyemaianData.lightValid;
        penyemaian["timestamp"] = receivedPenyemaianData.timestamp; // Timestamp when A received it
        penyemaian["isSerialRecent"] = isPenyemaianSerialRecent; // Indicate if Serial data from B is recent


        // Dewasa data (received via Serial from B)
        JsonObject dewasa = doc.createNestedObject("dewasa");
        dewasa["temp"] = receivedDewasaData.temperature;
        dewasa["hum"] = receivedDewasaData.humidity;
        dewasa["light"] = receivedDewasaData.lightIntensity;
        JsonObject dewasa_valid = dewasa.createNestedObject("valid");
        dewasa_valid["temp"] = receivedDewasaData.temperatureValid; // Validity from original node + B's ESP-NOW timeout
        dewasa_valid["hum"] = receivedDewasaData.humidityValid;
        dewasa_valid["light"] = receivedDewasaData.lightValid;
        dewasa["timestamp"] = receivedDewasaData.timestamp; // Timestamp when A received it
        dewasa["isSerialRecent"] = isDewasaSerialRecent; // Indicate if Serial data from B is recent
        // Include Dewasa actuator states (as commanded by A)
        dewasa["fan_state"] = finalDewasaFanState; // Report the state A is commanding
        dewasa["fan_mode"] = dewasaFanManual ? "manual" : "auto";
        dewasa["light_state"] = finalDewasaLightState; // Report the state A is commanding
        dewasa["light_mode"] = dewasaLightManual ? "manual" : "auto";


        // Add overall system status/mode if needed
        // doc["system_mode"] = "auto"; // or "manual" if any manual override is active?

        String payload;
        serializeJson(doc, payload);

        // Publish data to MQTT
        if (mqttManager->publish(payload)) {
            Serial.println("[MasterPeremajaanNode] Data published to MQTT successfully");
        } else {
            Serial.println("[MasterPeremajaanNode] ERROR: Failed to publish data to MQTT");
        }
    }

    // Handle MQTT connection and message processing
    mqttManager->loop();

    // Small delay/yield
    yield();
}

// --- MQTT Callback Function ---
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    Serial.printf("[MasterPeremajaanNode] MQTT Message arrived on topic: %s\n", topic);

    payload[length] = '\0';
    String message = (char*)payload;
    Serial.printf("[MasterPeremajaanNode] Payload: %s\n", message.c_str());

    if (strcmp(topic, MQTT_CONTROL_TOPIC) == 0) {
        StaticJsonDocument<128> doc;
        DeserializationError error = deserializeJson(doc, message);

        if (error) {
            Serial.printf("[MasterPeremajaanNode] ERROR: deserializeJson() failed: %s\n", error.c_str());
            return;
        }

        const char* node = doc["node"];
        const char* device = doc["device"];
        bool state = doc["state"];
        const char* mode = doc["mode"];

        if (!node || !device || !mode) {
            Serial.println("[MasterPeremajaanNode] ERROR: Missing required keys in command payload.");
            return;
        }

        if (strcmp(mode, "manual") == 0) {
            Serial.printf("[MasterPeremajaanNode] Manual command received for node '%s', device '%s': state=%s\n", node, device, state ? "ON" : "OFF");

            if (strcmp(node, "peremajaan_A") == 0) {
                if (strcmp(device, "light") == 0) {
                    peremajaanLightManual = true;
                    desiredManualPeremajaanLightState = state;
                    Serial.printf("[MasterPeremajaanNode] Peremajaan Light manual state set to %s\n", state ? "ON" : "OFF");
                    // Pin control happens in loop based on final state
                } else {
                    Serial.printf("[MasterPeremajaanNode] WARNING: Unknown device '%s' for node 'peremajaan_A'.\n", device);
                }
            } else if (strcmp(node, "dewasa") == 0) {
                 if (strcmp(device, "fan") == 0) {
                     dewasaFanManual = true;
                     desiredManualDewasaFanState = state;
                     sendDewasaControlCommand("fan", state); // Send manual command immediately
                     Serial.printf("[MasterPeremajaanNode] Dewasa Fan manual command sent via Serial: %s\n", state ? "ON" : "OFF");
                 } else if (strcmp(device, "light") == 0) {
                     dewasaLightManual = true;
                     desiredManualDewasaLightState = state;
                     sendDewasaControlCommand("light", state); // Send manual command immediately
                     Serial.printf("[MasterPeremajaanNode] Dewasa Light manual command sent via Serial: %s\n", state ? "ON" : "OFF");
                 } else {
                     Serial.printf("[MasterPeremajaanNode] WARNING: Unknown device '%s' for node 'dewasa'.\n", device);
                 }
            } else {
                Serial.printf("[MasterPeremajaanNode] WARNING: Received manual command for unknown node '%s'.\n", node);
            }
        } else if (strcmp(mode, "auto") == 0) {
             Serial.printf("[MasterPeremajaanNode] Auto command received for node '%s', device '%s'.\n", node, device);
             if (strcmp(node, "peremajaan_A") == 0) {
                 if (strcmp(device, "light") == 0) {
                     peremajaanLightManual = false; // Disable manual mode
                     Serial.println("[MasterPeremajaanNode] Peremajaan Light set to Auto mode.");
                 } else {
                     Serial.printf("[MasterPeremajaanNode] WARNING: Unknown device '%s' for node 'peremajaan_A' in auto mode command.\n", device);
                 }
             } else if (strcmp(node, "dewasa") == 0) {
                  if (strcmp(device, "fan") == 0) {
                      dewasaFanManual = false; // Disable manual mode
                      Serial.println("[MasterPeremajaanNode] Dewasa Fan set to Auto mode.");
                  } else if (strcmp(device, "light") == 0) {
                      dewasaLightManual = false; // Disable manual mode
                      Serial.println("[MasterPeremajaanNode] Dewasa Light set to Auto mode.");
                  } else {
                      Serial.printf("[MasterPeremajaanNode] WARNING: Unknown device '%s' for node 'dewasa' in auto mode command.\n", device);
                  }
             } else {
                 Serial.printf("[MasterPeremajaanNode] WARNING: Received auto command for unknown node '%s'.\n", node);
             }
        } else {
            Serial.printf("[MasterPeremajaanNode] WARNING: Received command with unknown mode '%s'.\n", mode);
        }
    } else {
        Serial.printf("[MasterPeremajaanNode] Message on unhandled topic: %s\n", topic);
    }
}

// --- Calculate Averages ---
void calculateAverages(float &avgTemp, float &avgHumidity, float &avgLight, bool &averagesValid, int &tempCount, int &humidityCount, int &lightCount) {
    float tempSum = 0;
    tempCount = 0;
    float humiditySum = 0;
    humidityCount = 0;
    float lightSum = 0;
    lightCount = 0;
    unsigned long currentMillis = millis();

    // Local (Peremajaan A) sensors
    if (sensorManager->isTemperatureValid()) {
        tempSum += sensorManager->getTemperature();
        tempCount++;
    }
    if (sensorManager->isHumidityValid()) {
        humiditySum += sensorManager->getHumidity();
        humidityCount++;
    }
    if (sensorManager->isLightValid()) {
        lightSum += sensorManager->getLightIntensity();
        lightCount++;
    }

    // Penyemaian data (received via Serial from B)
    // Only use if the Serial data from B is recent AND the data itself was valid
    if ((currentMillis - lastPenyemaianSerialTime) < SERIAL_DATA_TIMEOUT_B_TO_A) {
        if (receivedPenyemaianData.temperatureValid) { // This flag includes original validity + B's ESP-NOW timeout
            tempSum += receivedPenyemaianData.temperature;
            tempCount++;
        }
        if (receivedPenyemaianData.humidityValid) {
            humiditySum += receivedPenyemaianData.humidity;
            humidityCount++;
        }
        if (receivedPenyemaianData.lightValid) {
            lightSum += receivedPenyemaianData.lightIntensity;
            lightCount++;
        }
    } else {
        // Serial.println("[MasterPeremajaanNode] Penyemaian data from Serial is stale."); // Too verbose
    }

    // Dewasa data (received via Serial from B)
    // Only use if the Serial data from B is recent AND the data itself was valid
    if ((currentMillis - lastDewasaSerialTime) < SERIAL_DATA_TIMEOUT_B_TO_A) {
         if (receivedDewasaData.temperatureValid) { // This flag includes original validity + B's ESP-NOW timeout
            tempSum += receivedDewasaData.temperature;
            tempCount++;
        }
        if (receivedDewasaData.humidityValid) {
            humiditySum += receivedDewasaData.humidity;
            humidityCount++;
        }
        if (receivedDewasaData.lightValid) {
            lightSum += receivedDewasaData.lightIntensity;
            lightCount++;
        }
    } else {
        // Serial.println("[MasterPeremajaanNode] Dewasa data from Serial is stale."); // Too verbose
    }


    // Calculate averages only if there's valid data
    avgTemp = (tempCount > 0) ? (tempSum / tempCount) : -999.0f; // Use sentinel value if no valid data
    avgHumidity = (humidityCount > 0) ? (humiditySum / humidityCount) : -999.0f;
    avgLight = (lightCount > 0) ? (lightSum / lightCount) : -999.0f;

    // Averages are considered valid if at least one sensor of each type reported valid data
    averagesValid = (tempCount > 0 && humidityCount > 0 && lightCount > 0);

    // Serial.printf("[MasterPeremajaanNode] Averages - Temp: %.1f (%d), Hum: %.1f (%d), Light: %.1f (%d), Valid: %s\n",
    //               avgTemp, tempCount, avgHumidity, humidityCount, avgLight, lightCount, averagesValid ? "Yes" : "No"); // Too verbose
}

// --- Run Fuzzy Logic and Set Auto States ---
void runFuzzyLogic() {
    float avgTemp, avgHumidity, avgLight;
    bool averagesValid;
    int tempCount, humidityCount, lightCount;

    // Calculate averages from all sources
    calculateAverages(avgTemp, avgHumidity, avgLight, averagesValid, tempCount, humidityCount, lightCount);

    // Only run fuzzy if averages are valid
    if (averagesValid) {
        fuzzyController->setInputs(avgTemp, avgHumidity, avgLight);
        fuzzyController->run();
        // Get auto states from fuzzy output
        autoPeremajaanLightState = fuzzyController->getLightOutput(); // Assuming getLightOutput applies to Peremajaan
        autoDewasaFanState = fuzzyController->getFanOutput();
        autoDewasaLightState = fuzzyController->getLightOutput(); // Assuming getLightOutput applies to Dewasa
         Serial.println("[MasterPeremajaanNode] Fuzzy Logic executed.");
    } else {
        // Default auto states to OFF if averages are invalid
        autoPeremajaanLightState = false;
        autoDewasaFanState = false;
        autoDewasaLightState = false;
        // Serial.println("[MasterPeremajaanNode] Fuzzy Logic skipped (Averages Invalid)."); // Too verbose
    }

    // --- Debug Printing (Fuzzy) ---
    // Add fuzzy debug printing similar to the old DeWasaNode_Master.cpp if needed
    // unsigned long currentTime = millis();
    // if (currentTime - lastFuzzyDebugPrintTime >= FUZZY_DEBUG_PRINT_INTERVAL) { ... }
}

// --- Send Dewasa Control Command via Serial to Gateway B ---
void sendDewasaControlCommand(const char* device, bool state) {
    StaticJsonDocument<128> doc;
    doc["type"] = "command";
    doc["node"] = "dewasa";
    doc["device"] = device;
    doc["state"] = state;

    String output;
    serializeJson(doc, output);

    SERIAL_TO_GATEWAY.println(output);
    // Serial.printf("[MasterPeremajaanNode] Sent command to Gateway B for Dewasa %s: %s\n", device, state ? "ON" : "OFF"); // Log in loop or callback

    // lastSerialCommandSendTime = millis(); // Update timer for potential periodic sends (if implemented)
}
