// MOCK VERSION of dashboard.js - Generates simulated data

// System status tracking (Simplified for Mock)
const SystemMonitor = {
    status: {
        connected: true, // Always connected in mock mode
        masterNode: true, // Assume master is online
        nodes: {
            penyemaian: { online: true, sensors: { temp: true, humidity: true, light: true } }, // Backend key: penyemaian
            remaja: { online: true, sensors: { temp: true, humidity: true, light: true } },     // Backend key: remaja
            dewasa: { online: true, sensors: { temp: true, humidity: true, light: true } }
        }
    },

    // Update the connection status (Always true in mock)
    updateConnectionStatus(connected) {
        this.status.connected = true; // Force true
        UI.updateConnectionStatusUI(this.status.connected);
        UI.hideError(); // Always hide error in mock
    },

    // Update node and sensor status based on generated mock data
    updateNodeStatus(data) {
        if (!data || !data.sections) return false;

        // Reset statuses (though they'll likely be set to true)
        Object.keys(this.status.nodes).forEach(section => {
            this.status.nodes[section].online = false;
            Object.keys(this.status.nodes[section].sensors).forEach(sensor => {
                this.status.nodes[section].sensors[sensor] = false;
            });
        });

        // Update with mock data status (check for nulls)
        for (const [section, values] of Object.entries(data.sections)) {
            if (!this.status.nodes[section]) continue;

            const hasAnyData = values && (values.temp !== null || values.humidity !== null || values.light !== null);
            this.status.nodes[section].online = hasAnyData; // Online if any sensor has data

            if (hasAnyData) {
                this.status.nodes[section].sensors.temp = values.temp !== null;
                this.status.nodes[section].sensors.humidity = values.humidity !== null;
                this.status.nodes[section].sensors.light = values.light !== null;
            } else {
                 // Reset sensor status if node is offline
                 this.status.nodes[section].sensors.temp = false;
                 this.status.nodes[section].sensors.humidity = false;
                 this.status.nodes[section].sensors.light = false;
            }
        }
        this.status.masterNode = this.status.nodes.dewasa.online;
        return true;
    }
};

// UI Management (Copied from dashboard.js - no changes needed)
const UI = {
    elements: {
        connectionStatus: null,
        connectionText: null,
        connectionIcon: null,
        systemError: null,
        errorMessage: null,
        statusContainer: null
    },

    initialize() {
        this.elements.connectionStatus = document.getElementById('connection-status');
        this.elements.connectionText = this.elements.connectionStatus.querySelector('span');
        this.elements.connectionIcon = this.elements.connectionStatus.querySelector('i');
        this.elements.systemError = document.getElementById('system-error');
        this.elements.errorMessage = document.getElementById('error-message');
        this.elements.statusContainer = document.getElementById('status-container');
        this.initializeControls();
    },

    updateConnectionStatusUI(connected) {
        this.elements.connectionStatus.className = connected ? 'connection-status online' : 'connection-status offline';
        this.elements.connectionIcon.className = connected ? 'fas fa-check-circle' : 'fas fa-circle-exclamation';
        this.elements.connectionText.textContent = connected ? 'Sistem IoT Terhubung (MOCK)' : 'Sistem IoT Tidak terhubung'; // Added (MOCK)
    },

    showError(message) { /* Don't show errors in mock mode */ },
    hideError() { this.elements.systemError.style.display = 'none'; },

    resetDisplay() { /* Initial reset might still be useful */
        ['temperature-gauge', 'humidity-gauge'].forEach(id => { this.updateGauge(id, null, 100, '#ccc'); });
        this.updateGauge('light-gauge', null, 10000, '#ccc');
        const sections = ['penyemaian', 'remaja', 'dewasa']; // Backend keys
        const types = ['temp', 'humidity', 'light'];
        sections.forEach(section => {
            types.forEach(type => {
                const elements = document.querySelectorAll(`[data-section="${section}"][data-type="${type}"]`);
                elements.forEach(el => {
                    el.querySelector('.section-value').textContent = '--';
                    el.querySelector('.section-indicator i').className = 'fas fa-minus';
                    el.classList.add('sensor-offline');
                });
            });
        });
        this.updateStatusSummary();
    },

    updateGauge(id, value, max, color) {
        const gaugeElement = document.getElementById(id);
        if (!gaugeElement) return;
        const circle = gaugeElement.querySelector('.svg-circle');
        const valueDisplay = gaugeElement.querySelector('.value');
        if (id === 'light-gauge' && value !== null && value !== undefined) {
            valueDisplay.textContent = value.toLocaleString();
        } else {
            valueDisplay.textContent = value !== null && value !== undefined ? value : '--';
        }
        if (value !== null && value !== undefined) {
            circle.style.stroke = color;
            const circumference = 2 * Math.PI * 54;
            const offset = circumference - ((value / max) * circumference);
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = offset;
        } else {
            circle.style.stroke = '#ccc';
            circle.style.strokeDashoffset = 2 * Math.PI * 54;
        }
    },

    updateSectionValue(section, type, value, trend) {
        const elements = document.querySelectorAll(`[data-section="${section}"][data-type="${type}"]`);
        elements.forEach(el => {
            if (value !== null && value !== undefined && trend) {
                if (type === 'light') {
                    el.querySelector('.section-value').textContent = value.toLocaleString() ;
                } else {
                    el.querySelector('.section-value').textContent = value;
                }
                el.querySelector('.section-indicator i').className = `fas fa-${trend}`;
                el.classList.remove('sensor-error', 'sensor-offline');
            } else {
                el.querySelector('.section-value').textContent = '--';
                el.querySelector('.section-indicator i').className = 'fas fa-circle-exclamation';
                el.classList.add('sensor-error');
            }
        });
    },

    updateStatusSummary() {
        const status = SystemMonitor.status;
        this.elements.statusContainer.innerHTML = '';

        // Check offline nodes (less likely in mock, but check anyway)
        const offlineNodes = Object.entries(status.nodes)
            .filter(([_, status]) => !status.online)
            .map(([section, _]) => this.translateSection(section));
        if (offlineNodes.length > 0) {
            this.elements.statusContainer.innerHTML += `<div class="status-item"><i class="fas fa-circle-exclamation" style="color: #e74c3c"></i><span>Node ${offlineNodes.join(', ')} offline</span></div>`;
        }

        // Check sensor status for online nodes
        Object.entries(status.nodes).forEach(([section, nodeStatus]) => {
            if (nodeStatus.online) {
                const failedSensors = Object.entries(nodeStatus.sensors)
                    .filter(([_, working]) => !working)
                    .map(([sensor, _]) => this.translateSensor(sensor));
                if (failedSensors.length > 0) {
                    this.elements.statusContainer.innerHTML += `<div class="status-item"><i class="fas fa-triangle-exclamation" style="color: #f39c12"></i><span>Sensor ${failedSensors.join(', ')} di ${this.translateSection(section)} bermasalah</span></div>`;
                }
            }
        });

        // All good
        if (this.elements.statusContainer.innerHTML === '') {
            this.elements.statusContainer.innerHTML = `<div class="status-item"><i class="fas fa-check-circle" style="color: #27ae60"></i><span>Semua sistem bekerja normal (MOCK)</span></div>`;
        }
    },

    translateSection(section) { /* ... (same as original) ... */
        const translations = { penyemaian: 'Peremajaan', remaja: 'Meja Apung', dewasa: 'Dewasa' }; // Frontend: Peremajaan (Backend/HW: penyemaian), Frontend: Meja Apung (Backend/HW: remaja)
        return translations[section] || section; // section is backend key
    },
    translateSensor(sensor) { /* ... (same as original) ... */
        const translations = { temp: 'suhu', humidity: 'kelembapan', light: 'cahaya' };
        return translations[sensor] || sensor;
    },
    initializeControls() { /* ... (same as original) ... */
        ['fan-switch', 'lights-switch'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', function() {
                    // Allow control toggling in mock mode for visual feedback
                    console.log(`(MOCK) ${id === 'fan-switch' ? 'Kipas exhaust' : 'Lampu'} diubah:`, this.checked);
                });
            }
        });
    }
};

// Data Management (Mock Version)
const DataManager = {
    debug: false, // Disable debug logging for mock unless needed
    mockState: { // Store current mock values. Keys are backend keys.
        penyemaian: { temp: 26, humidity: 85, light: 500 }, // Backend key: penyemaian
        remaja: { temp: 25, humidity: 80, light: 800 },     // Backend key: remaja
        dewasa: { temp: 24, humidity: 75, light: 1200 }     // Backend key: dewasa
    },

    log(...args) {
        if (this.debug) console.log('[MockDataManager]', ...args);
    },

    // Generate mock data instead of fetching
    generateMockData() {
        this.log('Generating mock data...');
        const data = {
            timestamp: Math.floor(Date.now() / 1000),
            sections: {},
            averages: { temp: 0, humidity: 0, light: 0 }
        };

        let validTempCount = 0, validHumidityCount = 0, validLightCount = 0;
        let totalTemp = 0, totalHumidity = 0, totalLight = 0;

        // Update each section with slight random variations
        for (const section in this.mockState) {
            const state = this.mockState[section];

            // Simulate slight fluctuations
            state.temp += (Math.random() - 0.5) * 0.5; // +/- 0.25
            state.humidity += (Math.random() - 0.5) * 1; // +/- 0.5
            state.light += (Math.random() - 0.5) * 50; // +/- 25

            // Keep within reasonable bounds
            state.temp = Math.max(18, Math.min(35, state.temp));
            state.humidity = Math.max(50, Math.min(98, state.humidity));
            state.light = Math.max(100, Math.min(20000, state.light));

            // Simulate occasional sensor failure (e.g., 5% chance per sensor)
            const tempValue = Math.random() > 0.05 ? Math.round(state.temp * 10) / 10 : null;
            const humidityValue = Math.random() > 0.05 ? Math.round(state.humidity) : null;
            const lightValue = Math.random() > 0.05 ? Math.round(state.light) : null;

            data.sections[section] = {
                temp: tempValue,
                humidity: humidityValue,
                light: lightValue,
                trends: { temp: "equals", humidity: "equals", light: "equals" } // Mock trends
            };

            // Accumulate for averages
            if (tempValue !== null) { totalTemp += tempValue; validTempCount++; }
            if (humidityValue !== null) { totalHumidity += humidityValue; validHumidityCount++; }
            if (lightValue !== null) { totalLight += lightValue; validLightCount++; }
        }

        // Calculate averages
        data.averages.temp = validTempCount > 0 ? Math.round((totalTemp / validTempCount) * 10) / 10 : null;
        data.averages.humidity = validHumidityCount > 0 ? Math.round(totalHumidity / validHumidityCount) : null;
        data.averages.light = validLightCount > 0 ? Math.round(totalLight / validLightCount) : null;

        this.log('Generated data:', data);
        return data;
    },

    updateDisplay(data) {
        this.log('Updating display with mock data:', data);
        if (!data || !data.sections) return;

        SystemMonitor.updateNodeStatus(data); // Update status based on generated nulls
        SystemMonitor.updateConnectionStatus(true); // Keep connection 'online'

        if (data.averages) {
            this.log('Updating gauges with averages:', data.averages);
            UI.updateGauge('temperature-gauge', data.averages.temp, 50, '#286247');
            UI.updateGauge('humidity-gauge', data.averages.humidity, 100, '#333333');
            UI.updateGauge('light-gauge', data.averages.light, 10000, '#F9D949');
        }

        const allSections = ['penyemaian', 'remaja', 'dewasa']; // Backend keys
        allSections.forEach(section => {
            const nodeIsOnline = SystemMonitor.status.nodes[section]?.online;
            const values = data.sections[section];

            if (nodeIsOnline && values) {
                this.log(`Updating online section ${section} with values:`, values);
                ['temp', 'humidity', 'light'].forEach(type => {
                    UI.updateSectionValue(section, type, values[type], values.trends ? values.trends[type] : 'equals');
                });
            } else {
                this.log(`Section ${section} is offline or missing, resetting UI`);
                ['temp', 'humidity', 'light'].forEach(type => { UI.updateSectionValue(section, type, null, null); });
            }
        });

        UI.updateStatusSummary();
    }
};

// Main initialization
document.addEventListener('DOMContentLoaded', function() {
    UI.initialize();
    SystemMonitor.updateConnectionStatus(true); // Start as connected
    UI.resetDisplay(); // Initial clear state

    // Start generating and displaying mock data
    setInterval(() => {
        try {
            const mockData = DataManager.generateMockData();
            DataManager.updateDisplay(mockData);
        } catch (error) {
            console.error('Error in mock data update loop:', error);
            // Should not happen in mock, but good practice
        }
    }, 1500); // Update every 1.5 seconds
});
