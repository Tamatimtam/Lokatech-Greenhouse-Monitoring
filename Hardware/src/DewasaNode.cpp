// THIS FILE NOW REPRESENTS THE "DEWASA NODE" (sending data to Gateway)
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h> 

// Include shared libraries
#include "SensorManager.h"
#include "NodeConfig.h" 
#include "SensorData.h" 

const int MAX_SEND_RETRIES = 5;                 
const unsigned long SEND_CALLBACK_TIMEOUT_MS = 200; 
const unsigned long RETRY_DELAY_MS = 100;          

#define TEMP_HUMID_SIMULATION_MODE false 
#define LIGHT_SIMULATION_MODE false      

unsigned long lastSensorReadTime = 0;
unsigned long lastSendTime = 0;

SensorManager* sensorManager;

// Data structure to send (local sensor data for this "Dewasa" node)
SensorData dewasaLocalData;

// Global flag to track ESP-NOW send status from callback
volatile bool esp_now_send_success = false;

// Callback function when data is sent to Gateway
void OnDataSentToGateway(const uint8_t *mac_addr, esp_now_send_status_t status) {
    esp_now_send_success = (status == ESP_NOW_SEND_SUCCESS); 
    #ifdef DEBUG_DEWASA_NODE // Use specific debug flag if defined
    if (!esp_now_send_success) { 
        Serial.printf("[DewasaNode] Send CB to Gateway %02X:%02X:%02X:%02X:%02X:%02X : Fail (Status: %d)\n",
                       mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5], status);
    } else { 
        Serial.printf("[DewasaNode] Send CB to Gateway %02X:%02X:%02X:%02X:%02X:%02X : Success\n",
                       mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);
    }
    #else // Default minimal logging
     if (!esp_now_send_success) { 
        Serial.printf("DN Send Fail: %d\n", status);
    }
    #endif
}

// ESP-NOW Receive Callback for control commands from Gateway
void OnControlDataRecvFromGateway(const uint8_t *mac_addr, const uint8_t *incomingData, int len) {
    if (memcmp(mac_addr, MAC_ADDR_GATEWAY, 6) != 0) {
        Serial.println("[DewasaNode] Control command received from unrecognized MAC. Ignoring.");
        return;
    }
    if (len != sizeof(ActuatorCommand)) {
        Serial.printf("[DewasaNode] Control command received with incorrect size. Expected %d, got %d. Ignoring.\n", sizeof(ActuatorCommand), len);
        return;
    }

    ActuatorCommand cmd;
    memcpy(&cmd, incomingData, sizeof(ActuatorCommand));

    Serial.printf("[DewasaNode] Received control command for device '%s' to state %s\n", cmd.device, cmd.state ? "ON" : "OFF");

    if (strcmp(cmd.device, "fan") == 0) {
        digitalWrite(DEWASA_FAN_PIN, cmd.state ? HIGH : LOW);
    } else if (strcmp(cmd.device, "light") == 0) {
        digitalWrite(DEWASA_LIGHT_PIN, cmd.state ? HIGH : LOW);
    }
}

void setup() {
  Serial.begin(115200);
  delay(1000); 
  Serial.println("\n\n[DewasaNode] Starting Dewasa Node (Old Peremajaan Hardware)...");

  sensorManager = new SensorManager(DHT_PIN, TEMP_HUMID_SIMULATION_MODE, LIGHT_SIMULATION_MODE);
  sensorManager->begin();

  // Initialize actuator pins
  pinMode(DEWASA_FAN_PIN, OUTPUT);
  pinMode(DEWASA_LIGHT_PIN, OUTPUT);
  digitalWrite(DEWASA_FAN_PIN, LOW); // Default OFF
  digitalWrite(DEWASA_LIGHT_PIN, LOW); // Default OFF

  WiFi.mode(WIFI_STA);
  Serial.print("[DewasaNode] MAC Address: ");
  Serial.println(WiFi.macAddress()); 

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
  // Register send callback for data TO Gateway
  esp_now_register_send_cb(OnDataSentToGateway);
  esp_now_register_recv_cb(OnControlDataRecvFromGateway); // Register receive callback for commands FROM Gateway

  // Add Gateway as peer
  esp_now_peer_info_t gatewayPeerInfo = {};
  memcpy(gatewayPeerInfo.peer_addr, MAC_ADDR_GATEWAY, 6); 
  gatewayPeerInfo.channel = WIFI_CHANNEL; 
  gatewayPeerInfo.encrypt = false;

  if (esp_now_add_peer(&gatewayPeerInfo) != ESP_OK){
    Serial.println("[DewasaNode] Failed to add Gateway peer");
    return;
  }
  Serial.println("[DewasaNode] Gateway node added as peer (for sending sensor data and receiving commands).");

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
      #ifdef DEBUG_DEWASA_NODE
      Serial.println("[DewasaNode] Sensors read successfully.");
      #endif
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
      #ifdef DEBUG_DEWASA_NODE
      Serial.println("[DewasaNode] Attempting to send local data to Gateway...");
      #endif

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
                  #ifdef DEBUG_DEWASA_NODE
                  Serial.printf("[DewasaNode] Sent successfully to Gateway on attempt %d.\n", attempt + 1);
                  #endif
                  sent_successfully_after_retries = true;
                  break; 
              } else {
                  #ifdef DEBUG_DEWASA_NODE
                  Serial.printf("[DewasaNode] Send attempt %d to Gateway: ACK not received within %lu ms.\n", attempt + 1, SEND_CALLBACK_TIMEOUT_MS);
                  #endif
              }
          } else {
              #ifdef DEBUG_DEWASA_NODE
              Serial.printf("[DewasaNode] esp_now_send error on attempt %d. ESP-NOW Error Code: %d (%s)\n", attempt + 1, result, esp_err_to_name(result));
              #endif
          }

          if (!sent_successfully_after_retries && attempt < MAX_SEND_RETRIES - 1) {
              #ifdef DEBUG_DEWASA_NODE
              Serial.printf("[DewasaNode] Retrying send in %lu ms...\n", RETRY_DELAY_MS);
              #endif
              delay(RETRY_DELAY_MS);
          }
      } 

      if (!sent_successfully_after_retries) {
          Serial.println("[DewasaNode] ERROR: Failed to send data to Gateway after all retries.");
      }
  } 
  delay(10);
}
