// Global variables
let temperatureChart; // Holds the Chart.js instance for the temperature chart.
let currentSelectedRange = "1day"; // Tracks the currently active time range filter (e.g., "1hour", "1day"). Default is "1day".

// Defines a consistent color palette for different greenhouse sections in the chart.
const chartColors = {
    dewasa: 'rgba(231, 76, 60, 1)',     // Red
    remaja: 'rgba(52, 152, 219, 1)',    // Blue
    penyemaian: 'rgba(46, 204, 113, 1)',// Green
    averages: 'rgba(155, 89, 182, 1)'   // Purple
};

// Fires when the initial HTML document has been completely loaded and parsed.
document.addEventListener('DOMContentLoaded', function() {
    setupTimeRangeButtons(); // Initializes event listeners for time range filter buttons.
    initTemperatureChart();  // Sets up the initial empty temperature chart.
    loadHistoricalData(currentSelectedRange); // Loads data for the default time range.
});

// Sets up click event listeners for the time range selection buttons.
function setupTimeRangeButtons() {
    const buttons = document.querySelectorAll('.time-range-btn');
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // Manages 'active' class styling for buttons.
            buttons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            // Updates the global time range and reloads data.
            currentSelectedRange = this.getAttribute('data-range');
            loadHistoricalData(currentSelectedRange);
        });
    });
}

// Initializes the temperature chart with Chart.js.
function initTemperatureChart() {
    const ctx = document.getElementById('temperatureChart').getContext('2d');
    temperatureChart = new Chart(ctx, {
        type: 'line', // Specifies the chart type.
        data: {
            datasets: [] // Datasets are populated dynamically by updateTemperatureChart.
        },
        options: {
            responsive: true, // Makes the chart responsive to container size.
            maintainAspectRatio: false, // Allows chart to fill container height without fixed aspect ratio.
            scales: {
                x: {
                    type: 'time', // Configures X-axis for time-series data.
                    time: {
                        // tooltipFormat is dynamically set in updateTemperatureChart based on range.
                        tooltipFormat: 'MMM d, yyyy HH:mm' // Default tooltip format.
                    },
                    title: {
                        display: true,
                        text: 'Time' // X-axis label.
                    },
                    ticks: {
                        source: 'auto', // Chart.js automatically determines optimal tick placement.
                        maxRotation: 0, // Prevents X-axis labels from rotating.
                        autoSkipPadding: 20, // Adds padding to prevent labels from overlapping.
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Temperature (°C)' // Y-axis label.
                    },
                    beginAtZero: false // Y-axis does not necessarily start at zero for temperature.
                }
            },
            plugins: {
                legend: {
                    position: 'top', // Positions the legend at the top of the chart.
                },
                tooltip: {
                    mode: 'nearest', // Tooltip appears for the data point nearest to the cursor.
                    axis: 'x',       // Considers nearness along the X-axis.
                    intersect: false, // Tooltip activates when hovering near a point, not strictly on it.
                }
            }
        }
    });
}

// Fetches historical data from the backend API based on the selected time range.
function loadHistoricalData(selectedRange) {
    const chartContainerId = 'temperatureChartContainer'; 
    showLoadingState(chartContainerId); // Displays a loading indicator.
    updateTemperatureInsights(null); // Clears previous insight values.

    let daysToFetchAPI = 1; // Default days to fetch for the API.
    if (selectedRange.endsWith('day')) {
        daysToFetchAPI = parseInt(selectedRange); // Parses days from ranges like "1day", "7day".
    }
    // For "1hour" range, we fetch 1 day of data and filter it on the client-side.

    fetch(`/history/data?days=${daysToFetchAPI}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(apiResponse => {
            hideLoadingState(chartContainerId); // Hides loading indicator.
            if (apiResponse.success && apiResponse.data) {
                // Processes the fetched data to prepare it for chart and insights.
                const { chartData, insightsData } = processTemperatureData(apiResponse.data, selectedRange);
                updateTemperatureChart(chartData, selectedRange); // Updates the chart with new data.
                updateTemperatureInsights(insightsData); // Updates the insight boxes.

                // Checks if any data exists for the processed range to display appropriate messages.
                const hasDataForRange = Object.values(chartData).some(arr => arr.length > 0);
                if (!hasDataForRange) {
                    showErrorState(chartContainerId, 'No data available for the selected period.');
                    updateTemperatureInsights(null); 
                }
            } else {
                showErrorState(chartContainerId, apiResponse.message || 'Failed to load data.');
                updateTemperatureInsights(null);
            }
        })
        .catch(error => {
            hideLoadingState(chartContainerId);
            console.error('Error fetching historical data:', error);
            showErrorState(chartContainerId, `Error fetching data: ${error.message}`);
            updateTemperatureInsights(null);
        });
}

// Processes raw API data: filters for "1hour", downsamples for "1day", and calculates insights.
function processTemperatureData(apiData, selectedRange) {
    let dataForInsightCalculation = apiData; // Data used for calculating Min/Max/Avg insights.
    let dataForChartDisplay = apiData;    // Data used for plotting points on the chart.

    // Client-side filtering for "1hour" range: uses data from the last 60 minutes.
    if (selectedRange === "1hour") {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const hourlyFilteredData = apiData.filter(point => new Date(point.timestamp) >= oneHourAgo);
        dataForInsightCalculation = hourlyFilteredData;
        dataForChartDisplay = hourlyFilteredData; 
    }
    // For "7day" and "30day", dataForInsightCalculation and dataForChartDisplay remain the full apiData.

    // Calculate true Min/Max temperatures and overall average from the (potentially filtered) insight data.
    const validSections = Object.keys(chartColors); 
    let trueMinTemp = { value: Infinity, timestamp: null, section: null, originalPoint: null };
    let trueMaxTemp = { value: -Infinity, timestamp: null, section: null, originalPoint: null };
    let sumOfAverageTemps = 0;
    let countOfAverageTemps = 0;

    dataForInsightCalculation.forEach(point => { 
        const timestamp = new Date(point.timestamp); 
        validSections.forEach(sectionName => {
            if (point.data && point.data[sectionName] && 
                point.data[sectionName].temps && 
                typeof point.data[sectionName].temps.avg === 'number') {
                
                const currentAvgTemp = point.data[sectionName].temps.avg;
                // Tracks the absolute minimum temperature point.
                if (currentAvgTemp < trueMinTemp.value) {
                    trueMinTemp = { value: currentAvgTemp, timestamp: timestamp, section: sectionName, originalPoint: point };
                }
                // Tracks the absolute maximum temperature point.
                if (currentAvgTemp > trueMaxTemp.value) {
                    trueMaxTemp = { value: currentAvgTemp, timestamp: timestamp, section: sectionName, originalPoint: point };
                }
                // Sums 'averages' section temperatures for overall average calculation.
                if (sectionName === 'averages') {
                    sumOfAverageTemps += currentAvgTemp;
                    countOfAverageTemps++;
                }
            }
        });
    });

    const insightsData = {
        minTemp: trueMinTemp.value !== Infinity ? { value: trueMinTemp.value, timestamp: trueMinTemp.timestamp, section: trueMinTemp.section } : null,
        maxTemp: trueMaxTemp.value !== -Infinity ? { value: trueMaxTemp.value, timestamp: trueMaxTemp.timestamp, section: trueMaxTemp.section } : null,
        overallAverageTemp: countOfAverageTemps > 0 ? (sumOfAverageTemps / countOfAverageTemps) : null
    };

    // For "1day" range, downsample data for chart display to reduce clutter,
    // but ensure the true Min/Max points are included for visual consistency with insights.
    if (selectedRange === "1day") {
        const DOWNSAMPLE_INTERVAL_MINUTES = 15; // Target interval for downsampling.
        let downsampledPoints = [];

        if (apiData.length > 0) {
            downsampledPoints.push(apiData[0]); // Always include the first data point.
            let lastSelectedTime = new Date(apiData[0].timestamp).getTime();

            // Select points at roughly DOWNSAMPLE_INTERVAL_MINUTES.
            for (let i = 1; i < apiData.length -1; i++) { 
                const currentTime = new Date(apiData[i].timestamp).getTime();
                if (currentTime - lastSelectedTime >= DOWNSAMPLE_INTERVAL_MINUTES * 60 * 1000) {
                    downsampledPoints.push(apiData[i]);
                    lastSelectedTime = currentTime;
                }
            }
            // Always include the last data point.
            if (apiData.length > 1 && downsampledPoints[downsampledPoints.length -1] !== apiData[apiData.length -1]) {
                 downsampledPoints.push(apiData[apiData.length - 1]); 
            }
        }
        
        // Explicitly add the original data points corresponding to true Min/Max temperatures.
        if (trueMinTemp.originalPoint) {
            downsampledPoints.push(trueMinTemp.originalPoint);
        }
        if (trueMaxTemp.originalPoint) {
            downsampledPoints.push(trueMaxTemp.originalPoint);
        }

        // De-duplicate points (by timestamp, in case Min/Max were already picked) and sort chronologically.
        const uniquePointsMap = new Map();
        downsampledPoints.forEach(p => uniquePointsMap.set(new Date(p.timestamp).getTime(), p));
        dataForChartDisplay = Array.from(uniquePointsMap.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }
    // For "1hour", "7day", "30day", dataForChartDisplay is already set (either filtered 1hr data or full apiData).

    // Prepare chartData structure for Chart.js.
    const chartData = {
        dewasa: [],
        remaja: [],
        penyemaian: [],
        averages: []
    };

    // Populate chartData using the final (potentially downsampled or filtered) dataForChartDisplay.
    dataForChartDisplay.forEach(point => {
        const timestamp = new Date(point.timestamp); 
        validSections.forEach(sectionName => {
            if (point.data && point.data[sectionName] && 
                point.data[sectionName].temps && 
                typeof point.data[sectionName].temps.avg === 'number') {
                
                chartData[sectionName].push({
                    x: timestamp, // X-coordinate (time).
                    y: point.data[sectionName].temps.avg // Y-coordinate (temperature value).
                });
            }
        });
    });

    return { chartData, insightsData };
}

// Updates the Chart.js instance with new data and adjusts X-axis formatting.
function updateTemperatureChart(chartData, selectedRange) {
    temperatureChart.data.datasets = []; // Clear previous datasets.

    Object.keys(chartData).forEach(sectionName => {
        if (chartData[sectionName] && chartData[sectionName].length > 0) {
            const isAverages = sectionName === 'averages';
            const color = chartColors[sectionName] || 'rgba(0, 0, 0, 0.5)'; // Fallback color.
            
            // Use different background transparency for 'averages' line fill.
            const backgroundColor = isAverages 
                ? color.replace('1)', '0.2)') 
                : color.replace('1)', '0.1)'); 

            const dataset = {
                label: `${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)} Temp`,
                data: chartData[sectionName],
                borderColor: color,
                backgroundColor: backgroundColor,
                tension: 0.1, // Slight curve to lines.
                borderWidth: 2,
                // Show points for shorter ranges (1hr, 1day) for better detail.
                pointRadius: selectedRange === "1hour" ? 3 : (selectedRange === "1day" ? 2 : 0), 
                pointHoverRadius: 5,
                fill: isAverages ? 'origin' : false, // Fill 'averages' line to origin.
            };

            // Control draw order if needed (e.g., 'averages' on top).
            if (isAverages) {
                dataset.order = 1; 
            } else {
                dataset.order = 2; 
            }
            temperatureChart.data.datasets.push(dataset);
        }
    });

    // Dynamically adjust X-axis time unit, tooltip format, and display formats based on selectedRange.
    if (selectedRange === "1hour") {
        temperatureChart.options.scales.x.time.unit = 'minute';
        temperatureChart.options.scales.x.time.tooltipFormat = 'HH:mm:ss'; 
        temperatureChart.options.scales.x.time.displayFormats = { minute: 'HH:mm' };
        temperatureChart.options.scales.x.ticks.stepSize = 5; // Tick every 5 minutes for 1-hour view.
    } else if (selectedRange === "1day") { 
        temperatureChart.options.scales.x.time.unit = 'hour';
        temperatureChart.options.scales.x.time.tooltipFormat = 'HH:mm';
        temperatureChart.options.scales.x.time.displayFormats = { hour: 'HH:mm' };
        temperatureChart.options.scales.x.ticks.stepSize = undefined; // Let Chart.js auto-determine ticks.
    } else if (selectedRange === "7day") { 
        temperatureChart.options.scales.x.time.unit = 'day';
        temperatureChart.options.scales.x.time.tooltipFormat = 'MMM d, HH:mm';
        temperatureChart.options.scales.x.time.displayFormats = { day: 'MMM d' };
        temperatureChart.options.scales.x.ticks.stepSize = undefined;
    } else { // "30day"
        temperatureChart.options.scales.x.time.unit = 'day';
        temperatureChart.options.scales.x.time.tooltipFormat = 'MMM d, yyyy';
        temperatureChart.options.scales.x.time.displayFormats = { day: 'MMM d' };
        temperatureChart.options.scales.x.ticks.stepSize = undefined;
    }
    
    // Ensure stepSize is explicitly undefined if not "1hour" to rely on auto ticks.
    if (selectedRange !== "1hour") {
        temperatureChart.options.scales.x.ticks.stepSize = undefined;
    }

    temperatureChart.update(); // Re-renders the chart with new data and options.
}

// Updates the Min/Max/Avg temperature insight boxes below the chart.
function updateTemperatureInsights(insights) {
    const minTempValueEl = document.getElementById('minTempInsightValue');
    const minTempSubtextEl = document.getElementById('minTempInsightSubtext');
    const maxTempValueEl = document.getElementById('maxTempInsightValue');
    const maxTempSubtextEl = document.getElementById('maxTempInsightSubtext');
    const avgTempValueEl = document.getElementById('avgTempInsightValue');
    const avgTempSubtextEl = document.getElementById('avgTempInsightSubtext');

    // Helper to format date/time for insights display.
    const formatDateForInsight = (date) => {
        if (!date) return 'N/A';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) + 
               ', ' + 
               date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    // Helper to capitalize the first letter of a string.
    const capitalizeFirstLetter = (string) => {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    };

    // Populate Min Temperature insight.
    if (insights && insights.minTemp) {
        minTempValueEl.textContent = `${insights.minTemp.value.toFixed(1)}°C`;
        minTempSubtextEl.textContent = `Lowest in ${capitalizeFirstLetter(insights.minTemp.section)} at ${formatDateForInsight(insights.minTemp.timestamp)}`;
    } else {
        minTempValueEl.textContent = '--';
        minTempSubtextEl.textContent = 'No data available';
    }

    // Populate Max Temperature insight.
    if (insights && insights.maxTemp) {
        maxTempValueEl.textContent = `${insights.maxTemp.value.toFixed(1)}°C`;
        maxTempSubtextEl.textContent = `Highest in ${capitalizeFirstLetter(insights.maxTemp.section)} at ${formatDateForInsight(insights.maxTemp.timestamp)}`;
    } else {
        maxTempValueEl.textContent = '--';
        maxTempSubtextEl.textContent = 'No data available';
    }

    // Populate Average Temperature insight.
    if (insights && insights.overallAverageTemp !== null) {
        avgTempValueEl.textContent = `${insights.overallAverageTemp.toFixed(1)}°C`;
        avgTempSubtextEl.textContent = `Period average`;
    } else {
        avgTempValueEl.textContent = '--';
        avgTempSubtextEl.textContent = 'No data available';
    }
}


// UI Feedback Functions: Show/Hide Loading and Error States.
// Displays a loading message within the specified chart container.
function showLoadingState(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    // Remove any existing error message.
    const existingError = container.querySelector('.chart-error');
    if (existingError) existingError.remove();
    
    // Add loading message if not already present.
    if (!container.querySelector('.chart-loading')) {
        const loadingEl = document.createElement('div');
        loadingEl.className = 'chart-loading';
        loadingEl.textContent = 'Loading data...';
        container.appendChild(loadingEl);
    }
}

// Hides the loading message from the specified chart container.
function hideLoadingState(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const loadingEl = container.querySelector('.chart-loading');
    if (loadingEl) {
        loadingEl.remove();
    }
}

// Displays an error message within the specified chart container.
function showErrorState(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;
    // Remove any existing loading or error message.
    hideLoadingState(containerId); 
    const existingError = container.querySelector('.chart-error');
    if (existingError) existingError.remove();

    const errorEl = document.createElement('div');
    errorEl.className = 'chart-error';
    errorEl.textContent = message;
    container.appendChild(errorEl);
}