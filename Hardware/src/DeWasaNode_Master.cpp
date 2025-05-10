#include <Arduino.h>
#include <WiFi.h>
// #include <esp_now.h> // Removed
// #include <esp_wifi.h> // Removed (unless needed for other WiFi functions, keep if so)
#include <Wire.h>
#include <ArduinoJson.h> // Added

// Include our custom managers
#include "SensorManager.h"
// #include "ESPNowManager.h" // Removed
#include "MQTTManager.h"
#include "FuzzyController.h" // Include the new Fuzzy Controller
#include "../lib/Common/NodeConfig.h" // Include common configuration
#include "SensorData.h" // Added (needed for data structs)

// Pin Definitions (Moved to NodeConfig.h)
// #define DHT_PIN 4 // Removed

// Configuration flags
#define TEMP_HUMID_SIMULATION_MODE false  // Set to true to simulate DHT22 readings
#define LIGHT_SIMULATION_MODE false       // Set to true to simulate BH1750 readings

// WiFi and MQTT configuration
// const char* ssid = "padahal katanya uangtakan kemana";      // Replace with your WiFi SSID
// const char* password = "jika memang rejeki akan ditransfer juga";  // Replace with your WiFi password

const char* ssid = "Direktorat Kemendikbud";      // Replace with your WiFi SSID
const char* password = "NadiemGantengSih";  // Replace with your WiFi password

const char* mqtt_server = "d1b364f4ed864e92b1fb464a3201e5ae.s1.eu.hivemq.cloud"; // HiveMQ Cloud server
const int mqtt_port = 8883;                // TLS MQTT port
const char* mqtt_username = "LokataniAdmin"; // MQTT username
const char* mqtt_password = "LokataniAdmin123"; // MQTT password
const char* mqtt_publish_topic = "lokatech/greenhouse/sensors"; // Topic to publish data TO
const char* mqtt_control_topic = "lokatech/greenhouse/controls/set"; // Topic to receive commands FROM
const char* mqtt_subscribe_topic = "#"; // Subscribe to all topics

// MAC addresses of peer nodes (REMOVED - Not used for ESP-NOW in this node)
// uint8_t penyemaianMac[] = {0x30, 0xAE, 0xA4, 0x96, 0xA3, 0x48}; // Removed
// uint8_t peremajaanMac[] = {0x4C, 0x11, 0xAE, 0x64, 0xD0, 0x74}; // Removed

// LED Pin Definitions for Fuzzy Control Output Simulation
const int FAN_LED_PIN = 18;
const int LIGHT_LED_PIN = 19;

// Timing variables
unsigned long lastSensorReadTime = 0;
unsigned long lastMqttPublishTime = 0;
// SENSOR_READ_INTERVAL and MQTT_PUBLISH_INTERVAL are now defined in NodeConfig.h

// Storage for previous sensor values (for trend calculation)
float prevTemperature = 0;
float prevHumidity = 0;
float prevLightIntensity = 0;

// Managers
SensorManager* sensorManager;
// ESPNowManager* espNowManager; // Removed
MQTTManager* mqttManager;
FuzzyController* fuzzyController; // Pointer for Fuzzy Controller

// --- Actuator Control Mode ---
bool fanManual = false;    // Tracks if fan is in manual override mode
bool lightManual = false;  // Tracks if light is in manual override mode

// --- Data Storage from Gateway ---
SensorData gatewayPenyemaianData;
SensorData gatewayPeremajaanData;
bool gatewayPenyemaianValid = false; // Was Penyemaian data valid when Gateway received it?
unsigned long lastGatewayDataTime = 0; // Timestamp of last valid message from Gateway
// const unsigned long GATEWAY_DATA_TIMEOUT = 9000UL; // Defined in NodeConfig.h

// Initialize received data structures (in setup or globally)
void initializeGatewayData() {
     memset(&gatewayPenyemaianData, 0, sizeof(SensorData));
     strncpy(gatewayPenyemaianData.nodeName, "penyemaian", sizeof(gatewayPenyemaianData.nodeName) - 1);
     gatewayPenyemaianData.nodeName[sizeof(gatewayPenyemaianData.nodeName) - 1] = '\0';
     gatewayPenyemaianData.temperatureValid = false;
     gatewayPenyemaianData.humidityValid = false;
     gatewayPenyemaianData.lightValid = false;

     memset(&gatewayPeremajaanData, 0, sizeof(SensorData));
     strncpy(gatewayPeremajaanData.nodeName, "peremajaan", sizeof(gatewayPeremajaanData.nodeName) - 1);
     gatewayPeremajaanData.nodeName[sizeof(gatewayPeremajaanData.nodeName) - 1] = '\0';
     gatewayPeremajaanData.temperatureValid = false;
     gatewayPeremajaanData.humidityValid = false;
     gatewayPeremajaanData.lightValid = false;
}
// --- End Data Storage ---


// Function prototypes
void mqttCallback(char* topic, byte* payload, unsigned int length); // MQTT message callback
void runFuzzyControl(); // Function to handle fuzzy logic execution
void calculateAverages(float &avgTemp, float &avgHumidity, float &avgLight, bool &averagesValid, int &tempCount, int &humidityCount, int &lightCount); // Updated prototype

void setup() {
  Serial.begin(115200);
  delay(1000); 

#if DEBUG_DEWASA_MAIN
  Serial.println("\n\n[DeWasaNode_Master] Starting Dewasa Node (Master) - Serial Gateway Mode...");
#endif

  Serial2.begin(115200, SERIAL_8N1, 16, 17);
#if DEBUG_DEWASA_SERIAL_GATEWAY
  Serial.println("[DeWasaNode_Master] Serial2 initialized for Gateway communication.");
#endif

  initializeGatewayData();

  sensorManager = new SensorManager(DHT_PIN, TEMP_HUMID_SIMULATION_MODE, LIGHT_SIMULATION_MODE);
  mqttManager = new MQTTManager(ssid, password, mqtt_server, mqtt_port, mqtt_publish_topic, mqtt_control_topic, mqtt_username, mqtt_password);
  fuzzyController = new FuzzyController();

  pinMode(FAN_LED_PIN, OUTPUT);
  pinMode(LIGHT_LED_PIN, OUTPUT);
  digitalWrite(FAN_LED_PIN, LOW); 
  digitalWrite(LIGHT_LED_PIN, LOW);

  sensorManager->begin();
  WiFi.mode(WIFI_STA); 

#if DEBUG_DEWASA_MAIN
  Serial.println("[DeWasaNode_Master] Setting MQTT callback on MQTTManager...");
#endif
  mqttManager->setCallback(mqttCallback);
#if DEBUG_DEWASA_MAIN
  Serial.printf("[DeWasaNode_Master] MQTTManager's internal callback pointer set using function at %p\n", (void*)mqttCallback);
#endif

  if (!mqttManager->begin()) { 
    Serial.println("[DeWasaNode_Master] ERROR: Failed to initialize MQTT (and WiFi)"); // Critical
  } else {
      if (mqttManager->isConnected()) {
#if DEBUG_DEWASA_MAIN
        Serial.println("[DeWasaNode_Master] Connected to MQTT broker (from begin call)");
        Serial.printf("[DeWasaNode_Master] Verifying subscription to general topic: %s\n", mqtt_subscribe_topic);
#endif
        bool generalSubscribeSuccess = mqttManager->getClient().subscribe(mqtt_subscribe_topic, 1);
#if DEBUG_DEWASA_MAIN
        Serial.printf("[DeWasaNode_Master] Subscription to %s: %s\n", 
                     mqtt_subscribe_topic, generalSubscribeSuccess ? "SUCCESS" : "FAILED");
#endif
      } else {
#if DEBUG_DEWASA_MAIN
         Serial.println("[DeWasaNode_Master] WARNING: Failed to connect to MQTT broker initially (during begin). Will retry in loop.");
#endif
      }
  }

  fuzzyController->begin();
#if DEBUG_DEWASA_MAIN
  Serial.println("[DeWasaNode_Master] Setup completed (Serial Gateway Mode)");
#endif
}

// Timer for fuzzy debug printing
unsigned long lastFuzzyDebugPrintTime = 0;
const unsigned long FUZZY_DEBUG_PRINT_INTERVAL = 5000; // Print fuzzy debug info every 5 seconds

void loop() {
  unsigned long currentTime = millis();

  // --- Process Incoming Data from Gateway via Serial2 ---
  if (Serial2.available() > 0) {
      String line = Serial2.readStringUntil('\n');
      line.trim(); 

      if (line.length() > 0) {
          StaticJsonDocument<512> doc; 
          DeserializationError error = deserializeJson(doc, line);

          if (!error) {
              if (doc.containsKey("peremajaan") && doc.containsKey("penyemaian") && doc.containsKey("isPenyemaianValid")) {
                  gatewayPeremajaanData.temperature = doc["peremajaan"]["temp"] | -999.0f;
                  gatewayPeremajaanData.humidity = doc["peremajaan"]["hum"] | -999.0f;
                  gatewayPeremajaanData.lightIntensity = doc["peremajaan"]["light"] | -999.0f;
                  gatewayPeremajaanData.temperatureValid = !doc["peremajaan"]["temp"].isNull();
                  gatewayPeremajaanData.humidityValid = !doc["peremajaan"]["hum"].isNull();
                  gatewayPeremajaanData.lightValid = !doc["peremajaan"]["light"].isNull();
                  gatewayPeremajaanData.timestamp = doc["timestamp_ms"] | 0;

                  gatewayPenyemaianData.temperature = doc["penyemaian"]["temp"] | -999.0f;
                  gatewayPenyemaianData.humidity = doc["penyemaian"]["hum"] | -999.0f;
                  gatewayPenyemaianData.lightIntensity = doc["penyemaian"]["light"] | -999.0f;
                  gatewayPenyemaianData.temperatureValid = !doc["penyemaian"]["temp"].isNull();
                  gatewayPenyemaianData.humidityValid = !doc["penyemaian"]["hum"].isNull();
                  gatewayPenyemaianData.lightValid = !doc["penyemaian"]["light"].isNull();
                  gatewayPenyemaianData.timestamp = doc["timestamp_ms"] | 0;
                  gatewayPenyemaianValid = doc["isPenyemaianValid"] | false;
                  lastGatewayDataTime = millis();
#if DEBUG_DEWASA_SERIAL_GATEWAY
                  Serial.println("[DewasaNode] Parsed valid JSON from Gateway via Serial2.");
#endif
              } else {
#if DEBUG_DEWASA_SERIAL_GATEWAY
                  Serial.println("[DewasaNode] ERROR: Received JSON from Gateway missing required keys.");
                  Serial.print("  Raw line: "); Serial.println(line);
#endif
              }
          } else {
#if DEBUG_DEWASA_SERIAL_GATEWAY
              Serial.print("[DewasaNode] ERROR: Failed to parse JSON from Gateway: "); Serial.println(error.c_str());
              Serial.print("  Raw line: "); Serial.println(line);
#endif
          }
      } 
  } 


  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) { 
    lastSensorReadTime = currentTime;
#if DEBUG_DEWASA_MAIN
    Serial.println("\n[DeWasaNode_Master] Reading sensors...");
#endif
    bool success = sensorManager->readSensors();
#if DEBUG_DEWASA_MAIN
    if (success) Serial.println("[DeWasaNode_Master] All sensors read successfully");
    else Serial.println("[DeWasaNode_Master] WARNING: Some sensors failed to read");
#endif
  }

  if (currentTime - lastMqttPublishTime >= MQTT_PUBLISH_INTERVAL) {
    lastMqttPublishTime = currentTime;
#if DEBUG_DEWASA_MAIN
    Serial.println("\n[DeWasaNode_Master] Preparing MQTT payload...");
#endif
    String payload;
    mqttManager->generateJsonPayload( payload, sensorManager->getTemperature(), sensorManager->getHumidity(), sensorManager->getLightIntensity(),
      sensorManager->isTemperatureValid(), sensorManager->isHumidityValid(), sensorManager->isLightValid(),
      gatewayPenyemaianData, (millis() - lastGatewayDataTime < GATEWAY_DATA_TIMEOUT && gatewayPenyemaianValid),
      gatewayPeremajaanData, (millis() - lastGatewayDataTime < GATEWAY_DATA_TIMEOUT),
      digitalRead(FAN_LED_PIN) == HIGH, fanManual ? "manual" : "auto",
      digitalRead(LIGHT_LED_PIN) == HIGH, lightManual ? "manual" : "auto"
    );

    if (mqttManager->publish(payload)) {
#if DEBUG_DEWASA_MAIN
      Serial.println("[DeWasaNode_Master] Data published to MQTT successfully");
#endif
    } else {
      Serial.println("[DeWasaNode_Master] ERROR: Failed to publish data to MQTT"); // Critical
    }
  }

  mqttManager->loop();
  
#if DEBUG_DEWASA_MQTT_SELF_TEST
  static unsigned long lastSubscriptionCheckTime = 0;
  if (currentTime - lastSubscriptionCheckTime >= 10000) { 
    lastSubscriptionCheckTime = currentTime;
    if (mqttManager->isConnected()) {
      char testMsg[100];
      sprintf(testMsg, "{\"device\":\"fan\",\"state\":true,\"mode\":\"manual\"}");
      bool publishResult = mqttManager->getClient().publish(mqtt_control_topic, testMsg);
      Serial.printf("[DeWasaNode_Master] Self-test message sent to %s: %s\n", 
                   mqtt_control_topic, publishResult ? "SUCCESS" : "FAILED");
      if(publishResult) Serial.printf("  Test Payload: %s\n", testMsg);
    }
  }
#endif

  runFuzzyControl();
  yield(); 
}

// Updated function to also return counts for debugging
// --- Modified calculateAverages ---
void calculateAverages(float &avgTemp, float &avgHumidity, float &avgLight, bool &averagesValid, int &tempCount, int &humidityCount, int &lightCount) {
    float tempSum = 0;
    tempCount = 0;
    float humiditySum = 0;
    humidityCount = 0;
    float lightSum = 0;
    lightCount = 0;
    unsigned long currentMillis = millis(); // Get current time once

    bool isGatewayDataRecent = (currentMillis - lastGatewayDataTime < GATEWAY_DATA_TIMEOUT);

    // Local (Dewasa) sensors
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

    // Peremajaan data (received via Gateway)
    if (isGatewayDataRecent) { // Check if ANY data from gateway is recent
        // Use the validity flags stored WITHIN gatewayPeremajaanData
        if (gatewayPeremajaanData.temperatureValid) {
            tempSum += gatewayPeremajaanData.temperature;
            tempCount++;
        }
        if (gatewayPeremajaanData.humidityValid) {
            humiditySum += gatewayPeremajaanData.humidity;
            humidityCount++;
        }
        if (gatewayPeremajaanData.lightValid) {
            lightSum += gatewayPeremajaanData.lightIntensity;
            lightCount++;
        }
    }

    // Penyemaian data (received via Gateway)
    // Valid only if Gateway data is recent AND the flag sent by Gateway is true
    if (isGatewayDataRecent && gatewayPenyemaianValid) {
         // Use the validity flags stored WITHIN gatewayPenyemaianData
        if (gatewayPenyemaianData.temperatureValid) {
            tempSum += gatewayPenyemaianData.temperature;
            tempCount++;
        }
        if (gatewayPenyemaianData.humidityValid) {
            humiditySum += gatewayPenyemaianData.humidity;
            humidityCount++;
        }
        if (gatewayPenyemaianData.lightValid) {
            lightSum += gatewayPenyemaianData.lightIntensity;
            lightCount++;
        }
    }

    // Calculate averages only if there's valid data
    avgTemp = (tempCount > 0) ? (tempSum / tempCount) : -999.0f; // Use sentinel value if no valid data
    avgHumidity = (humidityCount > 0) ? (humiditySum / humidityCount) : -999.0f;
    avgLight = (lightCount > 0) ? (lightSum / lightCount) : -999.0f;

    // Averages are considered valid if at least one sensor of each type reported valid data
    averagesValid = (tempCount > 0 && humidityCount > 0 && lightCount > 0);

    // Serial.printf("[Averages] Temp: %.1f (%d), Hum: %.1f (%d), Light: %.1f (%d), Valid: %s\n",
    //               avgTemp, tempCount, avgHumidity, humidityCount, avgLight, lightCount, averagesValid ? "Yes" : "No");
}


// Function to run the fuzzy logic and control LEDs
void runFuzzyControl() {
    float avgTemp, avgHumidity, avgLight;
    bool averagesValid;
    int tempCount, humidityCount, lightCount; // Variables to receive counts

    // Calculate averages and get counts (uses the modified function)
    calculateAverages(avgTemp, avgHumidity, avgLight, averagesValid, tempCount, humidityCount, lightCount);

    // Determine if fuzzy logic should run (requires valid averages)
    bool runLogic = averagesValid;

    // --- Perform Fuzzy Logic Calculation (always run if possible, control output based on validity) ---
    if (runLogic) {
        fuzzyController->setInputs(avgTemp, avgHumidity, avgLight);
        fuzzyController->run();
    }

    // --- Control LEDs based on fuzzy output OR default state ---
    bool fanState = false; // Default OFF
    bool lightState = false; // Default OFF

    // Determine desired state based on fuzzy logic or manual override
    if (!fanManual) {
        fanState = runLogic ? fuzzyController->getFanOutput() : false; // Use fuzzy output if valid, else OFF
    } else {
        fanState = digitalRead(FAN_LED_PIN) == HIGH; // Keep manual state
    }

    if (!lightManual) {
        lightState = runLogic ? fuzzyController->getLightOutput() : false; // Use fuzzy output if valid, else OFF
    } else {
        lightState = digitalRead(LIGHT_LED_PIN) == HIGH; // Keep manual state
    }

    // Set the final pin states
    digitalWrite(FAN_LED_PIN, fanState ? HIGH : LOW);
    digitalWrite(LIGHT_LED_PIN, lightState ? HIGH : LOW);


//     // --- Debug Printing (with delay) ---
//     unsigned long currentTime = millis();
//     if (currentTime - lastFuzzyDebugPrintTime >= FUZZY_DEBUG_PRINT_INTERVAL) {
//         lastFuzzyDebugPrintTime = currentTime;

//         Serial.println("\n--- Fuzzy Control Debug ---");
//         if (runLogic) {
//              Serial.printf("  Status: Running Logic\n");
//              Serial.printf("  Inputs (Avg of %d T, %d H, %d L sensors):\n", tempCount, humidityCount, lightCount);
//              Serial.printf("    Temp: %.1f C\n", avgTemp);
//              Serial.printf("    Humidity: %.1f %%\n", avgHumidity);
//              Serial.printf("    Light: %.1f lux\n", avgLight);
//              Serial.printf("  Membership Degrees:\n");
//              Serial.printf("    Temp -> Cold:%.2f Optimal:%.2f Hot:%.2f\n",
//                            fuzzyController->getMembershipTempCold(),
//                            fuzzyController->getMembershipTempOptimal(),
//                            fuzzyController->getMembershipTempHot());
//              Serial.printf("    Hum  -> Dry:%.2f Optimal:%.2f Humid:%.2f\n",
//                            fuzzyController->getMembershipHumidityDry(),
//                            fuzzyController->getMembershipHumidityOptimal(),
//                            fuzzyController->getMembershipHumidityHumid());
//              Serial.printf("    Light-> Dark:%.2f Adequate:%.2f\n",
//                            fuzzyController->getMembershipLightDark(),
//                            fuzzyController->getMembershipLightAdequate());
//              Serial.printf("  Raw Outputs (Defuzzified):\n");
//              Serial.printf("    Fan Raw: %.2f\n", fuzzyController->getRawFanOutput());
//              Serial.printf("    Light Raw: %.2f\n", fuzzyController->getRawLightOutput());
//              Serial.printf("  Final Outputs (Threshold > 0.5):\n");
//              Serial.printf("    Fan State: %s (Mode: %s)\n", fanState ? "ON" : "OFF", fanManual ? "Manual" : "Auto");
//              Serial.printf("    Light State: %s (Mode: %s)\n", lightState ? "ON" : "OFF", lightManual ? "Manual" : "Auto");
//         } else {
//              Serial.printf("  Status: Skipped (Averages Invalid - Need Temp:%s, Hum:%s, Light:%s)\n",
//                            tempCount > 0 ? "OK" : "FAIL",
//                            humidityCount > 0 ? "OK" : "FAIL",
//                            lightCount > 0 ? "OK" : "FAIL");
//              Serial.printf("  Outputs: Defaulting to OFF (unless manually overridden)\n");
//              Serial.printf("    Fan State: %s (Mode: %s)\n", digitalRead(FAN_LED_PIN) == HIGH ? "ON" : "OFF", fanManual ? "Manual" : "Auto");
//              Serial.printf("    Light State: %s (Mode: %s)\n", digitalRead(LIGHT_LED_PIN) == HIGH ? "ON" : "OFF", lightManual ? "Manual" : "Auto");
//         }
//          Serial.println("---------------------------");
//     }
}

// --- MQTT Callback Function ---
void mqttCallback(char* topic, byte* payload, unsigned int length) {
#if DEBUG_DEWASA_MQTT_CALLBACK
  Serial.printf("\n*** [MQTT Callback] Message arrived! ***\n");
  Serial.printf("  Topic: %s (expected control topic: %s)\n", topic, mqtt_control_topic);
  Serial.printf("  Topics match control topic: %s\n", (strcmp(topic, mqtt_control_topic) == 0) ? "YES" : "NO");
  Serial.printf("  Message length: %d bytes\n", length);
#endif

  char* payloadCopy = (char*)malloc(length + 1);
  if (!payloadCopy) {
    Serial.println("[MQTT Callback] ERROR: Out of memory for payload copy"); // Critical
    return;
  }
  memcpy(payloadCopy, payload, length);
  payloadCopy[length] = '\0';
  
#if DEBUG_DEWASA_MQTT_CALLBACK
  String message = String(payloadCopy);
  Serial.printf("  Payload: %s\n", message.c_str());
  Serial.print("  Raw bytes: ");
  for (unsigned int i = 0; i < length; i++) Serial.printf("%02X ", payload[i]);
  Serial.println();
#endif

  if (strcmp(topic, mqtt_control_topic) == 0) {
    StaticJsonDocument<128> doc; 
    DeserializationError error = deserializeJson(doc, payloadCopy);
    
    if (error) {
#if DEBUG_DEWASA_MQTT_CALLBACK
      Serial.printf("  ERROR: JSON parsing failed: %s\n", error.c_str());
#endif
      free(payloadCopy);
      return;
    }
    free(payloadCopy); // Free here after successful or failed parsing of payloadCopy

#if DEBUG_DEWASA_MQTT_CALLBACK
    Serial.println("  JSON contents:");
    serializeJsonPretty(doc, Serial);
    Serial.println();
#endif

    const char* device = doc["device"]; 
    const char* mode = doc["mode"];     
    
#if DEBUG_DEWASA_MQTT_CALLBACK
    Serial.printf("  Extracted: device=%s (exists: %s), mode=%s (exists: %s)\n", 
                 device ? device : "NULL", doc.containsKey("device") ? "YES" : "NO",
                 mode ? mode : "NULL", doc.containsKey("mode") ? "YES" : "NO");
    if (doc.containsKey("state")) {
      Serial.printf("  Extracted: state=%s (type: %s)\n", 
                   doc["state"].as<bool>() ? "true" : "false", 
                   doc["state"].is<bool>() ? "bool" : (doc["state"].is<int>() ? "int" : "other"));
    } else {
      Serial.println("  state key does not exist in JSON");
    }
#endif

    if (!device) {
#if DEBUG_DEWASA_MQTT_CALLBACK
        Serial.println("[MQTT Callback] ERROR: Missing 'device' in command payload.");
#endif
        return;
    }

    if (mode) {
#if DEBUG_DEWASA_MQTT_CALLBACK
        Serial.printf("[MQTT Callback] Processing mode switch: device='%s', mode='%s'\n", device, mode);
#endif
        if (strcmp(device, "fan") == 0) {
            if (strcmp(mode, "manual") == 0) {
                fanManual = true;
                if (doc.containsKey("state")) {
                    bool state = doc["state"];
                    digitalWrite(FAN_LED_PIN, state ? HIGH : LOW);
#if DEBUG_DEWASA_MQTT_CALLBACK
                    Serial.printf("[Control] Fan set to %s (Manual Mode)\n", state ? "ON" : "OFF");
#endif
                }
            } else if (strcmp(mode, "auto") == 0) {
                fanManual = false;
#if DEBUG_DEWASA_MQTT_CALLBACK
                Serial.println("[Control] Fan switched to Automatic Mode");
#endif
            }
        } else if (strcmp(device, "light") == 0) {
            if (strcmp(mode, "manual") == 0) {
                lightManual = true;
                if (doc.containsKey("state")) {
                    bool state = doc["state"];
                    digitalWrite(LIGHT_LED_PIN, state ? HIGH : LOW);
#if DEBUG_DEWASA_MQTT_CALLBACK
                    Serial.printf("[Control] Light set to %s (Manual Mode)\n", state ? "ON" : "OFF");
#endif
                }
            } else if (strcmp(mode, "auto") == 0) {
                lightManual = false;
#if DEBUG_DEWASA_MQTT_CALLBACK
                Serial.println("[Control] Light switched to Automatic Mode");
#endif
            }
        }
    } else if (doc.containsKey("state")) {
        bool state = doc["state"];
#if DEBUG_DEWASA_MQTT_CALLBACK
        Serial.printf("[MQTT Callback] Processing state change (no mode specified): device='%s', state=%s\n", device, state ? "ON" : "OFF");
#endif
        if (strcmp(device, "fan") == 0) {
            if (!fanManual) { // If in auto, switch to manual upon direct state command
                fanManual = true;
#if DEBUG_DEWASA_MQTT_CALLBACK
                Serial.println("[Control] Fan auto-switched to Manual Mode due to state command.");
#endif
            }
            digitalWrite(FAN_LED_PIN, state ? HIGH : LOW);
#if DEBUG_DEWASA_MQTT_CALLBACK
            Serial.printf("[Control] Fan set to %s (Manual Mode)\n", state ? "ON" : "OFF");
#endif
        } else if (strcmp(device, "light") == 0) {
             if (!lightManual) { // If in auto, switch to manual
                lightManual = true;
#if DEBUG_DEWASA_MQTT_CALLBACK
                Serial.println("[Control] Light auto-switched to Manual Mode due to state command.");
#endif
            }
            digitalWrite(LIGHT_LED_PIN, state ? HIGH : LOW);
#if DEBUG_DEWASA_MQTT_CALLBACK
            Serial.printf("[Control] Light set to %s (Manual Mode)\n", state ? "ON" : "OFF");
#endif
        }
    } else {
#if DEBUG_DEWASA_MQTT_CALLBACK
        Serial.println("[MQTT Callback] Command payload missing 'mode' and 'state'. No action taken.");
#endif
    }
  } else {
#if DEBUG_DEWASA_MQTT_CALLBACK
      Serial.printf("[MQTT Callback] Message on unhandled topic: %s\n", topic);
#endif
  }
}
