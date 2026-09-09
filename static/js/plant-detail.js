document.addEventListener('DOMContentLoaded', function() {
    console.log('Plant detail page loaded');
    
    // Define mapping between plant conditions and sensor data fields
    const sensorMapping = {
        temperature: 'temp',
        humidity: 'humidity',
        light: 'light',
        soil_moisture: 'soil_moisture'
    };
    
    // Get min/max values for each condition from the HTML
    const conditionRanges = {};
    document.querySelectorAll('.optimal-condition-card').forEach(card => {
        const sliderEl = card.querySelector('.range-slider');
        if (!sliderEl) return;
        
        const conditionKey = sliderEl.id.replace('-slider', '');
        const targetLabelEl = card.querySelector('.target-label'); // Correct selector

        if (targetLabelEl) {
            const text = targetLabelEl.textContent;
            // Regex to find MIN-MAX in the format "Target kondisi rata-rata MIN-MAX UNIT"
            const match = text.match(/(\d+(\.\d+)?)-(\d+(\.\d+)?)/); 

            if (match && match[1] && match[3]) {
                const min = parseFloat(match[1]);
                const max = parseFloat(match[3]);

                conditionRanges[conditionKey] = { min, max };

                // Position the target bubble to show optimal range
                const rangeOptimal = card.querySelector('.range-optimal');
                const rangeMinMarker = card.querySelector('.range-min-marker');
                const rangeMaxMarker = card.querySelector('.range-max-marker');
                
                if (rangeOptimal) {
                    const totalRange = calculateTotalRange(conditionKey);
                    // Avoid division by zero if totalRange.max === totalRange.min
                    if (totalRange.max > totalRange.min) {
                        const minPos = ((conditionRanges[conditionKey].min - totalRange.min) / (totalRange.max - totalRange.min)) * 100;
                        const maxPos = ((conditionRanges[conditionKey].max - totalRange.min) / (totalRange.max - totalRange.min)) * 100;
                        rangeOptimal.style.left = `${minPos}%`;
                        rangeOptimal.style.width = `${maxPos - minPos}%`;
                        
                        // Position the min/max markers
                        if (rangeMinMarker) rangeMinMarker.style.left = `${minPos}%`;
                        if (rangeMaxMarker) rangeMaxMarker.style.left = `${maxPos}%`;
                    } else {
                         // Handle case where min and max are the same (or range is invalid)
                         rangeOptimal.style.left = '0%';
                         rangeOptimal.style.width = '100%'; // Or some other default
                    }
                }
            } else {
                console.error('Could not parse min/max from target label for:', conditionKey, 'Text:', text);
            }
        } else {
            console.error('Target label element not found for:', conditionKey);
        }
    });
    console.log('Initial conditionRanges:', conditionRanges); // Add logging here
    
    // Calculate the total range for the slider (add 20% padding to min/max)
    function calculateTotalRange(conditionKey) {
        // Check if conditionRanges[conditionKey] exists before accessing min/max
        if (!conditionRanges[conditionKey]) {
             console.error('Condition range not found for total range calculation:', conditionKey);
             return { min: 0, max: 100 }; // Return a default range
        }

        const min = conditionRanges[conditionKey].min;
        const max = conditionRanges[conditionKey].max;
        const range = max - min;
        
        return {
            min: Math.max(0, min - (range * 0.2)),
            max: max + (range * 0.2)
        };
    }
    
    // Connect to Socket.IO for real-time updates
    const socket = io();
    
    socket.on('connect', function() {
        console.log('Connected to socket server');
        document.getElementById('loading-overlay').style.display = 'none';
    });
    
    socket.on('disconnect', function() {
        console.log('Disconnected from socket server');
        document.getElementById('loading-overlay').style.display = 'flex';
    });
    
    // Listen for sensor data updates from WebSocket
    socket.on('sensor_update', function(data) {
        console.log('Received sensor update:', data);
        updateDisplay(data);
    });

    // Check for simulated data from 3D greenhouse simulation
    const loadSimulatedData = () => {
        try {
            const raw = localStorage.getItem('lokagrow_sim_data');
            if (raw) {
                const simData = JSON.parse(raw);
                updateDisplay(simData);
                return true;
            }
        } catch (e) {}
        return false;
    };

    // Load initial simulation data immediately
    loadSimulatedData();

    // Listen to storage events across tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'lokagrow_sim_data') {
            loadSimulatedData();
        }
    });

    // Periodically sync with simulation
    setInterval(loadSimulatedData, 1000);
    
    // Update the UI with sensor data
    function updateDisplay(sensorData) {
        if (!sensorData || !sensorData.averages) {
            console.log('No valid sensor data received');
            return;
        }
        
        document.getElementById('loading-overlay').style.display = 'none';
        
        // For each condition we're tracking
        Object.keys(sensorMapping).forEach(conditionKey => {
            // Get the corresponding sensor data field
            const sensorKey = sensorMapping[conditionKey];
            // Get the value from the sensor data
            let value = sensorData.averages[sensorKey];
            
            // Fallback for soil moisture if not provided by ambient atmospheric sensors
            if (value === undefined && conditionKey === 'soil_moisture') {
                const hum = sensorData.averages.humidity || 65;
                value = Math.min(85, Math.max(50, 62 + (hum - 65) * 0.25));
            }
            
            if (value !== undefined) {
                updateConditionDisplay(conditionKey, value);
            }
        });
    }
    
    // Update a single condition's display
function updateConditionDisplay(conditionKey, value) {
    // Add a check here
    if (!conditionRanges[conditionKey]) {
        console.error('Condition range not found for:', conditionKey);
        return; // Exit the function if range is not defined
    }
    
    // Check if in optimal range
    const isInRange = (value >= conditionRanges[conditionKey].min && value <= conditionRanges[conditionKey].max);
    
    // Update the current value text
    const currentValueEl = document.getElementById(`current-${conditionKey}`);
    if (currentValueEl) {
        currentValueEl.textContent = value.toFixed(1);
        
        // Set color based on status
        if (isInRange) {
            currentValueEl.style.color = 'var(--primary-dark)';
        } else if (value < conditionRanges[conditionKey].min) {
            currentValueEl.style.color = '#E53935'; // Below range - red
        } else {
            currentValueEl.style.color = '#FF9800'; // Above range - orange/amber
        }
    }
        
        // Update the marker position and bubble
        const marker = document.getElementById(`${conditionKey}-marker`);
        const bubble = document.getElementById(`${conditionKey}-bubble`);
        const slider = document.getElementById(`${conditionKey}-slider`);
        
        if (marker && bubble && slider) {
            const bubbleValueEl = bubble.querySelector('.current-bubble-value');
            if (bubbleValueEl) {
                bubbleValueEl.textContent = value.toFixed(1);
            }
            
            // Calculate position percentage based on the total range
            const totalRange = calculateTotalRange(conditionKey);
            const position = ((value - totalRange.min) / (totalRange.max - totalRange.min)) * 100;
            
            // Limit position to 0-100% range
            const limitedPosition = Math.min(Math.max(position, 0), 100);
            
            // Set the marker and bubble positions
            marker.style.left = `${limitedPosition}%`;
            bubble.style.left = `${limitedPosition}%`;
            
            // Using the already calculated isInRange value from above
            
            // Update marker class for styling
            if (isInRange) {
                marker.classList.add('in-range');
                marker.classList.remove('out-of-range');
            } else {
                marker.classList.add('out-of-range');
                marker.classList.remove('in-range');
            }
            
            // Update status message
            const statusEl = document.getElementById(`status-${conditionKey}`);
            if (statusEl) {
                if (isInRange) {
                    statusEl.innerHTML = 'Nilai saat ini dalam rentang optimal <i class="fas fa-check-circle"></i>';
                    statusEl.classList.add('in-range');
                    statusEl.classList.remove('out-of-range');
                } else if (value < conditionRanges[conditionKey].min) {
                    statusEl.innerHTML = 'Nilai saat ini di bawah rentang optimal <i class="fas fa-triangle-exclamation"></i>';
                    statusEl.classList.add('out-of-range');
                    statusEl.classList.remove('in-range');
                } else {
                    statusEl.innerHTML = 'Nilai saat ini di atas rentang optimal <i class="fas fa-triangle-exclamation"></i>';
                    statusEl.classList.add('out-of-range');
                    statusEl.classList.remove('in-range');
                }
            }
        }
    }
    
    // Helper function to calculate color based on value and range
    function getStatusColor(value, min, max) {
        if (value >= min && value <= max) {
            return 'var(--primary)';  // In range - green
        } else if (value < min) {
            return '#E53935';  // Below range - red
        } else {
            return '#FF9800';  // Above range - orange/amber
        }
    }
    
    // Initialize with default/mock data if needed
    const mockData = {
        averages: {
            temperature: 28,
            humidity: 65,
            light: 12,
            soil_moisture: 65
        }
    };
    
    // Use this mockData to show something before real data arrives
    updateDisplay(mockData);
});
