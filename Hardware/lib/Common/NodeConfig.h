#ifndef NODECONFIG_H
#define NODECONFIG_H

// --- Communication & Timing Configuration ---
#define WIFI_CHANNEL 3            // Define the operating channel (1-11 recommended)
#define SENSOR_READ_INTERVAL 3000UL // Read sensors every 3 seconds
#define SEND_INTERVAL 3000UL        // Send data every 3 seconds (Penyemaian, Peremajaan)
#define MQTT_PUBLISH_INTERVAL 4000UL // Publish MQTT every 3 seconds (Dewasa)

// --- Data Validity Timeouts (Considered stale after this duration) ---
#define PENYEMAIAN_DATA_TIMEOUT 5000UL // Timeout for data from Penyemaian (on Peremajaan)
#define COMBINED_DATA_TIMEOUT 7000UL   // Timeout for data from Peremajaan (on Dewasa)

// --- Hardware Pins ---
#define DHT_PIN 4                   // DHT22 data pin

// Add other common configuration constants here as needed

#endif // NODECONFIG_H
