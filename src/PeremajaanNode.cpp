#include <Arduino.h>
#include <DHT.h>
#include <Wire.h>
#include <BH1750.h>
#include <esp_now.h>
#include <WiFi.h>

// Pin Definitions
#define DHT_PIN 4  // DHT22 data pin connected to GPIO4

// Configuration flags
#define TEMP_HUMID_SIMULATION_MODE false  // Set to true to simulate DHT22 readings
#define LIGHT_SIMULATION_MODE true       // Changed to true to simulate BH1750 readings

// Master node MAC address (Dewasa)
uint8_t masterMac[] = {0xE4, 0x65, 0xB8, 0x83, 0xD1, 0x40}; // MAC of the master node

// Define the data structure for sending sensor readings
struct SensorData {
    char nodeName[16]; // Name of the node
    float temperature;
    float humidity;
    float lightIntensity;
    bool temperatureValid;
    bool humidityValid;
    bool lightValid;
    unsigned long timestamp;
};

SensorData sensorData;

// Sensor objects
DHT dht(DHT_PIN, DHT22);
BH1750 lightSensor;

// Timing variables
unsigned long lastSensorReadTime = 0;
unsigned long lastSendTime = 0;
const unsigned long SENSOR_READ_INTERVAL = 1000; // Read sensors every 5 seconds
const unsigned long SEND_INTERVAL = 1000; // Send data to master every 10 seconds

// ESP-NOW callback function
void onDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    Serial.print("[ESPNow] Last packet send status: ");
    if (status == ESP_NOW_SEND_SUCCESS) {
        Serial.println("Success");
    } else {
        Serial.println("Failed");
    }
}

// Function prototypes
void readSensors();
float getRandomTemperature();
float getRandomHumidity();
float getRandomLightIntensity();

void setup() {
    // Initialize serial communication
    Serial.begin(115200);
    delay(1000); // Give serial monitor time to start
    
    Serial.println("\n\n[PeremajaanNode] Starting Peremajaan Node...");
    
    // Initialize DHT sensor
    dht.begin();
    Serial.println("[PeremajaanNode] DHT22 sensor initialized");
    
    // Initialize BH1750 light sensor
    Wire.begin();
    if (lightSensor.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
        Serial.println("[PeremajaanNode] BH1750 sensor initialized");
    } else {
        Serial.println("[PeremajaanNode] ERROR: Failed to initialize BH1750 sensor!");
    }
    
    // Log simulation mode status
    if (TEMP_HUMID_SIMULATION_MODE) {
        Serial.println("[PeremajaanNode] Temperature & humidity simulation mode ENABLED");
    }
    
    if (LIGHT_SIMULATION_MODE) {
        Serial.println("[PeremajaanNode] Light intensity simulation mode ENABLED");
    }

    // Initialize random seed for simulation
    if (TEMP_HUMID_SIMULATION_MODE || LIGHT_SIMULATION_MODE) {
        randomSeed(analogRead(0));
    }
    
    // Set device as a Wi-Fi Station
    WiFi.mode(WIFI_STA);
    
    // Disconnect from any WiFi connections to ensure clean slate
    WiFi.disconnect();
    delay(100);
    
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
    peerInfo.channel = 0;  
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
    Serial.println("\n[PeremajaanNode] Reading sensors...");
    
    // Read temperature and humidity from DHT22 or simulate
    if (TEMP_HUMID_SIMULATION_MODE) {
        sensorData.temperature = getRandomTemperature();
        sensorData.humidity = getRandomHumidity();
        sensorData.temperatureValid = true;
        sensorData.humidityValid = true;
        Serial.println("[PeremajaanNode] Simulated temperature: " + String(sensorData.temperature) + "°C");
        Serial.println("[PeremajaanNode] Simulated humidity: " + String(sensorData.humidity) + "%");
    } else {
        sensorData.temperature = dht.readTemperature();
        sensorData.humidity = dht.readHumidity();
        
        if (isnan(sensorData.temperature) || isnan(sensorData.humidity)) {
            Serial.println("[PeremajaanNode] ERROR: Failed to read from DHT sensor!");
            sensorData.temperatureValid = false;
            sensorData.humidityValid = false;
        } else {
            sensorData.temperatureValid = true;
            sensorData.humidityValid = true;
            Serial.println("[PeremajaanNode] Temperature: " + String(sensorData.temperature) + "°C");
            Serial.println("[PeremajaanNode] Humidity: " + String(sensorData.humidity) + "%");
        }
    }
    
    // Read light intensity from BH1750 or simulate
    if (LIGHT_SIMULATION_MODE) {
        sensorData.lightIntensity = getRandomLightIntensity();
        sensorData.lightValid = true;
        Serial.println("[PeremajaanNode] Simulated light intensity: " + String(sensorData.lightIntensity) + " lux");
    } else {
        // Read lux directly from sensor
        float luxReading = lightSensor.readLightLevel();
        if (luxReading < 0) {
            Serial.println("[PeremajaanNode] ERROR: Failed to read from BH1750 sensor!");
            sensorData.lightValid = false;
        } else {
            sensorData.lightIntensity = luxReading; // Use raw lux value
            sensorData.lightValid = true;
            Serial.println("[PeremajaanNode] Light intensity: " + String(sensorData.lightIntensity) + " lux");
        }
    }
}

float getRandomTemperature() {
    // Generate random temperature between 20-35°C
    return 20.0 + (random(1500) / 100.0);
}

float getRandomHumidity() {
    // Generate random humidity between 40-90%
    return 40.0 + (random(5000) / 100.0);
}

float getRandomLightIntensity() {
    // Generate random light intensity between 0-10000 lux
    // Indoor light is typically 50-500 lux, outdoor shade is ~10000 lux
    return random(10000);
}