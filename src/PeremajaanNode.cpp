#include <Arduino.h>
#include <DHT.h>
#include <Wire.h>
#include <BH1750.h>
#include <esp_now.h>
#include <WiFi.h>
#include <esp_wifi.h> // Needed for esp_wifi_set_channel
#include <SensorData.h> // Use angle brackets for library includes
#include <SensorManager.h> // Include the Sensor Manager library
#include <NodeConfig.h> // Include common configuration

// Pin Definitions (Moved to NodeConfig.h)
// #define DHT_PIN 4  // Removed

// Configuration flags
#define TEMP_HUMID_SIMULATION_MODE false  // Set to true to simulate DHT22 readings
#define LIGHT_SIMULATION_MODE true       // Changed to true to simulate BH1750 readings

// Master node MAC address (Dewasa)
uint8_t masterMac[] = {0xE4, 0x65, 0xB8, 0x83, 0xD1, 0x40}; // MAC of the master node

// Global variable to hold sensor data to be sent
SensorData sensorData;

// Sensor Manager object pointer
SensorManager* sensorManager;

// Sensor objects are now managed by SensorManager
// DHT dht(DHT_PIN, DHT22); // Removed
// BH1750 lightSensor; // Removed

// Timing variables
unsigned long lastSensorReadTime = 0;
unsigned long lastSendTime = 0;
const unsigned long SENSOR_READ_INTERVAL = 1000; // Read sensors every 5 seconds
const unsigned long SEND_INTERVAL = 1000; // Send data to master every 10 seconds

// ESP-NOW callback function
void onDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    Serial.print("[ESPNow] Send CB for MAC: ");
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
void readSensors();
// Removed getRandom... prototypes

void setup() {
    // Initialize serial communication
    Serial.begin(115200);
    delay(1000); // Give serial monitor time to start
    
    Serial.println("\n\n[PeremajaanNode] Starting Peremajaan Node...");

    // Initialize Sensor Manager
    // Pass the DHT pin and the simulation flags defined earlier
    sensorManager = new SensorManager(DHT_PIN, TEMP_HUMID_SIMULATION_MODE, LIGHT_SIMULATION_MODE);
    sensorManager->begin(); // Initializes DHT and BH1750 internally

    // Log simulation mode status (SensorManager handles simulation internally now)
    if (TEMP_HUMID_SIMULATION_MODE) {
        Serial.println("[PeremajaanNode] Temperature & humidity simulation mode ENABLED");
    }
    
    if (LIGHT_SIMULATION_MODE) {
        Serial.println("[PeremajaanNode] Light intensity simulation mode ENABLED");
    }
    
    // Initialize random seed for simulation (SensorManager handles this if needed)
    // if (TEMP_HUMID_SIMULATION_MODE || LIGHT_SIMULATION_MODE) { // Removed
    //     randomSeed(analogRead(0)); // Removed
    // } // Removed
    
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
        Serial.println("[PeremajaanNode] ERROR: Failed to initialize ESP-NOW");
        return;
    }
    Serial.println("[PeremajaanNode] ESP-NOW initialized successfully");
    
    // Register callback function
    esp_now_register_send_cb(onDataSent);
    
    // Register peer (master node)
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, masterMac, 6);
    peerInfo.channel = 6;  // Use channel 6 explicitly
    peerInfo.encrypt = false;
    
    // Print master MAC address for debugging
    Serial.print("[PeremajaanNode] Adding master node with MAC: ");
    for (int i = 0; i < 6; i++) {
        Serial.print(masterMac[i], HEX);
        if (i < 5) Serial.print(":");
    }
    Serial.println();
    
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("[PeremajaanNode] ERROR: Failed to add master node as peer");
        return;
    }
    Serial.println("[PeremajaanNode] Master node added as peer successfully");
    
    // Initialize sensor data structure
    strncpy(sensorData.nodeName, "peremajaan", sizeof(sensorData.nodeName));
    sensorData.temperature = 0;
    sensorData.humidity = 0;
    sensorData.lightIntensity = 0;
    sensorData.temperatureValid = false;
    sensorData.humidityValid = false;
    sensorData.lightValid = false;
    sensorData.timestamp = 0;
    
    Serial.println("[PeremajaanNode] Setup completed");
}

void loop() {
    unsigned long currentTime = millis();
    
    // Read sensors at regular intervals
    if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
        lastSensorReadTime = currentTime;
        readSensors();
    }
    
    // Send data to master at regular intervals
    if (currentTime - lastSendTime >= SEND_INTERVAL) {
        lastSendTime = currentTime;
        
        // Update timestamp
        sensorData.timestamp = millis();
        
        // Check if WiFi is in the correct mode
        if (WiFi.getMode() != WIFI_STA) {
            Serial.println("[PeremajaanNode] WARNING: WiFi not in station mode, resetting...");
            WiFi.mode(WIFI_STA);
            delay(10);
        }
        
        // Check if peer exists before sending
        if (!esp_now_is_peer_exist(masterMac)) {
            Serial.println("[PeremajaanNode] ERROR: Master peer not found in ESP-NOW table before sending!");
            // Optionally try re-adding the peer here if needed
        }

        // Send data via ESP-NOW
        Serial.println("[PeremajaanNode] Sending data to master node...");
        
        // Print data being sent for debugging
        Serial.println("[PeremajaanNode] Data Content:");
        Serial.println("  Node: " + String(sensorData.nodeName));
        Serial.println("  Temp: " + String(sensorData.temperature) + "°C (Valid: " + String(sensorData.temperatureValid ? "Yes" : "No") + ")");
        Serial.println("  Humidity: " + String(sensorData.humidity) + "% (Valid: " + String(sensorData.humidityValid ? "Yes" : "No") + ")");
        Serial.println("  Light: " + String(sensorData.lightIntensity) + " lux (Valid: " + String(sensorData.lightValid ? "Yes" : "No") + ")");
        Serial.println("  Timestamp: " + String(sensorData.timestamp));
        
        esp_err_t result = esp_now_send(masterMac, (uint8_t *) &sensorData, sizeof(SensorData));
        
        if (result == ESP_OK) {
            Serial.println("[PeremajaanNode] Data sent successfully");
        } else {
            Serial.println("[PeremajaanNode] ERROR: Failed to send data, error code: " + String(result));
            
            // Try to re-register peer if send fails
            esp_now_peer_info_t peerInfo = {};
            esp_now_del_peer(masterMac);
            memcpy(peerInfo.peer_addr, masterMac, 6);
            peerInfo.channel = 0;
            peerInfo.encrypt = false;
            
            if (esp_now_add_peer(&peerInfo) != ESP_OK) {
                Serial.println("[PeremajaanNode] ERROR: Failed to re-add peer");
            } else {
                Serial.println("[PeremajaanNode] Peer re-added successfully");
            }
        }
    }
    
    // Small delay to prevent watchdog issues
    delay(10);
}

void readSensors() {
    Serial.println("\n[PeremajaanNode] Reading sensors via SensorManager...");
    
    // Call the manager to read sensors (handles simulation internally)
    bool success = sensorManager->readSensors();
    
    if (success) {
        Serial.println("[PeremajaanNode] SensorManager read successful");
    } else {
        Serial.println("[PeremajaanNode] WARNING: SensorManager reported read failure");
    }

    // Update the global sensorData struct with values from the manager
    sensorData.temperature = sensorManager->getTemperature();
    sensorData.humidity = sensorManager->getHumidity();
    sensorData.lightIntensity = sensorManager->getLightIntensity();
    
    sensorData.temperatureValid = sensorManager->isTemperatureValid();
    sensorData.humidityValid = sensorManager->isHumidityValid();
    sensorData.lightValid = sensorManager->isLightValid();

    // Optional: Log the retrieved values for debugging
    Serial.println("  Temp: " + String(sensorData.temperature) + "°C (Valid: " + String(sensorData.temperatureValid ? "Yes" : "No") + ")");
    Serial.println("  Humidity: " + String(sensorData.humidity) + "% (Valid: " + String(sensorData.humidityValid ? "Yes" : "No") + ")");
    Serial.println("  Light: " + String(sensorData.lightIntensity) + " lux (Valid: " + String(sensorData.lightValid ? "Yes" : "No") + ")");
}

// Removed getRandomTemperature, getRandomHumidity, getRandomLightIntensity functions
// as simulation is now handled within SensorManager
