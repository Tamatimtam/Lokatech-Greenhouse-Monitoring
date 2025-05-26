// Manages the connection status and node/sensor health

import { SECTIONS, SENSOR_TYPES, CONNECTION_TIMEOUT_DURATION } from './config.js';
import { UI } from './ui.js'; 

export const SystemMonitor = {
    connectionTimeout: null,
    lastUpdateTime: null,
    status: {
        connected: false,
        // masterNode status might now refer to the Remaja node's MQTT connection status implicitly
        // or can be explicitly set if Remaja node sends a specific "i'm master" signal.
        // For now, 'connected' implies master (Remaja) is connected to MQTT and sending data.
        masterNode: false, // Will be true if 'remaja' section has data and system is connected
        nodes: {
            penyemaian: { online: false, sensors: { temp: false, humidity: false, light: false } }, // Backend key: penyemaian
            remaja: { online: false, sensors: { temp: false, humidity: false, light: false } },     // Backend key: remaja
            dewasa: { online: false, sensors: { temp: false, humidity: false, light: false } }
        },
        actuators: { // Actuators on Remaja (Master)
            fan: { state: null, mode: 'auto' }, 
            light: { state: null, mode: 'auto' }
        }
    },

    startConnectionTimeout() {
        this.clearConnectionTimeout();
        this.connectionTimeout = setTimeout(() => {
            console.warn(`Connection timeout: No data received for ${CONNECTION_TIMEOUT_DURATION/1000} seconds.`);
            this.updateConnectionStatus(false); 
            UI.resetDisplay();
            UI.updateStatusSummary();
            UI.showError("Koneksi ke hardware (Remaja Node) terputus. Menunggu data..."); 
        }, CONNECTION_TIMEOUT_DURATION);
    },

    clearConnectionTimeout() {
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
    },

    updateConnectionStatus(connected) {
        this.lastUpdateTime = Date.now(); 
        
        if (this.status.connected !== connected) {
            this.status.connected = connected;
            UI.updateConnectionStatusUI(connected); 

            if (connected) {
                UI.hideError(); 
                this.startConnectionTimeout();
            } else {
                this.clearConnectionTimeout();
                UI.resetDisplay(); // Reset UI elements to default/offline state
                UI.updateStatusSummary(); // Update summary to reflect disconnection
                // Error message is usually set by the caller (e.g. timeout handler, socket disconnect)
            }
        } else if (connected) {
             this.startConnectionTimeout(); // Restart timeout if already connected and new data/ping arrives
        }
        // Update masterNode status based on 'remaja' node's presence and overall connection
        this.status.masterNode = connected && this.status.nodes.remaja?.online;
    },

    updateNodeStatus(data) {
        this.startConnectionTimeout(); // Data received, reset timeout

        if (!data || !data.sections) {
            console.warn("updateNodeStatus called with invalid data format.");
             // Mark all nodes as offline if data.sections is missing
            SECTIONS.forEach(section => {
                if (this.status.nodes[section]) {
                    this.status.nodes[section].online = false;
                    SENSOR_TYPES.forEach(type => {
                        this.status.nodes[section].sensors[type] = false;
                    });
                }
            });
            this.status.masterNode = false;
            return false;
        }


        SECTIONS.forEach(section => {
            if (!this.status.nodes[section]) { // Should not happen if SECTIONS and status.nodes are aligned
                console.warn(`Section ${section} not found in SystemMonitor.status.nodes`);
                return;
            }

            const sectionPayload = data.sections[section];
            // Node is online if the section key exists in payload and has at least one non-null sensor value
            // AND that value is not 0 for temp/humidity
            let nodeHasAnyValidData = false;

            if (sectionPayload) {
                SENSOR_TYPES.forEach(type => {
                    const sensorValue = sectionPayload[type];
                    let isSensorWorking = sensorValue !== null && sensorValue !== undefined;

                    if (type === 'temp' || type === 'humidity' || type === 'light') { // Added 'light'
                        if (sensorValue === 0) {
                            isSensorWorking = false; // Treat 0 as not working for temp, humidity, and light
                        }
                    }
                    
                    this.status.nodes[section].sensors[type] = isSensorWorking;
                    if (isSensorWorking) {
                        nodeHasAnyValidData = true;
                    }
                });
            } else {
                 SENSOR_TYPES.forEach(type => {
                    this.status.nodes[section].sensors[type] = false;
                });
            }
            this.status.nodes[section].online = nodeHasAnyValidData;
        });

        this.status.masterNode = this.status.nodes.remaja.online && this.status.connected;

        if (data.actuators) {
            if (data.actuators.fan) {
                this.status.actuators.fan.state = data.actuators.fan.state;
                this.status.actuators.fan.mode = data.actuators.fan.mode || 'auto';
            }
            if (data.actuators.light) {
                this.status.actuators.light.state = data.actuators.light.state;
                this.status.actuators.light.mode = data.actuators.light.mode || 'auto';
            }
        } else {
            this.status.actuators.fan = { state: null, mode: 'auto' };
            this.status.actuators.light = { state: null, mode: 'auto' };
        }
        return true;
    }
};
