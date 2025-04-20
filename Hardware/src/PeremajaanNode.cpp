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

// --- ESP-NOW Send Retry Configuration ---
const int MAX_SEND_RETRIES = 15;                 // Max attempts per data packet
const unsigned long SEND_CALLBACK_TIMEOUT_MS = 200; // Max wait time for ACK callback (milliseconds)
const unsigned long RETRY_DELAY_MS = 75;          // Delay between retries (milliseconds)

// Configuration flags
#define TEMP_HUMID_SIMULATION_MODE false  // Set to true to simulate DHT22 readings
#define LIGHT_SIMULATION_MODE false       // Changed to true to simulate BH1750 readings

// MAC addresses
uint8_t masterMac[] = {0xE4, 0x65, 0xB8, 0x83, 0xD1, 0x40}; // MAC of the master node (Dewasa) - UPDATE THIS
uint8_t penyemaianMac[] = {0xA8, 0x42, 0xE3, 0x5A, 0x78, 0xD4}; // MAC of the source node (Penyemaian) - UPDATE THIS

// Global variables
SensorManager* sensorManager;
CombinedData combinedDataToSend; // Data structure to send to master
SensorData receivedPenyemaianData; // Buffer for data received from Penyemaian
unsigned long lastPenyemaianReceiveTime = 0;
// PENYEMAIAN_DATA_TIMEOUT is now defined in NodeConfig.h

// Timing variables
unsigned long lastSensorReadTime = 0;
unsigned long lastSendTime = 0;
// SENSOR_READ_INTERVAL and SEND_INTERVAL are now defined in NodeConfig.h

// Global flag to track ESP-NOW send status from callback
volatile bool esp_now_send_success = false;

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


// ESP-NOW callback function for sending data (to Dewasa) - MODIFIED
void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    esp_now_send_success = (status == ESP_NOW_SEND_SUCCESS); // Set flag based on ACK status

    // Optional: Concise logging
    if (!esp_now_send_success) { // Log only failures from callback for less noise
         Serial.printf("[PeremajaanNode] Send CB to %02X:%02X:%02X:%02X:%02X:%02X : Fail (No ACK)\n",
                       mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);
    }
    // Remove the verbose success/fail printing from here, handle in retry loop
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

    // Set WiFi channel using value from NodeConfig.h BEFORE initializing ESP-NOW
    Serial.printf("[PeremajaanNode] Setting WiFi channel to %d...\n", WIFI_CHANNEL);
    if (esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE) != ESP_OK) {
        Serial.printf("[PeremajaanNode] ERROR: Failed to set WiFi channel %d!\n", WIFI_CHANNEL);
    } else {
        Serial.printf("[PeremajaanNode] WiFi channel set to %d successfully.\n", WIFI_CHANNEL);
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
    masterPeerInfo.channel = WIFI_CHANNEL; // Use channel from NodeConfig.h
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
    penyemaianPeerInfo.channel = WIFI_CHANNEL; // Use channel from NodeConfig.h
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

    // Read local sensors at regular intervals using interval from NodeConfig.h
    if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
        lastSensorReadTime = currentTime;
        readLocalSensors(); // Reads local sensors into combinedDataToSend.peremajaanData
    }

    // Send combined data to master at regular intervals WITH RETRIES
    if (currentTime - lastSendTime >= SEND_INTERVAL) {
        lastSendTime = currentTime;

        // --- Prepare Data to Send (Existing Logic) ---
        bool isPenyemaianValid = (millis() - lastPenyemaianReceiveTime) < PENYEMAIAN_DATA_TIMEOUT;
        combinedDataToSend.isPenyemaianDataValid = isPenyemaianValid;
        memcpy(&combinedDataToSend.penyemaianData, &receivedPenyemaianData, sizeof(SensorData));
        if (!isPenyemaianValid) {
            combinedDataToSend.penyemaianData.temperatureValid = false;
            combinedDataToSend.penyemaianData.humidityValid = false;
            combinedDataToSend.penyemaianData.lightValid = false;
        }
        combinedDataToSend.timestamp = millis(); // Update timestamp just before sending attempt
        // --- End Prepare Data ---

        Serial.println("[PeremajaanNode] Attempting to send combined data to master...");

        bool sent_successfully_after_retries = false;
        for (int attempt = 0; attempt < MAX_SEND_RETRIES; ++attempt) {
            esp_now_send_success = false; // Reset flag before this attempt
            esp_err_t result = esp_now_send(masterMac, (uint8_t *) &combinedDataToSend, sizeof(CombinedData));

            if (result == ESP_OK) {
                // Send queued, now wait for the ACK callback or timeout
                unsigned long send_start_time = millis();
                while (!esp_now_send_success && (millis() - send_start_time < SEND_CALLBACK_TIMEOUT_MS)) {
                    // Wait for the callback to set the flag
                    // Use yield() or a very small delay if needed, but often waiting is enough
                    yield(); // Give ESP-IDF background tasks time to process ACK
                    // delay(5); // Alternative if yield() causes issues
                }

                if (esp_now_send_success) {
                    // Callback reported success!
                    Serial.printf("[PeremajaanNode] Sent successfully to Dewasa on attempt %d.\n", attempt + 1);
                    sent_successfully_after_retries = true;
                    break; // Exit the retry loop
                } else {
                    // Callback timed out (or reported failure, handled in callback log)
                    Serial.printf("[PeremajaanNode] Send attempt %d ACK not received within %lu ms.\n", attempt + 1, SEND_CALLBACK_TIMEOUT_MS);
                }
            } else {
                // esp_now_send failed immediately (e.g., queue full, invalid params)
                Serial.printf("[PeremajaanNode] esp_now_send error on attempt %d. ESP-NOW Error Code: %d\n", attempt + 1, result);
                // No need to wait for callback if send failed immediately
            }

            // If not successful and more retries are left, delay before next attempt
            if (!sent_successfully_after_retries && attempt < MAX_SEND_RETRIES - 1) {
                Serial.printf("[PeremajaanNode] Retrying send in %lu ms...\n", RETRY_DELAY_MS);
                delay(RETRY_DELAY_MS);
            }
        } // End of retry loop

        if (!sent_successfully_after_retries) {
            Serial.println("[PeremajaanNode] ERROR: Failed to send combined data to Dewasa after all retries.");
            // Consider additional error handling if needed (e.g., increment failure counter)
        }
    } // End of SEND_INTERVAL block


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
