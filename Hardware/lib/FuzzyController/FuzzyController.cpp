#include "FuzzyController.h"
#include <Arduino.h> // For Serial printing (optional debugging)
#include <Fuzzy.h>   // Include the fuzzy logic library

// --- Define Membership Functions based on new.md ---

// Temperature Input Sets (Range: 0-40°C)
// COLD: Trapezoidal, 100% from -1 to 5, dropping to 0 at 8
FuzzySet* tempCold = new FuzzySet(-1, -1, 5, 8); 
// OPTIMAL: Trapezoidal, 100% from 10-25, dropping to 0 at exactly 29
FuzzySet* tempOptimal = new FuzzySet(5, 10, 29, 31);
// HOT: Trapezoidal, 100% from exactly 30-40, dropping to 0 at 29
FuzzySet* tempHot = new FuzzySet(29, 31, 40, 40);

// Humidity Input Sets (Range: 0-100%)
// DRY: Trapezoidal, 100% below 40, zero above 50
FuzzySet* humidityDry = new FuzzySet(-1, -1, 40, 50); // Assuming range starts at -1
// OPTIMAL: Trapezoidal, 100% from 55-75, dropping to 0 at 40 and 90
FuzzySet* humidityOptimal = new FuzzySet(40, 55, 75, 90);
// HUMID: Trapezoidal, zero below 90, 100% above 100
FuzzySet* humidityHumid = new FuzzySet(80, 90, 100, 100); // Assuming range ends at 100

// Light Input Sets (Range: 0-1000 lux)
// DARK: Trapezoidal, 100% from 0-100, dropping linearly to 0 at 350
FuzzySet* lightDark = new FuzzySet(0, 0, 150, 350);
// ADEQUATE: Trapezoidal, 0 below 150, rising linearly to 100% at 400
FuzzySet* lightAdequate = new FuzzySet(150, 350, 1000, 1000);


// Output Sets (Simple ON/OFF representation, Range 0-1)
// Using narrow triangular sets around 0 (OFF) and 1 (ON) for each output
FuzzySet* fanOff = new FuzzySet(0, 0, 0, 0.1); 
FuzzySet* fanOn = new FuzzySet(0.9, 1, 1, 1);
FuzzySet* lightOff = new FuzzySet(0, 0, 0, 0.1); 
FuzzySet* lightOn = new FuzzySet(0.9, 1, 1, 1);

// --- FuzzyController Class Implementation ---

FuzzyController::FuzzyController() : _fuzzy(nullptr), _crispFanOutput(0.0f), _crispLightOutput(0.0f), _currentTemp(0.0f), _currentLight(0.0f), _isFanOn(false) {
    // Constructor initializes pointer to null, outputs to 0 (OFF state), sensor values to 0, and fan state to OFF
}

FuzzyController::~FuzzyController() {
    // Clean up allocated memory
    delete _fuzzy; // Deleting _fuzzy should cascade delete inputs, outputs, rules, sets if managed correctly by eFLL (check lib docs if issues)
    // Manually delete sets if not handled by ~Fuzzy() - Best practice to delete them here
    delete tempCold;
    delete tempOptimal;
    delete tempHot;
    delete humidityDry;
    delete humidityOptimal;
    delete humidityHumid;
    delete lightDark;
    delete lightAdequate;
    // Delete the new distinct sets
    delete fanOff;
    delete fanOn;
    delete lightOff;
    delete lightOn;
}

void FuzzyController::begin() {
    Serial.println("[FuzzyController] Initializing...");
    _fuzzy = new Fuzzy();

    defineInputs();
    defineOutputs();
    defineRules();
    Serial.println("[FuzzyController] Initialization complete.");
}

void FuzzyController::defineInputs() {
    // Input 1: Average Temperature
    FuzzyInput* avgTemp = new FuzzyInput(1);
    avgTemp->addFuzzySet(tempCold);
    avgTemp->addFuzzySet(tempOptimal);
    avgTemp->addFuzzySet(tempHot);
    _fuzzy->addFuzzyInput(avgTemp);

    // Input 2: Average Humidity
    FuzzyInput* avgHumidity = new FuzzyInput(2);
    avgHumidity->addFuzzySet(humidityDry);
    avgHumidity->addFuzzySet(humidityOptimal);
    avgHumidity->addFuzzySet(humidityHumid);
    _fuzzy->addFuzzyInput(avgHumidity);

    // Input 3: Average Light
    FuzzyInput* avgLight = new FuzzyInput(3);
    avgLight->addFuzzySet(lightDark);
    avgLight->addFuzzySet(lightAdequate);
    _fuzzy->addFuzzyInput(avgLight);
}

void FuzzyController::defineOutputs() {
    // Output 1: Fan State
    FuzzyOutput* fanState = new FuzzyOutput(1);
    fanState->addFuzzySet(fanOff); // Use distinct set for FAN_OFF
    fanState->addFuzzySet(fanOn);  // Use distinct set for FAN_ON
    _fuzzy->addFuzzyOutput(fanState);

    // Output 2: Light State
    FuzzyOutput* lightState = new FuzzyOutput(2);
    lightState->addFuzzySet(lightOff); // Use distinct set for LIGHTS_OFF
    lightState->addFuzzySet(lightOn);  // Use distinct set for LIGHTS_ON
    _fuzzy->addFuzzyOutput(lightState);
}

void FuzzyController::defineRules() {
    // --- Fan Control Rules ---
    // Rule 1: IF avgTemp IS HOT THEN Fan IS FAN_ON
    FuzzyRuleAntecedent* ifTempHot = new FuzzyRuleAntecedent();
    ifTempHot->joinSingle(tempHot);
    FuzzyRuleConsequent* thenFanOn1 = new FuzzyRuleConsequent();
    thenFanOn1->addOutput(fanOn); // Use fanOn set
    FuzzyRule* fuzzyRule01 = new FuzzyRule(1, ifTempHot, thenFanOn1);
    _fuzzy->addFuzzyRule(fuzzyRule01);

    // Rule 2: IF avgHumidity IS HUMID THEN Fan IS FAN_ON
    FuzzyRuleAntecedent* ifHumidityHumid = new FuzzyRuleAntecedent();
    ifHumidityHumid->joinSingle(humidityHumid);
    FuzzyRuleConsequent* thenFanOn2 = new FuzzyRuleConsequent();
    thenFanOn2->addOutput(fanOn); // Use fanOn set
    FuzzyRule* fuzzyRule02 = new FuzzyRule(2, ifHumidityHumid, thenFanOn2);
    _fuzzy->addFuzzyRule(fuzzyRule02);

    // Rule 3: IF avgTemp IS OPTIMAL AND avgHumidity IS OPTIMAL THEN Fan IS FAN_OFF
    FuzzyRuleAntecedent* ifTempOptimalAndHumidityOptimal = new FuzzyRuleAntecedent();
    ifTempOptimalAndHumidityOptimal->joinWithAND(tempOptimal, humidityOptimal);
    FuzzyRuleConsequent* thenFanOff1 = new FuzzyRuleConsequent();
    thenFanOff1->addOutput(fanOff); // Use fanOff set
    FuzzyRule* fuzzyRule03 = new FuzzyRule(3, ifTempOptimalAndHumidityOptimal, thenFanOff1);
    _fuzzy->addFuzzyRule(fuzzyRule03);

    // Rule 4: IF avgTemp IS COLD THEN Fan IS FAN_OFF
    FuzzyRuleAntecedent* ifTempCold = new FuzzyRuleAntecedent();
    ifTempCold->joinSingle(tempCold);
    FuzzyRuleConsequent* thenFanOff2 = new FuzzyRuleConsequent();
    thenFanOff2->addOutput(fanOff); // Use fanOff set
    FuzzyRule* fuzzyRule04 = new FuzzyRule(4, ifTempCold, thenFanOff2);
    _fuzzy->addFuzzyRule(fuzzyRule04);

    // --- Light Control Rules ---
    // Rule 5: IF avgLight IS DARK_FOR_WORK THEN Light IS LIGHTS_ON
    FuzzyRuleAntecedent* ifLightDark = new FuzzyRuleAntecedent();
    ifLightDark->joinSingle(lightDark);
    FuzzyRuleConsequent* thenLightOn = new FuzzyRuleConsequent();
    thenLightOn->addOutput(lightOn); // Use lightOn set
    FuzzyRule* fuzzyRule05 = new FuzzyRule(5, ifLightDark, thenLightOn);
    _fuzzy->addFuzzyRule(fuzzyRule05);

    // Rule 6: IF avgLight IS ADEQUATE_FOR_WORK THEN Light IS LIGHTS_OFF
    FuzzyRuleAntecedent* ifLightAdequate = new FuzzyRuleAntecedent();
    ifLightAdequate->joinSingle(lightAdequate);
    FuzzyRuleConsequent* thenLightOff = new FuzzyRuleConsequent();
    thenLightOff->addOutput(lightOff); // Use lightOff set
    FuzzyRule* fuzzyRule06 = new FuzzyRule(6, ifLightAdequate, thenLightOff);
    _fuzzy->addFuzzyRule(fuzzyRule06);
}


void FuzzyController::setInputs(float avgTemp, float avgHumidity, float avgLight) {
    if (!_fuzzy) {
        Serial.println("[FuzzyController] ERROR: Fuzzy system not initialized!");
        return;
    }
    // Store current sensor values for use in run() method
    _currentTemp = avgTemp;
    _currentLight = avgLight;
    
    // Set crisp values for each input (Input numbers match definition order: 1=Temp, 2=Humidity, 3=Light)
    _fuzzy->setInput(1, avgTemp);
    _fuzzy->setInput(2, avgHumidity);
    _fuzzy->setInput(3, avgLight);
     // Serial.printf("[FuzzyController] Inputs set: Temp=%.1f, Hum=%.1f, Light=%.1f\n", avgTemp, avgHumidity, avgLight);
}

void FuzzyController::run() {
    if (!_fuzzy) {
        Serial.println("[FuzzyController] ERROR: Fuzzy system not initialized!");
        return;
    }
    
    // Fuzzify inputs based on current values
    _fuzzy->fuzzify();

    // --- Calculate and store membership degrees for debugging ---
    // Temperature (Input 1)
    _tempMembership[0] = tempCold->getPertinence();    // Cold
    _tempMembership[1] = tempOptimal->getPertinence(); // Optimal
    _tempMembership[2] = tempHot->getPertinence();     // Hot
    // Humidity (Input 2)
    _humidityMembership[0] = humidityDry->getPertinence();     // Dry
    _humidityMembership[1] = humidityOptimal->getPertinence(); // Optimal
    _humidityMembership[2] = humidityHumid->getPertinence();   // Humid
    // Light (Input 3)
    _lightMembership[0] = lightDark->getPertinence();      // Dark
    _lightMembership[1] = lightAdequate->getPertinence();  // Adequate
    
    // Defuzzify outputs (Output numbers match definition order: 1=Fan, 2=Light)
    // Using Centroid method as default for eFLL
    _crispFanOutput = _fuzzy->defuzzify(1);
    _crispLightOutput = _fuzzy->defuzzify(2);

    // Debug output for critical temperature threshold monitoring
    // Store the current temperature during setInputs for access here
    if (_currentTemp >= 28.0 && _currentTemp <= 31.0) {
        Serial.printf("[FuzzyController] TEMP THRESHOLD: Temp=%.1f, Optimal=%.2f, Hot=%.2f, Fan Output=%.2f\n", 
                     _currentTemp, _tempMembership[1], _tempMembership[2], _crispFanOutput);
    }
    
    // Debug output for light intensity control - focus on critical regions
    if (_currentLight >= 100.0 && _currentLight <= 400.0) {
        Serial.printf("[FuzzyController] LIGHT: %.1f lux, Dark=%.2f, Adequate=%.2f | ON at >%.1f, OFF at <%.1f\n", 
                     _currentLight, _lightMembership[0], _lightMembership[1], 0.7f, 0.3f);
    }
    // Serial.printf("[FuzzyController] Outputs: Fan=%.2f, Light=%.2f\n", _crispFanOutput, _crispLightOutput);
}

bool FuzzyController::getFanOutput() const {
    // Precise fan control based on temperature thresholds
    // The membership functions ensure crisp output is:
    // - Higher when temperature is >= 30°C (tempHot is active)
    // - Lower when temperature is <= 29°C (tempOptimal is active)
    const float ON_THRESHOLD = 0.9f; // Adjusted for precise control at 30°C boundary
    const float OFF_THRESHOLD = 0.1f; // Adjusted to make sure fan turns off at 29°C

    // Using temperature membership values directly
    if (_isFanOn) {
        // If fan is currently ON, turn OFF only if hot membership drops below threshold
        if (_crispFanOutput <= OFF_THRESHOLD) {
            _isFanOn = false;
        }
    } else {
        // If fan is currently OFF, turn ON only if hot membership exceeds threshold
        if (_crispFanOutput > ON_THRESHOLD) {
            _isFanOn = true;
        }
    }

    return _isFanOn;
}

bool FuzzyController::getLightOutput() const {
    // Direct control based on membership in "DARK" fuzzy set
    // This ensures light turns on when dark membership is high (low light conditions)
    // and turns off when dark membership is low (adequate light conditions)
    static bool isLightOn = false;
    
    // Set thresholds for hysteresis (different thresholds for ON and OFF to prevent oscillation)
    // These thresholds correspond to approximately:
    // - Turn ON at ~150 lux (darkness membership ~0.8)
    // - Turn OFF at ~350 lux (darkness membership ~0.2)  
    const float ON_THRESHOLD = 0.9f;   // Turn light ON when darkness membership > 70%
    const float OFF_THRESHOLD = 0.1f;  // Turn light OFF when darkness membership < 30%
    
    // Directly use the dark membership value instead of defuzzified output
    float darkMembership = _lightMembership[0];
    
    if (isLightOn) {
        // Light is currently ON, only turn OFF if darkness drops below threshold
        if (darkMembership < OFF_THRESHOLD) {
            isLightOn = false;
            Serial.printf("[Light Control] OFF at %.1f lux (dark=%.2f < %.2f)\n", 
                         _currentLight, darkMembership, OFF_THRESHOLD);
        }
    } else {
        // Light is currently OFF, only turn ON if darkness exceeds threshold
        if (darkMembership > ON_THRESHOLD) {
            isLightOn = true;
            Serial.printf("[Light Control] ON at %.1f lux (dark=%.2f > %.2f)\n", 
                         _currentLight, darkMembership, ON_THRESHOLD);
        }
    }
    
    return isLightOn;
}
