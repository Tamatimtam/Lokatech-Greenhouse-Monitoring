// File: Hardware/src/DeWasaNode_Master.cpp
// THIS FILE NOW REPRESENTS THE "REMAJA NODE (MASTER)"
#include <Arduino.h>
#include <WiFi.h>
#include <Wire.h>
#include <ArduinoJson.h> 

// Include our custom managers
#include "SensorManager.h"
#include "MQTTManager.h"
#include "FuzzyController.h" 
#include "../lib/Common/NodeConfig.h" 
#include "SensorData.h" 

// Configuration flags
#define TEMP_HUMID_SIMULATION_MODE false  
#define LIGHT_SIMULATION_MODE false       

// WiFi and MQTT configuration (from NodeConfig.h or define here if different for Remaja Master)
// Using global MQTT config from NodeConfig.h for now
// const char* ssid = WIFI_SSID; // Defined in NodeConfig.h if you add it there
// const char* password = WIFI_PASSWORD; // Defined in NodeConfig.h
// const char* mqtt_server = MQTT_BROKER_ADDRESS; // Defined in NodeConfig.h
// const int mqtt_port = MQTT_PORT;
// const char* mqtt_username = MQTT_USERNAME;
// const char* mqtt_password = MQTT_PASSWORD;
// const char* mqtt_publish_topic = MQTT_MAIN_TOPIC "/sensors";
// const char* mqtt_control_topic = MQTT_MAIN_TOPIC "/controls/set";

// For this example, using the existing hardcoded credentials in this file
const char* ssid = "Direktorat Kemendikbud"; 
const char* password = "NadiemGantengSih";  

const char* mqtt_server = "d1b364f4ed864e92b1fb464a3201e5ae.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;                
const char* mqtt_username = "LokataniAdmin"; 
const char* mqtt_password = "LokataniAdmin123"; 
const char* mqtt_publish_topic = "lokatech/greenhouse/sensors"; 
const char* mqtt_control_topic = "lokatech/greenhouse/controls/set"; 

// LED Pin Definitions for Fuzzy Control Output Simulation on THIS Remaja Node
// REMAJA_FAN_LED_PIN, REMAJA_LIGHT_LED_PIN are in NodeConfig.h

// Timing variables
unsigned long lastSensorReadTime = 0;
unsigned long lastMqttPublishTime = 0;
// SENSOR_READ_INTERVAL and MQTT_PUBLISH_INTERVAL are in NodeConfig.h

// Managers
SensorManager* sensorManager; // For local "Remaja" sensors
MQTTManager* mqttManager;
FuzzyController* fuzzyController; 

// --- Data Storage from Gateway (Penyemaian & Dewasa data) ---
SensorData receivedPenyemaianData;
SensorData receivedDewasaData;
bool isPenyemaianDataValidSerial = false; // Validity based on Gateway's report
bool isDewasaDataValidSerial = false;     // Validity based on Gateway's report
unsigned long lastGatewaySerialTime = 0; // Timestamp of last valid JSON from Gateway

// Actuator Control Mode for Remaja's actuators
bool remajaFanManual = false;    
bool remajaLightManual = false;  

void initializeReceivedData() {
     memset(&receivedPenyemaianData, 0, sizeof(SensorData));
     strncpy(receivedPenyemaianData.nodeName, "penyemaian", sizeof(receivedPenyemaianData.nodeName) - 1);
     receivedPenyemaianData.temperatureValid = false;

     memset(&receivedDewasaData, 0, sizeof(SensorData));
     strncpy(receivedDewasaData.nodeName, "dewasa", sizeof(receivedDewasaData.nodeName) - 1);
     receivedDewasaData.temperatureValid = false;
}

void mqttCallback(char* topic, byte* payload, unsigned int length);
void runFuzzyControlAndActuators();
void calculateAverages(float &avgTemp, float &avgHumidity, float &avgLight, bool &averagesValid, int &tempCount, int &humidityCount, int &lightCount);

void setup() {
  Serial.begin(115200);
  delay(1000); 

  Serial.println("\n\n[RemajaNode_Master] Starting Remaja Node (Master - Old Dewasa Hardware)...");

  // Serial2 for communication with Gateway
  Serial2.begin(SERIAL_BAUD_RATE, SERIAL_8N1, 16, 17); // Default RX2, TX2
  Serial.println("[RemajaNode_Master] Serial2 initialized for Gateway communication.");

  initializeReceivedData();

  // SensorManager for THIS node's (Remaja) local sensors
  sensorManager = new SensorManager(DHT_PIN, TEMP_HUMID_SIMULATION_MODE, LIGHT_SIMULATION_MODE);
  sensorManager->begin();
  Serial.println("[RemajaNode_Master] Local SensorManager (for Remaja sensors) initialized.");

  // MQTT Manager
  mqttManager = new MQTTManager(ssid, password, mqtt_server, mqtt_port, mqtt_publish_topic, mqtt_control_topic, mqtt_username, mqtt_password);
  mqttManager->setCallback(mqttCallback);
  if (!mqttManager->begin()) { 
    Serial.println("[RemajaNode_Master] ERROR: Failed to initialize MQTT (and WiFi)");
  } else {
    Serial.println("[RemajaNode_Master] MQTTManager initialized.");
    // Subscription to control topic is handled within mqttManager->connect()
  }
  
  // Fuzzy Controller
  fuzzyController = new FuzzyController();
  fuzzyController->begin();
  Serial.println("[RemajaNode_Master] FuzzyController initialized.");

  // Actuator (LED) pins for this Remaja node
  pinMode(REMAJA_FAN_LED_PIN, OUTPUT);
  pinMode(REMAJA_LIGHT_LED_PIN, OUTPUT);
  digitalWrite(REMAJA_FAN_LED_PIN, LOW); 
  digitalWrite(REMAJA_LIGHT_LED_PIN, LOW);
  Serial.println("[RemajaNode_Master] Remaja actuator LED pins initialized.");

  Serial.println("[RemajaNode_Master] Setup completed.");
}

void loop() {
  unsigned long currentTime = millis();

  // --- Process Incoming Data from Gateway via Serial2 ---
  if (Serial2.available() > 0) {
      String line = Serial2.readStringUntil('\n');
      line.trim(); 

      if (line.length() > 0) {
          StaticJsonDocument<768> doc; // Should match Gateway's send size
          DeserializationError error = deserializeJson(doc, line);
          unsigned long currentParseTime = millis(); // CAPTURE REMAJAS millis() HERE

          if (!error) {
              Serial.println("[RemajaNode_Master] Parsed JSON from Gateway. Content:");
              serializeJsonPretty(doc, Serial); // Print the whole received JSON
              Serial.println();

              JsonObject penyemaianJson = doc["penyemaian"];
              bool gatewayReportedPenyemaianValid = penyemaianJson["isValid"].as<bool>() | false; // More explicit cast
              Serial.printf("  Gateway Reported Penyemaian Valid: %s\n", gatewayReportedPenyemaianValid ? "TRUE" : "FALSE");

              if (gatewayReportedPenyemaianValid) {
                  strncpy(receivedPenyemaianData.nodeName, penyemaianJson["nodeName"] | "penyemaian", sizeof(receivedPenyemaianData.nodeName)-1);
                  receivedPenyemaianData.temperature = penyemaianJson["temp"] | -999.0f;
                  receivedPenyemaianData.humidity = penyemaianJson["hum"] | -999.0f;
                  receivedPenyemaianData.lightIntensity = penyemaianJson["light"] | -999.0f;
                  receivedPenyemaianData.temperatureValid = penyemaianJson["tempValid"].as<bool>() | false;
                  receivedPenyemaianData.humidityValid = penyemaianJson["humValid"].as<bool>() | false;
                  receivedPenyemaianData.lightValid = penyemaianJson["lightValid"].as<bool>() | false;
                  isPenyemaianDataValidSerial = true;
                  Serial.printf("  Penyemaian Data (after parsing): Temp=%.1f (Valid:%s), Hum=%.1f (Valid:%s), Light=%.0f (Valid:%s)\n",
                      receivedPenyemaianData.temperature, receivedPenyemaianData.temperatureValid ? "T" : "F",
                      receivedPenyemaianData.humidity, receivedPenyemaianData.humidityValid ? "T" : "F",
                      receivedPenyemaianData.lightIntensity, receivedPenyemaianData.lightValid ? "T" : "F");
              } else {
                  receivedPenyemaianData.temperatureValid = false;
                  receivedPenyemaianData.humidityValid = false;
                  receivedPenyemaianData.lightValid = false;
                  isPenyemaianDataValidSerial = false;
                  Serial.println("  Penyemaian data marked INVALID by Gateway or parsing.");
              }
              
              JsonObject dewasaJson = doc["dewasa"];
              bool gatewayReportedDewasaValid = dewasaJson["isValid"].as<bool>() | false;
              Serial.printf("  Gateway Reported Dewasa Valid: %s\n", gatewayReportedDewasaValid ? "TRUE" : "FALSE");
              if (gatewayReportedDewasaValid) {
                  strncpy(receivedDewasaData.nodeName, dewasaJson["nodeName"] | "dewasa", sizeof(receivedDewasaData.nodeName)-1);
                  receivedDewasaData.temperature = dewasaJson["temp"] | -999.0f;
                  receivedDewasaData.humidity = dewasaJson["hum"] | -999.0f;
                  receivedDewasaData.lightIntensity = dewasaJson["light"] | -999.0f;
                  receivedDewasaData.temperatureValid = dewasaJson["tempValid"].as<bool>() | false;
                  receivedDewasaData.humidityValid = dewasaJson["humValid"].as<bool>() | false;
                  receivedDewasaData.lightValid = dewasaJson["lightValid"].as<bool>() | false;
                  isDewasaDataValidSerial = true;
                   Serial.printf("  Dewasa Data (after parsing): Temp=%.1f (Valid:%s), Hum=%.1f (Valid:%s), Light=%.0f (Valid:%s)\n",
                      receivedDewasaData.temperature, receivedDewasaData.temperatureValid ? "T" : "F",
                      receivedDewasaData.humidity, receivedDewasaData.humidityValid ? "T" : "F",
                      receivedDewasaData.lightIntensity, receivedDewasaData.lightValid ? "T" : "F");
              } else {
                  receivedDewasaData.temperatureValid = false;
                  receivedDewasaData.humidityValid = false;
                  receivedDewasaData.lightValid = false;
                  isDewasaDataValidSerial = false;
                  Serial.println("  Dewasa data marked INVALID by Gateway or parsing.");
              }
              // Use the Remaja Master's millis() at the time of successful parsing
              lastGatewaySerialTime = currentParseTime; 
              Serial.printf("  lastGatewaySerialTime (Remaja's millis) updated to: %lu\n", lastGatewaySerialTime);

          } else {
              Serial.print("[RemajaNode_Master] ERROR: Failed to parse JSON from Gateway: "); Serial.println(error.c_str());
              Serial.print("  Raw line: "); Serial.println(line);
          }
      } 
  } 

  // Read local "Remaja" sensors
  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) { 
    lastSensorReadTime = currentTime;
    Serial.println("\n[RemajaNode_Master] Reading local Remaja sensors...");
    sensorManager->readSensors(); // Data stored in sensorManager's internal state
  }

  // Run Fuzzy Logic and control local (Remaja) actuators
  runFuzzyControlAndActuators();

  // Publish to MQTT
  if (currentTime - lastMqttPublishTime >= MQTT_PUBLISH_INTERVAL) {
    lastMqttPublishTime = currentTime;
    Serial.println("\n[RemajaNode_Master] Preparing MQTT payload...");
    String payload;

    // Determine validity of received data based on serial timeout
    bool penyemaianDataFreshForMqtt = (currentTime - lastGatewaySerialTime < GATEWAY_SERIAL_TIMEOUT) && isPenyemaianDataValidSerial;
    bool dewasaDataFreshForMqtt = (currentTime - lastGatewaySerialTime < GATEWAY_SERIAL_TIMEOUT) && isDewasaDataValidSerial;

    Serial.printf("[RemajaNode_Master] Before MQTT Gen: currentTime=%lu, lastGatewaySerialTime=%lu, GATEWAY_SERIAL_TIMEOUT=%lu\n", currentTime, lastGatewaySerialTime, GATEWAY_SERIAL_TIMEOUT);
    Serial.printf("  isPenyemaianDataValidSerial: %s, penyemaianDataFreshForMqtt: %s\n", isPenyemaianDataValidSerial ? "TRUE":"FALSE", penyemaianDataFreshForMqtt ? "TRUE":"FALSE");
    Serial.printf("  isDewasaDataValidSerial: %s, dewasaDataFreshForMqtt: %s\n", isDewasaDataValidSerial ? "TRUE":"FALSE", dewasaDataFreshForMqtt ? "TRUE":"FALSE");
    Serial.printf("  Penyemaian data to be sent: TempValid=%s, HumValid=%s, LightValid=%s\n",
        receivedPenyemaianData.temperatureValid ? "T":"F",
        receivedPenyemaianData.humidityValid ? "T":"F",
        receivedPenyemaianData.lightValid ? "T":"F");
    Serial.printf("  Dewasa data to be sent: TempValid=%s, HumValid=%s, LightValid=%s\n",
        receivedDewasaData.temperatureValid ? "T":"F",
        receivedDewasaData.humidityValid ? "T":"F",
        receivedDewasaData.lightValid ? "T":"F");

    mqttManager->generateJsonPayload( 
      payload, 
      // Remaja (local) data
      sensorManager->getTemperature(), sensorManager->getHumidity(), sensorManager->getLightIntensity(),
      sensorManager->isTemperatureValid(), sensorManager->isHumidityValid(), sensorManager->isLightValid(),
      // Penyemaian data (from Gateway)
      receivedPenyemaianData, penyemaianDataFreshForMqtt,
      // Dewasa data (from Gateway)
      receivedDewasaData, dewasaDataFreshForMqtt,
      // Remaja Actuator states
      digitalRead(REMAJA_FAN_LED_PIN) == HIGH, remajaFanManual ? "manual" : "auto",
      digitalRead(REMAJA_LIGHT_LED_PIN) == HIGH, remajaLightManual ? "manual" : "auto"
    );

    if (mqttManager->publish(payload)) {
      Serial.println("[RemajaNode_Master] Data published to MQTT successfully");
    } else {
      Serial.println("[RemajaNode_Master] ERROR: Failed to publish data to MQTT");
    }
  }

  mqttManager->loop(); // Keep MQTT connection alive and process incoming messages
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

    // 1. Local Remaja sensors
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

    // 2. Penyemaian data (from Gateway) - valid if Gateway said it was valid AND serial packet is recent
    if ((currentMillis - lastGatewaySerialTime < GATEWAY_SERIAL_TIMEOUT) && isPenyemaianDataValidSerial) {
        if (receivedPenyemaianData.temperatureValid) {
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
    }

    // 3. Dewasa data (from Gateway) - valid if Gateway said it was valid AND serial packet is recent
    if ((currentMillis - lastGatewaySerialTime < GATEWAY_SERIAL_TIMEOUT) && isDewasaDataValidSerial) {
        if (receivedDewasaData.temperatureValid) {
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
    }

    avgTemp = (tempCount > 0) ? (tempSum / tempCount) : -999.0f;
    avgHumidity = (humidityCount > 0) ? (humiditySum / humidityCount) : -999.0f;
    avgLight = (lightCount > 0) ? (lightSum / lightCount) : -999.0f;
    averagesValid = (tempCount > 0 && humidityCount > 0 && lightCount > 0);

    // Serial.printf("[Averages] Temp: %.1f (%d sources), Hum: %.1f (%d sources), Light: %.1f (%d sources), Valid: %s\n",
    //               avgTemp, tempCount, avgHumidity, humidityCount, avgLight, lightCount, averagesValid ? "Yes" : "No");
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
        if (!remajaFanManual) { // If in auto mode for fan
            finalFanState = fuzzyController->getFanOutput();
        } else {
            finalFanState = digitalRead(REMAJA_FAN_LED_PIN) == HIGH; // Keep manual state
        }
        if (!remajaLightManual) { // If in auto mode for light
            finalLightState = fuzzyController->getLightOutput();
        } else {
            finalLightState = digitalRead(REMAJA_LIGHT_LED_PIN) == HIGH; // Keep manual state
        }
    } else { // Averages not valid, default to OFF unless in manual
        finalFanState = remajaFanManual ? (digitalRead(REMAJA_FAN_LED_PIN) == HIGH) : false;
        finalLightState = remajaLightManual ? (digitalRead(REMAJA_LIGHT_LED_PIN) == HIGH) : false;
        // Serial.println("[RemajaNode_Master] Fuzzy logic skipped (averages invalid). Actuators OFF unless manual.");
    }

    digitalWrite(REMAJA_FAN_LED_PIN, finalFanState ? HIGH : LOW);
    digitalWrite(REMAJA_LIGHT_LED_PIN, finalLightState ? HIGH : LOW);

    // Optional: Print fuzzy debug info periodically
}

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

    const char* targetNode = doc["node"]; // Expecting "remaja", "dewasa", etc.
    const char* device = doc["device"]; 
    const char* mode = doc["mode"];     
    
    // For now, only handle commands for "remaja" node's actuators
    if (targetNode && strcmp(targetNode, "remaja") == 0) {
        if (!device) {
            Serial.println("[MQTT Callback] ERROR: Missing 'device' for 'remaja' node in command.");
            return;
        }

        if (mode) { // Mode change command
            Serial.printf("[MQTT Callback] Processing mode switch for Remaja: device='%s', mode='%s'\n", device, mode);
            if (strcmp(device, "fan") == 0) {
                remajaFanManual = (strcmp(mode, "manual") == 0);
                if (remajaFanManual && doc.containsKey("state")) { // If switching to manual and state is provided
                    digitalWrite(REMAJA_FAN_LED_PIN, doc["state"].as<bool>() ? HIGH : LOW);
                }
                Serial.printf("[Control] Remaja Fan mode set to %s. Current state: %s\n", 
                              remajaFanManual ? "Manual" : "Auto", 
                              digitalRead(REMAJA_FAN_LED_PIN) ? "ON" : "OFF");
            } else if (strcmp(device, "light") == 0) {
                remajaLightManual = (strcmp(mode, "manual") == 0);
                 if (remajaLightManual && doc.containsKey("state")) {
                    digitalWrite(REMAJA_LIGHT_LED_PIN, doc["state"].as<bool>() ? HIGH : LOW);
                }
                Serial.printf("[Control] Remaja Light mode set to %s. Current state: %s\n", 
                              remajaLightManual ? "Manual" : "Auto",
                              digitalRead(REMAJA_LIGHT_LED_PIN) ? "ON" : "OFF");
            }
        } else if (doc.containsKey("state")) { // Direct state command (implies manual)
            bool state = doc["state"].as<bool>();
            Serial.printf("[MQTT Callback] Processing state change for Remaja: device='%s', state=%s\n", device, state ? "ON" : "OFF");
            if (strcmp(device, "fan") == 0) {
                remajaFanManual = true; // Assume manual if state is direectly commanded
                digitalWrite(REMAJA_FAN_LED_PIN, state ? HIGH : LOW);
                Serial.printf("[Control] Remaja Fan (Manual) set to %s\n", state ? "ON" : "OFF");
            } else if (strcmp(device, "light") == 0) {
                remajaLightManual = true; // Assume manual
                digitalWrite(REMAJA_LIGHT_LED_PIN, state ? HIGH : LOW);
                Serial.printf("[Control] Remaja Light (Manual) set to %s\n", state ? "ON" : "OFF");
            }
        } else {
            Serial.println("[MQTT Callback] Command for 'remaja' missing 'mode' or 'state'.");
        }
    } else {
        Serial.printf("[MQTT Callback] Command for unhandled node '%s' or missing node field. Ignoring.\n", targetNode ? targetNode : "N/A");
        // If you need to relay commands to Dewasa node, this is where you'd parse
        // for targetNode == "dewasa" and then send a command via Serial to Gateway.
        // For now, this is not implemented.
    }
  } else {
      Serial.printf("[MQTT Callback] Message on unhandled topic: %s\n", topic);
  }
}
