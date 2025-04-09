// Manages all UI updates and interactions for the dashboard

import { SECTIONS, SENSOR_TYPES, ANIMATION_DURATION, THRESHOLDS } from './config.js'; // Import THRESHOLDS
import { SystemMonitor } from './state.js'; // Import state for status summary
import { DataManager } from './data.js'; // Import DataManager to access latest data

export const UI = {
    elements: {}, // Populated in initialize
    animationStates: new Map(), // Store animation state for elements

    initialize() {
        this.elements = {
            connectionStatus: document.getElementById('connection-status'), // Corrected typo: documeent -> document
            connectionText: document.getElementById('connection-status')?.querySelector('span'),
            connectionIcon: document.getElementById('connection-status')?.querySelector('i'),
            systemError: document.getElementById('system-error'),
            errorMessage: document.getElementById('error-message'),
            statusContainer: document.getElementById('status-container'), // Original container (fallback)
            // Add elements for switches and mode indicators
            fanSwitch: document.getElementById('fan-switch'),
            lightSwitch: document.getElementById('light-switch'), // Changed ID here
            fanModeIndicator: document.getElementById('fan-mode-indicator'), // Assumes this ID will be added to HTML
            lightModeIndicator: document.getElementById('light-mode-indicator'), // Assumes this ID will be added to HTML
            // Add elements for the new status summary structure
            statusSummaryLine: document.getElementById('status-summary-line'), // Assumes this ID will be added
            statusDetailsContainer: document.getElementById('status-details'), // Assumes this ID will be added
            statusDetailsToggle: document.getElementById('status-details-toggle') // Assumes this ID will be added
        };
        
        // Add listener for the details toggle button
        this.elements.statusDetailsToggle?.addEventListener('click', () => {
            if (this.elements.statusDetailsContainer) {
                const detailsVisible = this.elements.statusDetailsContainer.style.display === 'block';
                this.elements.statusDetailsContainer.style.display = detailsVisible ? 'none' : 'block';
                // Use toggleButton reference which is safer
                if (this.elements.statusDetailsToggle) {
                     this.elements.statusDetailsToggle.textContent = detailsVisible ? 'Lihat Detail' : 'Sembunyikan Detail';
                }
            }
        });
        // Control initialization is handled in controls.js now
    },

    updateConnectionStatusUI(connected) {
        if (!this.elements.connectionStatus) return;
        this.elements.connectionStatus.className = connected ? 'connection-status online' : 'connection-status offline';
        if (this.elements.connectionIcon) {
            this.elements.connectionIcon.className = connected ? 'fas fa-check-circle' : 'fas fa-circle-exclamation';
        }
        if (this.elements.connectionText) {
            this.elements.connectionText.textContent = connected ? 'Sistem IoT Terhubung' : 'Sistem IoT Tidak terhubung';
        }
    },

    showError(message) {
        if (this.elements.errorMessage) this.elements.errorMessage.textContent = message;
        if (this.elements.systemError) this.elements.systemError.style.display = 'block';
    },

    hideError() {
        if (this.elements.systemError) this.elements.systemError.style.display = 'none';
    },

    // Helper function to animate numeric values
    animateValue(element, targetValue, options = {}) {
        if (!element) return;

        const { duration = ANIMATION_DURATION, format = (val) => val.toLocaleString() } = options;
        const defaultValue = '--';

        // Clear existing animation for this element
        const existingAnimationId = this.animationStates.get(element);
        if (existingAnimationId) {
            cancelAnimationFrame(existingAnimationId);
            this.animationStates.delete(element);
        }

        if (targetValue === null || targetValue === undefined) {
            element.textContent = defaultValue;
            return;
        }

        const startValueText = element.textContent;
        let startValue = parseFloat(startValueText.replace(/,/g, ''));
        if (isNaN(startValue) || startValueText === defaultValue) {
            startValue = 0;
        }

        const formattedTarget = format(targetValue);
        if (element.textContent === formattedTarget) {
             return;
        }
        if (Math.abs(startValue - targetValue) < 0.01 && startValue !== 0) {
             element.textContent = formattedTarget;
             return;
        }

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
                element.textContent = format(targetValue); // Ensure final value is exact
                this.animationStates.delete(element);
            }
        };

        const animationId = requestAnimationFrame(step);
        this.animationStates.set(element, animationId);
    },

    resetDisplay() {
        this.updateGauge('temperature-gauge', null, 100, '#ccc');
        this.updateGauge('humidity-gauge', null, 100, '#ccc');
        this.updateGauge('light-gauge', null, 10000, '#ccc');

        SECTIONS.forEach(section => {
            SENSOR_TYPES.forEach(type => {
                this.updateSectionDisplay(section, type, null, 'minus');
            });
        });

        this.updateStatusSummary();
    },

    updateGauge(id, value, max, color) {
        const gaugeElement = document.getElementById(id);
        if (!gaugeElement) return;

        const circle = gaugeElement.querySelector('.svg-circle');
        const valueDisplay = gaugeElement.querySelector('.value');

        const formatOptions = (id === 'light-gauge')
            ? { format: (val) => Math.round(val).toLocaleString() }
            : { format: (val) => (val !== null && val !== undefined) ? val.toFixed(1) : '--' }; // Ensure format handles null
        this.animateValue(valueDisplay, value, formatOptions);

        if (value !== null && value !== undefined) {
            circle.style.stroke = color;
            const circumference = 2 * Math.PI * 54;
            const clampedValue = Math.max(0, Math.min(value, max));
            const offset = circumference - ((clampedValue / max) * circumference);
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = offset;
        } else {
            circle.style.stroke = '#ccc';
            const circumference = 2 * Math.PI * 54;
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = circumference;
        }
    },

    updateSectionDisplay(section, type, value, trend) {
        const elements = document.querySelectorAll(`[data-section="${section}"][data-type="${type}"]`);
        elements.forEach(el => {
            const valueElement = el.querySelector('.section-value');
            const indicatorElement = el.querySelector('.section-indicator i');

            const formatOptions = (type === 'light')
                ? { format: (val) => Math.round(val).toLocaleString() }
                : { format: (val) => (val !== null && val !== undefined) ? val.toFixed(1) : '--' };
            this.animateValue(valueElement, value, formatOptions);

            if (value !== null && value !== undefined && trend) {
                indicatorElement.className = `fas fa-${trend || 'minus'}`;
                el.classList.remove('sensor-error', 'sensor-offline');
            } else {
                indicatorElement.className = 'fas fa-circle-exclamation';
                el.classList.add('sensor-error');
                el.classList.remove('sensor-offline');
            }
        });
    },

    // --- NEW updateStatusSummary ---
    updateStatusSummary() {
        const summaryLine = this.elements.statusSummaryLine;
        const detailsContainer = this.elements.statusDetailsContainer;
        const toggleButton = this.elements.statusDetailsToggle;
        const fallbackContainer = this.elements.statusContainer;

        if (!summaryLine || !detailsContainer || !toggleButton) {
            if (fallbackContainer) {
                console.warn("Using fallback statusContainer. Add status-summary-line, status-details, and status-details-toggle elements to HTML for improved summary.");
                const status = SystemMonitor.status;
                let fallbackHtml = '';
                if (!status.connected) {
                    fallbackHtml = `<div class="status-item"><i class="fas fa-triangle-exclamation" style="color: #e74c3c"></i><span>Tidak terhubung ke jaringan ESP</span></div>`;
                } else {
                    fallbackHtml = `<div class="status-item"><i class="fas fa-check-circle" style="color: #27ae60"></i><span>Terhubung</span></div>`;
                }
                 if (fallbackContainer.innerHTML !== fallbackHtml) {
                     fallbackContainer.innerHTML = fallbackHtml;
                 }
            } else {
                console.error("Status summary elements not found.");
            }
            return;
        }

        const status = SystemMonitor.status;
        let summaryText = '';
        let summaryIcon = 'fa-check-circle';
        let summaryColor = '#27ae60';
        const detailMessages = [];
        let allOkOverall = true;

        if (!status.connected) {
            summaryText = 'Tidak terhubung ke jaringan ESP';
            summaryIcon = 'fa-triangle-exclamation';
            summaryColor = '#e74c3c';
            allOkOverall = false;
        } else {
            const latestData = DataManager.getLatestData();
            const offlineNodes = SECTIONS.filter(section => !status.nodes[section]?.online);
            if (offlineNodes.length > 0) {
                detailMessages.push({ type: 'error', text: `Node ${offlineNodes.map(this.translateSection).join(', ')} offline` });
                allOkOverall = false;
            }

            SECTIONS.forEach(section => {
                const nodeStatus = status.nodes[section];
                if (nodeStatus?.online) {
                    const sectionValues = latestData?.sections?.[section];
                    const sectionName = this.translateSection(section);

                    if (!sectionValues) {
                         detailMessages.push({ type: 'warning', text: `Data untuk ${sectionName} tidak diterima` });
                         allOkOverall = false;
                         return;
                    }

                    const failedSensors = SENSOR_TYPES.filter(type => !nodeStatus.sensors[type]);
                    if (failedSensors.length > 0) {
                        detailMessages.push({ type: 'warning', text: `Sensor ${failedSensors.map(this.translateSensor).join(', ')} di ${sectionName} bermasalah` });
                        allOkOverall = false;
                    }

                    SENSOR_TYPES.forEach(type => {
                        if (nodeStatus.sensors[type] && sectionValues[type] !== null) {
                            const value = sectionValues[type];
                            const threshold = THRESHOLDS[type];
                            const sensorName = threshold.name;
                            let unit = '';
                            if (type === 'temp') unit = '°C';
                            if (type === 'humidity') unit = '%';
                            if (type === 'light') unit = ' lux';

                            let issueFound = false;
                            let messageText = '';

                            if (threshold.low !== undefined && value < threshold.low) {
                                messageText = `${sensorName} ${sectionName} terlalu ${type === 'temp' ? 'dingin' : 'kering'} (${value}${unit})`;
                                issueFound = true;
                            } else if (threshold.high !== undefined && value > threshold.high) {
                                messageText = `${sensorName} ${sectionName} terlalu ${type === 'temp' ? 'panas' : 'lembap'} (${value}${unit})`;
                                issueFound = true;
                            } else if (threshold.dark !== undefined && value < threshold.dark) {
                                messageText = `${sensorName} ${sectionName} terlalu gelap (${value}${unit})`;
                                issueFound = true;
                            }

                            if (issueFound) {
                                detailMessages.push({ type: 'warning', text: messageText });
                                allOkOverall = false;
                            }
                        }
                    });
                }
            });

            if (allOkOverall) {
                summaryText = 'Semua kondisi optimal';
                summaryIcon = 'fa-check-circle';
                summaryColor = '#27ae60';
            } else {
                const hasErrors = detailMessages.some(msg => msg.type === 'error');
                if (hasErrors) {
                    summaryText = 'Sistem bermasalah (Node offline)';
                    summaryIcon = 'fa-triangle-exclamation';
                    summaryColor = '#e74c3c';
                } else {
                    summaryText = 'Peringatan kondisi terdeteksi';
                    summaryIcon = 'fa-circle-exclamation';
                    summaryColor = '#f39c12';
                }
            }
        }

        const summaryHtml = `<i class="fas ${summaryIcon}" style="color: ${summaryColor}"></i><span>${summaryText}</span>`;
        if (summaryLine.innerHTML !== summaryHtml) {
            summaryLine.innerHTML = summaryHtml;
        }

        const detailsHtml = detailMessages.map(msg => {
            const iconClass = msg.type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation';
            const iconColor = msg.type === 'error' ? '#e74c3c' : '#f39c12';
            return `<div class="status-item status-item--detail"><i class="fas ${iconClass}" style="color: ${iconColor}"></i><span>${msg.text}</span></div>`;
        }).join('');

        if (detailsContainer.innerHTML !== detailsHtml) {
            detailsContainer.innerHTML = detailsHtml;
        }

        if (detailMessages.length > 0) {
            toggleButton.style.display = 'inline-block';
            if (detailsContainer.style.display !== 'block') {
                toggleButton.textContent = 'Lihat Detail';
            }
        } else {
            toggleButton.style.display = 'none';
            detailsContainer.style.display = 'none';
        }
    },
    // --- END NEW updateStatusSummary ---

    translateSection(section) {
        const translations = { penyemaian: 'Penyemaian', peremajaan: 'Peremajaan', dewasa: 'Dewasa' };
        return translations[section] || section;
    },

    translateSensor(sensor) {
        const translations = { temp: 'suhu', humidity: 'kelembapan', light: 'cahaya' };
        return translations[sensor] || sensor;
    },

    updateControlsUI() {
        const fanState = SystemMonitor.status.actuators.fan;
        const lightState = SystemMonitor.status.actuators.light;

        if (this.elements.fanSwitch) {
            this.elements.fanSwitch.checked = fanState.state === true;
        }
        if (this.elements.fanModeIndicator) {
            this.elements.fanModeIndicator.textContent = `(${fanState.mode === 'manual' ? 'Manual' : 'Auto'})`;
            this.elements.fanSwitch?.closest('.control')?.classList.toggle('control--manual', fanState.mode === 'manual');
        }

        if (this.elements.lightSwitch) {
            this.elements.lightSwitch.checked = lightState.state === true;
        }
        if (this.elements.lightModeIndicator) {
            this.elements.lightModeIndicator.textContent = `(${lightState.mode === 'manual' ? 'Manual' : 'Auto'})`;
            this.elements.lightSwitch?.closest('.control')?.classList.toggle('control--manual', lightState.mode === 'manual');
        }
    }
};
