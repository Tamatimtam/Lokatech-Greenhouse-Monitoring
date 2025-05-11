// Manages all UI updates and interactions for the dashboard

import { SECTIONS, SENSOR_TYPES, ANIMATION_DURATION, THRESHOLDS } from './config.js'; 
import { SystemMonitor } from './state.js'; 
import { DataManager } from './data.js'; 

export const UI = {
    elements: {}, 
    animationStates: new Map(), 

    initialize() {
        this.elements = {
            connectionStatus: document.getElementById('connection-status'),
            connectionText: document.getElementById('connection-status')?.querySelector('span'),
            connectionIcon: document.getElementById('connection-status')?.querySelector('i'),
            systemError: document.getElementById('system-error'),
            errorMessage: document.getElementById('error-message'),
            statusContainer: document.getElementById('status-container'),
            fanSwitch: document.getElementById('fan-switch'),
            lightSwitch: document.getElementById('light-switch'), // Corrected ID if it was 'lights-switch'
            fanModeIndicator: document.getElementById('fan-mode-indicator'),
            lightModeIndicator: document.getElementById('light-mode-indicator'),
            statusSummaryLine: document.getElementById('status-summary-line')
        };
        
        this.initializeModeIndicators();
        
        const detailsContainer = document.getElementById('status-details');
        if (detailsContainer) {
            detailsContainer.style.transition = 'none';
        }
    },

    updateConnectionStatusUI(connected) {
        if (!this.elements.connectionStatus) return;
        this.elements.connectionStatus.className = connected ? 'connection-status online' : 'connection-status offline';
        if (this.elements.connectionIcon) {
            this.elements.connectionIcon.className = connected ? 'fas fa-check-circle' : 'fas fa-wifi'; // Wifi icon for connected
        }
        if (this.elements.connectionText) {
            this.elements.connectionText.textContent = connected ? 'Terhubung ke Server (Remaja Master)' : 'Koneksi Server Terputus';
        }
    },

    showError(message) {
        if (this.elements.errorMessage) this.elements.errorMessage.textContent = message;
        if (this.elements.systemError) {
             this.elements.systemError.style.display = 'block';
             this.elements.systemError.classList.add('visible'); // For CSS animation
        }
    },

    hideError() {
        if (this.elements.systemError) {
            this.elements.systemError.style.display = 'none';
            this.elements.systemError.classList.remove('visible');
        }
    },
    
    initializeModeIndicators() {
        ['fan', 'light'].forEach(type => {
            const indicator = this.elements[`${type}ModeIndicator`];
            if (indicator) {
                const mode = SystemMonitor.status.actuators[type]?.mode || 'auto';
                indicator.textContent = `(${mode === 'manual' ? 'Manual' : 'Auto'})`;
                indicator.classList.remove('mode-auto', 'mode-manual');
                indicator.classList.add(mode === 'auto' ? 'mode-auto' : 'mode-manual');
            }
            this.updateModeToggleButtons(type);
        });
    },

    updateModeToggleButtons(type) {
        const modeToggle = document.getElementById(`${type}-mode-toggle`);
        if (!modeToggle) return;

        const mode = SystemMonitor.status.actuators[type]?.mode || 'auto';
        
        modeToggle.dataset.mode = mode;
        modeToggle.textContent = mode === 'auto' ? 'Ke Mode Manual' : 'Ke Mode Auto';
        
        modeToggle.classList.remove('mode-auto', 'mode-manual'); // Ensure old classes are removed
        modeToggle.classList.add(mode === 'auto' ? 'mode-auto' : 'mode-manual'); // Add current mode class
        
        // Ensure consistent styling (can be moved to CSS if preferred)
        modeToggle.style.padding = '6px 12px';
        modeToggle.style.margin = '5px auto'; // Or adjust as needed
        modeToggle.style.borderRadius = 'var(--radius-sm)';
        modeToggle.style.textAlign = 'center';
        modeToggle.style.fontWeight = '500';
        modeToggle.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
        modeToggle.style.transition = 'all 0.2s ease-in-out';
    },

    animateValue(element, targetValue, options = {}) {
        if (!element) return;
        const { duration = ANIMATION_DURATION, format = (val) => val.toLocaleString() } = options;
        const defaultValue = '--';

        const existingAnimationId = this.animationStates.get(element);
        if (existingAnimationId) cancelAnimationFrame(existingAnimationId);

        if (targetValue === null || targetValue === undefined) {
            element.textContent = defaultValue;
            return;
        }

        const startValueText = element.textContent;
        let startValue = parseFloat(String(startValueText).replace(/,/g, ''));
        if (isNaN(startValue) || startValueText === defaultValue) startValue = 0;
        
        const formattedTarget = format(targetValue);
        if (element.textContent === formattedTarget && startValueText !== defaultValue) return; // Avoid re-animating if already at target

        const startTime = performance.now();
        const step = (currentTime) => {
            const elapsedTime = currentTime - startTime;
            const progress = Math.min(1, elapsedTime / duration);
            const currentValue = startValue + (targetValue - startValue) * progress;
            element.textContent = format(currentValue);

            if (progress < 1) {
                const animationId = requestAnimationFrame(step);
                this.animationStates.set(element, animationId);
            } else {
                element.textContent = format(targetValue);
                this.animationStates.delete(element);
            }
        };
        const animationId = requestAnimationFrame(step);
        this.animationStates.set(element, animationId);
    },

    resetDisplay() {
        this.updateGauge('temperature-gauge', null, 50, '#ccc'); // Max 50 for temp
        this.updateGauge('humidity-gauge', null, 100, '#ccc');
        this.updateGauge('light-gauge', null, 20000, '#ccc'); // Max 20000 for light

        SECTIONS.forEach(section => {
            SENSOR_TYPES.forEach(type => {
                this.updateSectionDisplay(section, type, null, 'minus');
            });
        });
        this.updateStatusSummary();
        this.updateControlsUI(); // Reset controls UI as well
    },

    updateGauge(id, value, max, color) {
        const gaugeElement = document.getElementById(id);
        if (!gaugeElement) return;

        const circle = gaugeElement.querySelector('.svg-circle');
        const valueDisplay = gaugeElement.querySelector('.value'); // Ensure this class exists in your gauge HTML

        const formatOptions = (id === 'light-gauge')
            ? { format: (val) => (val !== null && val !== undefined) ? Math.round(val).toLocaleString() : '--' }
            : { format: (val) => (val !== null && val !== undefined) ? val.toFixed(1) : '--' };
        this.animateValue(valueDisplay, value, formatOptions);

        if (value !== null && value !== undefined && circle) {
            circle.style.stroke = color;
            const radius = parseFloat(circle.getAttribute('r'));
            const circumference = 2 * Math.PI * radius;
            const clampedValue = Math.max(0, Math.min(value, max)); // Clamp value to be within 0-max
            const offset = circumference - ((clampedValue / max) * circumference);
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = offset;
        } else if (circle) {
            circle.style.stroke = '#ccc'; // Default color for null value
            const radius = parseFloat(circle.getAttribute('r'));
            const circumference = 2 * Math.PI * radius;
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = circumference; // Empty gauge
        }
    },

    updateSectionDisplay(section, type, value, trend) {
        const elements = document.querySelectorAll(`[data-section="${section}"][data-type="${type}"]`);
        elements.forEach(el => {
            const valueElement = el.querySelector('.section-value');
            const indicatorElement = el.querySelector('.section-indicator i');

            const formatOptions = (type === 'light')
                ? { format: (val) => (val !== null && val !== undefined) ? Math.round(val).toLocaleString() : '--' }
                : { format: (val) => (val !== null && val !== undefined) ? val.toFixed(1) : '--' };
            this.animateValue(valueElement, value, formatOptions);

            if (value !== null && value !== undefined && trend && indicatorElement) {
                indicatorElement.className = `fas fa-${trend || 'minus'}`;
                el.classList.remove('sensor-error', 'sensor-offline');
            } else if (indicatorElement) {
                indicatorElement.className = 'fas fa-circle-exclamation'; // Or 'fa-power-off' for offline
                el.classList.add('sensor-error'); // Or 'sensor-offline' if that's more appropriate
                el.classList.remove('sensor-offline'); // Ensure only one state class
            }
        });
    },
    
    updateStatusSummary() {
        const summaryLine = this.elements.statusSummaryLine;
        const detailsContainer = document.getElementById('status-details');
        const fallbackContainer = this.elements.statusContainer; // Fallback if new elements not present

        if (!summaryLine || !detailsContainer) {
            // Fallback to simpler status if new elements aren't there
            if (fallbackContainer) {
                const status = SystemMonitor.status;
                let fallbackHtml = '';
                if (!status.connected) {
                    fallbackHtml = `<div class="status-item"><i class="fas fa-wifi-slash status-error"></i><span>Tidak terhubung ke Remaja Master</span></div>`;
                } else if (!status.masterNode) { // Check if Remaja master itself is reporting offline
                    fallbackHtml = `<div class="status-item"><i class="fas fa-server status-error"></i><span>Remaja Master offline</span></div>`;
                }
                 else {
                    fallbackHtml = `<div class="status-item"><i class="fas fa-check-circle status-success"></i><span>Terhubung & Semua Sistem Normal</span></div>`;
                }
                if (fallbackContainer.innerHTML !== fallbackHtml) fallbackContainer.innerHTML = fallbackHtml;
            }
            return;
        }

        const status = SystemMonitor.status;
        let summaryText = '';
        let summaryIcon = 'fa-check-circle';
        let summaryClass = 'status-success';
        const detailMessages = [];
        let allOkOverall = true;
        
        const oldDetailsHtml = detailsContainer.innerHTML;

        if (!status.connected) {
            summaryText = 'Tidak terhubung ke server';
            summaryIcon = 'fa-wifi-slash';
            summaryClass = 'status-error';
            allOkOverall = false;
        } else {
            const latestData = DataManager.getLatestData();
            
            if (!latestData || !latestData.sections || latestData.timestamp === null) { // Check timestamp for actual data
                summaryText = 'Menunggu data dari sensor...';
                summaryIcon = 'fa-spinner fa-spin';
                summaryClass = ''; // Neutral class
                allOkOverall = false;
            } else {
                const offlineNodes = SECTIONS.filter(section => !status.nodes[section]?.online);
                if (offlineNodes.length > 0) {
                    detailMessages.push({ 
                        type: 'connection', 
                        text: `Node ${offlineNodes.map(s => this.translateSection(s)).join(', ')} offline`,
                        icon: 'fa-server'
                    });
                    allOkOverall = false;
                }

                SECTIONS.forEach(section => {
                    const nodeStatus = status.nodes[section];
                    if (nodeStatus?.online) {
                        const sectionValues = latestData.sections[section];
                        const sectionName = this.translateSection(section);

                        if (!sectionValues || Object.keys(sectionValues).length === 0) { // Check if sectionValues is empty
                            detailMessages.push({ 
                                type: 'connection', 
                                text: `Data untuk ${sectionName} tidak diterima`,
                                icon: 'fa-triangle-exclamation' 
                            });
                            allOkOverall = false;
                            return; // Skip to next section
                        }

                        const failedSensors = SENSOR_TYPES.filter(type => !nodeStatus.sensors[type]);
                        if (failedSensors.length > 0) {
                            detailMessages.push({ 
                                type: 'connection', 
                                text: `Sensor ${failedSensors.map(s => this.translateSensor(s)).join(', ')} di ${sectionName} bermasalah`,
                                icon: 'fa-microchip'
                            });
                            allOkOverall = false;
                        }

                        SENSOR_TYPES.forEach(type => {
                            if (nodeStatus.sensors[type] && sectionValues[type] !== null && sectionValues[type] !== undefined) {
                                const value = sectionValues[type];
                                const threshold = THRESHOLDS[type];
                                const sensorName = threshold.name;
                                let unit = '';
                                if (type === 'temp') unit = '°C';
                                if (type === 'humidity') unit = '%';
                                if (type === 'light') unit = ' lux';

                                const formattedValue = type === 'light' ? Math.round(value) : parseFloat(value).toFixed(1);
                                
                                if (type === 'temp' && threshold.low !== undefined && value < threshold.low) {
                                    detailMessages.push({ type: 'temp', text: `${sensorName} ${sectionName} terlalu dingin (${formattedValue}${unit})`, icon: 'fa-temperature-low'});
                                    allOkOverall = false;
                                } else if (type === 'temp' && threshold.high !== undefined && value > threshold.high) {
                                    detailMessages.push({ type: 'temp', text: `${sensorName} ${sectionName} terlalu panas (${formattedValue}${unit})`, icon: 'fa-temperature-high'});
                                    allOkOverall = false;
                                } else if (type === 'humidity' && threshold.low !== undefined && value < threshold.low) {
                                    detailMessages.push({ type: 'humidity', text: `${sensorName} ${sectionName} terlalu kering (${formattedValue}${unit})`, icon: 'fa-droplet-slash'});
                                    allOkOverall = false;
                                } else if (type === 'humidity' && threshold.high !== undefined && value > threshold.high) {
                                    detailMessages.push({ type: 'humidity', text: `${sensorName} ${sectionName} terlalu lembap (${formattedValue}${unit})`, icon: 'fa-droplet'});
                                    allOkOverall = false;
                                } else if (type === 'light' && threshold.dark !== undefined && value < threshold.dark) {
                                    detailMessages.push({ type: 'light', text: `${sensorName} ${sectionName} terlalu gelap (${formattedValue}${unit})`, icon: 'fa-moon'});
                                    allOkOverall = false;
                                }
                            }
                        });
                    }
                });

                if (allOkOverall) {
                    summaryText = 'Semua kondisi optimal';
                    summaryIcon = 'fa-check-circle';
                    summaryClass = 'status-success';
                    detailMessages.push({ type: 'success', text: 'Semua sensor berfungsi normal', icon: 'fa-check-circle'});
                } else {
                    const hasConnectionErrors = detailMessages.some(msg => msg.type === 'connection');
                    if (hasConnectionErrors) {
                        summaryText = 'Masalah koneksi atau sensor terdeteksi';
                        summaryIcon = 'fa-triangle-exclamation';
                        summaryClass = 'status-error'; // More severe for connection issues
                    } else { // Environmental warnings only
                        summaryText = 'Peringatan kondisi lingkungan';
                        summaryIcon = 'fa-circle-exclamation'; // Standard warning icon
                        summaryClass = 'status-warning'; // A specific class for warnings
                    }
                }
            }
        }

        summaryLine.className = `status-item ${summaryClass}`;
        summaryLine.innerHTML = `<i class="fas ${summaryIcon}"></i><span>${summaryText}</span>`;

        const detailsHtml = detailMessages.map(msg => {
            let iconClass, statusClass;
            switch(msg.type) {
                case 'temp': iconClass = 'icon-temp'; statusClass = 'status-temp'; break;
                case 'humidity': iconClass = 'icon-humidity'; statusClass = 'status-humidity'; break;
                case 'light': iconClass = 'icon-light'; statusClass = 'status-light'; break;
                case 'connection': iconClass = 'icon-connection'; statusClass = 'status-connection'; break;
                case 'success': iconClass = 'icon-success'; statusClass = 'status-success'; break;
                default: iconClass = 'icon-error'; statusClass = 'status-error'; // Default to error for unknown types
            }
            return `
                <div class="status-item--detail ${statusClass}" data-id="${msg.type}-${msg.section || ''}-${Date.now()}">
                    <div class="status-icon ${iconClass}"><i class="fas ${msg.icon}"></i></div>
                    <span class="status-text">${msg.text}</span>
                </div>`;
        }).join('');

        if (detailsContainer.innerHTML !== detailsHtml) {
            detailsContainer.innerHTML = detailsHtml;
        }
    },

    translateSection(section) {
        const translations = { penyemaian: 'Penyemaian', remaja: 'Remaja', dewasa: 'Dewasa' }; // Updated
        return translations[section] || section;
    },

    translateSensor(sensor) {
        const translations = { temp: 'suhu', humidity: 'kelembapan', light: 'cahaya' };
        return translations[sensor] || sensor;
    },

    updateControlsUI() {
        const fanState = SystemMonitor.status.actuators.fan;
        const lightState = SystemMonitor.status.actuators.light; // Corrected from lightsState

        if (this.elements.fanSwitch) {
            this.elements.fanSwitch.checked = fanState.state === true;
        }
        if (this.elements.fanModeIndicator) {
            const fanMode = fanState.mode || 'auto';
            this.elements.fanModeIndicator.textContent = `(${fanMode === 'manual' ? 'Manual' : 'Auto'})`;
            this.elements.fanModeIndicator.classList.remove('mode-auto', 'mode-manual');
            this.elements.fanModeIndicator.classList.add(fanMode === 'auto' ? 'mode-auto' : 'mode-manual');
            this.elements.fanSwitch?.closest('.control')?.classList.toggle('control--manual', fanMode === 'manual');
            this.updateModeToggleButtons('fan');
        }

        if (this.elements.lightSwitch) { // Corrected from lightSwitch
            this.elements.lightSwitch.checked = lightState.state === true;
        }
        if (this.elements.lightModeIndicator) { // Corrected from lightModeIndicator
            const lightActuatorMode = lightState.mode || 'auto';
            this.elements.lightModeIndicator.textContent = `(${lightActuatorMode === 'manual' ? 'Manual' : 'Auto'})`;
            this.elements.lightModeIndicator.classList.remove('mode-auto', 'mode-manual');
            this.elements.lightModeIndicator.classList.add(lightActuatorMode === 'auto' ? 'mode-auto' : 'mode-manual');
            this.elements.lightSwitch?.closest('.control')?.classList.toggle('control--manual', lightActuatorMode === 'manual');
            this.updateModeToggleButtons('light');
        }
    }
};
