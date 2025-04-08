#ifndef SENSOR_MANAGER_H
#define SENSOR_MANAGER_H

#include <Arduino.h>
#include <DHT.h>
#include <Wire.h>
#include <BH1750.h>

class SensorManager {
public:
    SensorManager(int dhtPin, bool tempHumidSimulation = false, bool lightSimulation = false);
    void begin();
    bool readSensors();
    float getTemperature();
    float getHumidity();
    float getLightIntensity();
    bool isTemperatureValid();
    bool isHumidityValid();
    bool isLightValid();
    
private:
    DHT _dht;
    BH1750 _lightSensor;
    int _dhtPin;
    bool _tempHumidSimulationMode;
    bool _lightSimulationMode;
    float _temperature;
    float _humidity;
    float _lightIntensity;
    bool _temperatureValid;
    bool _humidityValid;
    bool _lightValid;
    
    float getRandomTemperature();
    float getRandomHumidity();
    float getRandomLightIntensity();
};

#endif // SENSOR_MANAGER_H