#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h> // Needed for esp_wifi_set_channel

// Include shared libraries
#include "SensorManager.h"
#include "NodeConfig.h" // Include common configuration (contains MAC addresses now)
#include "SensorData.h" // Include the data structure definition

// --- ESP-NOW Send Retry Configuration ---
const int MAX_SEND_RETRIES = 3;                 // Max attempts per data packet
const unsigned long SEND_CALLBACK_TIMEOUT_MS = 200; // Max wait time for ACK callback (milliseconds)
const unsigned long RETRY_DELAY_MS = 75;          // Delay between retries (milliseconds)

// Configuration flags
#define TEMP_HUMID_SIMULATION_MODE false  // Set to true to simulate DHT22 readings
#define LIGHT_SIMULATION_MODE false       // Set to true to simulate BH1750 readings

// MAC address of the destination node (Peremajaan Node) - DEFINED IN NodeConfig.h
// uint8_t peremajaanMac[] = {0xA8, 0x42, 0xE3, 0x5A, 0x78, 0xD4}; // REMOVED - Use MAC_ADDR_PEREMAJAAN from NodeConfig.h

// Timing variables
unsigned long lastSensorReadTime = 0;
unsigned long lastSendTime = 0;
// Interval constants are now defined in NodeConfig.h

// Managers
SensorManager* sensorManager;

// Data structure to send
SensorData myData;

// Global flag to track ESP-NOW send status from callback
volatile bool esp_now_send_success = false;

// Callback function when data is sent - MODIFIED
void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    esp_now_send_success = (status == ESP_NOW_SEND_SUCCESS); // Set flag based on ACK status

    // Optional: Concise logging
    if (!esp_now_send_success) { // Log only failures from callback
        Serial.printf("[PenyemaianNode] Send CB to %02X:%02X:%02X:%02X:%02X:%02X : Fail (No ACK)\n",
                       mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);
    }
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

  // Set the specific WiFi channel for ESP-NOW using the value from NodeConfig.h
  Serial.printf("[PenyemaianNode] Setting WiFi channel to %d for ESP-NOW...\n", WIFI_CHANNEL);
  // Disconnect WiFi as it's not needed for ESP-NOW sending only
  WiFi.disconnect();
  if (esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE) != ESP_OK) {
    Serial.printf("[PenyemaianNode] Error setting WiFi channel %d\n", WIFI_CHANNEL);
    return;
  } else {
    Serial.printf("[PenyemaianNode] WiFi channel set to %d successfully.\n", WIFI_CHANNEL);
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
  memcpy(peerInfo.peer_addr, MAC_ADDR_PEREMAJAAN, 6); // Use central definition
  peerInfo.channel = WIFI_CHANNEL; // Use channel from NodeConfig.h
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

  // Read sensors periodically using interval from NodeConfig.h
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

  // Send data periodically WITH RETRIES
  if (currentTime - lastSendTime >= SEND_INTERVAL) {
      lastSendTime = currentTime;

      // Note: Data (myData) should have been updated by the sensor read block earlier

      Serial.println("[PenyemaianNode] Attempting to send data to Peremajaan...");

      bool sent_successfully_after_retries = false;
      for (int attempt = 0; attempt < MAX_SEND_RETRIES; ++attempt) {
          esp_now_send_success = false; // Reset flag before this attempt
          // Use central definition for MAC address
          esp_err_t result = esp_now_send(MAC_ADDR_PEREMAJAAN, (uint8_t *) &myData, sizeof(myData));

          if (result == ESP_OK) {
              // Send queued, wait for ACK callback or timeout
              unsigned long send_start_time = millis();
              while (!esp_now_send_success && (millis() - send_start_time < SEND_CALLBACK_TIMEOUT_MS)) {
                  yield(); // Give background tasks time
                  // delay(5); // Alternative
              }

              if (esp_now_send_success) {
                  Serial.printf("[PenyemaianNode] Sent successfully to Peremajaan on attempt %d.\n", attempt + 1);
                  sent_successfully_after_retries = true;
                  break; // Exit retry loop
              } else {
                  Serial.printf("[PenyemaianNode] Send attempt %d ACK not received within %lu ms.\n", attempt + 1, SEND_CALLBACK_TIMEOUT_MS);
              }
          } else {
              Serial.printf("[PenyemaianNode] esp_now_send error on attempt %d. ESP-NOW Error Code: %d\n", attempt + 1, result);
          }

          // Delay before next retry if needed
          if (!sent_successfully_after_retries && attempt < MAX_SEND_RETRIES - 1) {
              Serial.printf("[PenyemaianNode] Retrying send in %lu ms...\n", RETRY_DELAY_MS);
              delay(RETRY_DELAY_MS);
          }
      } // End of retry loop

      if (!sent_successfully_after_retries) {
          Serial.println("[PenyemaianNode] ERROR: Failed to send data to Peremajaan after all retries.");
      }
  } // End of SEND_INTERVAL block


  // Small delay to prevent watchdog issues and excessive looping
  delay(10);
}
