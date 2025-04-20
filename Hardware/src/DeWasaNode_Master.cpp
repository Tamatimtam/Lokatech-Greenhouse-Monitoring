#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h> // Needed for esp_wifi_set_channel
#include <Wire.h>
#include <ArduinoJson.h>

// Include our custom managers
#include "SensorManager.h"
#include "ESPNowManager.h"
#include "MQTTManager.h"
#include "FuzzyController.h" // Include the new Fuzzy Controller
#include "NodeConfig.h" // Include common configuration

// Pin Definitions (Moved to NodeConfig.h)
// #define DHT_PIN 4 // Removed

// Configuration flags
#define TEMP_HUMID_SIMULATION_MODE false  // Set to true to simulate DHT22 readings
#define LIGHT_SIMULATION_MODE false       // Set to true to simulate BH1750 readings

// WiFi and MQTT configuration
const char* ssid = "Direktorat Kemendikbud";      // Replace with your WiFi SSID
const char* password = "NadiemGantengSih";  // Replace with your WiFi password
const char* mqtt_server = "broker.emqx.io"; // Replace if using a different broker
const int mqtt_port = 1883;                // Standard MQTT port
const char* mqtt_publish_topic = "lokatech/greenhouse/sensors"; // Topic to publish data TO
const char* mqtt_control_topic = "lokatech/greenhouse/controls/set"; // Topic to receive commands FROM

// MAC addresses of peer nodes (update with your actual MAC addresses)
uint8_t penyemaianMac[] = {0x30, 0xAE, 0xA4, 0x96, 0xA3, 0x48}; // Example MAC - Keep for reference
uint8_t peremajaanMac[] = {0x4C, 0x11, 0xAE, 0x64, 0xD0, 0x74}; // MAC address of Peremajaan node

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
ESPNowManager* espNowManager;
MQTTManager* mqttManager;
FuzzyController* fuzzyController; // Pointer for Fuzzy Controller

// --- Actuator Control Mode ---
bool fanManual = false;    // Tracks if fan is in manual override mode
bool lightManual = false;  // Tracks if light is in manual override mode

// Function prototypes
void mqttCallback(char* topic, byte* payload, unsigned int length); // MQTT message callback
void runFuzzyControl(); // Function to handle fuzzy logic execution
void calculateAverages(float &avgTemp, float &avgHumidity, float &avgLight, bool &averagesValid, int &tempCount, int &humidityCount, int &lightCount); // Updated prototype

void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  delay(1000); // Give serial monitor time to start
  
  Serial.println("\n\n[DeWasaNode_Master] Starting Dewasa Node (Master)...");
  
  // Initialize managers
  sensorManager = new SensorManager(DHT_PIN, TEMP_HUMID_SIMULATION_MODE, LIGHT_SIMULATION_MODE);
  espNowManager = new ESPNowManager();
  // Pass the PUBLISH topic to the manager constructor
  mqttManager = new MQTTManager(ssid, password, mqtt_server, mqtt_port, mqtt_publish_topic); 
  fuzzyController = new FuzzyController(); // Initialize Fuzzy Controller

  // Initialize LED pins
  pinMode(FAN_LED_PIN, OUTPUT);
  pinMode(LIGHT_LED_PIN, OUTPUT);
  digitalWrite(FAN_LED_PIN, LOW); // Start with LEDs OFF
  digitalWrite(LIGHT_LED_PIN, LOW);

  // Initialize sensor manager
  sensorManager->begin();

  // Set WiFi Station mode (needed before setting channel)
  WiFi.mode(WIFI_STA); // Ensure STA mode is set

  // Set WiFi channel BEFORE connecting to WiFi/MQTT and initializing ESP-NOW
  Serial.printf("[DeWasaNode_Master] Setting WiFi channel to %d...\n", WIFI_CHANNEL);
  if (esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE) != ESP_OK) {
      Serial.printf("[DeWasaNode_Master] ERROR: Failed to set WiFi channel %d!\n", WIFI_CHANNEL);
  } else {
      Serial.printf("[DeWasaNode_Master] WiFi channel set to %d successfully.\n", WIFI_CHANNEL);
  }
  // IMPORTANT: The Master node's WiFi connection (mqttManager->begin())
  // will now *only* succeed if the target AP (SSID: "Direktorat Kemendikbud")
  // is also operating on the channel defined by WIFI_CHANNEL.

  // Initialize MQTT (this will now connect to WiFi on the pre-set channel)
  if (!mqttManager->begin()) { // <-- MQTT Init happens AFTER setting channel
    Serial.println("[DeWasaNode_Master] ERROR: Failed to initialize MQTT (and WiFi)");
    // Consider halting or retrying if WiFi/MQTT is critical
  } else {
      // Connect to MQTT broker only after WiFi is up via mqttManager->begin()
      if (mqttManager->connect()) {
        Serial.println("[DeWasaNode_Master] Connected to MQTT broker");
        // Set the callback AFTER successful connection
        mqttManager->getClient().setCallback(mqttCallback); // Use the PubSubClient instance via getter if available, or modify MQTTManager
        // Subscribe to the control topic
        if (mqttManager->getClient().subscribe(mqtt_control_topic)) {
             Serial.printf("[DeWasaNode_Master] Subscribed to control topic: %s\n", mqtt_control_topic);
        } else {
             Serial.println("[DeWasaNode_Master] ERROR: Failed to subscribe to control topic!");
        }
      } else {
         Serial.println("[DeWasaNode_Master] WARNING: Failed to connect to MQTT broker initially.");
      }
  }

  // Now initialize ESP-NOW, passing the MAC of the node sending CombinedData (Peremajaan)
  // This requires WiFi to be initialized (which mqttManager->begin() does)
  if (!espNowManager->begin(peremajaanMac)) {
    Serial.println("[DeWasaNode_Master] ERROR: Failed to initialize ESP-NOW Manager");
    // Handle error, maybe halt or retry
  } else {
    Serial.println("[DeWasaNode_Master] ESP-NOW Manager initialized.");
  }

  // Add Peremajaan as a peer (optional but good practice for receiving)
  if (espNowManager->addPeer(peremajaanMac)) {
    Serial.println("[DeWasaNode_Master] Peremajaan node added as ESP-NOW peer.");
  } else {
     Serial.println("[DeWasaNode_Master] WARNING: Failed to add Peremajaan as ESP-NOW peer.");
  }

  // Channel is now set *before* WiFi/MQTT connection. This block is removed.

  // Initialize the Fuzzy Controller logic (defines sets, rules etc.)
  fuzzyController->begin();
  
  Serial.println("[DeWasaNode_Master] Setup completed");
}

// Timer for fuzzy debug printing
unsigned long lastFuzzyDebugPrintTime = 0;
const unsigned long FUZZY_DEBUG_PRINT_INTERVAL = 5000; // Print fuzzy debug info every 5 seconds

void loop() {
  unsigned long currentTime = millis();
  
  // Read sensors at regular intervals using interval from NodeConfig.h
  if (currentTime - lastSensorReadTime >= 2000UL) {
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
    
    // Store current values for next trend calculation
    prevTemperature = sensorManager->getTemperature();
    prevHumidity = sensorManager->getHumidity();
    prevLightIntensity = sensorManager->getLightIntensity();
    
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
      espNowManager->getPenyemaianData(),
      espNowManager->isPenyemaianDataValid(),
      espNowManager->getPeremajaanData(),
      espNowManager->isPeremajaanDataValid(),
      // Pass current actuator state and mode
      digitalRead(FAN_LED_PIN) == HIGH, // Current fan state (true if HIGH/ON)
      fanManual ? "manual" : "auto",    // Fan mode
      digitalRead(LIGHT_LED_PIN) == HIGH, // Current light state (true if HIGH/ON)
      lightManual ? "manual" : "auto"   // Light mode
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

  // Run Fuzzy Logic Control periodically (could be tied to MQTT interval or separate)
  // Let's run it right after potentially publishing MQTT data
  runFuzzyControl();
  
  // Small delay removed as per plan
  // delay(10); 
}

// Updated function to also return counts for debugging
void calculateAverages(float &avgTemp, float &avgHumidity, float &avgLight, bool &averagesValid, int &tempCount, int &humidityCount, int &lightCount) {
    float tempSum = 0;
    tempCount = 0; // Reset counts
    float humiditySum = 0;
    humidityCount = 0;
    float lightSum = 0;
    lightCount = 0;

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

    // Peremajaan data (check overall validity first)
    if (espNowManager->isPeremajaanDataValid()) {
        const SensorData& peremajaan = espNowManager->getPeremajaanData();
        if (peremajaan.temperatureValid) {
            tempSum += peremajaan.temperature;
            tempCount++;
        }
        if (peremajaan.humidityValid) {
            humiditySum += peremajaan.humidity;
            humidityCount++;
        }
        if (peremajaan.lightValid) {
            lightSum += peremajaan.lightIntensity;
            lightCount++;
        }
    }

    // Penyemaian data (check overall validity first)
    if (espNowManager->isPenyemaianDataValid()) {
         const SensorData& penyemaian = espNowManager->getPenyemaianData();
        if (penyemaian.temperatureValid) {
            tempSum += penyemaian.temperature;
            tempCount++;
        }
        if (penyemaian.humidityValid) {
            humiditySum += penyemaian.humidity;
            humidityCount++;
        }
        if (penyemaian.lightValid) {
            lightSum += penyemaian.lightIntensity;
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

    // Calculate averages and get counts
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

    if (runLogic) {
        fanState = fuzzyController->getFanOutput();
        // Only use fuzzy output if not in manual mode
        if (!fanManual) {
             fanState = fuzzyController->getFanOutput();
        } else {
             // Keep the state set by the manual command (read the pin)
             fanState = digitalRead(FAN_LED_PIN) == HIGH;
        }
        
        if (!lightManual) {
             lightState = fuzzyController->getLightOutput();
        } else {
             // Keep the state set by the manual command (read the pin)
             lightState = digitalRead(LIGHT_LED_PIN) == HIGH;
        }
    } 
    // If fuzzy logic didn't run, fanState/lightState remain false (default OFF)
    // unless overridden by manual control earlier via MQTT callback.
    
    // Set the final pin states (respecting manual overrides)
    // Note: The MQTT callback already set the pin state for manual commands.
    // This section now primarily handles setting the state when in AUTO mode.
    if (!fanManual) {
        digitalWrite(FAN_LED_PIN, fanState ? HIGH : LOW);
    }
    if (!lightManual) {
        digitalWrite(LIGHT_LED_PIN, lightState ? HIGH : LOW);
    }


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
             Serial.printf("    Fan State: %s\n", fanState ? "ON" : "OFF");
             Serial.printf("    Light State: %s\n", lightState ? "ON" : "OFF");
        } else {
             Serial.printf("  Status: Skipped (Averages Invalid - Need Temp:%s, Hum:%s, Light:%s)\n",
                           tempCount > 0 ? "OK" : "FAIL",
                           humidityCount > 0 ? "OK" : "FAIL", 
                           lightCount > 0 ? "OK" : "FAIL");
             Serial.printf("  Outputs: Defaulting to OFF\n");
             Serial.printf("    Fan State: OFF\n");
             Serial.printf("    Light State: OFF\n");
        }
         Serial.println("---------------------------");
    }
}

// --- MQTT Callback Function ---
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT Callback] Message arrived on topic: %s\n", topic);
  
  // Null-terminate the payload to treat it as a C-string
  payload[length] = '\0';
  String message = (char*)payload;
  Serial.printf("[MQTT Callback] Payload: %s\n", message.c_str());

  // Check if the topic matches the control topic
  if (strcmp(topic, mqtt_control_topic) == 0) {
    StaticJsonDocument<128> doc; // Small doc for command parsing
    DeserializationError error = deserializeJson(doc, message);

    if (error) {
      Serial.print("[MQTT Callback] ERROR: deserializeJson() failed: ");
      Serial.println(error.c_str());
      return;
    }

    // Extract command details
    const char* device = doc["device"]; // "fan" or "light"
    bool state = doc["state"];          // true or false
    const char* mode = doc["mode"];     // Should be "manual" from API

    if (!device || !mode) {
        Serial.println("[MQTT Callback] ERROR: Missing 'device' or 'mode' in command payload.");
        return;
    }

    // Process only manual commands for now
    if (strcmp(mode, "manual") == 0) {
        Serial.printf("[MQTT Callback] Manual command received for %s: state=%s\n", device, state ? "ON" : "OFF");
        if (strcmp(device, "fan") == 0) {
            fanManual = true; // Set manual mode
            digitalWrite(FAN_LED_PIN, state ? HIGH : LOW); // Directly set state
            Serial.printf("[Control] Fan set to %s (Manual Mode)\n", state ? "ON" : "OFF");
        } else if (strcmp(device, "light") == 0) {
            lightManual = true; // Set manual mode
            digitalWrite(LIGHT_LED_PIN, state ? HIGH : LOW); // Directly set state
            Serial.printf("[Control] Light set to %s (Manual Mode)\n", state ? "ON" : "OFF");
        } else {
            Serial.printf("[MQTT Callback] WARNING: Unknown device '%s' in command.\n", device);
        }
        // TODO: Add logic to switch back to 'auto' mode? (e.g., via timeout or specific command)
    } else {
         Serial.printf("[MQTT Callback] Received non-manual mode command for %s: mode=%s. Ignoring for now.\n", device, mode);
         // Could add logic here to switch back to auto if needed:
         // if (strcmp(mode, "auto") == 0) { ... fanManual = false; ... }
    }
  } else {
      Serial.printf("[MQTT Callback] Message on unhandled topic: %s\n", topic);
  }
}

// Callback function no longer needed here, as ESPNowManager handles reception internally
