#ifndef SENSORDATA_H
#define SENSORDATA_H

// Define the data structure for sending/receiving sensor readings via ESP-NOW
struct SensorData {
    char nodeName[16]; // Name of the node (e.g., "penyemaian", "peremajaan")
    float temperature;
    float humidity;
    float lightIntensity;
    bool temperatureValid;
    bool humidityValid;
    bool lightValid;
    unsigned long timestamp; // Timestamp from the sending node
};

#endif // SENSORDATA_H
