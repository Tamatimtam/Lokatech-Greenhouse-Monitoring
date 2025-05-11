// THIS FILE NOW REPRESENTS THE "DEWASA NODE" (sending data to Gateway)
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h> 

// Include shared libraries
#include "SensorManager.h"
#include "NodeConfig.h" 
#include "SensorData.h" 

// --- ESP-NOW Send Retry Configuration ---
const int MAX_SEND_RETRIES = 5;                 
const unsigned long SEND_CALLBACK_TIMEOUT_MS = 200; 
const unsigned long RETRY_DELAY_MS = 100;          

// Configuration flags
#define TEMP_HUMID_SIMULATION_MODE false 
#define LIGHT_SIMULATION_MODE false      

// Timing variables
unsigned long lastSensorReadTime = 0;
unsigned long lastSendTime = 0;

// Managers
SensorManager* sensorManager;

// Data structure to send (local sensor data for this "Dewasa" node)
SensorData dewasaLocalData;

// Global flag to track ESP-NOW send status from callback
volatile bool esp_now_send_success = false;

// Callback function when data is sent to Gateway
void OnDataSentToGateway(const uint8_t *mac_addr, esp_now_send_status_t status) {
    esp_now_send_success = (status == ESP_NOW_SEND_SUCCESS); 

    if (!esp_now_send_success) { 
        Serial.printf("[DewasaNode] Send CB to Gateway %02X:%02X:%02X:%02X:%02X:%02X : Fail (Status: %d)\n",
                       mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5], status);
    }
    // else { // Optional: log success
    //     Serial.printf("[DewasaNode] Send CB to Gateway %02X:%02X:%02X:%02X:%02X:%02X : Success\n",
    //                    mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);
    // }
}

void setup() {
  Serial.begin(115200);
  delay(1000); 

  Serial.println("\n\n[DewasaNode] Starting Dewasa Node (Old Peremajaan Hardware)...");

  sensorManager = new SensorManager(DHT_PIN, TEMP_HUMID_SIMULATION_MODE, LIGHT_SIMULATION_MODE);
  sensorManager->begin();

  WiFi.mode(WIFI_STA);
  Serial.print("[DewasaNode] MAC Address: ");
  Serial.println(WiFi.macAddress()); // This will be MAC_ADDR_DEWASA as defined in NodeConfig.h

  WiFi.disconnect();
  Serial.printf("[DewasaNode] Setting WiFi channel to %d for ESP-NOW...\n", WIFI_CHANNEL);
  if (esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE) != ESP_OK) {
    Serial.printf("[DewasaNode] Error setting WiFi channel %d\n", WIFI_CHANNEL);
    return;
  }
  Serial.printf("[DewasaNode] WiFi channel set to %d successfully.\n", WIFI_CHANNEL);

  if (esp_now_init() != ESP_OK) {
    Serial.println("[DewasaNode] Error initializing ESP-NOW");
    return;
  }
  esp_now_register_send_cb(OnDataSentToGateway);

  // Add Gateway as peer
  esp_now_peer_info_t gatewayPeerInfo = {};
  memcpy(gatewayPeerInfo.peer_addr, MAC_ADDR_GATEWAY, 6); 
  gatewayPeerInfo.channel = WIFI_CHANNEL; 
  gatewayPeerInfo.encrypt = false;

  if (esp_now_add_peer(&gatewayPeerInfo) != ESP_OK){
    Serial.println("[DewasaNode] Failed to add Gateway peer");
    return;
  }
  Serial.println("[DewasaNode] Gateway node added as peer.");

  // Set node name in the data structure
  strncpy(dewasaLocalData.nodeName, "dewasa", sizeof(dewasaLocalData.nodeName) - 1);
  dewasaLocalData.nodeName[sizeof(dewasaLocalData.nodeName) - 1] = '\0'; 

  Serial.println("[DewasaNode] Setup completed.");
}

void loop() {
  unsigned long currentTime = millis();

  // Read local sensors periodically
  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    lastSensorReadTime = currentTime;

    Serial.println("\n[DewasaNode] Reading local sensors...");
    bool success = sensorManager->readSensors();

    if (success) {
      Serial.println("[DewasaNode] Sensors read successfully.");
      dewasaLocalData.temperature = sensorManager->getTemperature();
      dewasaLocalData.humidity = sensorManager->getHumidity();
      dewasaLocalData.lightIntensity = sensorManager->getLightIntensity();
      dewasaLocalData.temperatureValid = sensorManager->isTemperatureValid();
      dewasaLocalData.humidityValid = sensorManager->isHumidityValid();
      dewasaLocalData.lightValid = sensorManager->isLightValid();
      dewasaLocalData.timestamp = currentTime; 
    } else {
      Serial.println("[DewasaNode] WARNING: SensorManager reported read failure.");
      dewasaLocalData.temperatureValid = sensorManager->isTemperatureValid();
      dewasaLocalData.humidityValid = sensorManager->isHumidityValid();
      dewasaLocalData.lightValid = sensorManager->isLightValid();
      dewasaLocalData.temperature = sensorManager->getTemperature();
      dewasaLocalData.humidity = sensorManager->getHumidity();
      dewasaLocalData.lightIntensity = sensorManager->getLightIntensity();
      dewasaLocalData.timestamp = currentTime;
    }
  }

  // Send local sensor data to Gateway periodically
  if (currentTime - lastSendTime >= SEND_INTERVAL) {
      lastSendTime = currentTime;
      Serial.println("[DewasaNode] Attempting to send local data to Gateway...");

      bool sent_successfully_after_retries = false;
      for (int attempt = 0; attempt < MAX_SEND_RETRIES; ++attempt) {
          esp_now_send_success = false; 
          esp_err_t result = esp_now_send(MAC_ADDR_GATEWAY, (uint8_t *) &dewasaLocalData, sizeof(dewasaLocalData));

          if (result == ESP_OK) {
              unsigned long send_start_time = millis();
              while (!esp_now_send_success && (millis() - send_start_time < SEND_CALLBACK_TIMEOUT_MS)) {
                  yield(); 
              }

              if (esp_now_send_success) {
                  Serial.printf("[DewasaNode] Sent successfully to Gateway on attempt %d.\n", attempt + 1);
                  sent_successfully_after_retries = true;
                  break; 
              } else {
                  Serial.printf("[DewasaNode] Send attempt %d to Gateway: ACK not received within %lu ms.\n", attempt + 1, SEND_CALLBACK_TIMEOUT_MS);
              }
          } else {
              Serial.printf("[DewasaNode] esp_now_send error on attempt %d. ESP-NOW Error Code: %d (%s)\n", attempt + 1, result, esp_err_to_name(result));
          }

          if (!sent_successfully_after_retries && attempt < MAX_SEND_RETRIES - 1) {
              Serial.printf("[DewasaNode] Retrying send in %lu ms...\n", RETRY_DELAY_MS);
              delay(RETRY_DELAY_MS);
          }
      } 

      if (!sent_successfully_after_retries) {
          Serial.println("[DewasaNode] ERROR: Failed to send data to Gateway after all retries.");
      }
  } 
  delay(10);
}
