#include <Arduino.h>
#include <DHT.h>
#include <Wire.h>
#include <BH1750.h>
#include <esp_now.h>
#include <WiFi.h>
#include <esp_wifi.h> // Needed for esp_wifi_set_channel
#include "../lib/Common/SensorData.h" // Use relative path for local lib includes
#include "../lib/SensorManager/SensorManager.h" // Include the Sensor Manager library
#include "../lib/Common/NodeConfig.h" // Include common configuration

// Pin Definitions (Moved to NodeConfig.h)
// #define DHT_PIN 4  // Removed

// Configuration flags
#define TEMP_HUMID_SIMULATION_MODE false  // Set to true to simulate DHT22 readings
#define LIGHT_SIMULATION_MODE true       // Changed to true to simulate BH1750 readings

// MAC addresses
uint8_t masterMac[] = {0xE4, 0x65, 0xB8, 0x83, 0xD1, 0x40}; // MAC of the master node (Dewasa) - UPDATE THIS
uint8_t penyemaianMac[] = {0xA8, 0x42, 0xE3, 0x5A, 0x78, 0xD4}; // MAC of the source node (Penyemaian) - UPDATE THIS

// Global variables
SensorManager* sensorManager;
CombinedData combinedDataToSend; // Data structure to send to master
SensorData receivedPenyemaianData; // Buffer for data received from Penyemaian
unsigned long lastPenyemaianReceiveTime = 0;
const unsigned long PENYEMAIAN_DATA_TIMEOUT = 3000UL; // Timeout for Penyemaian data (5 seconds)

// Timing variables
unsigned long lastSensorReadTime = 0;
unsigned long lastSendTime = 0;
const unsigned long SENSOR_READ_INTERVAL = 1000; // Read sensors every 5 seconds
const unsigned long SEND_INTERVAL = 1000; // Send combined data to master every 5 seconds

// ESP-NOW Callback function for receiving data (from Penyemaian)
void OnDataRecv(const uint8_t * mac, const uint8_t *incomingData, int len) {
  Serial.println("[PeremajaanNode] Data received via ESP-NOW.");
  // Check if data is from the expected Penyemaian MAC
  if (memcmp(mac, penyemaianMac, 6) != 0) {
      Serial.print("  Received from unexpected MAC: ");
      for (int i = 0; i < 6; i++) { Serial.print(mac[i], HEX); if (i < 5) Serial.print(":"); }
      Serial.println();
      return;
  }

  if (len == sizeof(SensorData)) {
    memcpy(&receivedPenyemaianData, incomingData, sizeof(receivedPenyemaianData));
    lastPenyemaianReceiveTime = millis(); // Update timestamp on successful reception
    Serial.println("  Data successfully received from Penyemaian node.");
    // Optional: Print received data for debugging
    // Serial.println("  Temp: " + String(receivedPenyemaianData.temperature));
  } else {
    Serial.print("  Error: Received data size mismatch. Expected: ");
    Serial.print(sizeof(SensorData));
    Serial.print(", Got: ");
    Serial.println(len);
  }
}


// ESP-NOW callback function for sending data (to Dewasa)
void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    Serial.print("[PeremajaanNode] Send CB to Dewasa (MAC: ");
    for (int i = 0; i < 6; i++) {
        Serial.print(mac_addr[i], HEX);
        if (i < 5) Serial.print(":");
    }
    Serial.print(" - Status: ");
    if (status == ESP_NOW_SEND_SUCCESS) {
        Serial.println("Success");
    } else {
        Serial.print("Failed (Code: ");
        Serial.print(status); // Print the actual error code
        Serial.println(")");
    }
}

// Function prototypes
void readLocalSensors();

void setup() {
    // Initialize serial communication
    Serial.begin(115200);
    delay(1000); // Give serial monitor time to start
    
    Serial.println("\n\n[PeremajaanNode] Starting Peremajaan Node...");

    // Initialize Sensor Manager for local sensors
    sensorManager = new SensorManager(DHT_PIN, TEMP_HUMID_SIMULATION_MODE, LIGHT_SIMULATION_MODE);
    sensorManager->begin();

    // Log simulation mode status (SensorManager handles simulation internally now)
    if (TEMP_HUMID_SIMULATION_MODE) {
        Serial.println("[PeremajaanNode] Temperature & humidity simulation mode ENABLED");
    }
    
    if (LIGHT_SIMULATION_MODE) {
        Serial.println("[PeremajaanNode] Light intensity simulation mode ENABLED");
    }
    
    
    // Set device as a Wi-Fi Station
    WiFi.mode(WIFI_STA);
    
    // Disconnect from any WiFi connections to ensure clean slate
    WiFi.disconnect();
    delay(100);

    // Set WiFi channel to 6 BEFORE initializing ESP-NOW
    Serial.println("[PeremajaanNode] Setting WiFi channel to 6...");
    if (esp_wifi_set_channel(6, WIFI_SECOND_CHAN_NONE) != ESP_OK) {
        Serial.println("[PeremajaanNode] ERROR: Failed to set WiFi channel!");
    } else {
        Serial.println("[PeremajaanNode] WiFi channel set to 6 successfully.");
    }
    
    // Print MAC address
    Serial.print("[PeremajaanNode] MAC Address: ");
    Serial.println(WiFi.macAddress());
    
    // Initialize ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("[PeremajaanNode] Error initializing ESP-NOW");
        return;
    }
    Serial.println("[PeremajaanNode] ESP-NOW initialized successfully");

    // Register BOTH send and receive callbacks
    esp_now_register_send_cb(OnDataSent);
    esp_now_register_recv_cb(OnDataRecv);

    // Register Master Node (Dewasa) as peer for sending
    esp_now_peer_info_t masterPeerInfo = {};
    memcpy(masterPeerInfo.peer_addr, masterMac, 6);
    masterPeerInfo.channel = 6; // Use channel 6 explicitly
    masterPeerInfo.encrypt = false;
    if (esp_now_add_peer(&masterPeerInfo) != ESP_OK){
      Serial.println("[PeremajaanNode] Failed to add Master (Dewasa) peer");
      return;
    }
    Serial.println("[PeremajaanNode] Master (Dewasa) node added as peer for sending.");

    // Register Penyemaian Node as peer for receiving (optional but good practice)
    // Note: Receiving works even without adding the sender as a peer, but adding helps manage connections.
    esp_now_peer_info_t penyemaianPeerInfo = {};
    memcpy(penyemaianPeerInfo.peer_addr, penyemaianMac, 6);
    penyemaianPeerInfo.channel = 6; // Should match Penyemaian's channel
    penyemaianPeerInfo.encrypt = false;
    if (esp_now_add_peer(&penyemaianPeerInfo) != ESP_OK){
      Serial.println("[PeremajaanNode] Failed to add Penyemaian peer (optional)");
      // Continue anyway, as receiving might still work
    } else {
      Serial.println("[PeremajaanNode] Penyemaian node added as peer for receiving.");
    }

    // Initialize data structures
    memset(&receivedPenyemaianData, 0, sizeof(SensorData));
    strncpy(receivedPenyemaianData.nodeName, "penyemaian", sizeof(receivedPenyemaianData.nodeName) - 1);
    receivedPenyemaianData.nodeName[sizeof(receivedPenyemaianData.nodeName) - 1] = '\0';
    receivedPenyemaianData.temperatureValid = false; // Start as invalid
    receivedPenyemaianData.humidityValid = false;
    receivedPenyemaianData.lightValid = false;

    memset(&combinedDataToSend, 0, sizeof(CombinedData));
    strncpy(combinedDataToSend.peremajaanData.nodeName, "peremajaan", sizeof(combinedDataToSend.peremajaanData.nodeName) - 1);
    combinedDataToSend.peremajaanData.nodeName[sizeof(combinedDataToSend.peremajaanData.nodeName) - 1] = '\0';
    // Copy initial invalid Penyemaian data into the combined struct
    memcpy(&combinedDataToSend.penyemaianData, &receivedPenyemaianData, sizeof(SensorData));
    combinedDataToSend.isPenyemaianDataValid = false;
    
    Serial.println("[PeremajaanNode] Setup completed");
}

void loop() {
    unsigned long currentTime = millis();
    
    // Read local sensors at regular intervals
    if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
        lastSensorReadTime = currentTime;
        readLocalSensors(); // Reads local sensors into combinedDataToSend.peremajaanData
    }

    // Send combined data to master at regular intervals
    if (currentTime - lastSendTime >= SEND_INTERVAL) {
        lastSendTime = currentTime;

        // Check validity of received Penyemaian data
        bool isPenyemaianValid = (millis() - lastPenyemaianReceiveTime) < PENYEMAIAN_DATA_TIMEOUT;
        combinedDataToSend.isPenyemaianDataValid = isPenyemaianValid;

        // Copy the latest received Penyemaian data (valid or not)
        memcpy(&combinedDataToSend.penyemaianData, &receivedPenyemaianData, sizeof(SensorData));
        // Ensure validity flags within penyemaianData reflect the timeout status
        if (!isPenyemaianValid) {
            combinedDataToSend.penyemaianData.temperatureValid = false;
            combinedDataToSend.penyemaianData.humidityValid = false;
            combinedDataToSend.penyemaianData.lightValid = false;
        }


        // Update the timestamp for the combined packet
        combinedDataToSend.timestamp = millis();

        // Send the combined data structure
        Serial.println("[PeremajaanNode] Sending combined data to master node...");
        // Optional: Print combined data for debugging
        // Serial.println("  Peremajaan Temp: " + String(combinedDataToSend.peremajaanData.temperature));
        // Serial.println("  Penyemaian Temp: " + String(combinedDataToSend.penyemaianData.temperature));
        // Serial.println("  Penyemaian Valid: " + String(combinedDataToSend.isPenyemaianDataValid ? "Yes" : "No"));

        esp_err_t result = esp_now_send(masterMac, (uint8_t *) &combinedDataToSend, sizeof(CombinedData));

        if (result == ESP_OK) {
            Serial.println("[PeremajaanNode] Combined data sent successfully.");
        } else {
            Serial.println("[PeremajaanNode] ERROR: Failed to send combined data, error code: " + String(result));
            // Consider re-adding peer logic if needed, similar to before
        }
    }

    // Small delay
    delay(10);
}

// Reads local sensors and updates the peremajaanData part of combinedDataToSend
void readLocalSensors() {
    Serial.println("\n[PeremajaanNode] Reading local sensors via SensorManager...");

    bool success = sensorManager->readSensors();

    if (success) {
        Serial.println("[PeremajaanNode] SensorManager read successful");
    } else {
        Serial.println("[PeremajaanNode] WARNING: SensorManager reported read failure");
    }

    // Update the peremajaanData within the combinedDataToSend struct
    combinedDataToSend.peremajaanData.temperature = sensorManager->getTemperature();
    combinedDataToSend.peremajaanData.humidity = sensorManager->getHumidity();
    combinedDataToSend.peremajaanData.lightIntensity = sensorManager->getLightIntensity();
    combinedDataToSend.peremajaanData.temperatureValid = sensorManager->isTemperatureValid();
    combinedDataToSend.peremajaanData.humidityValid = sensorManager->isHumidityValid();
    combinedDataToSend.peremajaanData.lightValid = sensorManager->isLightValid();
    combinedDataToSend.peremajaanData.timestamp = millis(); // Timestamp for local read

    // Optional: Log the retrieved values
    // Serial.println("  Local Temp: " + String(combinedDataToSend.peremajaanData.temperature) + "°C (Valid: " + String(combinedDataToSend.peremajaanData.temperatureValid ? "Yes" : "No") + ")");
    // Serial.println("  Local Humidity: " + String(combinedDataToSend.peremajaanData.humidity) + "% (Valid: " + String(combinedDataToSend.peremajaanData.humidityValid ? "Yes" : "No") + ")");
    // Serial.println("  Local Light: " + String(combinedDataToSend.peremajaanData.lightIntensity) + " lux (Valid: " + String(combinedDataToSend.peremajaanData.lightValid ? "Yes" : "No") + ")");
}
