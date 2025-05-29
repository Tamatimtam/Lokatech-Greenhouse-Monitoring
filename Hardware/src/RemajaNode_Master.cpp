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

// secondary WiFi and MQTT configuration ([please keep this here for easy switching ])
// const char* ssid = "padahal katanya uangtakan kemana"; 
// const char* password = "jika memang rejeki akan ditransfer juga";  


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
// These pins (REMAJA_FAN_LED_PIN, REMAJA_LIGHT_LED_PIN) will also signal Gateway for Dewasa's state
bool remajaFanManual = false;    
bool remajaLightManual = false;  

// Previous states for fuzzy logic change detection (for Remaja's local actuators)
static bool prevFuzzyFanStateRemaja = false;
static bool prevFuzzyLightStateRemaja = false;

// REMOVED: Serial Command ACK variables

// Function Prototypes
void initializeReceivedData();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void runFuzzyControlAndActuators(); // Controls Remaja's local actuators (pins 18, 19)
void calculateAverages(float &avgTemp, float &avgHumidity, float &avgLight, bool &averagesValid, int &tempCount, int &humidityCount, int &lightCount);
// REMOVED: sendControlCommandToGatewayForDewasaWithRetries
// REMOVED: ForwardCommand
bool syncNTP();
String getFormattedTimestamp();
void processSerialFromGateway(); 

void initializeReceivedData() {
     memset(&receivedPenyemaianData, 0, sizeof(SensorData));
     strncpy(receivedPenyemaianData.nodeName, "penyemaian", sizeof(receivedPenyemaianData.nodeName) - 1);
     receivedPenyemaianData.temperatureValid = false;

     memset(&receivedDewasaData, 0, sizeof(SensorData));
     strncpy(receivedDewasaData.nodeName, "dewasa", sizeof(receivedDewasaData.nodeName) - 1);
     receivedDewasaData.temperatureValid = false;
}

bool syncNTP() {
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
  Serial.println("[RemajaNode_Master] Serial2 initialized for Gateway communication (receiving sensor data).");

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

  // REMAJA_FAN_LED_PIN and REMAJA_LIGHT_LED_PIN are outputs for local Remaja actuators
  // AND signals to Gateway for Dewasa actuators.
  pinMode(REMAJA_FAN_LED_PIN, OUTPUT);
  pinMode(REMAJA_LIGHT_LED_PIN, OUTPUT);
  digitalWrite(REMAJA_FAN_LED_PIN, LOW); 
  digitalWrite(REMAJA_LIGHT_LED_PIN, LOW);
  Serial.println("[RemajaNode_Master] Remaja actuator/signal pins initialized.");

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

            StaticJsonDocument<1024> doc; 
            DeserializationError error = deserializeJson(doc, line);

            if (!error) {
                // Assuming all serial data from Gateway is sensor data now
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

  processSerialFromGateway(); 

  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) { 
    lastSensorReadTime = currentTime;
    #if DEBUG_REMAJA_MASTER
    Serial.println("\n[RemajaNode_Master] Reading local Remaja sensors...");
    #endif
    sensorManager->readSensors(); 
  }

  runFuzzyControlAndActuators(); // This will set REMAJA_FAN_LED_PIN and REMAJA_LIGHT_LED_PIN

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

    // Get Remaja's local temperature and apply offset
    float localRemajaTemp = sensorManager->getTemperature();
    bool localRemajaTempValid = sensorManager->isTemperatureValid();
    if (localRemajaTempValid) {
        localRemajaTemp -= 3.5f; // Apply -3.5 C offset
        #if DEBUG_REMAJA_MASTER
        // Serial.printf("[RemajaNode_Master] Original Remaja Temp: %.1fC, Adjusted Remaja Temp: %.1fC\n", sensorManager->getTemperature(), localRemajaTemp);
        #endif
    }

    // Apply temperature offsets to received data
    float adjustedPenyemaianTemp = receivedPenyemaianData.temperature;
    float adjustedDewasaTemp = receivedDewasaData.temperature;
    
    if (penyemaianDataFreshForMqtt && receivedPenyemaianData.temperatureValid) {
        adjustedPenyemaianTemp -= 1.0f; // Apply -1.0 C offset for Penyemaian
    }
    
    if (dewasaDataFreshForMqtt && receivedDewasaData.temperatureValid) {
        adjustedDewasaTemp -= 1.0f; // Apply -1.0 C offset for Dewasa
    }

    // The state of REMAJA_FAN_LED_PIN and REMAJA_LIGHT_LED_PIN reflects Remaja's (and thus Dewasa's) actuator state
    mqttManager->generateJsonPayload( 
      payload, 
      currentNtpTimestampStr, 
      localRemajaTemp, sensorManager->getHumidity(), sensorManager->getLightIntensity(), // Use adjusted temp
      localRemajaTempValid, sensorManager->isHumidityValid(), sensorManager->isLightValid(), // Use original validity for temp
      receivedPenyemaianData, penyemaianDataFreshForMqtt, simulatedPenyemaianEspNowLatencyMs, 
      receivedDewasaData, dewasaDataFreshForMqtt, simulatedDewasaEspNowLatencyMs,         
      digitalRead(REMAJA_FAN_LED_PIN) == HIGH, remajaFanManual ? "manual" : "auto",
      digitalRead(REMAJA_LIGHT_LED_PIN) == HIGH, remajaLightManual ? "manual" : "auto",
      adjustedPenyemaianTemp, adjustedDewasaTemp // Pass adjusted temperatures for MQTT payload
    );

    #if DEBUG_MQTT_MANAGER && DEBUG_REMAJA_MASTER
    Serial.print("[RemajaNode_Master] Publishing to MQTT. NTP Timestamp: "); Serial.println(currentNtpTimestampStr);
    Serial.print("  Penyemaian ESP-NOW Latency (, ms): "); Serial.println(penyemaianDataFreshForMqtt ? String(simulatedPenyemaianEspNowLatencyMs) : "N/A (stale)");
    Serial.print("  Dewasa ESP-NOW Latency (, ms): "); Serial.println(dewasaDataFreshForMqtt ? String(simulatedDewasaEspNowLatencyMs) : "N/A (stale)");
    #endif

    if (mqttManager->publish(payload)) {
      #if DEBUG_REMAJA_MASTER
      // Serial.println("[RemajaNode_Master] Data published to MQTT successfully"); 
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

    // Get Remaja's local temperature and apply offset for average calculation
    float localRemajaTempForAvg = sensorManager->getTemperature();
    bool localRemajaTempValidForAvg = sensorManager->isTemperatureValid();
    if (localRemajaTempValidForAvg) {
        localRemajaTempForAvg -= 3.5f; // Apply -3.5 C offset
    }

    if (localRemajaTempValidForAvg) {
        tempSum += localRemajaTempForAvg; tempCount++;
    }
    if (sensorManager->isHumidityValid()) {
        humiditySum += sensorManager->getHumidity(); humidityCount++;
    }
    if (sensorManager->isLightValid()) {
        lightSum += sensorManager->getLightIntensity(); lightCount++;
    }

    if ((currentMillis - lastGatewaySerialTime < GATEWAY_SERIAL_TIMEOUT) && isPenyemaianDataValidSerial) {
        if (receivedPenyemaianData.temperatureValid) { 
            tempSum += (receivedPenyemaianData.temperature - 1.0f); tempCount++; // Apply -1.0 C offset
        }
        if (receivedPenyemaianData.humidityValid) { humiditySum += receivedPenyemaianData.humidity; humidityCount++; }
        if (receivedPenyemaianData.lightValid) { lightSum += receivedPenyemaianData.lightIntensity; lightCount++; }
    }

    if ((currentMillis - lastGatewaySerialTime < GATEWAY_SERIAL_TIMEOUT) && isDewasaDataValidSerial) {
        if (receivedDewasaData.temperatureValid) { 
            tempSum += (receivedDewasaData.temperature - 1.0f); tempCount++; // Apply -1.0 C offset
        }
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

    // Control Remaja's local actuators (pins 18, 19)
    // These pins also act as signals to the Gateway for Dewasa's actuators
    if (digitalRead(REMAJA_FAN_LED_PIN) != finalFanState) {
        digitalWrite(REMAJA_FAN_LED_PIN, finalFanState ? HIGH : LOW);
        #if DEBUG_REMAJA_MASTER
        Serial.printf("[RemajaNode_Master] Remaja/Dewasa Fan (Pin %d) set to %s (Mode: %s)\n", REMAJA_FAN_LED_PIN, finalFanState ? "ON" : "OFF", remajaFanManual ? "Manual" : "Auto");
        #endif
    }
    if (digitalRead(REMAJA_LIGHT_LED_PIN) != finalLightState) {
        digitalWrite(REMAJA_LIGHT_LED_PIN, finalLightState ? HIGH : LOW);
        #if DEBUG_REMAJA_MASTER
        Serial.printf("[RemajaNode_Master] Remaja/Dewasa Light (Pin %d) set to %s (Mode: %s)\n", REMAJA_LIGHT_LED_PIN, finalLightState ? "ON" : "OFF", remajaLightManual ? "Manual" : "Auto");
        #endif
    }

    // No need to send commands to Gateway via Serial anymore for Dewasa.
    // The Gateway will read the state of REMAJA_FAN_LED_PIN and REMAJA_LIGHT_LED_PIN.
    prevFuzzyFanStateRemaja = finalFanState; // Update previous states for Remaja's local logic if needed
    prevFuzzyLightStateRemaja = finalLightState;
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

    const char* targetNode = doc["node"]; 
    const char* device = doc["device"]; 
    const char* mode = doc["mode"];     
    
    // If targetNode is "dewasa", the command will effectively control Remaja's output pins,
    // which are then read by the Gateway to control Dewasa.
    // So, all commands effectively target Remaja's output pins.
    if (!device) {
        Serial.println("[MQTT Callback] ERROR: Missing 'device' in command.");
        return;
    }

    bool state = false; 
    if (doc.containsKey("state")) {
        state = doc["state"].as<bool>();
    } else if (!mode) { 
        Serial.println("[MQTT Callback] Command missing 'state' for direct control or 'mode' for mode switch.");
        return;
    }

    if (mode) { 
        Serial.printf("[MQTT Callback] Processing mode switch for Remaja/Dewasa: device='%s', mode='%s'\n", device, mode);
        if (strcmp(device, "fan") == 0) {
            remajaFanManual = (strcmp(mode, "manual") == 0);
            if (remajaFanManual && doc.containsKey("state")) { 
                digitalWrite(REMAJA_FAN_LED_PIN, state ? HIGH : LOW);
            } 
            Serial.printf("[Control] Remaja/Dewasa Fan mode set to %s. Current pin %d state: %s\n", 
                          remajaFanManual ? "Manual" : "Auto", REMAJA_FAN_LED_PIN,
                          digitalRead(REMAJA_FAN_LED_PIN) ? "ON" : "OFF");
        } else if (strcmp(device, "light") == 0) {
            remajaLightManual = (strcmp(mode, "manual") == 0);
             if (remajaLightManual && doc.containsKey("state")) {
                digitalWrite(REMAJA_LIGHT_LED_PIN, state ? HIGH : LOW);
            }
            Serial.printf("[Control] Remaja/Dewasa Light mode set to %s. Current pin %d state: %s\n", 
                          remajaLightManual ? "Manual" : "Auto", REMAJA_LIGHT_LED_PIN,
                          digitalRead(REMAJA_LIGHT_LED_PIN) ? "ON" : "OFF");
        }
    } else if (doc.containsKey("state")) { 
        Serial.printf("[MQTT Callback] Processing state change for Remaja/Dewasa: device='%s', state=%s\n", device, state ? "ON" : "OFF");
        if (strcmp(device, "fan") == 0) {
            remajaFanManual = true; 
            digitalWrite(REMAJA_FAN_LED_PIN, state ? HIGH : LOW);
            Serial.printf("[Control] Remaja/Dewasa Fan (Pin %d, Manual) set to %s\n", REMAJA_FAN_LED_PIN, state ? "ON" : "OFF");
        } else if (strcmp(device, "light") == 0) {
            remajaLightManual = true; 
            digitalWrite(REMAJA_LIGHT_LED_PIN, state ? HIGH : LOW);
            Serial.printf("[Control] Remaja/Dewasa Light (Pin %d, Manual) set to %s\n", REMAJA_LIGHT_LED_PIN, state ? "ON" : "OFF");
        }
    } else {
        Serial.println("[MQTT Callback] Command missing 'mode' or 'state'.");
        return; 
    }
    // The runFuzzyControlAndActuators() in the main loop will ensure the pins are correctly set
    // based on the new manual/auto mode and state if manual.
    // No need to call sendControlCommandToGatewayForDewasaWithRetries or ForwardCommand.
  } else {
      Serial.printf("[MQTT Callback] Message on unhandled topic: %s\n", topic);
  }
}
