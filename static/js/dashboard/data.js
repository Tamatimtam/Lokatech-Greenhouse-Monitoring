// File: /simpleLogin/static/js/dashboard/data.js
// Manages fetching sensor data and updating the application state and UI

import { SystemMonitor } from './state.js';
import { UI } from './ui.js';
import { SENSOR_TYPES } from './config.js'; // Import SENSOR_TYPES for fallback

export const DataManager = {
    latestDataPayload: null, // Store the last valid data payload
    debug: false, // Enable debug logging if needed

    log(...args) {
        if (this.debug) console.log('[DataManager]', ...args);
    },

    // Getter for the UI module to access the latest data for threshold checks
    getLatestData() {
        return this.latestDataPayload;
    },

    // This function orchestrates updates based on fetched data
    updateDashboard(data) {
        this.log('Updating dashboard with data:', data);

        if (data === null) {
            SystemMonitor.updateConnectionStatus(false); 
            UI.updateStatusSummary(); 
            return;
        }

        this.latestDataPayload = data;
        
        SystemMonitor.updateNodeStatus(data); 
        SystemMonitor.updateConnectionStatus(true); 

        // Apply 10-point increase to 'dewasa lux' and 'cahaya rata2' if not 0
        if (data.sections && data.sections.dewasa && data.sections.dewasa.light !== undefined && data.sections.dewasa.light !== null && data.sections.dewasa.light !== 0) {
            data.sections.dewasa.light += 10;
            this.log('Applied 10-point increase to dewasa lux. New value:', data.sections.dewasa.light);
        }

        if (data.averages) {
            // Apply 10-point increase to average light if it exists and is not 0
            if (data.averages.light !== undefined && data.averages.light !== null && data.averages.light !== 0) {
                data.averages.light += 10;
                this.log('Applied 10-point increase to average light. New value:', data.averages.light);
            }
            this.log('Updating gauges with averages:', data.averages);
            UI.updateGauge('temperature-gauge', data.averages.temp, 50, '#286247');
            UI.updateGauge('humidity-gauge', data.averages.humidity, 100, '#333333');
            UI.updateGauge('light-gauge', data.averages.light, 10000, '#F9D949');
        } else {
             UI.updateGauge('temperature-gauge', null, 50, '#ccc');
             UI.updateGauge('humidity-gauge', null, 100, '#ccc');
             UI.updateGauge('light-gauge', null, 10000, '#ccc');
        }

        Object.keys(SystemMonitor.status.nodes).forEach(section => {
            const values = data.sections && typeof data.sections === 'object' ? data.sections[section] : undefined; 
            const nodeStatus = SystemMonitor.status.nodes[section]; 

            // Enhanced check for nodeStatus and its properties
            if (nodeStatus && typeof nodeStatus === 'object' && nodeStatus.hasOwnProperty('online') && nodeStatus.online && values && typeof values === 'object') {
                this.log(`Updating online section ${section} UI`);

                if (nodeStatus.sensors && typeof nodeStatus.sensors === 'object') {
                    Object.keys(nodeStatus.sensors).forEach(type => {
                        const sensorIsWorking = nodeStatus.sensors[type]; 
                        UI.updateSectionDisplay(
                            section,
                            type,
                            // Ensure values[type] exists before trying to access it
                            (sensorIsWorking && values.hasOwnProperty(type)) ? values[type] : null, 
                            // Ensure values.trends and values.trends[type] exist
                            (values.trends && typeof values.trends === 'object' && values.trends.hasOwnProperty(type)) ? values.trends[type] : 'equals'
                        );
                    });
                } else {
                    // This case indicates an issue with SystemMonitor.status.nodes[section].sensors not being an object
                    this.log(`Error: nodeStatus.sensors is not an object for section ${section}. Resetting UI for this section's sensors.`);
                    SENSOR_TYPES.forEach(typeKey => { // Use SENSOR_TYPES imported from config
                        UI.updateSectionDisplay(section, typeKey, null, null);
                    });
                }
            } else { 
                this.log(`Section ${section} is offline or data for it is missing/invalid, resetting UI`);
                // Fallback to reset sensors of this section
                let sensorsToResetKeys = [];
                if (nodeStatus && nodeStatus.sensors && typeof nodeStatus.sensors === 'object') {
                    sensorsToResetKeys = Object.keys(nodeStatus.sensors);
                } else {
                    // If nodeStatus.sensors is not even an object, use default SENSOR_TYPES
                    sensorsToResetKeys = SENSOR_TYPES;
                }
                
                sensorsToResetKeys.forEach(typeKey => {
                    UI.updateSectionDisplay(section, typeKey, null, null);
                });
            }
        });

        UI.updateStatusSummary();
        UI.updateControlsUI();
    }
};
