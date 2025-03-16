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
            
            this.status.nodes[section].online = true;
            
            // Update sensor status
            if (values.hasOwnProperty('temp')) this.status.nodes[section].sensors.temp = true;
            if (values.hasOwnProperty('humidity')) this.status.nodes[section].sensors.humidity = true;
            if (values.hasOwnProperty('light')) this.status.nodes[section].sensors.light = true;
        }

        // Update master node status (dewasa node)
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
        this.elements.connectionText.textContent = connected ? 'Terhubung' : 'Tidak terhubung';
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
        ['temperature-gauge', 'humidity-gauge', 'light-gauge'].forEach(id => {
            this.updateGauge(id, null, 100, '#ccc');
        });
        
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
        valueDisplay.textContent = value !== null && value !== undefined ? value : '--';

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
                el.querySelector('.section-value').textContent = value;
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
    async fetchData() {
        try {
            const response = await fetch('/api/sensor/data');
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching sensor data:', error);
            throw error;
        }
    },

    updateDisplay(data) {
        if (!data || !data.sections || !data.averages) {
            UI.showError("Data sensor tidak valid");
            return;
        }

        // Update system status
        SystemMonitor.updateNodeStatus(data);
        
        // Update connection status
        SystemMonitor.updateConnectionStatus(true);
        
        // Update gauges with averages
        if (data.averages) {
            UI.updateGauge('temperature-gauge', data.averages.temp, 50, '#286247');
            UI.updateGauge('humidity-gauge', data.averages.humidity, 100, '#333333');
            UI.updateGauge('light-gauge', data.averages.light, 100, '#F9D949');
        }

        // Update section values
        Object.entries(data.sections).forEach(([section, values]) => {
            ['temp', 'humidity', 'light'].forEach(type => {
                UI.updateSectionValue(
                    section,
                    type,
                    values[type],
                    values.trends ? values.trends[type] : null
                );
            });
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
            DataManager.updateDisplay(data);
        } catch (error) {
            SystemMonitor.updateConnectionStatus(false);
            UI.showError("Gagal memuat data sensor. Coba lagi nanti.");
        }
    }, 5000);
});