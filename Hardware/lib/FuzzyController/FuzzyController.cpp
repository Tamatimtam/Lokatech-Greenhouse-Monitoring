#include "FuzzyController.h"
#include <Arduino.h> // For Serial printing (optional debugging)
#include <Fuzzy.h>   // Include the fuzzy logic library

// --- Define Membership Functions based on new.md ---

// Temperature Input Sets (Range: 20-35°C)
// COLD: Trapezoidal, 100% from 20-24, dropping to 0 at 27
FuzzySet* tempCold = new FuzzySet(20, 20, 24, 27); 
// OPTIMAL: Trapezoidal, 100% from 27-29, dropping to 0 at 25 and 31
FuzzySet* tempOptimal = new FuzzySet(25, 27, 29, 31);
// HOT: Trapezoidal, 100% from 32-35, dropping to 0 at 30
FuzzySet* tempHot = new FuzzySet(30, 32, 35, 35);

// Humidity Input Sets (Range: 20-100%)
// DRY: Trapezoidal, 100% below 70, zero above 80
FuzzySet* humidityDry = new FuzzySet(20, 70, 70, 80); // Assuming range starts at 20
// OPTIMAL: Peak at 85, Zero at 75 and 95
FuzzySet* humidityOptimal = new FuzzySet(75, 85, 85, 95);
// HUMID: Trapezoidal, zero below 90, 100% above 95
FuzzySet* humidityHumid = new FuzzySet(90, 95, 95, 100); // Assuming range ends at 100

// Light Input Sets (Range: 0-1000+ lux, focus on 0-300 for work)
// DARK_FOR_WORK: Trapezoidal, 100% below 100, zero above 200
FuzzySet* lightDark = new FuzzySet(0, 100, 100, 200); // Note: (0, 0, 100, 200) would better match "100% below 100"
// ADEQUATE_FOR_WORK: Trapezoidal, zero below 150, 100% above 250
FuzzySet* lightAdequate = new FuzzySet(150, 250, 10000, 10000); // Corrected: Stays 1 from 250 up to 10000+ lux

// Output Sets (Simple ON/OFF representation, Range 0-1)
// Using narrow triangular sets around 0 (OFF) and 1 (ON) for each output
FuzzySet* fanOff = new FuzzySet(0, 0, 0, 0.1); 
FuzzySet* fanOn = new FuzzySet(0.9, 1, 1, 1);
FuzzySet* lightOff = new FuzzySet(0, 0, 0, 0.1); 
FuzzySet* lightOn = new FuzzySet(0.9, 1, 1, 1);

// --- FuzzyController Class Implementation ---

FuzzyController::FuzzyController() : _fuzzy(nullptr), _crispFanOutput(0.0f), _crispLightOutput(0.0f) {
    // Constructor initializes pointer to null and outputs to 0 (OFF state)
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

    // Serial.printf("[FuzzyController] Outputs: Fan=%.2f, Light=%.2f\n", _crispFanOutput, _crispLightOutput);
}

bool FuzzyController::getFanOutput() const {
    // Simple thresholding: if defuzzified value is closer to 1 (ON) than 0 (OFF)
    return (_crispFanOutput > 0.5f); 
}

bool FuzzyController::getLightOutput() const {
    // Simple thresholding
    return (_crispLightOutput > 0.5f);
}
