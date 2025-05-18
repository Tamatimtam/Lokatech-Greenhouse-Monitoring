// File: Hardware/src/RemajaNode_Master.cpp
// THIS FILE NOW REPRESENTS THE "REMAJA NODE (MASTER)"
#include <Arduino.h>
#include <WiFi.h>
#include <Wire.h>
#include <ArduinoJson.h> 
#include <time.h> // For NTP
#include <sys/time.h> // For gettimeofday

// Include our custom managers
#include "../lib/SensorManager/SensorManager.h"
#include "../lib/MQTTManager/MQTTManager.h"
#include "../lib/FuzzyController/FuzzyController.h" 
#include "../lib/Common/NodeConfig.h" 
#include "../lib/Common/SensorData.h" 

// Configuration flags
#define TEMP_HUMID_SIMULATION_MODE false  
#define LIGHT_SIMULATION_MODE false       

// Define NTP server constants (declared as extern in NodeConfig.h)
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.google.com";

// WiFi and MQTT configuration
const char* ssid = "Direktorat Kemendikbud"; 
const char* password = "NadiemGantengSih";  

const char* mqtt_server = "d1b364f4ed864e92b1fb464a3201e5ae.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;                
const char* mqtt_username = "LokataniAdmin"; 
const char* mqtt_password = "LokataniAdmin123"; 
const char* mqtt_publish_topic = "lokatech/greenhouse/sensors"; 
const char* mqtt_control_topic = "lokatech/greenhouse/controls/set"; 

// Timing variables
unsigned long lastSensorReadTime = 0;
unsigned long lastMqttPublishTime = 0;
unsigned long lastNtpSyncAttempt = 0;
unsigned long lastSuccessfulNtpSync = 0;
bool ntpSynchronized = false;

// Managers
SensorManager* sensorManager; // For local "Remaja" sensors
MQTTManager* mqttManager;
FuzzyController* fuzzyController; 

// Data Storage from Gateway (Penyemaian & Dewasa data)
SensorData receivedPenyemaianData;
SensorData receivedDewasaData;
bool isPenyemaianDataValidSerial = false; 
bool isDewasaDataValidSerial = false;     
unsigned long lastGatewaySerialTime = 0; 

// Actuator Control Mode for Remaja's actuators
bool remajaFanManual = false;    
bool remajaLightManual = false;  

// Previous states for fuzzy logic change detection
static bool prevFuzzyFanState = false;
static bool prevFuzzyLightState = false;

// --- Serial Command ACK ---
static uint32_t currentSerialCommandId = 0;
volatile uint32_t expectedSerialAckId = 0;
volatile bool serialCommandAckReceived = false;
volatile bool serialCommandAckStatusOk = false;


// Function Prototypes
void initializeReceivedData();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void runFuzzyControlAndActuators();
void calculateAverages(float &avgTemp, float &avgHumidity, float &avgLight, bool &averagesValid, int &tempCount, int &humidityCount, int &lightCount);
// void sendControlCommandToGatewayForDewasa(const char* device, bool state, const char* mode); // Old declaration
bool sendControlCommandToGatewayForDewasaWithRetries(const char* device, bool state, const char* mode); // New declaration
bool syncNTP();
String getFormattedTimestamp();
void processSerialFromGateway(); // New function to handle all serial input
bool ForwardCommand(const char* device, bool state, const char* mode); // Function prototype for fuck

void initializeReceivedData() {
     memset(&receivedPenyemaianData, 0, sizeof(SensorData));
     strncpy(receivedPenyemaianData.nodeName, "penyemaian", sizeof(receivedPenyemaianData.nodeName) - 1);
     receivedPenyemaianData.temperatureValid = false;

     memset(&receivedDewasaData, 0, sizeof(SensorData));
     strncpy(receivedDewasaData.nodeName, "dewasa", sizeof(receivedDewasaData.nodeName) - 1);
     receivedDewasaData.temperatureValid = false;
}

bool syncNTP() {
    return true;
    if (WiFi.status() != WL_CONNECTED) {
        #if DEBUG_NTP && DEBUG_REMAJA_MASTER
        Serial.println("[NTP] WiFi not connected. Cannot sync NTP.");
        #endif
        ntpSynchronized = false;
        return false;
    }

    #if DEBUG_NTP && DEBUG_REMAJA_MASTER
    Serial.println("[NTP] Attempting to synchronize time...");
    #endif
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);
    
    struct tm timeinfo;
    int retry = 0;
    while (!getLocalTime(&timeinfo, 10000)) { // Timeout 10 seconds
        #if DEBUG_NTP && DEBUG_REMAJA_MASTER
        Serial.println("[NTP] Failed to obtain time. Retrying...");
        #endif
        retry++;
        if (retry >= NTP_SYNC_RETRY_COUNT) {
            #if DEBUG_NTP && DEBUG_REMAJA_MASTER
            Serial.println("[NTP] Max retries reached. NTP sync failed.");
            #endif
            ntpSynchronized = false;
            return false;
        }
        delay(NTP_SYNC_RETRY_DELAY_MS);
    }
    
    #if DEBUG_NTP && DEBUG_REMAJA_MASTER
    Serial.print("[NTP] Time synchronized: ");
    Serial.println(&timeinfo, "%A, %B %d %Y %H:%M:%S");
    #endif
    ntpSynchronized = true;
    lastSuccessfulNtpSync = millis();
    return true;
}

String getFormattedTimestamp() {
    if (!ntpSynchronized) {
        return "N/A"; 
    }
    
    struct timeval tv;
    gettimeofday(&tv, NULL); 

    char ntp_timestamp_str[35]; 
    time_t now_seconds = tv.tv_sec; 
    struct tm *ptm = gmtime(&now_seconds); 

    if (ptm == NULL) {
        #if DEBUG_NTP && DEBUG_REMAJA_MASTER
        Serial.println("[NTP] gmtime() returned NULL!");
        #endif
        return "N/A_gmtime_err";
    }

    strftime(ntp_timestamp_str, sizeof(ntp_timestamp_str), "%Y-%m-%dT%H:%M:%S", ptm); 
    
    char millis_str[5];
    sprintf(millis_str, ".%03ldZ", tv.tv_usec / 1000); 
    strcat(ntp_timestamp_str, millis_str);
    
    return String(ntp_timestamp_str);
}


void setup() {
  Serial.begin(115200);
  delay(1000); 
  randomSeed(analogRead(0)); 

  Serial.println("\n\n[RemajaNode_Master] Starting Remaja Node (Master)...");

  Serial2.begin(SERIAL_BAUD_RATE, SERIAL_8N1, 16, 17); 
  Serial.println("[RemajaNode_Master] Serial2 initialized for Gateway communication.");

  initializeReceivedData();

  sensorManager = new SensorManager(DHT_PIN, TEMP_HUMID_SIMULATION_MODE, LIGHT_SIMULATION_MODE);
  sensorManager->begin();
  Serial.println("[RemajaNode_Master] Local SensorManager (for Remaja sensors) initialized.");

  mqttManager = new MQTTManager(ssid, password, mqtt_server, mqtt_port, mqtt_publish_topic, mqtt_control_topic, mqtt_username, mqtt_password);
  mqttManager->setCallback(mqttCallback);
  if (!mqttManager->begin()) { 
    Serial.println("[RemajaNode_Master] ERROR: Failed to initialize MQTT (and WiFi). NTP sync will be skipped initially.");
  } else {
    Serial.println("[RemajaNode_Master] MQTTManager initialized.");
    syncNTP(); 
  }
  
  fuzzyController = new FuzzyController();
  fuzzyController->begin();
  Serial.println("[RemajaNode_Master] FuzzyController initialized.");

  pinMode(REMAJA_FAN_LED_PIN, OUTPUT);
  pinMode(REMAJA_LIGHT_LED_PIN, OUTPUT);
  digitalWrite(REMAJA_FAN_LED_PIN, LOW); 
  digitalWrite(REMAJA_LIGHT_LED_PIN, LOW);
  Serial.println("[RemajaNode_Master] Remaja actuator LED pins initialized.");

  Serial.println("[RemajaNode_Master] Setup completed.");
}

void processSerialFromGateway() {
    if (Serial2.available() > 0) {
        String line = Serial2.readStringUntil('\n');
        line.trim(); 

        if (line.length() > 0) {
            #if DEBUG_REMAJA_MASTER
            // Serial.printf("[RemajaNode_Master] Raw Serial2 input: %s\n", line.c_str());
            #endif

            StaticJsonDocument<1024> doc; // Large enough for sensor data or ACK
            DeserializationError error = deserializeJson(doc, line);

            if (!error) {
                const char* msgType = doc["type"];
                if (msgType && strcmp(msgType, "ack") == 0) {
                    #if DEBUG_REMAJA_MASTER
                    Serial.printf("[RemajaNode_Master] Received ACK from Gateway: %s\n", line.c_str());
                    #endif
                    uint32_t ackId = doc["id"] | 0;
                    if (ackId != 0 && ackId == expectedSerialAckId) {
                        serialCommandAckStatusOk = (strcmp(doc["status"], "ok") == 0);
                        serialCommandAckReceived = true;
                        // expectedSerialAckId is reset by the sender function after processing
                    } else {
                        #if DEBUG_REMAJA_MASTER
                        Serial.printf("[RemajaNode_Master] Stray/unexpected ACK. ID: %u, Expected: %u\n", ackId, expectedSerialAckId);
                        #endif
                    }
                } else { // Assume it's sensor data from Gateway
                    #if DEBUG_REMAJA_MASTER
                    Serial.println("[RemajaNode_Master] Parsed Sensor JSON from Gateway. Content:");
                    serializeJsonPretty(doc, Serial); 
                    Serial.println();
                    #endif
                    unsigned long currentParseTime = millis(); 

                    JsonObject penyemaianJson = doc["penyemaian"];
                    bool gatewayReportedPenyemaianValid = penyemaianJson["isValid"].as<bool>() | false; 
                    
                    if (gatewayReportedPenyemaianValid) {
                        strncpy(receivedPenyemaianData.nodeName, penyemaianJson["nodeName"] | "penyemaian", sizeof(receivedPenyemaianData.nodeName)-1);
                        receivedPenyemaianData.temperature = penyemaianJson["temp"] | -999.0f;
                        receivedPenyemaianData.humidity = penyemaianJson["hum"] | -999.0f;
                        receivedPenyemaianData.lightIntensity = penyemaianJson["light"] | -999.0f;
                        receivedPenyemaianData.temperatureValid = penyemaianJson["tempValid"].as<bool>() | false;
                        receivedPenyemaianData.humidityValid = penyemaianJson["humValid"].as<bool>() | false;
                        receivedPenyemaianData.lightValid = penyemaianJson["lightValid"].as<bool>() | false;
                        isPenyemaianDataValidSerial = true;
                    } else {
                        receivedPenyemaianData.temperatureValid = false; 
                        receivedPenyemaianData.humidityValid = false;
                        receivedPenyemaianData.lightValid = false;
                        isPenyemaianDataValidSerial = false;
                    }
                    
                    JsonObject dewasaJson = doc["dewasa"];
                    bool gatewayReportedDewasaValid = dewasaJson["isValid"].as<bool>() | false;
                    if (gatewayReportedDewasaValid) {
                        strncpy(receivedDewasaData.nodeName, dewasaJson["nodeName"] | "dewasa", sizeof(receivedDewasaData.nodeName)-1);
                        receivedDewasaData.temperature = dewasaJson["temp"] | -999.0f;
                        receivedDewasaData.humidity = dewasaJson["hum"] | -999.0f;
                        receivedDewasaData.lightIntensity = dewasaJson["light"] | -999.0f;
                        receivedDewasaData.temperatureValid = dewasaJson["tempValid"].as<bool>() | false;
                        receivedDewasaData.humidityValid = dewasaJson["humValid"].as<bool>() | false;
                        receivedDewasaData.lightValid = dewasaJson["lightValid"].as<bool>() | false;
                        isDewasaDataValidSerial = true;
                    } else {
                        receivedDewasaData.temperatureValid = false; 
                        receivedDewasaData.humidityValid = false;
                        receivedDewasaData.lightValid = false;
                        isDewasaDataValidSerial = false;
                    }
                    lastGatewaySerialTime = currentParseTime; 
                }
            } else {
                #if DEBUG_REMAJA_MASTER
                Serial.print("[RemajaNode_Master] ERROR: Failed to parse JSON from Gateway: "); Serial.println(error.c_str());
                Serial.print("  Raw line: "); Serial.println(line);
                #endif
            }
        } 
    }
}


void loop() {
  unsigned long currentTime = millis();

  if (WiFi.status() == WL_CONNECTED && (currentTime - lastSuccessfulNtpSync > NTP_RESYNC_INTERVAL_MS || !ntpSynchronized)) {
      if (currentTime - lastNtpSyncAttempt > 60000UL) { 
          lastNtpSyncAttempt = currentTime;
          syncNTP();
      }
  }

  processSerialFromGateway(); // Process any incoming Serial data from Gateway

  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) { 
    lastSensorReadTime = currentTime;
    #if DEBUG_REMAJA_MASTER
    Serial.println("\n[RemajaNode_Master] Reading local Remaja sensors...");
    #endif
    sensorManager->readSensors(); 
  }

  runFuzzyControlAndActuators();

  if (currentTime - lastMqttPublishTime >= MQTT_PUBLISH_INTERVAL) {
    lastMqttPublishTime = currentTime;
    #if DEBUG_REMAJA_MASTER
    Serial.println("\n[RemajaNode_Master] Preparing MQTT payload...");
    #endif
    String payload;
    String currentNtpTimestampStr = getFormattedTimestamp();

    bool penyemaianDataFreshForMqtt = (currentTime - lastGatewaySerialTime < GATEWAY_SERIAL_TIMEOUT) && isPenyemaianDataValidSerial;
    bool dewasaDataFreshForMqtt = (currentTime - lastGatewaySerialTime < GATEWAY_SERIAL_TIMEOUT) && isDewasaDataValidSerial;

    int simulatedPenyemaianEspNowLatencyMs = -1;
    if (penyemaianDataFreshForMqtt) {
        simulatedPenyemaianEspNowLatencyMs = 18 + random(5); 
    }

    int simulatedDewasaEspNowLatencyMs = -1;
    if (dewasaDataFreshForMqtt) {
        simulatedDewasaEspNowLatencyMs = 18 + random(5); 
    }

    mqttManager->generateJsonPayload( 
      payload, 
      currentNtpTimestampStr, 
      sensorManager->getTemperature(), sensorManager->getHumidity(), sensorManager->getLightIntensity(),
      sensorManager->isTemperatureValid(), sensorManager->isHumidityValid(), sensorManager->isLightValid(),
      receivedPenyemaianData, penyemaianDataFreshForMqtt, simulatedPenyemaianEspNowLatencyMs, 
      receivedDewasaData, dewasaDataFreshForMqtt, simulatedDewasaEspNowLatencyMs,         
      digitalRead(REMAJA_FAN_LED_PIN) == HIGH, remajaFanManual ? "manual" : "auto",
      digitalRead(REMAJA_LIGHT_LED_PIN) == HIGH, remajaLightManual ? "manual" : "auto"
    );

    #if DEBUG_MQTT_MANAGER && DEBUG_REMAJA_MASTER
    Serial.print("[RemajaNode_Master] Publishing to MQTT. NTP Timestamp: "); Serial.println(currentNtpTimestampStr);
    Serial.print("  Penyemaian ESP-NOW Latency (Simulated, ms): "); Serial.println(penyemaianDataFreshForMqtt ? String(simulatedPenyemaianEspNowLatencyMs) : "N/A (stale)");
    Serial.print("  Dewasa ESP-NOW Latency (Simulated, ms): "); Serial.println(dewasaDataFreshForMqtt ? String(simulatedDewasaEspNowLatencyMs) : "N/A (stale)");
    #endif

    if (mqttManager->publish(payload)) {
      #if DEBUG_REMAJA_MASTER
      // Serial.println("[RemajaNode_Master] Data published to MQTT successfully"); // Already logged by MQTTManager
      #endif
    } else {
      Serial.println("[RemajaNode_Master] ERROR: Failed to publish data to MQTT");
    }
  }

  mqttManager->loop(); 
  yield(); 
}


void calculateAverages(float &avgTemp, float &avgHumidity, float &avgLight, bool &averagesValid, int &tempCount, int &humidityCount, int &lightCount) {
    float tempSum = 0;
    tempCount = 0;
    float humiditySum = 0;
    humidityCount = 0;
    float lightSum = 0;
    lightCount = 0;
    unsigned long currentMillis = millis();

    if (sensorManager->isTemperatureValid()) {
        tempSum += sensorManager->getTemperature(); tempCount++;
    }
    if (sensorManager->isHumidityValid()) {
        humiditySum += sensorManager->getHumidity(); humidityCount++;
    }
    if (sensorManager->isLightValid()) {
        lightSum += sensorManager->getLightIntensity(); lightCount++;
    }

    if ((currentMillis - lastGatewaySerialTime < GATEWAY_SERIAL_TIMEOUT) && isPenyemaianDataValidSerial) {
        if (receivedPenyemaianData.temperatureValid) { tempSum += receivedPenyemaianData.temperature; tempCount++; }
        if (receivedPenyemaianData.humidityValid) { humiditySum += receivedPenyemaianData.humidity; humidityCount++; }
        if (receivedPenyemaianData.lightValid) { lightSum += receivedPenyemaianData.lightIntensity; lightCount++; }
    }

    if ((currentMillis - lastGatewaySerialTime < GATEWAY_SERIAL_TIMEOUT) && isDewasaDataValidSerial) {
        if (receivedDewasaData.temperatureValid) { tempSum += receivedDewasaData.temperature; tempCount++; }
        if (receivedDewasaData.humidityValid) { humiditySum += receivedDewasaData.humidity; humidityCount++; }
        if (receivedDewasaData.lightValid) { lightSum += receivedDewasaData.lightIntensity; lightCount++; }
    }

    avgTemp = (tempCount > 0) ? (tempSum / tempCount) : -999.0f;
    avgHumidity = (humidityCount > 0) ? (humiditySum / humidityCount) : -999.0f;
    avgLight = (lightCount > 0) ? (lightSum / lightCount) : -999.0f;
    averagesValid = (tempCount > 0 && humidityCount > 0 && lightCount > 0);
}

void runFuzzyControlAndActuators() {
    float avgTemp, avgHumidity, avgLight;
    bool averagesValid;
    int tempCount, humidityCount, lightCount; 

    calculateAverages(avgTemp, avgHumidity, avgLight, averagesValid, tempCount, humidityCount, lightCount);

    bool finalFanState = false;
    bool finalLightState = false;

    if (averagesValid) {
        fuzzyController->setInputs(avgTemp, avgHumidity, avgLight);
        fuzzyController->run();
        if (!remajaFanManual) { 
            finalFanState = fuzzyController->getFanOutput();
        } else {
            finalFanState = digitalRead(REMAJA_FAN_LED_PIN) == HIGH; 
        }
        if (!remajaLightManual) { 
            finalLightState = fuzzyController->getLightOutput();
        } else {
            finalLightState = digitalRead(REMAJA_LIGHT_LED_PIN) == HIGH; 
        }
    } else { 
        finalFanState = remajaFanManual ? (digitalRead(REMAJA_FAN_LED_PIN) == HIGH) : false;
        finalLightState = remajaLightManual ? (digitalRead(REMAJA_LIGHT_LED_PIN) == HIGH) : false;
    }

    // Check for changes in fuzzy logic output and send command if in auto mode
    if (averagesValid) { // Only send fuzzy logic decisions if averages are valid
        if (!remajaFanManual && finalFanState != prevFuzzyFanState) {
            #if DEBUG_REMAJA_MASTER
            Serial.printf("[RemajaNode_Master] Fuzzy Fan state changed from %s to %s. Sending command to Dewasa.\n", prevFuzzyFanState ? "ON" : "OFF", finalFanState ? "ON" : "OFF");
            #endif
            ForwardCommand("fan", finalFanState, "auto");
        }
        if (!remajaLightManual && finalLightState != prevFuzzyLightState) {
             #if DEBUG_REMAJA_MASTER
            Serial.printf("[RemajaNode_Master] Fuzzy Light state changed from %s to %s. Sending command to Dewasa.\n", prevFuzzyLightState ? "ON" : "OFF", finalLightState ? "ON" : "OFF");
            #endif
            ForwardCommand("light", finalLightState, "auto");
        }

        // Update previous states *after* checking for changes
        prevFuzzyFanState = finalFanState;
        prevFuzzyLightState = finalLightState;
    }


    digitalWrite(REMAJA_FAN_LED_PIN, finalFanState ? HIGH : LOW);
    digitalWrite(REMAJA_LIGHT_LED_PIN, finalLightState ? HIGH : LOW);
}

bool sendControlCommandToGatewayForDewasaWithRetries(const char* device, bool state, const char* mode) {
    currentSerialCommandId++;
    if (currentSerialCommandId == 0) currentSerialCommandId = 1; // Avoid ID 0, which is default for expectedSerialAckId

    #if DEBUG_REMAJA_MASTER
    Serial.printf("[Remaja->Gateway] Attempting to send command for Dewasa: Device='%s', State=%s, Mode='%s', ID=%u\n", device, state ? "ON" : "OFF", mode, currentSerialCommandId);
    #endif

    for (int attempt = 0; attempt < MAX_SERIAL_COMMAND_RETRIES; ++attempt) {
        StaticJsonDocument<128> doc;
        doc["type"] = "control_dewasa";
        doc["device"] = device;
        doc["state"] = state;
        doc["id"] = currentSerialCommandId;

        String outputJson;
        serializeJson(doc, outputJson);

        serialCommandAckReceived = false; 
        serialCommandAckStatusOk = false;
        expectedSerialAckId = currentSerialCommandId; 

        Serial2.println(outputJson);
        Serial2.println("FUCK");
        #if DEBUG_REMAJA_MASTER
        Serial.printf("[Remaja->Gateway] Sent command (Attempt %d/%d), ID %u: %s\n", attempt + 1, MAX_SERIAL_COMMAND_RETRIES, currentSerialCommandId, outputJson.c_str());
        #endif

        unsigned long ackWaitStart = millis();
        while (!serialCommandAckReceived && (millis() - ackWaitStart < SERIAL_COMMAND_ACK_TIMEOUT_MS)) {
            processSerialFromGateway(); // Allow ACK processing
            mqttManager->loop();        // Keep MQTT alive
            yield();                    // Allow other tasks
        }
        
        // No longer expecting this specific ACK ID after timeout or reception
        // Keep expectedSerialAckId as is, it will be overwritten by next command send or naturally ignored if an old ACK arrives.
        // If we reset it to 0 here, a late ACK for this ID might be ignored by processSerialFromGateway.
        // The check `ackId == expectedSerialAckId` in processSerialFromGateway is key.

        if (serialCommandAckReceived) {
            if (serialCommandAckStatusOk) {
                #if DEBUG_REMAJA_MASTER
                Serial.printf("[Remaja->Gateway] Command ID %u ACKed successfully by Gateway on attempt %d.\n", currentSerialCommandId, attempt + 1);
                #endif
                expectedSerialAckId = 0; // Successfully processed, clear expectation
                return true; 
            } else {
                #if DEBUG_REMAJA_MASTER
                Serial.printf("[Remaja->Gateway] Command ID %u NACKed by Gateway on attempt %d. Retrying...\n", currentSerialCommandId, attempt + 1);
                #endif
            }
        } else {
            #if DEBUG_REMAJA_MASTER
            Serial.printf("[Remaja->Gateway] Timeout waiting for ACK for command ID %u on attempt %d. Retrying...\n", currentSerialCommandId, attempt + 1);
            #endif
        }

        if (attempt < MAX_SERIAL_COMMAND_RETRIES - 1) {
            delay(SERIAL_COMMAND_RETRY_DELAY_MS);
        }
    }
    Serial.printf("[Remaja->Gateway] ERROR: Failed to send command ID %u to Gateway for Dewasa after all retries.\n", currentSerialCommandId);
    expectedSerialAckId = 0; // Failed all retries, clear expectation
    return false;
}

bool ForwardCommand(const char* device, bool state, const char* mode) {
    currentSerialCommandId++;
    if (currentSerialCommandId == 0) currentSerialCommandId = 1; 

    #if DEBUG_REMAJA_MASTER
    Serial.printf("[Remaja->Gateway] INSIDE sendControlCommand... ID=%u, Device='%s', State=%s\n", 
                  currentSerialCommandId, device, state ? "ON" : "OFF");
    #endif

    StaticJsonDocument<128> doc;
    doc["type"] = "control_dewasa";
    doc["device"] = device;
    doc["state"] = state;
    doc["id"] = currentSerialCommandId;

    String outputJson;
    serializeJson(doc, outputJson);

    String fullCommandString = "CMD:" + outputJson; // Using the prefix method

    Serial.println("[Remaja->Gateway] BEFORE Serial2.println in sendControlCommand...");
    Serial.print("   Sending: "); Serial.println(fullCommandString);

    Serial2.println(fullCommandString);
    Serial2.flush(); // Make sure it's sent out

    Serial.println("[Remaja->Gateway] AFTER Serial2.println and flush in sendControlCommand.");
    
    return false; 
};

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("\n[RemajaNode_Master][MQTT Callback] Message arrived on topic: %s\n", topic);
  
  char* payloadCopy = (char*)malloc(length + 1);
  if (!payloadCopy) {
    Serial.println("[MQTT Callback] ERROR: Out of memory for payload copy");
    return;
  }
  memcpy(payloadCopy, payload, length);
  payloadCopy[length] = '\0';
  String message = String(payloadCopy);
  Serial.printf("  Payload: %s\n", message.c_str());
  free(payloadCopy);

  if (strcmp(topic, mqtt_control_topic) == 0) {
    StaticJsonDocument<128> doc; 
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
      Serial.printf("  ERROR: JSON parsing failed: %s\n", error.c_str());
      return;
    }

    const char* targetNode = doc["node"]; 
    const char* device = doc["device"]; 
    const char* mode = doc["mode"];     
    
    if (targetNode && strcmp(targetNode, "remaja") == 0) {
        if (!device) {
            Serial.println("[MQTT Callback] ERROR: Missing 'device' for 'remaja' node in command.");
            return;
        }

        bool state = false; // Default state
        if (doc.containsKey("state")) {
            state = doc["state"].as<bool>();
        } else if (!mode) { // If no mode and no state, it's an incomplete command for direct state change
            Serial.println("[MQTT Callback] Command for 'remaja' missing 'state' for direct control.");
            return;
        }


        if (mode) { 
            Serial.printf("[MQTT Callback] Processing mode switch for Remaja: device='%s', mode='%s'\n", device, mode);
            if (strcmp(device, "fan") == 0) {
                remajaFanManual = (strcmp(mode, "manual") == 0);
                if (remajaFanManual && doc.containsKey("state")) { 
                    digitalWrite(REMAJA_FAN_LED_PIN, state ? HIGH : LOW);
                } // If auto, fuzzy logic will handle it
                Serial.printf("[Control] Remaja Fan mode set to %s. Current state: %s\n", 
                              remajaFanManual ? "Manual" : "Auto", 
                              digitalRead(REMAJA_FAN_LED_PIN) ? "ON" : "OFF");
            } else if (strcmp(device, "light") == 0) {
                remajaLightManual = (strcmp(mode, "manual") == 0);
                 if (remajaLightManual && doc.containsKey("state")) {
                    digitalWrite(REMAJA_LIGHT_LED_PIN, state ? HIGH : LOW);
                } // If auto, fuzzy logic will handle it
                Serial.printf("[Control] Remaja Light mode set to %s. Current state: %s\n", 
                              remajaLightManual ? "Manual" : "Auto",
                              digitalRead(REMAJA_LIGHT_LED_PIN) ? "ON" : "OFF");
            }
        } else if (doc.containsKey("state")) { // Direct state command (implies manual)
            Serial.printf("[MQTT Callback] Processing state change for Remaja: device='%s', state=%s\n", device, state ? "ON" : "OFF");
            if (strcmp(device, "fan") == 0) {
                remajaFanManual = true; 
                digitalWrite(REMAJA_FAN_LED_PIN, state ? HIGH : LOW);
                Serial.printf("[Control] Remaja Fan (Manual) set to %s\n", state ? "ON" : "OFF");
            } else if (strcmp(device, "light") == 0) {
                remajaLightManual = true; 
                digitalWrite(REMAJA_LIGHT_LED_PIN, state ? HIGH : LOW);
                Serial.printf("[Control] Remaja Light (Manual) set to %s\n", state ? "ON" : "OFF");
            }
        } else {
             // This case should ideally not be reached if logic above is correct
            Serial.println("[MQTT Callback] Command for 'remaja' missing 'mode' or 'state'.");
            return; 
        }
        
        // Mirror the command to Dewasa Node if a state was determined/present
        if (doc.containsKey("state") || mode) { // If mode is set (even to auto), or state is set
            bool effectiveState = state; // Use state from MQTT if present
            if (strcmp(mode, "auto")==0 && !doc.containsKey("state")) { // If mode is auto and no explicit state, use current fuzzy state
                 if (strcmp(device, "fan") == 0) effectiveState = fuzzyController->getFanOutput();
                 else if (strcmp(device, "light") == 0) effectiveState = fuzzyController->getLightOutput();
            }
            // If mode is manual and no state, use current manual state (which is `state` already)

            #if DEBUG_REMAJA_MASTER
            Serial.println("[MQTT Callback] Remaja command processed. Not mirroring fuzzy logic decisions here.");
            #endif
            // The fuzzy logic decision is now mirrored to Dewasa in runFuzzyControlAndActuators
        }

    } else if (targetNode && strcmp(targetNode, "dewasa") == 0) {
        // Command is specifically for Dewasa Node, forward it via Serial to Gateway
        bool stateCmd = doc["state"] | false; // Default to false if not present
        // sendControlCommandToGatewayForDewasaWithRetries(device, stateCmd, mode ? mode : "manual");
            ForwardCommand(device, stateCmd, mode ? mode : "manual"); // Call the simplified one
    } else {
        Serial.printf("[MQTT Callback] Command for unhandled node '%s' or missing node field. Ignoring.\n", targetNode ? targetNode : "N/A");
    }
  } else {
      Serial.printf("[MQTT Callback] Message on unhandled topic: %s\n", topic);
  }
}
