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
#include "NodeConfig.h" // Include common configuration
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
  // Initialize serial communication
  Serial.begin(115200);
  delay(1000); // Give serial monitor time to start

  Serial.println("\n\n[DeWasaNode_Master] Starting Dewasa Node (Master) - Serial Gateway Mode...");

  // Initialize Serial2 to receive data from Gateway ESP32
  // Baud rate MUST match Gateway's Serial2 setting
  Serial2.begin(115200, SERIAL_8N1, 16, 17); // RX2=16, TX2=17
  Serial.println("[DeWasaNode_Master] Serial2 initialized for Gateway communication.");

  // Initialize Gateway data storage
  initializeGatewayData();

  // Initialize managers
  sensorManager = new SensorManager(DHT_PIN, TEMP_HUMID_SIMULATION_MODE, LIGHT_SIMULATION_MODE);
  // espNowManager = new ESPNowManager(); // Removed
  // Pass both PUBLISH and CONTROL topics to the manager constructor
  // Initialize the MQTT Manager with username and password
  mqttManager = new MQTTManager(ssid, password, mqtt_server, mqtt_port, mqtt_publish_topic, mqtt_control_topic, mqtt_username, mqtt_password);
  fuzzyController = new FuzzyController(); // Initialize Fuzzy Controller

  // Initialize LED pins
  pinMode(FAN_LED_PIN, OUTPUT);
  pinMode(LIGHT_LED_PIN, OUTPUT);
  digitalWrite(FAN_LED_PIN, LOW); // Start with LEDs OFF
  digitalWrite(LIGHT_LED_PIN, LOW);

  // Initialize sensor manager
  sensorManager->begin();

  // Set WiFi Station mode (needed before setting channel) - Keep if MQTT needs it
  WiFi.mode(WIFI_STA); // Ensure STA mode is set

  // Set WiFi channel BEFORE connecting to WiFi/MQTT and initializing ESP-NOW (REMOVED)
  // Serial.printf("[DeWasaNode_Master] Setting WiFi channel to %d...\n", WIFI_CHANNEL); // Removed
  // if (esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE) != ESP_OK) { // Removed
  //     Serial.printf("[DeWasaNode_Master] ERROR: Failed to set WiFi channel %d!\n", WIFI_CHANNEL); // Removed
  // } else { // Removed
  //     Serial.printf("[DeWasaNode_Master] WiFi channel set to %d successfully.\n", WIFI_CHANNEL); // Removed
  // } // Removed

  // Initialize MQTT (this will now connect to WiFi on the pre-set channel)
  if (!mqttManager->begin()) { // <-- MQTT Init happens AFTER setting channel
    Serial.println("[DeWasaNode_Master] ERROR: Failed to initialize MQTT (and WiFi)");
    // Consider halting or retrying if WiFi/MQTT is critical
  } else {
      // Set the callback BEFORE trying to connect
      Serial.println("[DeWasaNode_Master] Setting MQTT callback...");
      mqttManager->setCallback(mqttCallback);
      Serial.printf("[DeWasaNode_Master] MQTT callback set to %p\n", mqttCallback);
      
      // Now try to connect to MQTT broker
      if (mqttManager->connect()) {
        Serial.println("[DeWasaNode_Master] Connected to MQTT broker");
        Serial.printf("[DeWasaNode_Master] Control topic is: %s\n", mqtt_control_topic);
        
        // Double-check subscription
        bool resubscribeSuccess = mqttManager->getClient().subscribe(mqtt_control_topic, 1);
        Serial.printf("[DeWasaNode_Master] Double-check subscription: %s\n", 
                     resubscribeSuccess ? "SUCCESS" : "FAILED");
      } else {
         Serial.println("[DeWasaNode_Master] WARNING: Failed to connect to MQTT broker initially.");
      }
  }

  // Now initialize ESP-NOW, passing the MAC of the node sending CombinedData (Peremajaan) (REMOVED)
  // if (!espNowManager->begin(peremajaanMac)) { // Removed
  //   Serial.println("[DeWasaNode_Master] ERROR: Failed to initialize ESP-NOW Manager"); // Removed
  // } else { // Removed
  //   Serial.println("[DeWasaNode_Master] ESP-NOW Manager initialized."); // Removed
  // } // Removed

  // Add Peremajaan as a peer (optional but good practice for receiving) (REMOVED)
  // if (espNowManager->addPeer(peremajaanMac)) { // Removed
  //   Serial.println("[DeWasaNode_Master] Peremajaan node added as ESP-NOW peer."); // Removed
  // } else { // Removed
  //    Serial.println("[DeWasaNode_Master] WARNING: Failed to add Peremajaan as ESP-NOW peer."); // Removed
  // } // Removed

  // Initialize the Fuzzy Controller logic (defines sets, rules etc.)
  fuzzyController->begin();

  Serial.println("[DeWasaNode_Master] Setup completed (Serial Gateway Mode)");
}

// Timer for fuzzy debug printing
unsigned long lastFuzzyDebugPrintTime = 0;
const unsigned long FUZZY_DEBUG_PRINT_INTERVAL = 5000; // Print fuzzy debug info every 5 seconds

void loop() {
  unsigned long currentTime = millis();

  // --- Process Incoming Data from Gateway via Serial2 ---
  if (Serial2.available() > 0) {
      String line = Serial2.readStringUntil('\n');
      line.trim(); // Remove potential whitespace/newlines

      if (line.length() > 0) {
          // Attempt to parse JSON
          StaticJsonDocument<512> doc; // Adjust size if needed based on Gateway JSON
          DeserializationError error = deserializeJson(doc, line);

          if (!error) {
              // Basic validation
              if (doc.containsKey("peremajaan") && doc.containsKey("penyemaian") && doc.containsKey("isPenyemaianValid")) {
                  JsonObject peremajaanJson = doc["peremajaan"];
                  JsonObject penyemaianJson = doc["penyemaian"];

                  // Extract Peremajaan Data
                  gatewayPeremajaanData.temperature = peremajaanJson["temp"] | -999.0f;
                  gatewayPeremajaanData.humidity = peremajaanJson["hum"] | -999.0f;
                  gatewayPeremajaanData.lightIntensity = peremajaanJson["light"] | -999.0f;
                  gatewayPeremajaanData.temperatureValid = !peremajaanJson["temp"].isNull();
                  gatewayPeremajaanData.humidityValid = !peremajaanJson["hum"].isNull();
                  gatewayPeremajaanData.lightValid = !peremajaanJson["light"].isNull();
                  gatewayPeremajaanData.timestamp = doc["timestamp_ms"] | 0; // Store original timestamp if needed

                  // Extract Penyemaian Data
                  gatewayPenyemaianData.temperature = penyemaianJson["temp"] | -999.0f;
                  gatewayPenyemaianData.humidity = penyemaianJson["hum"] | -999.0f;
                  gatewayPenyemaianData.lightIntensity = penyemaianJson["light"] | -999.0f;
                  gatewayPenyemaianData.temperatureValid = !penyemaianJson["temp"].isNull();
                  gatewayPenyemaianData.humidityValid = !penyemaianJson["hum"].isNull();
                  gatewayPenyemaianData.lightValid = !penyemaianJson["light"].isNull();
                  // Timestamp is likely same as peremajaan's packet time
                  gatewayPenyemaianData.timestamp = doc["timestamp_ms"] | 0;

                  // Extract Penyemaian Validity Flag
                  gatewayPenyemaianValid = doc["isPenyemaianValid"] | false;

                  lastGatewayDataTime = millis(); // Update time of successful reception
                  Serial.println("[DewasaNode] Parsed valid JSON from Gateway via Serial2.");

                  // Optional: Print extracted data for debug
                  // Serial.printf("  GW Prmj T:%.1f H:%.1f L:%.1f\n", gatewayPeremajaanData.temperature, gatewayPeremajaanData.humidity, gatewayPeremajaanData.lightIntensity);
                  // Serial.printf("  GW Pnym T:%.1f H:%.1f L:%.1f (Valid Flag:%d)\n", gatewayPenyemaianData.temperature, gatewayPenyemaianData.humidity, gatewayPenyemaianData.lightIntensity, gatewayPenyemaianValid);

              } else {
                  Serial.println("[DewasaNode] ERROR: Received JSON from Gateway missing required keys.");
                  Serial.print("  Raw line: "); Serial.println(line);
              }
          } else {
              Serial.print("[DewasaNode] ERROR: Failed to parse JSON from Gateway: ");
              Serial.println(error.c_str());
              Serial.print("  Raw line: "); Serial.println(line);
          }
      } // end if line length > 0
  } // end if Serial2.available()
  // --- End Serial Processing ---


  // Read sensors at regular intervals using interval from NodeConfig.h
  if (currentTime - lastSensorReadTime >= 1000UL) { // Use constant from NodeConfig.h
    lastSensorReadTime = currentTime;

    Serial.println("\n[DeWasaNode_Master] Reading sensors...");
    bool success = sensorManager->readSensors();

    if (success) {
      Serial.println("[DeWasaNode_Master] All sensors read successfully");
    } else {
      Serial.println("[DeWasaNode_Master] WARNING: Some sensors failed to read");
    }
  }

  // Publish to MQTT at regular intervals using interval from NodeConfig.h
  if (currentTime - lastMqttPublishTime >= MQTT_PUBLISH_INTERVAL) {
    lastMqttPublishTime = currentTime;

    Serial.println("\n[DeWasaNode_Master] Preparing MQTT payload...");

    // Store current values for next trend calculation (REMOVED - Trend logic not implemented in payload generation)
    // prevTemperature = sensorManager->getTemperature();
    // prevHumidity = sensorManager->getHumidity();
    // prevLightIntensity = sensorManager->getLightIntensity();

    // Generate JSON payload
    String payload;
    mqttManager->generateJsonPayload(
      payload,
      sensorManager->getTemperature(),
      sensorManager->getHumidity(),
      sensorManager->getLightIntensity(),
      sensorManager->isTemperatureValid(),
      sensorManager->isHumidityValid(),
      sensorManager->isLightValid(),
      gatewayPenyemaianData, // Pass stored data
      (millis() - lastGatewayDataTime < GATEWAY_DATA_TIMEOUT && gatewayPenyemaianValid), // Combined validity check
      gatewayPeremajaanData, // Pass stored data
      (millis() - lastGatewayDataTime < GATEWAY_DATA_TIMEOUT), // Combined validity check
      // Pass current actuator state and mode (existing logic)
      digitalRead(FAN_LED_PIN) == HIGH,
      fanManual ? "manual" : "auto",
      digitalRead(LIGHT_LED_PIN) == HIGH,
      lightManual ? "manual" : "auto"
    );

    // Publish data to MQTT
    if (mqttManager->publish(payload)) {
      Serial.println("[DeWasaNode_Master] Data published to MQTT successfully");
    } else {
      Serial.println("[DeWasaNode_Master] ERROR: Failed to publish data to MQTT");
    }
  }

  // Handle MQTT connection and message processing
  mqttManager->loop();
  
  // Ensure we're subscribed to the control topic if MQTT is connected
  static unsigned long lastSubscriptionCheckTime = 0;
  if (currentTime - lastSubscriptionCheckTime >= 10000) { // Check every 10 seconds (was 30)
    lastSubscriptionCheckTime = currentTime;
    if (mqttManager->isConnected()) {
      // Test sending a message to ourselves (loopback) to verify MQTT reception
      char testMsg[100];
      sprintf(testMsg, "{\"device\":\"test\",\"mode\":\"test\",\"state\":false}");
      
      // Force a resubscription to ensure we're listening
      bool subscribeResult = mqttManager->getClient().subscribe(mqtt_control_topic, 1); // QoS 1
      Serial.printf("[DeWasaNode_Master] Subscription check - Topic: %s, Result: %s\n", 
                   mqtt_control_topic, subscribeResult ? "SUCCESS" : "FAILED");
                   
      // Send a test message to the control topic to test reception
      bool publishResult = mqttManager->getClient().publish(mqtt_control_topic, testMsg);
      Serial.printf("[DeWasaNode_Master] Self-test message sent to %s: %s\n", 
                   mqtt_control_topic, publishResult ? "SUCCESS" : "FAILED");
    }
  }

  // Run Fuzzy Logic Control periodically (could be tied to MQTT interval or separate)
  // Let's run it right after potentially publishing MQTT data
  runFuzzyControl();

  // Small delay removed as per plan
  yield(); // Keep the yield/delay
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


    // --- Debug Printing (with delay) ---
    unsigned long currentTime = millis();
    if (currentTime - lastFuzzyDebugPrintTime >= FUZZY_DEBUG_PRINT_INTERVAL) {
        lastFuzzyDebugPrintTime = currentTime;

        Serial.println("\n--- Fuzzy Control Debug ---");
        if (runLogic) {
             Serial.printf("  Status: Running Logic\n");
             Serial.printf("  Inputs (Avg of %d T, %d H, %d L sensors):\n", tempCount, humidityCount, lightCount);
             Serial.printf("    Temp: %.1f C\n", avgTemp);
             Serial.printf("    Humidity: %.1f %%\n", avgHumidity);
             Serial.printf("    Light: %.1f lux\n", avgLight);
             Serial.printf("  Membership Degrees:\n");
             Serial.printf("    Temp -> Cold:%.2f Optimal:%.2f Hot:%.2f\n",
                           fuzzyController->getMembershipTempCold(),
                           fuzzyController->getMembershipTempOptimal(),
                           fuzzyController->getMembershipTempHot());
             Serial.printf("    Hum  -> Dry:%.2f Optimal:%.2f Humid:%.2f\n",
                           fuzzyController->getMembershipHumidityDry(),
                           fuzzyController->getMembershipHumidityOptimal(),
                           fuzzyController->getMembershipHumidityHumid());
             Serial.printf("    Light-> Dark:%.2f Adequate:%.2f\n",
                           fuzzyController->getMembershipLightDark(),
                           fuzzyController->getMembershipLightAdequate());
             Serial.printf("  Raw Outputs (Defuzzified):\n");
             Serial.printf("    Fan Raw: %.2f\n", fuzzyController->getRawFanOutput());
             Serial.printf("    Light Raw: %.2f\n", fuzzyController->getRawLightOutput());
             Serial.printf("  Final Outputs (Threshold > 0.5):\n");
             Serial.printf("    Fan State: %s (Mode: %s)\n", fanState ? "ON" : "OFF", fanManual ? "Manual" : "Auto");
             Serial.printf("    Light State: %s (Mode: %s)\n", lightState ? "ON" : "OFF", lightManual ? "Manual" : "Auto");
        } else {
             Serial.printf("  Status: Skipped (Averages Invalid - Need Temp:%s, Hum:%s, Light:%s)\n",
                           tempCount > 0 ? "OK" : "FAIL",
                           humidityCount > 0 ? "OK" : "FAIL",
                           lightCount > 0 ? "OK" : "FAIL");
             Serial.printf("  Outputs: Defaulting to OFF (unless manually overridden)\n");
             Serial.printf("    Fan State: %s (Mode: %s)\n", digitalRead(FAN_LED_PIN) == HIGH ? "ON" : "OFF", fanManual ? "Manual" : "Auto");
             Serial.printf("    Light State: %s (Mode: %s)\n", digitalRead(LIGHT_LED_PIN) == HIGH ? "ON" : "OFF", lightManual ? "Manual" : "Auto");
        }
         Serial.println("---------------------------");
    }
}

// --- MQTT Callback Function ---
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("\n*** [MQTT Callback] Message arrived! ***\n");
  Serial.printf("  Topic: %s (expected: %s)\n", topic, mqtt_control_topic);
  Serial.printf("  Topics match: %s\n", (strcmp(topic, mqtt_control_topic) == 0) ? "YES" : "NO");
  Serial.printf("  Message length: %d bytes\n", length);

  // Null-terminate the payload to treat it as a C-string
  char* payloadCopy = (char*)malloc(length + 1);
  if (!payloadCopy) {
    Serial.println("[MQTT Callback] ERROR: Out of memory for payload copy");
    return;
  }
  
  memcpy(payloadCopy, payload, length);
  payloadCopy[length] = '\0';
  String message = String(payloadCopy);
  
  Serial.printf("  Payload: %s\n", message.c_str());

  // Debug: Print the raw bytes of the payload for detailed inspection
  Serial.print("  Raw bytes: ");
  for (unsigned int i = 0; i < length; i++) {
    Serial.printf("%02X ", payload[i]);
  }
  Serial.println();

  // Check if the topic matches the control topic
  if (strcmp(topic, mqtt_control_topic) == 0) {
    StaticJsonDocument<128> doc; // Small doc for command parsing
    DeserializationError error = deserializeJson(doc, payloadCopy);
    free(payloadCopy); // Free the memory after use

    if (error) {
      Serial.printf("  ERROR: JSON parsing failed: %s\n", error.c_str());
      return;
    }

    // Debug: Dump the entire JSON document to see what it actually contains
    Serial.println("  JSON contents:");
    serializeJsonPretty(doc, Serial);
    Serial.println();

    // Extract command details
    const char* device = doc["device"]; // "fan" or "light"
    const char* mode = doc["mode"];     // "manual" or "auto"
    
    // Debug: Print individual extracted values with their types
    Serial.printf("  device=%s (exists: %s)\n", 
                 device ? device : "NULL", doc.containsKey("device") ? "YES" : "NO");
    Serial.printf("  mode=%s (exists: %s)\n", 
                 mode ? mode : "NULL", doc.containsKey("mode") ? "YES" : "NO");
    
    if (doc.containsKey("state")) {
      bool state = doc["state"];
      Serial.printf("  state=%s (type: %s)\n", 
                   state ? "true" : "false", 
                   doc["state"].is<bool>() ? "bool" : 
                   (doc["state"].is<int>() ? "int" : "other"));
    } else {
      Serial.println("  state key does not exist");
    }

    if (!device) {
        Serial.println("[MQTT Callback] ERROR: Missing 'device' in command payload.");
        return;
    }

    // Handle mode switching
    if (mode) {
        Serial.printf("[MQTT Callback] DEBUG: Mode present, processing mode='%s'\n", mode);
        if (strcmp(device, "fan") == 0) {
            if (strcmp(mode, "manual") == 0) {
                // Set manual mode and apply requested state
                fanManual = true;
                Serial.println("[MQTT Callback] DEBUG: Setting fanManual=true (Mode: manual)");
                if (doc.containsKey("state")) {
                    bool state = doc["state"];
                    digitalWrite(FAN_LED_PIN, state ? HIGH : LOW);
                    Serial.printf("[Control] Fan set to %s (Manual Mode)\n", state ? "ON" : "OFF");
                }
            } 
            else if (strcmp(mode, "auto") == 0) {
                // Switch back to automatic control
                fanManual = false;
                Serial.println("[MQTT Callback] DEBUG: Setting fanManual=false (Mode: auto)");
                Serial.println("[Control] Fan switched to Automatic Mode");
            }
            else {
                Serial.printf("[MQTT Callback] DEBUG: Unknown mode value '%s' for fan\n", mode);
            }
        } 
        else if (strcmp(device, "light") == 0) {
            if (strcmp(mode, "manual") == 0) {
                // Set manual mode and apply requested state
                lightManual = true;
                Serial.println("[MQTT Callback] DEBUG: Setting lightManual=true (Mode: manual)");
                if (doc.containsKey("state")) {
                    bool state = doc["state"];
                    digitalWrite(LIGHT_LED_PIN, state ? HIGH : LOW);
                    Serial.printf("[Control] Light set to %s (Manual Mode)\n", state ? "ON" : "OFF");
                }
            } 
            else if (strcmp(mode, "auto") == 0) {
                // Switch back to automatic control
                lightManual = false;
                Serial.println("[MQTT Callback] DEBUG: Setting lightManual=false (Mode: auto)");
                Serial.println("[Control] Light switched to Automatic Mode");
            }
            else {
                Serial.printf("[MQTT Callback] DEBUG: Unknown mode value '%s' for light\n", mode);
            }
        } 
        else {
            Serial.printf("[MQTT Callback] WARNING: Unknown device '%s' in command.\n", device);
        }
    }
    // Handle state changes in manual mode (without explicit mode in message)
    else if (doc.containsKey("state")) {
        Serial.println("[MQTT Callback] DEBUG: No mode specified but state is present");
        bool state = doc["state"];
        
        if (strcmp(device, "fan") == 0) {
            // Only change state if already in manual mode
            if (fanManual) {
                Serial.println("[MQTT Callback] DEBUG: Fan already in manual mode, just changing state");
                digitalWrite(FAN_LED_PIN, state ? HIGH : LOW);
                Serial.printf("[Control] Fan set to %s (Manual Mode)\n", state ? "ON" : "OFF");
            } else {
                // Auto-switch to manual if a state change is requested
                Serial.println("[MQTT Callback] DEBUG: Fan in auto mode, auto-switching to manual");
                fanManual = true;
                digitalWrite(FAN_LED_PIN, state ? HIGH : LOW);
                Serial.printf("[Control] Fan switched to Manual Mode and set to %s\n", state ? "ON" : "OFF");
            }
        } 
        else if (strcmp(device, "light") == 0) {
            // Only change state if already in manual mode
            if (lightManual) {
                Serial.println("[MQTT Callback] DEBUG: Light already in manual mode, just changing state");
                digitalWrite(LIGHT_LED_PIN, state ? HIGH : LOW);
                Serial.printf("[Control] Light set to %s (Manual Mode)\n", state ? "ON" : "OFF");
            } else {
                // Auto-switch to manual if a state change is requested
                Serial.println("[MQTT Callback] DEBUG: Light in auto mode, auto-switching to manual");
                lightManual = true;
                digitalWrite(LIGHT_LED_PIN, state ? HIGH : LOW);
                Serial.printf("[Control] Light switched to Manual Mode and set to %s\n", state ? "ON" : "OFF");
            }
        } 
        else {
            Serial.printf("[MQTT Callback] WARNING: Unknown device '%s' in command.\n", device);
        }
    }
    else {
        Serial.println("[MQTT Callback] DEBUG: Neither mode nor state is present in the message");
    }
  } else {
      Serial.printf("[MQTT Callback] Message on unhandled topic: %s\n", topic);
  }
}
