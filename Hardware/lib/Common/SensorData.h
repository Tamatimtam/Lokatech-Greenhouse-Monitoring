#ifndef SENSORDATA_H
#define SENSORDATA_H

#include <Arduino.h> // Include Arduino types like bool, uint8_t etc.

// Define the structure for individual node sensor data
struct SensorData {
    char nodeName[16]; // Name of the node (e.g., "penyemaian", "peremajaan")
    float temperature;
    float humidity;
    float lightIntensity;
    bool temperatureValid;
    bool humidityValid;
    bool lightValid;
    unsigned long timestamp; // Timestamp from the sending node (millis())
};

// Define the structure for combined data sent from Peremajaan to Dewasa
struct CombinedData {
    SensorData peremajaanData; // Data from Peremajaan node's sensors
    SensorData penyemaianData; // Data received from Penyemaian node
    bool isPenyemaianDataValid; // Flag indicating if penyemaianData is recent/valid
    unsigned long timestamp;    // Timestamp when this combined packet was created (millis())
};

// Define the structure for actuator commands sent from Gateway to Dewasa
struct ActuatorCommand {
    char device[10]; // "fan" or "light"
    bool state;      // true for ON, false for OFF
    // uint32_t commandId; // Optional: for more advanced ACK tracking if needed
};


#endif // SENSORDATA_H
