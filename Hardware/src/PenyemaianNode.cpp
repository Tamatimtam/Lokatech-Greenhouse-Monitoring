#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h> // Needed for esp_wifi_set_channel

// Include shared libraries
#include "SensorManager.h"
#include "NodeConfig.h" // Include common configuration (contains MAC addresses now)
#include "SensorData.h" // Include the data structure definition

// --- ESP-NOW Send Retry Configuration ---
const int MAX_SEND_RETRIES = 5;                 // Max attempts per data packet
const unsigned long SEND_CALLBACK_TIMEOUT_MS = 200; // Max wait time for ACK callback (milliseconds)
const unsigned long RETRY_DELAY_MS = 100;          // Delay between retries (milliseconds)

// Configuration flags
#define TEMP_HUMID_SIMULATION_MODE false  // Set to true to simulate DHT22 readings
#define LIGHT_SIMULATION_MODE false       // Set to true to simulate BH1750 readings

// MAC address of the destination node (Gateway Node) - DEFINED IN NodeConfig.h
// uint8_t gatewayMac[] = MAC_ADDR_GATEWAY; // This is how you'd use it if needed locally

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

// Callback function when data is sent
void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    esp_now_send_success = (status == ESP_NOW_SEND_SUCCESS); 

    if (!esp_now_send_success) { 
        Serial.printf("[PenyemaianNode] Send CB to %02X:%02X:%02X:%02X:%02X:%02X : Fail (Status: %d)\n",
                       mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5], status);
    }
    // else { // Optional: log success
    //     Serial.printf("[PenyemaianNode] Send CB to %02X:%02X:%02X:%02X:%02X:%02X : Success\n",
    //                    mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);
    // }
}

void setup() {
  Serial.begin(115200);
  delay(1000); 

  Serial.println("\n\n[PenyemaianNode] Starting Penyemaian Node...");

  sensorManager = new SensorManager(DHT_PIN, TEMP_HUMID_SIMULATION_MODE, LIGHT_SIMULATION_MODE);
  sensorManager->begin();

  WiFi.mode(WIFI_STA);
  Serial.print("[PenyemaianNode] MAC Address: ");
  Serial.println(WiFi.macAddress());

  WiFi.disconnect();
  Serial.printf("[PenyemaianNode] Setting WiFi channel to %d for ESP-NOW...\n", WIFI_CHANNEL);
  if (esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE) != ESP_OK) {
    Serial.printf("[PenyemaianNode] Error setting WiFi channel %d\n", WIFI_CHANNEL);
    return;
  }
  Serial.printf("[PenyemaianNode] WiFi channel set to %d successfully.\n", WIFI_CHANNEL);

  if (esp_now_init() != ESP_OK) {
    Serial.println("[PenyemaianNode] Error initializing ESP-NOW");
    return;
  }
  esp_now_register_send_cb(OnDataSent);

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, MAC_ADDR_GATEWAY, 6); // Target Gateway
  peerInfo.channel = WIFI_CHANNEL; 
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK){
    Serial.println("[PenyemaianNode] Failed to add Gateway peer");
    return;
  }
  Serial.println("[PenyemaianNode] Gateway node added as peer.");

  strncpy(myData.nodeName, "penyemaian", sizeof(myData.nodeName) - 1);
  myData.nodeName[sizeof(myData.nodeName) - 1] = '\0'; 

  Serial.println("[PenyemaianNode] Setup completed.");
}

void loop() {
  unsigned long currentTime = millis();

  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    lastSensorReadTime = currentTime;

    Serial.println("\n[PenyemaianNode] Reading sensors...");
    bool success = sensorManager->readSensors();

    if (success) {
      Serial.println("[PenyemaianNode] Sensors read successfully.");
      myData.temperature = sensorManager->getTemperature();
      myData.humidity = sensorManager->getHumidity();
      myData.lightIntensity = sensorManager->getLightIntensity();
      myData.temperatureValid = sensorManager->isTemperatureValid();
      myData.humidityValid = sensorManager->isHumidityValid();
      myData.lightValid = sensorManager->isLightValid();
      myData.timestamp = currentTime; 
    } else {
      Serial.println("[PenyemaianNode] WARNING: SensorManager reported read failure.");
      myData.temperatureValid = sensorManager->isTemperatureValid();
      myData.humidityValid = sensorManager->isHumidityValid();
      myData.lightValid = sensorManager->isLightValid();
      myData.temperature = sensorManager->getTemperature(); // Might be NaN or stale
      myData.humidity = sensorManager->getHumidity();     // Might be NaN or stale
      myData.lightIntensity = sensorManager->getLightIntensity(); // Might be NaN or stale
      myData.timestamp = currentTime;
    }
  }

  if (currentTime - lastSendTime >= SEND_INTERVAL) {
      lastSendTime = currentTime;
      Serial.println("[PenyemaianNode] Attempting to send data to Gateway...");

      bool sent_successfully_after_retries = false;
      for (int attempt = 0; attempt < MAX_SEND_RETRIES; ++attempt) {
          esp_now_send_success = false; 
          esp_err_t result = esp_now_send(MAC_ADDR_GATEWAY, (uint8_t *) &myData, sizeof(myData));

          if (result == ESP_OK) {
              unsigned long send_start_time = millis();
              while (!esp_now_send_success && (millis() - send_start_time < SEND_CALLBACK_TIMEOUT_MS)) {
                  yield(); 
              }

              if (esp_now_send_success) {
                  Serial.printf("[PenyemaianNode] Sent successfully to Gateway on attempt %d.\n", attempt + 1);
                  sent_successfully_after_retries = true;
                  break; 
              } else {
                  Serial.printf("[PenyemaianNode] Send attempt %d to Gateway: ACK not received within %lu ms.\n", attempt + 1, SEND_CALLBACK_TIMEOUT_MS);
              }
          } else {
              Serial.printf("[PenyemaianNode] esp_now_send error on attempt %d. ESP-NOW Error Code: %d (%s)\n", attempt + 1, result, esp_err_to_name(result));
          }

          if (!sent_successfully_after_retries && attempt < MAX_SEND_RETRIES - 1) {
              Serial.printf("[PenyemaianNode] Retrying send in %lu ms...\n", RETRY_DELAY_MS);
              delay(RETRY_DELAY_MS);
          }
      } 

      if (!sent_successfully_after_retries) {
          Serial.println("[PenyemaianNode] ERROR: Failed to send data to Gateway after all retries.");
      }
  } 
  delay(10);
}