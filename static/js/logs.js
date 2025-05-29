document.addEventListener('DOMContentLoaded', function() {
    // Add CSS for clickable log rows
    const style = document.createElement('style');
    style.textContent = `
        .clickable-log-row:hover {
            background-color: rgba(0, 0, 0, 0.05);
            transition: background-color 0.2s;
        }
    `;
    document.head.appendChild(style);

    // Tab switching logic
    const tabLinks = document.querySelectorAll('.tab-header .tab-link');
    const tabContents = document.querySelectorAll('.container .tab-content');

    function activateTab(tabId) {
        tabLinks.forEach(link => {
            if (link.getAttribute('data-tab') === tabId) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
        tabContents.forEach(content => {
            if (content.id === tabId) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    }

    const initialActiveLink = document.querySelector('.tab-header .tab-link.active');
    if (initialActiveLink) {
        const initialTabId = initialActiveLink.getAttribute('data-tab');
        activateTab(initialTabId);
    } else if (tabLinks.length > 0) {
        let performanceTabLink = Array.from(tabLinks).find(link => link.getAttribute('data-tab') === 'tab-performance');
        if (performanceTabLink) {
            activateTab('tab-performance');
        } else {
            activateTab(tabLinks[0].getAttribute('data-tab'));
        }
    }

    tabLinks.forEach(link => {
        link.addEventListener('click', function(event) {
            event.preventDefault(); // Prevent any default button behavior if necessary
            const tabId = this.getAttribute('data-tab');
            activateTab(tabId);
        });
    });

    // Performance Logs specific code
    const socket = io();
    const logTableBody = document.getElementById('log-table-body');
    const maxLogsInput = document.getElementById('maxLogs');
    const clearLogsButton = document.getElementById('clearLogsButton');
    const exportPerformanceCsvBtn = document.getElementById('exportPerformanceLogsCsvBtn');

    // Summary elements
    const avgCpuBackendEl = document.getElementById('avg-cpu-backend');
    const avgRamBackendEl = document.getElementById('avg-ram-backend');
    const maxCpuBackendEl = document.getElementById('max-cpu-backend');
    const maxRamBackendEl = document.getElementById('max-ram-backend');

    const avgEspnowPenyemaianEl = document.getElementById('avg-espnow-penyemaian');
    const avgEspnowDewasaEl = document.getElementById('avg-espnow-dewasa');
    const avgMqttLatencyEl = document.getElementById('avg-mqtt-latency');
    const avgWebsocketLatencyEl = document.getElementById('avg-websocket-latency');
    const avgTotalLatencyEl = document.getElementById('avg-total-latency');
    
    const avgEspnowPJitterEl = document.getElementById('avg-espnow-p-jitter');
    const avgEspnowDJitterEl = document.getElementById('avg-espnow-d-jitter');
    const avgMqttJitterEl = document.getElementById('avg-mqtt-jitter');
    const avgWebsocketJitterEl = document.getElementById('avg-websocket-jitter');
    
    const packetsReceivedEl = document.getElementById('packets-received');
    const packetsExpectedEl = document.getElementById('packets-expected');
    const msgsPerSecBackendEl = document.getElementById('msgs-per-sec-backend');
    const throughputPercentageEl = document.getElementById('throughput-percentage');
    const packetLossPercentageEl = document.getElementById('packet-loss-percentage');
    
    let logEntries = [];
    let maxLogEntries = maxLogsInput ? parseInt(maxLogsInput.value, 10) : 50;

    let prevWebsocketLatency = null;

    // Stats for averages
    let totalCpu = 0, countCpu = 0, currentMaxCpu = 0;
    let totalRam = 0, countRam = 0, currentMaxRam = 0;
    let totalEspnowP = 0, countEspnowP = 0;
    let totalEspnowD = 0, countEspnowD = 0;
    let totalMqtt = 0, countMqtt = 0;
    let totalWs = 0, countWs = 0;
    let totalOverall = 0, countOverall = 0;
    let totalMqttJitter = 0, countMqttJitter = 0;
    let totalWsJitter = 0, countWsJitter = 0;
    let totalEspnowPJitter = 0, countEspnowPJitter = 0;
    let totalEspnowDJitter = 0, countEspnowDJitter = 0;
    let totalMsgsPerSec = 0, countMsgsPerSec = 0;
    let totalThroughput = 0, countThroughput = 0;
    let totalPacketLoss = 0, countPacketLoss = 0;

    let connectionStartTime = null;
    
    if (maxLogsInput) {
        maxLogsInput.addEventListener('change', function() {
            maxLogEntries = parseInt(this.value, 10);
            renderLogTable(); 
        });
    }

    if (clearLogsButton) {
        clearLogsButton.addEventListener('click', function() {
            logEntries = [];
            prevWebsocketLatency = null;
            
            // Reset all stat counters
            totalCpu = 0; countCpu = 0; currentMaxCpu = 0;
            totalRam = 0; countRam = 0; currentMaxRam = 0;
            totalEspnowP = 0; countEspnowP = 0;
            totalEspnowD = 0; countEspnowD = 0;
            totalMqtt = 0; countMqtt = 0;
            totalWs = 0; countWs = 0;
            totalOverall = 0; countOverall = 0;
            totalMqttJitter = 0; countMqttJitter = 0;
            totalWsJitter = 0; countWsJitter = 0;
            totalEspnowPJitter = 0; countEspnowPJitter = 0;
            totalEspnowDJitter = 0; countEspnowDJitter = 0;
            totalMsgsPerSec = 0; countMsgsPerSec = 0;
            totalThroughput = 0; countThroughput = 0;
            totalPacketLoss = 0; countPacketLoss = 0;

            renderLogTable();
            updateSummaryStats();
            if (logTableBody && logTableBody.firstChild && logTableBody.firstChild.cells[0].textContent === "Menunggu data log...") {
                // Do nothing
            } else if (logEntries.length === 0 && logTableBody) {
                 logTableBody.innerHTML = '<tr><td colspan="20" style="text-align:center;">Log dibersihkan. Menunggu data baru...</td></tr>';
            }
            connectionStartTime = new Date();
        });
    }

    socket.on('connect', () => {
        console.log('Logs.js: Connected to WebSocket');
        connectionStartTime = new Date();
        if (logEntries.length === 0 && logTableBody.firstChild && logTableBody.firstChild.cells[0].textContent.includes("Menunggu")) {
             logTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Terhubung. Menunggu data log...</td></tr>';
        }
    });

    socket.on('disconnect', () => {
        console.log('Logs.js: Disconnected from WebSocket');
    });

    socket.on('sensor_update', (data) => {
        const feWsRecvTimestamp = new Date(); 
        const logData = data.log_data;

        if (!logData) {
            console.warn('Received sensor_update without log_data:', data);
            return;
        }

        let websocketLatencyMs = null;
        if (logData.websocket_send_timestamp_str && logData.websocket_send_timestamp_str !== "N/A") {
            try {
                const serverWsSendDate = new Date(logData.websocket_send_timestamp_str);
                websocketLatencyMs = feWsRecvTimestamp.getTime() - serverWsSendDate.getTime();
            } catch (e) {
                console.error("Error parsing websocket_send_timestamp_str:", logData.websocket_send_timestamp_str, e);
            }
        }
        
        let wsJitterMs = null;
        if (websocketLatencyMs !== null && prevWebsocketLatency !== null) {
            wsJitterMs = Math.abs(websocketLatencyMs - prevWebsocketLatency);
        }
        prevWebsocketLatency = websocketLatencyMs;

        // Calculate Total Latency
        let totalLatencyMs = null;
        const espP = logData.espnow_latency_penyemaian_ms;
        const espD = logData.espnow_latency_dewasa_ms;
        const mqttL = logData.mqtt_latency_ms;
        
        let espNowEffectiveLatency = 0;
        if (typeof espP === 'number' && espP !== -1) {
            espNowEffectiveLatency = Math.max(espNowEffectiveLatency, espP);
        }
        if (typeof espD === 'number' && espD !== -1) {
            espNowEffectiveLatency = Math.max(espNowEffectiveLatency, espD);
        }

        let tempTotalLatency = 0;
        let validComponentsForTotal = 0;
        if (espNowEffectiveLatency > 0) {
            tempTotalLatency += espNowEffectiveLatency;
            validComponentsForTotal++;
        }
        if (typeof mqttL === 'number') {
            tempTotalLatency += mqttL;
            validComponentsForTotal++;
        }
        if (typeof websocketLatencyMs === 'number') {
            tempTotalLatency += websocketLatencyMs;
            validComponentsForTotal++;
        }
        if (validComponentsForTotal > 0) {
            totalLatencyMs = tempTotalLatency;
        }

        // Extract simulator packet ID from various possible locations
        let simPacketId = '-';
        if (data.log_data && data.log_data.packet_id) {
            // If the backend forwards the simulator's original packet_id as separate field
            simPacketId = data.log_data.packet_id;
        } else if (data.sections && data.sections.remaja && data.sections.remaja.packet_id) {
            // If simulator sends packet_id in remaja section
            simPacketId = data.sections.remaja.packet_id;
        } else if (data.packet_id) {
            // If simulator sends packet_id at top level
            simPacketId = data.packet_id;
        }
        // If none found, keep as '-'

        const entry = {
            backendPacketId: logData.packet_id || '-',
            simPacketId: simPacketId,
            hwSendTs: formatTimestamp(logData.hardware_send_timestamp_str),
            serverMqttRecvTs: formatTimestamp(logData.server_mqtt_recv_timestamp_str),
            serverWsSendTs: formatTimestamp(logData.websocket_send_timestamp_str),
            feWsRecvTs: formatTimestamp(feWsRecvTimestamp.toISOString()),
            cpuBackendPercent: logData.cpu_backend_percent !== null ? Math.min(100, parseFloat(logData.cpu_backend_percent)).toFixed(2) : '--',
            memoryBackendMb: logData.memory_backend_mb !== null ? logData.memory_backend_mb.toFixed(2) : '--',
            espP: espP !== null && espP !== -1 ? espP.toFixed(2) : '--',
            espD: espD !== null && espD !== -1 ? espD.toFixed(2) : '--',
            mqtt: mqttL !== null ? mqttL.toFixed(2) : '--',
            ws: websocketLatencyMs !== null ? websocketLatencyMs.toFixed(2) : '--',
            total: totalLatencyMs !== null ? totalLatencyMs.toFixed(2) : '--',
            jitterEspP: logData.espnow_penyemaian_jitter_ms !== null ? logData.espnow_penyemaian_jitter_ms.toFixed(2) : '--',
            jitterEspD: logData.espnow_dewasa_jitter_ms !== null ? logData.espnow_dewasa_jitter_ms.toFixed(2) : '--',
            jitterMqtt: logData.mqtt_jitter_ms !== null ? logData.mqtt_jitter_ms.toFixed(2) : '--',
            jitterWs: wsJitterMs !== null ? wsJitterMs.toFixed(2) : '--',
            msgsPerSecBackend: logData.msgs_per_sec_backend !== null ? logData.msgs_per_sec_backend.toFixed(2) : '--',
            throughputBackendPercentage: logData.throughput_backend_percentage !== null ? logData.throughput_backend_percentage.toFixed(2) : '--',
            packetLossBackendPercentage: logData.packet_loss_backend_percentage !== null ? logData.packet_loss_backend_percentage.toFixed(2) : '--',
        };

        logEntries.unshift(entry); 
        if (logEntries.length > maxLogEntries) {
            logEntries.pop(); 
        }

        renderLogTable();
        updateStats(entry, logData);
        updateSummaryStats();
    });

    function formatTimestamp(isoString) {
        if (!isoString || isoString === "N/A") return "--";
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
        } catch (e) {
            console.error("Error formatting timestamp:", isoString, e);
            return isoString; // Return original if parsing fails
        }
    }
    
    function renderLogTable() {
        if (!logTableBody) return;
        logTableBody.innerHTML = '';

        if (logEntries.length === 0) {
            logTableBody.innerHTML = '<tr><td colspan="20" style="text-align:center;">Menunggu data log...</td></tr>';
            return;
        }

        logEntries.forEach(entry => {
            const row = logTableBody.insertRow();
            // Make the row look clickable
            row.style.cursor = 'pointer';
            row.classList.add('clickable-log-row');
            
            // Add a click event listener to remove the row
            row.addEventListener('click', function() {
                // Find the index of this entry in the logEntries array
                const index = logEntries.indexOf(entry);
                if (index > -1) {
                    // Remove from the data array
                    logEntries.splice(index, 1);
                    // Remove from the DOM
                    this.remove();
                }
            });
            
            row.insertCell().textContent = entry.backendPacketId;
            row.insertCell().textContent = entry.simPacketId;
            row.insertCell().textContent = entry.hwSendTs;
            row.insertCell().textContent = entry.serverMqttRecvTs;
            row.insertCell().textContent = entry.serverWsSendTs;
            row.insertCell().textContent = entry.feWsRecvTs;
            row.insertCell().textContent = entry.cpuBackendPercent;
            row.insertCell().textContent = entry.memoryBackendMb;
            row.insertCell().textContent = entry.espP;
            row.insertCell().textContent = entry.espD;
            row.insertCell().textContent = entry.mqtt;
            row.insertCell().textContent = entry.ws;
            row.insertCell().textContent = entry.total;
            row.insertCell().textContent = entry.jitterEspP;
            row.insertCell().textContent = entry.jitterEspD;
            row.insertCell().textContent = entry.jitterMqtt;
            row.insertCell().textContent = entry.jitterWs;
            row.insertCell().textContent = entry.msgsPerSecBackend;
            row.insertCell().textContent = entry.throughputBackendPercentage;
            row.insertCell().textContent = entry.packetLossBackendPercentage;
        });
    }

    function updateStats(entry, logData) {
        // CPU and RAM stats from backend
        if (logData.cpu_backend_percent !== null) { 
            // Ensure CPU percentage never exceeds 100%
            const cpuVal = Math.min(100, parseFloat(logData.cpu_backend_percent));
            totalCpu += cpuVal; 
            countCpu++;
            currentMaxCpu = Math.max(currentMaxCpu, cpuVal);
        }
        if (logData.memory_backend_mb !== null) { 
            const ramVal = parseFloat(logData.memory_backend_mb);
            totalRam += ramVal; 
            countRam++; 
            currentMaxRam = Math.max(currentMaxRam, ramVal);
        }

        // Latencies
        if (logData.espnow_latency_penyemaian_ms !== null && logData.espnow_latency_penyemaian_ms !== -1) { totalEspnowP += parseFloat(logData.espnow_latency_penyemaian_ms); countEspnowP++; }
        if (logData.espnow_latency_dewasa_ms !== null && logData.espnow_latency_dewasa_ms !== -1) { totalEspnowD += parseFloat(logData.espnow_latency_dewasa_ms); countEspnowD++; }
        if (logData.mqtt_latency_ms !== null) { totalMqtt += parseFloat(logData.mqtt_latency_ms); countMqtt++; }
        if (entry.ws !== '--') { totalWs += parseFloat(entry.ws); countWs++; }
        if (entry.total !== '--') { totalOverall += parseFloat(entry.total); countOverall++; }

        // Jitters
        if (logData.espnow_penyemaian_jitter_ms !== null) { totalEspnowPJitter += parseFloat(logData.espnow_penyemaian_jitter_ms); countEspnowPJitter++; }
        if (logData.espnow_dewasa_jitter_ms !== null) { totalEspnowDJitter += parseFloat(logData.espnow_dewasa_jitter_ms); countEspnowDJitter++; }
        if (logData.mqtt_jitter_ms !== null) { totalMqttJitter += parseFloat(logData.mqtt_jitter_ms); countMqttJitter++; }
        if (entry.jitterWs !== '--') { totalWsJitter += parseFloat(entry.jitterWs); countWsJitter++; }
        
        // Throughput stats
        if (logData.msgs_per_sec_backend !== null) { totalMsgsPerSec += parseFloat(logData.msgs_per_sec_backend); countMsgsPerSec++;}
        if (logData.throughput_backend_percentage !== null) { totalThroughput += parseFloat(logData.throughput_backend_percentage); countThroughput++;}
        if (logData.packet_loss_backend_percentage !== null) { totalPacketLoss += parseFloat(logData.packet_loss_backend_percentage); countPacketLoss++;}
    }

    function updateSummaryStats() {
        if (avgCpuBackendEl) {
            const avgCpu = countCpu > 0 ? Math.min(100, totalCpu / countCpu) : 0;
            avgCpuBackendEl.textContent = countCpu > 0 ? avgCpu.toFixed(2) + ' %' : '-- %';
        }
        if (avgRamBackendEl) avgRamBackendEl.textContent = countRam > 0 ? (totalRam / countRam).toFixed(2) + ' MB' : '-- MB';
        if (maxCpuBackendEl) {
            const maxCpu = Math.min(100, currentMaxCpu);
            maxCpuBackendEl.textContent = countCpu > 0 ? maxCpu.toFixed(2) + ' %' : '-- %';
        }
        if (maxRamBackendEl) maxRamBackendEl.textContent = countRam > 0 ? currentMaxRam.toFixed(2) + ' MB' : '-- MB';

        if (avgEspnowPenyemaianEl) avgEspnowPenyemaianEl.textContent = countEspnowP > 0 ? (totalEspnowP / countEspnowP).toFixed(2) + ' ms' : '-- ms';
        if (avgEspnowDewasaEl) avgEspnowDewasaEl.textContent = countEspnowD > 0 ? (totalEspnowD / countEspnowD).toFixed(2) + ' ms' : '-- ms';
        if (avgMqttLatencyEl) avgMqttLatencyEl.textContent = countMqtt > 0 ? (totalMqtt / countMqtt).toFixed(2) + ' ms' : '-- ms';
        if (avgWebsocketLatencyEl) avgWebsocketLatencyEl.textContent = countWs > 0 ? (totalWs / countWs).toFixed(2) + ' ms' : '-- ms';
        if (avgTotalLatencyEl) avgTotalLatencyEl.textContent = countOverall > 0 ? (totalOverall / countOverall).toFixed(2) + ' ms' : '-- ms';
        
        if (avgEspnowPJitterEl) avgEspnowPJitterEl.textContent = countEspnowPJitter > 0 ? (totalEspnowPJitter / countEspnowPJitter).toFixed(2) + ' ms' : '-- ms';
        if (avgEspnowDJitterEl) avgEspnowDJitterEl.textContent = countEspnowDJitter > 0 ? (totalEspnowDJitter / countEspnowDJitter).toFixed(2) + ' ms' : '-- ms';
        if (avgMqttJitterEl) avgMqttJitterEl.textContent = countMqttJitter > 0 ? (totalMqttJitter / countMqttJitter).toFixed(2) + ' ms' : '-- ms';
        if (avgWebsocketJitterEl) avgWebsocketJitterEl.textContent = countWsJitter > 0 ? (totalWsJitter / countWsJitter).toFixed(2) + ' ms' : '-- ms';
        
        if (packetsReceivedEl) packetsReceivedEl.textContent = logEntries.length;

        if (msgsPerSecBackendEl) msgsPerSecBackendEl.textContent = countMsgsPerSec > 0 ? (totalMsgsPerSec / countMsgsPerSec).toFixed(2) : (logEntries.length > 0 && logEntries[0].msgsPerSecBackend !== '--' ? logEntries[0].msgsPerSecBackend : '--');
        
        // Original frontend throughput/packet loss calculation
        if (connectionStartTime) {
            const elapsedTimeSeconds = (new Date() - connectionStartTime) / 1000;
            let expectedPackets = Math.max(1, Math.floor(elapsedTimeSeconds * 0.5)); // 2 packets per second (every 0.5 seconds)
            const receivedPackets = logEntries.length;
            
            if (receivedPackets > expectedPackets) {
                expectedPackets = receivedPackets;
            }
            
            const throughputPercentage = Math.min(100, ((receivedPackets / expectedPackets) * 100)).toFixed(1);
            const packetLossPercentage = Math.max(0, (100 - parseFloat(throughputPercentage))).toFixed(1);
            
            if (packetsExpectedEl) packetsExpectedEl.textContent = expectedPackets;
            if (throughputPercentageEl) throughputPercentageEl.textContent = throughputPercentage + '%';
            if (packetLossPercentageEl) packetLossPercentageEl.textContent = packetLossPercentage + '%';
        }
    }

    if (exportPerformanceCsvBtn) {
        exportPerformanceCsvBtn.addEventListener('click', function() {
            exportPerformanceLogsToCSV();
        });
    }

    function exportPerformanceLogsToCSV() {
        if (logEntries.length === 0) {
            alert("No performance logs to export.");
            return;
        }

        const headers = [
            "Backend Packet ID", "Expected Packet ID",
            "Hardware Send (UTC)", "Server MQTT Receive (UTC)", "Server WebSocket Send (UTC)", "Frontend WebSocket Receive (Local)",
            "CPU Backend (%)", "Memori Backend (MB)",
            "Latensi ESP-P (ms)", "Latensi ESP-D (ms)", "Latensi MQTT (ms)", "Latensi WS (ms)", "Latensi Total (ms)",
            "Jitter ESP-P (ms)", "Jitter ESP-D (ms)", "Jitter MQTT (ms)", "Jitter WS (ms)",
            "Pesan/Detik (Backend)", "Throughput Backend (%)", "Packet Loss Backend (%)"
        ];
        
        let csvContent = headers.join(",") + "\r\n";

        logEntries.slice().reverse().forEach(entry => {
            const row = [
                entry.backendPacketId, entry.simPacketId,
                entry.hwSendTs, entry.serverMqttRecvTs, entry.serverWsSendTs, entry.feWsRecvTs,
                entry.cpuBackendPercent, entry.memoryBackendMb,
                entry.espP, entry.espD, entry.mqtt, entry.ws, entry.total,
                entry.jitterEspP, entry.jitterEspD, entry.jitterMqtt, entry.jitterWs,
                entry.msgsPerSecBackend, entry.throughputBackendPercentage, entry.packetLossBackendPercentage
            ];
            csvContent += row.map(val => `"${String(val === null || val === undefined ? '--' : val).replace(/"/g, '""')}"`).join(",") + "\r\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
            link.setAttribute("href", url);
            link.setAttribute("download", `performance_logs_${timestamp}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    }

    if (logTableBody) renderLogTable();
    updateSummaryStats();
});
