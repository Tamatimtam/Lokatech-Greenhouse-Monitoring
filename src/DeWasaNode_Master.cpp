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
const char* mqtt_topic = "lokatech/greenhouse/sensors"; // Topic to publish data

// MAC addresses of peer nodes (update with your actual MAC addresses)
uint8_t penyemaianMac[] = {0x30, 0xAE, 0xA4, 0x96, 0xA3, 0x48}; // Example MAC
uint8_t peremajaanMac[] = {0x4C, 0x11, 0xAE, 0x64, 0xD0, 0x74}; // MAC address of Peremajaan node

// Timing variables
unsigned long lastSensorReadTime = 0;
unsigned long lastMqttPublishTime = 0;
const unsigned long SENSOR_READ_INTERVAL = 1000; // Read sensors every 5 seconds
const unsigned long MQTT_PUBLISH_INTERVAL = 1000; // Publish to MQTT every 10 seconds

// Storage for previous sensor values (for trend calculation)
float prevTemperature = 0;
float prevHumidity = 0;
float prevLightIntensity = 0;

// Managers
SensorManager* sensorManager;
ESPNowManager* espNowManager;
MQTTManager* mqttManager;

// Function prototypes
// void onDataReceived(const SensorData& data); // Callback no longer needed here

void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  delay(1000); // Give serial monitor time to start
  
  Serial.println("\n\n[DeWasaNode_Master] Starting Dewasa Node (Master)...");
  
  // Initialize managers
  sensorManager = new SensorManager(DHT_PIN, TEMP_HUMID_SIMULATION_MODE, LIGHT_SIMULATION_MODE);
  espNowManager = new ESPNowManager();
  mqttManager = new MQTTManager(ssid, password, mqtt_server, mqtt_port, mqtt_topic);
  
  // Initialize sensor manager
  sensorManager->begin();

  // Initialize MQTT first (this will connect to WiFi)
  if (!mqttManager->begin()) {
    Serial.println("[DeWasaNode_Master] ERROR: Failed to initialize MQTT (and WiFi)");
    // Consider halting or retrying if WiFi/MQTT is critical
  } else {
      // Connect to MQTT broker only after WiFi is up via mqttManager->begin()
      if (mqttManager->connect()) {
        Serial.println("[DeWasaNode_Master] Connected to MQTT broker");
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

  // Ensure ESP-NOW uses channel 6 AFTER WiFi connection is established
  // Check if WiFi is connected before setting channel
  if (WiFi.status() == WL_CONNECTED) {
      Serial.println("[DeWasaNode_Master] Setting WiFi channel to 6 for ESP-NOW compatibility...");
      if (esp_wifi_set_channel(6, WIFI_SECOND_CHAN_NONE) != ESP_OK) {
          Serial.println("[DeWasaNode_Master] ERROR: Failed to set WiFi channel post-connection!");
      } else {
          Serial.println("[DeWasaNode_Master] WiFi channel set to 6 successfully.");
      }
  } else {
      Serial.println("[DeWasaNode_Master] WARNING: WiFi not connected, cannot guarantee ESP-NOW channel setting.");
      // ESP-NOW might still work if the default channel happens to be 6, but it's less reliable.
  }
  
  Serial.println("[DeWasaNode_Master] Setup completed");
}

void loop() {
  unsigned long currentTime = millis();
  
  // Read sensors at regular intervals
  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    lastSensorReadTime = currentTime;
    
    Serial.println("\n[DeWasaNode_Master] Reading sensors...");
    bool success = sensorManager->readSensors();
    
    if (success) {
      Serial.println("[DeWasaNode_Master] All sensors read successfully");
    } else {
      Serial.println("[DeWasaNode_Master] WARNING: Some sensors failed to read");
    }
  }
  
  // Publish to MQTT at regular intervals
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
      espNowManager->isPeremajaanDataValid()
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
  
  // Small delay to prevent watchdog issues
  delay(10);
}

// Callback function no longer needed here, as ESPNowManager handles reception internally
// void onDataReceived(const SensorData& data) { ... }
