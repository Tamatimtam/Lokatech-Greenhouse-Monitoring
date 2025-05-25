document.addEventListener('DOMContentLoaded', function() {
    // Tab switching logic
    const tabLinks = document.querySelectorAll('.tab-header .tab-link');
    const tabContents = document.querySelectorAll('.container .tab-content');

    // Function to activate a tab
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

    // Set initial active tab based on HTML class
    // This ensures the JS respects the server-rendered active tab
    const initialActiveLink = document.querySelector('.tab-header .tab-link.active');
    if (initialActiveLink) {
        const initialTabId = initialActiveLink.getAttribute('data-tab');
        activateTab(initialTabId); // Ensure consistency if JS loads after some interaction or if classes are misaligned
    } else if (tabLinks.length > 0) {
        // Fallback: if no tab is marked active in HTML, activate the first one
        // Or, activate a specific default like 'tab-performance'
        activateTab(tabLinks[0].getAttribute('data-tab'));
    }


    tabLinks.forEach(link => {
        link.addEventListener('click', function(event) {
            event.preventDefault(); // Prevent any default button behavior if necessary
            const tabId = this.getAttribute('data-tab');
            activateTab(tabId);
        });
    });

    // Existing logs.js code for Performance Logs
    const socket = io();
    const logTableBody = document.getElementById('log-table-body');
    const maxLogsInput = document.getElementById('maxLogs');
    const clearLogsButton = document.getElementById('clearLogsButton');
    const exportPerformanceCsvBtn = document.getElementById('exportPerformanceCsvBtn');

    // Summary elements
    const avgEspnowPenyemaianEl = document.getElementById('avg-espnow-penyemaian');
    const avgEspnowDewasaEl = document.getElementById('avg-espnow-dewasa');
    const avgMqttLatencyEl = document.getElementById('avg-mqtt-latency');
    const avgWebsocketLatencyEl = document.getElementById('avg-websocket-latency');
    const avgTotalLatencyEl = document.getElementById('avg-total-latency');
    const avgMqttJitterEl = document.getElementById('avg-mqtt-jitter');
    const avgWebsocketJitterEl = document.getElementById('avg-websocket-jitter');
    const avgEspnowPJitterEl = document.getElementById('avg-espnow-p-jitter');
    const avgEspnowDJitterEl = document.getElementById('avg-espnow-d-jitter');
    const packetsReceivedEl = document.getElementById('packets-received');

    // New elements for throughput stats
    const packetsExpectedEl = document.getElementById('packets-expected');
    const throughputPercentageEl = document.getElementById('throughput-percentage');
    const packetLossPercentageEl = document.getElementById('packet-loss-percentage');
    
    let logEntries = [];
    let maxLogEntries = parseInt(maxLogsInput.value, 10);

    let prevMqttLatency = null;
    let prevWebsocketLatency = null;
    let prevEspnowPLatency = null;
    let prevEspnowDLatency = null;

    // Stats for averages
    let totalEspnowP = 0, countEspnowP = 0;
    let totalEspnowD = 0, countEspnowD = 0;
    let totalMqtt = 0, countMqtt = 0;
    let totalWs = 0, countWs = 0;
    let totalOverall = 0, countOverall = 0;
    let totalMqttJitter = 0, countMqttJitter = 0;
    let totalWsJitter = 0, countWsJitter = 0;
    let totalEspnowPJitter = 0, countEspnowPJitter = 0;
    let totalEspnowDJitter = 0, countEspnowDJitter = 0;

    // Tracking variables for throughput calculation
    let connectionStartTime = null;
    let expectedPacketsPerSecond = 0.6; // 1 packet every 2 seconds

    maxLogsInput.addEventListener('change', function() {
        maxLogEntries = parseInt(this.value, 10);
        renderLogTable(); // Re-render with new limit
    });

    clearLogsButton.addEventListener('click', function() {
        logEntries = [];
        prevMqttLatency = null;
        prevWebsocketLatency = null;
        prevEspnowPLatency = null;
        prevEspnowDLatency = null;
        totalEspnowP = 0; countEspnowP = 0;
        totalEspnowD = 0; countEspnowD = 0;
        totalMqtt = 0; countMqtt = 0;
        totalWs = 0; countWs = 0;
        totalOverall = 0; countOverall = 0;
        totalMqttJitter = 0; countMqttJitter = 0;
        totalWsJitter = 0; countWsJitter = 0;
        totalEspnowPJitter = 0; countEspnowPJitter = 0;
        totalEspnowDJitter = 0; countEspnowDJitter = 0;
        
        renderLogTable();
        updateSummaryStats();
        if (logTableBody.firstChild.cells[0].textContent === "Menunggu data log...") {
            // Do nothing, placeholder already there
        } else if (logEntries.length === 0) {
             logTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Log dibersihkan. Menunggu data baru...</td></tr>';
        }

        // Reset throughput tracking
        connectionStartTime = new Date();
    });


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
        const feWsRecvTimestamp = new Date(); // Frontend WebSocket reception time (Local)
        const logData = data.log_data;

        if (!logData) {
            console.warn('Received sensor_update without log_data:', data);
            return;
        }
        
        console.debug('Logs.js - Received log_data:', JSON.stringify(logData, null, 2));

        let mqttLatencyMs = logData.mqtt_latency_ms;
        let espnowLatencyPenyemaianMs = logData.espnow_latency_penyemaian_ms;
        let espnowLatencyDewasaMs = logData.espnow_latency_dewasa_ms;
        let websocketLatencyMs = null;
        let totalLatencyMs = null;

        // Calculate WebSocket Latency
        if (logData.websocket_send_timestamp_str && logData.websocket_send_timestamp_str !== "N/A") {
            try {
                const serverWsSendDate = new Date(logData.websocket_send_timestamp_str);
                websocketLatencyMs = feWsRecvTimestamp.getTime() - serverWsSendDate.getTime();
            } catch (e) {
                console.error("Error parsing websocket_send_timestamp_str:", logData.websocket_send_timestamp_str, e);
            }
        }
        
        // Calculate Total Latency
        // Only if all components are valid numbers
        const latencies = [espnowLatencyPenyemaianMs, espnowLatencyDewasaMs, mqttLatencyMs, websocketLatencyMs].filter(l => typeof l === 'number');
        if (latencies.length > 0) { // If at least one ESP-NOW latency is present, sum it with others
            let sum = 0;
            let espNowComponent = 0;
            if (typeof espnowLatencyPenyemaianMs === 'number' && espnowLatencyPenyemaianMs !== -1) espNowComponent = Math.max(espNowComponent, espnowLatencyPenyemaianMs);
            if (typeof espnowLatencyDewasaMs === 'number' && espnowLatencyDewasaMs !== -1) espNowComponent = Math.max(espNowComponent, espnowLatencyDewasaMs);
            
            if (espNowComponent > 0) sum += espNowComponent;
            if (typeof mqttLatencyMs === 'number') sum += mqttLatencyMs;
            if (typeof websocketLatencyMs === 'number') sum += websocketLatencyMs;
            totalLatencyMs = sum > 0 ? sum : null;
        }


        // Calculate Jitter for ESP-NOW Penyemaian
        let espnowPJitterMs = null;
        if (espnowLatencyPenyemaianMs !== null && espnowLatencyPenyemaianMs !== -1 && prevEspnowPLatency !== null && prevEspnowPLatency !== -1) {
            espnowPJitterMs = Math.abs(espnowLatencyPenyemaianMs - prevEspnowPLatency);
        }
        prevEspnowPLatency = espnowLatencyPenyemaianMs !== -1 ? espnowLatencyPenyemaianMs : prevEspnowPLatency;

        // Calculate Jitter for ESP-NOW Dewasa
        let espnowDJitterMs = null;
        if (espnowLatencyDewasaMs !== null && espnowLatencyDewasaMs !== -1 && prevEspnowDLatency !== null && prevEspnowDLatency !== -1) {
            espnowDJitterMs = Math.abs(espnowLatencyDewasaMs - prevEspnowDLatency);
        }
        prevEspnowDLatency = espnowLatencyDewasaMs !== -1 ? espnowLatencyDewasaMs : prevEspnowDLatency;

        // Calculate Jitter for MQTT
        let mqttJitterMs = null;
        if (mqttLatencyMs !== null && prevMqttLatency !== null) {
            mqttJitterMs = Math.abs(mqttLatencyMs - prevMqttLatency);
        }
        prevMqttLatency = mqttLatencyMs;

        // Calculate Jitter for WebSocket
        let wsJitterMs = null;
        if (websocketLatencyMs !== null && prevWebsocketLatency !== null) {
            wsJitterMs = Math.abs(websocketLatencyMs - prevWebsocketLatency);
        }
        prevWebsocketLatency = websocketLatencyMs;

        const entry = {
            packetId: logData.packet_id || '-',
            hwSendTs: formatTimestamp(logData.hardware_send_timestamp_str),
            serverMqttRecvTs: formatTimestamp(logData.server_mqtt_recv_timestamp_str),
            serverWsSendTs: formatTimestamp(logData.websocket_send_timestamp_str),
            feWsRecvTs: formatTimestamp(feWsRecvTimestamp.toISOString()),
            espP: espnowLatencyPenyemaianMs !== null && espnowLatencyPenyemaianMs !== -1 ? espnowLatencyPenyemaianMs : '--',
            espD: espnowLatencyDewasaMs !== null && espnowLatencyDewasaMs !== -1 ? espnowLatencyDewasaMs : '--',
            mqtt: mqttLatencyMs !== null ? mqttLatencyMs.toFixed(2) : '--',
            ws: websocketLatencyMs !== null ? websocketLatencyMs.toFixed(2) : '--',
            total: totalLatencyMs !== null ? totalLatencyMs.toFixed(2) : '--',
            jitterMqtt: mqttJitterMs !== null ? mqttJitterMs.toFixed(2) : '--',
            jitterWs: wsJitterMs !== null ? wsJitterMs.toFixed(2) : '--',
            jitterEspP: espnowPJitterMs !== null ? espnowPJitterMs.toFixed(2) : '--',
            jitterEspD: espnowDJitterMs !== null ? espnowDJitterMs.toFixed(2) : '--',
        };

        logEntries.unshift(entry); // Add to the beginning of the array
        if (logEntries.length > maxLogEntries) {
            logEntries.pop(); // Remove the oldest entry
        }

        renderLogTable();
        updateStats(entry);
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
        logTableBody.innerHTML = ''; // Clear existing rows

        if (logEntries.length === 0) {
            logTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Menunggu data log...</td></tr>';
            return;
        }

        logEntries.forEach(entry => {
            const row = logTableBody.insertRow();
            row.insertCell().textContent = entry.packetId;
            row.insertCell().textContent = entry.hwSendTs;
            row.insertCell().textContent = entry.serverMqttRecvTs;
            row.insertCell().textContent = entry.serverWsSendTs;
            row.insertCell().textContent = entry.feWsRecvTs;
            row.insertCell().textContent = entry.espP;
            row.insertCell().textContent = entry.espD;
            row.insertCell().textContent = entry.mqtt;
            row.insertCell().textContent = entry.ws;
            row.insertCell().textContent = entry.total;
            row.insertCell().textContent = entry.jitterMqtt;
            row.insertCell().textContent = entry.jitterWs;
        });
    }

    function updateStats(entry) {
        if (entry.espP !== '--') { totalEspnowP += parseFloat(entry.espP); countEspnowP++; }
        if (entry.espD !== '--') { totalEspnowD += parseFloat(entry.espD); countEspnowD++; }
        if (entry.mqtt !== '--') { totalMqtt += parseFloat(entry.mqtt); countMqtt++; }
        if (entry.ws !== '--') { totalWs += parseFloat(entry.ws); countWs++; }
        if (entry.total !== '--') { totalOverall += parseFloat(entry.total); countOverall++; }
        if (entry.jitterMqtt !== '--') { totalMqttJitter += parseFloat(entry.jitterMqtt); countMqttJitter++; }
        if (entry.jitterWs !== '--') { totalWsJitter += parseFloat(entry.jitterWs); countWsJitter++; }
        if (entry.jitterEspP !== '--') { totalEspnowPJitter += parseFloat(entry.jitterEspP); countEspnowPJitter++; }
        if (entry.jitterEspD !== '--') { totalEspnowDJitter += parseFloat(entry.jitterEspD); countEspnowDJitter++; }
    }

    function updateSummaryStats() {
        avgEspnowPenyemaianEl.textContent = countEspnowP > 0 ? (totalEspnowP / countEspnowP).toFixed(2) + ' ms' : '-- ms';
        avgEspnowDewasaEl.textContent = countEspnowD > 0 ? (totalEspnowD / countEspnowD).toFixed(2) + ' ms' : '-- ms';
        avgMqttLatencyEl.textContent = countMqtt > 0 ? (totalMqtt / countMqtt).toFixed(2) + ' ms' : '-- ms';
        avgWebsocketLatencyEl.textContent = countWs > 0 ? (totalWs / countWs).toFixed(2) + ' ms' : '-- ms';
        avgTotalLatencyEl.textContent = countOverall > 0 ? (totalOverall / countOverall).toFixed(2) + ' ms' : '-- ms';
        avgMqttJitterEl.textContent = countMqttJitter > 0 ? (totalMqttJitter / countMqttJitter).toFixed(2) + ' ms' : '-- ms';
        avgWebsocketJitterEl.textContent = countWsJitter > 0 ? (totalWsJitter / countWsJitter).toFixed(2) + ' ms' : '-- ms';
        avgEspnowPJitterEl.textContent = countEspnowPJitter > 0 ? (totalEspnowPJitter / countEspnowPJitter).toFixed(2) + ' ms' : '-- ms';
        avgEspnowDJitterEl.textContent = countEspnowDJitter > 0 ? (totalEspnowDJitter / countEspnowDJitter).toFixed(2) + ' ms' : '-- ms';
        packetsReceivedEl.textContent = logEntries.length;
        
        // Calculate throughput statistics
        if (connectionStartTime) {
            const elapsedTimeSeconds = (new Date() - connectionStartTime) / 1000;
            let expectedPackets = Math.max(1, Math.floor(elapsedTimeSeconds * expectedPacketsPerSecond));
            const receivedPackets = logEntries.length;
            
            // If received packets exceeds expected packets, adjust expected packets to match
            if (receivedPackets > expectedPackets) {
                expectedPackets = receivedPackets;
            }
            
            const throughputPercentage = Math.min(100, ((receivedPackets / expectedPackets) * 100)).toFixed(1);
            const packetLossPercentage = Math.max(0, (100 - throughputPercentage)).toFixed(1);
            
            packetsExpectedEl.textContent = expectedPackets;
            throughputPercentageEl.textContent = throughputPercentage + '%';
            packetLossPercentageEl.textContent = packetLossPercentage + '%';
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
            "Packet ID", "Hardware Send (UTC)", "Server MQTT Receive (UTC)", "Server WebSocket Send (UTC)", "Frontend WebSocket Receive (Local)",
            "ESP-P Latency (ms)", "ESP-D Latency (ms)", "MQTT Latency (ms)", "WebSocket Latency (ms)", "Total Latency (ms)",
            "Jitter MQTT (ms)", "Jitter WebSocket (ms)", "Jitter ESP-P (ms)", "Jitter ESP-D (ms)"
        ];
        
        let csvContent = headers.join(",") + "\r\n";

        logEntries.forEach(entry => {
            const row = [
                entry.packetId, entry.hwSendTs, entry.serverMqttRecvTs, entry.serverWsSendTs, entry.feWsRecvTs,
                entry.espP, entry.espD, entry.mqtt, entry.ws, entry.total,
                entry.jitterMqtt, entry.jitterWs, entry.jitterEspP, entry.jitterEspD
            ];
            csvContent += row.join(",") + "\r\n";
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

    // Initial render in case there are no logs yet
    renderLogTable();
    updateSummaryStats();
});
