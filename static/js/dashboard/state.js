// Manages the connection status and node/sensor health

import { SECTIONS, SENSOR_TYPES, CONNECTION_TIMEOUT_DURATION } from './config.js';
import { UI } from './ui.js'; // Import UI module

export const SystemMonitor = {
    connectionTimeout: null,
    lastUpdateTime: null,
    status: {
        connected: false,
        masterNode: false,
        nodes: {
            penyemaian: { online: false, sensors: { temp: false, humidity: false, light: false } },
            peremajaan: { online: false, sensors: { temp: false, humidity: false, light: false } },
            dewasa: { online: false, sensors: { temp: false, humidity: false, light: false } }
        },
        // Add state for actuators
        actuators: {
            fan: { state: null, mode: 'auto' }, // state: true/false/null, mode: 'auto'/'manual'
            light: { state: null, mode: 'auto' }
        }
    },

    updateConnectionStatus(connected) {
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
        }
        this.lastUpdateTime = Date.now();
        this.status.connected = connected;
        UI.updateConnectionStatusUI(connected); // Call UI function

        if (connected) {
            UI.hideError(); // Call UI function
        }

        // Set timeout for connection loss detection
        this.connectionTimeout = setTimeout(() => {
            // Check if still marked connected AND time elapsed > timeout duration
            if (this.status.connected && (Date.now() - this.lastUpdateTime) > (CONNECTION_TIMEOUT_DURATION - 500)) { // Check slightly before timeout fires
                console.warn(`Connection timeout triggered. Last update: ${this.lastUpdateTime}`);
                this.status.connected = false; // Ensure status is false
                UI.updateConnectionStatusUI(false); // Update UI
                UI.showError("Koneksi ke jaringan ESP terputus - Tidak ada data yang diterima"); // Call UI function
                UI.resetDisplay(); // Call UI function
            }
        }, CONNECTION_TIMEOUT_DURATION);
    },

    updateNodeStatus(data) {
        if (!data || !data.sections) return false;

        SECTIONS.forEach(section => {
            if (!this.status.nodes[section]) return;

            const values = data.sections[section];
            // Node is online if the section exists and has at least one non-null sensor value
            const hasValidData = values && (values.temp !== null || values.humidity !== null || values.light !== null);

            this.status.nodes[section].online = hasValidData;

            if (hasValidData) {
                // Update individual sensor status only if node is online
                SENSOR_TYPES.forEach(type => {
                    this.status.nodes[section].sensors[type] = values[type] !== null;
                });
            } else {
                // If node is offline, all its sensors are considered offline
                SENSOR_TYPES.forEach(type => {
                    this.status.nodes[section].sensors[type] = false;
                });
            }
        });

        // Master node status depends on 'dewasa' node status
        this.status.masterNode = this.status.nodes.dewasa.online;

        // Update actuator status if present in data
        if (data.actuators) {
            if (data.actuators.fan) {
                this.status.actuators.fan.state = data.actuators.fan.state;
                this.status.actuators.fan.mode = data.actuators.fan.mode || 'auto'; // Default to auto if mode missing
            }
            if (data.actuators.light) {
                this.status.actuators.light.state = data.actuators.light.state;
                this.status.actuators.light.mode = data.actuators.light.mode || 'auto'; // Default to auto if mode missing
            }
        } else {
            // Reset if actuators data is missing from payload
            this.status.actuators.fan.state = null;
            this.status.actuators.fan.mode = 'auto';
            this.status.actuators.light.state = null;
            this.status.actuators.light.mode = 'auto';
        }

        return true;
    }
};
