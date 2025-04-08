#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h> // Needed for esp_wifi_set_channel

// Include shared libraries
#include "SensorManager.h"
#include "NodeConfig.h" // Include common configuration
#include "SensorData.h" // Include the data structure definition

// Configuration flags
#define TEMP_HUMID_SIMULATION_MODE false  // Set to true to simulate DHT22 readings
#define LIGHT_SIMULATION_MODE false       // Set to true to simulate BH1750 readings

// MAC address of the destination node (Peremajaan Node) - UPDATE THIS
uint8_t peremajaanMac[] = {0x4C, 0x11, 0xAE, 0x64, 0xD0, 0x74}; // Replace with ACTUAL Peremajaan MAC address

// Timing variables
unsigned long lastSensorReadTime = 0;
unsigned long lastSendTime = 0;
const unsigned long SENSOR_READ_INTERVAL = 1000; // Read sensors every 5 seconds
const unsigned long SEND_INTERVAL = 1000;      // Send data every 5 seconds

// Managers
SensorManager* sensorManager;

// Data structure to send
SensorData myData;

// Callback function when data is sent
void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  Serial.print("[PenyemaianNode] Last Packet Send Status: ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "Delivery Success" : "Delivery Fail");
}

void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  delay(1000); // Give serial monitor time to start

  Serial.println("\n\n[PenyemaianNode] Starting Penyemaian Node...");

  // Initialize sensor manager
  sensorManager = new SensorManager(DHT_PIN, TEMP_HUMID_SIMULATION_MODE, LIGHT_SIMULATION_MODE);
  sensorManager->begin();

  // Set device as a Wi-Fi Station
  WiFi.mode(WIFI_STA);
  Serial.print("[PenyemaianNode] MAC Address: ");
  Serial.println(WiFi.macAddress());

  // Set the specific WiFi channel for ESP-NOW
  Serial.println("[PenyemaianNode] Setting WiFi channel to 6 for ESP-NOW...");
  // Disconnect WiFi as it's not needed for ESP-NOW sending only
  WiFi.disconnect();
  if (esp_wifi_set_channel(6, WIFI_SECOND_CHAN_NONE) != ESP_OK) {
    Serial.println("[PenyemaianNode] Error setting WiFi channel");
    return;
  } else {
    Serial.println("[PenyemaianNode] WiFi channel set to 6 successfully.");
  }


  // Initialize ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("[PenyemaianNode] Error initializing ESP-NOW");
    return;
  }

  // Register send callback
  esp_now_register_send_cb(OnDataSent);

  // Register peer (Peremajaan Node)
  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, peremajaanMac, 6);
  peerInfo.channel = 6; // Must match the channel set above
  peerInfo.encrypt = false;

  // Add peer
  if (esp_now_add_peer(&peerInfo) != ESP_OK){
    Serial.println("[PenyemaianNode] Failed to add peer");
    return;
  }
  Serial.println("[PenyemaianNode] Peremajaan node added as peer.");

  // Set node name in the data structure
  strncpy(myData.nodeName, "penyemaian", sizeof(myData.nodeName) - 1);
  myData.nodeName[sizeof(myData.nodeName) - 1] = '\0'; // Ensure null termination

  Serial.println("[PenyemaianNode] Setup completed.");
}

void loop() {
  unsigned long currentTime = millis();

  // Read sensors periodically
  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    lastSensorReadTime = currentTime;

    Serial.println("\n[PenyemaianNode] Reading sensors...");
    bool success = sensorManager->readSensors();

    if (success) {
      Serial.println("[PenyemaianNode] Sensors read successfully.");
      // Update data structure
      myData.temperature = sensorManager->getTemperature();
      myData.humidity = sensorManager->getHumidity();
      myData.lightIntensity = sensorManager->getLightIntensity();
      myData.temperatureValid = sensorManager->isTemperatureValid();
      myData.humidityValid = sensorManager->isHumidityValid();
      myData.lightValid = sensorManager->isLightValid();
      myData.timestamp = currentTime; // Use current millis as timestamp
    } else {
      Serial.println("[PenyemaianNode] WARNING: SensorManager reported read failure. Updating validity flags individually.");
      // Update validity flags based on SensorManager's state even if overall read failed
      myData.temperatureValid = sensorManager->isTemperatureValid();
      myData.humidityValid = sensorManager->isHumidityValid();
      myData.lightValid = sensorManager->isLightValid();
      // Still update values, they might be stale or default from SensorManager
      myData.temperature = sensorManager->getTemperature();
      myData.humidity = sensorManager->getHumidity();
      myData.lightIntensity = sensorManager->getLightIntensity();
      myData.timestamp = currentTime;
    }
  }

  // Send data periodically
  if (currentTime - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = currentTime;

    Serial.println("[PenyemaianNode] Sending data to Peremajaan node...");
    esp_err_t result = esp_now_send(peremajaanMac, (uint8_t *) &myData, sizeof(myData));

    if (result == ESP_OK) {
      Serial.println("[PenyemaianNode] Sent data successfully.");
    } else {
      Serial.print("[PenyemaianNode] Error sending data. ESP-NOW Error Code: ");
      Serial.println(result);
    }
  }

  // Small delay to prevent watchdog issues and excessive looping
  delay(10);
}
