#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <Wire.h>
#include <ArduinoJson.h>

// Include our custom managers
#include "SensorManager.h"
#include "ESPNowManager.h"
#include "MQTTManager.h"

// Pin Definitions
#define DHT_PIN 4  // DHT22 data pin connected to GPIO4

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
void onDataReceived(const SensorData& data);

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
  
  // Initialize ESP-NOW
  if (!espNowManager->begin()) {
    Serial.println("[DeWasaNode_Master] ERROR: Failed to initialize ESP-NOW");
  }
  
  // Add peer nodes to ESP-NOW
  if (espNowManager->addPeer(penyemaianMac)) {
    Serial.println("[DeWasaNode_Master] Penyemaian node added as ESP-NOW peer");
  }
  
  if (espNowManager->addPeer(peremajaanMac)) {
    Serial.println("[DeWasaNode_Master] Peremajaan node added as ESP-NOW peer");
  }
  
  // Register callback for ESP-NOW data reception
  espNowManager->registerDataCallback(onDataReceived);
  
  // Initialize MQTT (this will connect to WiFi)
  if (!mqttManager->begin()) {
    Serial.println("[DeWasaNode_Master] ERROR: Failed to initialize MQTT");
  }
  
  // Connect to MQTT broker
  if (mqttManager->connect()) {
    Serial.println("[DeWasaNode_Master] Connected to MQTT broker");
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

// Callback function for ESP-NOW data reception
void onDataReceived(const SensorData& data) {
  Serial.println("[DeWasaNode_Master] Data received via ESP-NOW:");
  Serial.print("  Node: ");
  Serial.println(data.nodeName);
  
  if (data.temperatureValid) {
    Serial.print("  Temperature: ");
    Serial.println(data.temperature);
  }
  
  if (data.humidityValid) {
    Serial.print("  Humidity: ");
    Serial.println(data.humidity);
  }
  
  if (data.lightValid) {
    Serial.print("  Light: ");
    Serial.println(data.lightIntensity);
  }
}