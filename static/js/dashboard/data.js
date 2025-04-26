// Manages fetching sensor data and updating the application state and UI

import { SystemMonitor } from './state.js';
import { UI } from './ui.js';

export const DataManager = {
    latestDataPayload: null, // Store the last valid data payload
    debug: false, // Enable debug logging if needed

    log(...args) {
        if (this.debug) console.log('[DataManager]', ...args);
    },

    // fetchData function is no longer used with WebSockets
    /*
    async fetchData() {
        try {
            this.log('Fetching sensor data...');
            const response = await fetch('/api/sensor/data');
            this.log('Response status:', response.status);

            if (response.status === 404) {
                this.log('No data available from sensors (404)');
                return null; // Treat 404 as no data available
            }
            if (!response.ok) {
                console.error(`Server error fetching data: ${response.status}`);
                return null; // Return null on server errors
            }
            const data = await response.json();
            this.log('Received data:', data);
            // Basic validation: check if sections exist
            if (!data || typeof data.sections !== 'object') {
                 console.error('Invalid data format received:', data);
                 return null;
            }
            this.latestDataPayload = data; // Store the valid data
            return data;
        } catch (error) {
            console.error('Network error fetching sensor data:', error);
            this.latestDataPayload = null; // Clear on error
            return null; // Treat network errors as no data available
        }
    },
    */

    // Getter for the UI module to access the latest data for threshold checks
    getLatestData() {
        return this.latestDataPayload;
    },

    // This function orchestrates updates based on fetched data
    updateDashboard(data) {
        this.log('Updating dashboard with data:', data);

        // If data is null (fetch error, 404, or invalid format), update connection status and summary
        if (data === null) {
            // Don't clear latestDataPayload here, keep last known good state for UI checks if needed?
            // Or maybe clear it? Let's clear it for now to avoid showing stale warnings.
            // this.latestDataPayload = null; // Decided against clearing here, let UI handle display based on connection status
            SystemMonitor.updateConnectionStatus(false); // Mark as disconnected
            UI.updateStatusSummary(); // Update summary to show disconnected state
            // UI.resetDisplay(); // Optionally reset all values on error
            return;
        }

        // We have valid data
        SystemMonitor.updateNodeStatus(data); // Update internal node/sensor status first
        SystemMonitor.updateConnectionStatus(true); // Mark as connected

        // Update gauges with averages
        if (data.averages) {
            this.log('Updating gauges with averages:', data.averages);
            UI.updateGauge('temperature-gauge', data.averages.temp, 50, '#286247');
            UI.updateGauge('humidity-gauge', data.averages.humidity, 100, '#333333');
            // Assuming max light is 10000 lux for the gauge scale
            UI.updateGauge('light-gauge', data.averages.light, 10000, '#F9D949');
        } else {
             // Reset gauges if averages are missing in valid data (unlikely but possible)
             UI.updateGauge('temperature-gauge', null, 50, '#ccc');
             UI.updateGauge('humidity-gauge', null, 100, '#ccc');
             UI.updateGauge('light-gauge', null, 10000, '#ccc');
        }

        // Update each section's display using the UI module
        // Iterate over the sections defined in the SystemMonitor state
        Object.keys(SystemMonitor.status.nodes).forEach(section => {
            const values = data.sections[section]; // Get data for this section if present
            const nodeIsOnline = SystemMonitor.status.nodes[section]?.online; // Check current state

            if (nodeIsOnline && values) {
                this.log(`Updating online section ${section} UI`);
                // Iterate over sensor types defined in the SystemMonitor state for this section
                Object.keys(SystemMonitor.status.nodes[section].sensors).forEach(type => {
                    UI.updateSectionDisplay(
                        section,
                        type,
                        values[type],
                        values.trends ? values.trends[type] : 'equals'
                    );
                });
            } else {
                // Node is offline or section data missing, reset its UI
                this.log(`Section ${section} is offline or missing data, resetting UI`);
                // Iterate over sensor types defined in the SystemMonitor state for this section
                Object.keys(SystemMonitor.status.nodes[section].sensors).forEach(type => {
                    UI.updateSectionDisplay(section, type, null, null);
                });
            }
        });

        // Update the overall status summary at the end
        UI.updateStatusSummary();
        // Update the controls UI (switches and mode indicators)
        UI.updateControlsUI();
    }
};
