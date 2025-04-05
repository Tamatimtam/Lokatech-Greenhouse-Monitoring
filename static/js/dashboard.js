// System status tracking
const SystemMonitor = {
    connectionTimeout: null,
    lastUpdateTime: null,
    status: {
        connected: false,
        masterNode: false,
        nodes: {
            penyemaian: { online: false, sensors: { temp: false, humidity: false, light: false } },
            peremajaan: { online: false, sensors: { temp: false, humidity: false, light: false } },
            dewasa: { online: false, sensors: { temp: false, humidity: false, light: false } }
        }
    },

    // Update the connection status
    updateConnectionStatus(connected) {
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
        }

        this.lastUpdateTime = Date.now();
        this.status.connected = connected;

        UI.updateConnectionStatusUI(connected);

        if (connected) {
            UI.hideError();
        }

        // Set timeout for connection loss detection
        this.connectionTimeout = setTimeout(() => {
            if ((Date.now() - this.lastUpdateTime) > 10000) {
                this.updateConnectionStatus(false);
                UI.showError("Koneksi ke jaringan ESP terputus - Tidak ada data yang diterima");
                UI.resetDisplay();
            }
        }, 10000);
    },

    // Update node and sensor status
    updateNodeStatus(data) {
        if (!data || !data.sections) return false;

        // Reset all node statuses first
        Object.keys(this.status.nodes).forEach(section => {
            this.status.nodes[section].online = false;
            Object.keys(this.status.nodes[section].sensors).forEach(sensor => {
                this.status.nodes[section].sensors[sensor] = false;
            });
        });

        // Update with new data
        for (const [section, values] of Object.entries(data.sections)) {
            if (!this.status.nodes[section]) continue;

            // Check if the section exists AND has at least one non-null sensor value
            // Ensure 'values' is not null or undefined before accessing properties
            const hasValidData = values && (values.temp !== null || values.humidity !== null || values.light !== null);

            if (hasValidData) {
                this.status.nodes[section].online = true; // Mark online only if valid data exists

                // Update sensor status based on non-null values
                this.status.nodes[section].sensors.temp = values.temp !== null;
                this.status.nodes[section].sensors.humidity = values.humidity !== null;
                this.status.nodes[section].sensors.light = values.light !== null;
            } else {
                 this.status.nodes[section].online = false; // Explicitly mark as offline if no valid data
                 // Reset sensor status for this offline node
                 this.status.nodes[section].sensors.temp = false;
                 this.status.nodes[section].sensors.humidity = false;
                 this.status.nodes[section].sensors.light = false;
            }
        }

        // Update master node status (dewasa node) - this remains based on its calculated online status
        this.status.masterNode = this.status.nodes.dewasa.online;

        return true;
    }
};

// UI Management
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
        // Initialize UI elements
        this.elements.connectionStatus = document.getElementById('connection-status');
        this.elements.connectionText = this.elements.connectionStatus.querySelector('span');
        this.elements.connectionIcon = this.elements.connectionStatus.querySelector('i');
        this.elements.systemError = document.getElementById('system-error');
        this.elements.errorMessage = document.getElementById('error-message');
        this.elements.statusContainer = document.getElementById('status-container');

        // Initialize control listeners
        this.initializeControls();
    },

    updateConnectionStatusUI(connected) {
        this.elements.connectionStatus.className = connected ? 'connection-status online' : 'connection-status offline';
        this.elements.connectionIcon.className = connected ? 'fas fa-check-circle' : 'fas fa-circle-exclamation';
        this.elements.connectionText.textContent = connected ? 'Sitem IoT Terhubung' : 'Sitem IoT Tidak terhubung';
    },

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.systemError.style.display = 'block';
    },

    hideError() {
        this.elements.systemError.style.display = 'none';
    },

    resetDisplay() {
        // Reset all gauges
        ['temperature-gauge', 'humidity-gauge'].forEach(id => {
            this.updateGauge(id, null, 100, '#ccc');
        });
        // Special case for light gauge that now uses lux
        this.updateGauge('light-gauge', null, 10000, '#ccc');

        // Reset all section values
        const sections = ['penyemaian', 'peremajaan', 'dewasa'];
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

        // Update display value
        if (id === 'light-gauge' && value !== null && value !== undefined) {
            // Format lux values for display: add commas for thousands and show 'lux' unit
            valueDisplay.textContent = value.toLocaleString();
        } else {
            valueDisplay.textContent = value !== null && value !== undefined ? value : '--';
        }

        // Update gauge
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
                // Format lux values when displaying light readings
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

        if (!status.connected) {
            this.elements.statusContainer.innerHTML = `
                <div class="status-item">
                    <i class="fas fa-triangle-exclamation" style="color: #e74c3c"></i>
                    <span>Tidak terhubung ke jaringan ESP</span>
                </div>
            `;
            return;
        }

        // Check offline nodes
        const offlineNodes = Object.entries(status.nodes)
            .filter(([_, status]) => !status.online)
            .map(([section, _]) => this.translateSection(section));

        if (offlineNodes.length > 0) {
            this.elements.statusContainer.innerHTML += `
                <div class="status-item">
                    <i class="fas fa-circle-exclamation" style="color: #e74c3c"></i>
                    <span>Node ${offlineNodes.join(', ')} offline</span>
                </div>
            `;
        }

        // Check sensor status for online nodes
        Object.entries(status.nodes).forEach(([section, nodeStatus]) => {
            if (nodeStatus.online) {
                const failedSensors = Object.entries(nodeStatus.sensors)
                    .filter(([_, working]) => !working)
                    .map(([sensor, _]) => this.translateSensor(sensor));

                if (failedSensors.length > 0) {
                    this.elements.statusContainer.innerHTML += `
                        <div class="status-item">
                            <i class="fas fa-triangle-exclamation" style="color: #f39c12"></i>
                            <span>Sensor ${failedSensors.join(', ')} di ${this.translateSection(section)} bermasalah</span>
                        </div>
                    `;
                }
            }
        });

        // All good
        if (this.elements.statusContainer.innerHTML === '') {
            this.elements.statusContainer.innerHTML = `
                <div class="status-item">
                    <i class="fas fa-check-circle" style="color: #27ae60"></i>
                    <span>Semua sistem bekerja normal</span>
                </div>
            `;
        }
    },

    translateSection(section) {
        const translations = {
            penyemaian: 'Penyemaian',
            peremajaan: 'Peremajaan',
            dewasa: 'Dewasa'
        };
        return translations[section] || section;
    },

    translateSensor(sensor) {
        const translations = {
            temp: 'suhu',
            humidity: 'kelembaban',
            light: 'cahaya'
        };
        return translations[sensor] || sensor;
    },

    initializeControls() {
        ['fan-switch', 'lights-switch'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', function() {
                    if (!SystemMonitor.status.connected) {
                        alert(`Tidak dapat mengontrol ${id === 'fan-switch' ? 'kipas' : 'lampu'} - sistem tidak terhubung`);
                        this.checked = false;
                        return;
                    }
                    console.log(`${id === 'fan-switch' ? 'Kipas exhaust' : 'Lampu'} diubah:`, this.checked);
                });
            }
        });
    }
};

// Data Management
const DataManager = {
    debug: true, // Enable debug logging

    log(...args) {
        if (this.debug) console.log('[DataManager]', ...args);
    },

    async fetchData() {
        try {
            this.log('Fetching sensor data...');
            const response = await fetch('/api/sensor/data');
            
            this.log('Response status:', response.status);
            
            if (response.status === 404) {
                this.log('No data available from sensors');
                return null;
            }
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            
            const data = await response.json();
            this.log('Received data:', data);
            return data;
        } catch (error) {
            console.error('Error fetching sensor data:', error);
            throw error;
        }
    },

    updateDisplay(data) {
        this.log('Updating display with data:', data);

        if (!data || !data.sections) {
            UI.showError("Menunggu data sensor...");
            return;
        }

        // Update system status
        SystemMonitor.updateNodeStatus(data);

        // Update connection status if we have any valid data
        const hasAnyData = Object.values(data.sections).some(section => 
            Object.keys(section).length > 0
        );
        
        this.log('Has any data:', hasAnyData);
        SystemMonitor.updateConnectionStatus(hasAnyData);

        // Update gauges with averages (if available)
        if (data.averages) {
            this.log('Updating gauges with averages:', data.averages);
            UI.updateGauge('temperature-gauge', data.averages.temp, 50, '#286247');
            UI.updateGauge('humidity-gauge', data.averages.humidity, 100, '#333333');
            UI.updateGauge('light-gauge', data.averages.light, 10000, '#F9D949');  // Updated max to 100,000 for lux
        }

        // Update sections that have data
        Object.entries(data.sections).forEach(([section, values]) => {
            this.log(`Updating section ${section} with values:`, values);
            if (Object.keys(values).length > 0) { // Only update if section has data
                ['temp', 'humidity', 'light'].forEach(type => {
                    UI.updateSectionValue(
                        section,
                        type,
                        values[type],
                        values.trends ? values.trends[type] : 'equals'
                    );
                });
            } else {
                this.log(`Section ${section} is empty, marking as offline`);
                ['temp', 'humidity', 'light'].forEach(type => {
                    UI.updateSectionValue(section, type, null, null);
                });
            }
        });

        // Update status summary
        UI.updateStatusSummary();
    }
};

// Main initialization
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize UI
    UI.initialize();

    // Initial state
    SystemMonitor.updateConnectionStatus(false);
    UI.resetDisplay();

    // Check for initial data
    const initialData = window.initialSensorData;
    if (initialData && initialData.sections && initialData.averages) {
        DataManager.updateDisplay(initialData);
    }

    // Start polling
    setInterval(async () => {
        try {
            const data = await DataManager.fetchData();
            if (data) {
                DataManager.updateDisplay(data);
            } else {
                // Don't show error for missing data, just update UI accordingly
                SystemMonitor.updateConnectionStatus(false);
                UI.showError("Menunggu data dari sensor...");
            }
        } catch (error) {
            console.error('Error in data update loop:', error);
            SystemMonitor.updateConnectionStatus(false);
            UI.showError("Gagal memuat data sensor. Coba lagi nanti.");
        }
    }, 1000);
});
