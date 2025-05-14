// Global variables
let temperatureChart; // Holds the Chart.js instance for the temperature chart.
let humidityChart;    // Holds the Chart.js instance for the humidity chart.
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
    initHumidityChart();     // Sets up the initial empty humidity chart.
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
                        text: 'Waktu' // X-axis label (Indonesian)
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
                        text: 'Suhu (°C)' // Y-axis label (Indonesian)
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

// Initializes the humidity chart with Chart.js.
function initHumidityChart() {
    const ctx = document.getElementById('humidityChart').getContext('2d');
    humidityChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [] 
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        tooltipFormat: 'MMM d, yyyy HH:mm'
                    },
                    title: {
                        display: true,
                        text: 'Waktu' // X-axis label (Indonesian)
                    },
                    ticks: {
                        source: 'auto',
                        maxRotation: 0,
                        autoSkipPadding: 20,
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Kelembaban (%)' // Y-axis label (Indonesian)
                    },
                    beginAtZero: false, // Humidity typically doesn't start at 0, but can be adjusted
                    // suggestedMin: 0, // Optional: set a min if desired
                    // suggestedMax: 100 // Optional: set a max if desired
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false,
                }
            }
        }
    });
}


// Fetches historical data from the backend API based on the selected time range.
function loadHistoricalData(selectedRange) {
    // For now, use temperatureChartContainer for global loading/error messages.
    // This can be enhanced later for per-chart loading states.
    const globalLoadingContainerId = 'temperatureChartContainer'; 
    showLoadingState(globalLoadingContainerId); 
    updateTemperatureInsights(null); 
    updateHumidityInsights(null); // Clear humidity insights too.

    let daysToFetchAPI = 1; 
    if (selectedRange.endsWith('day')) {
        daysToFetchAPI = parseInt(selectedRange); 
    }

    fetch(`/history/data?days=${daysToFetchAPI}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(apiResponse => {
            hideLoadingState(globalLoadingContainerId); 
            if (apiResponse.success && apiResponse.data) {
                // Process data for Temperature
                const { chartData: tempChartData, insightsData: tempInsightsData } = processSensorData(apiResponse.data, selectedRange, 'temps');
                updateTemperatureChart(tempChartData, selectedRange);
                updateTemperatureInsights(tempInsightsData);
                checkAndShowNoDataError('temperatureChartContainer', tempChartData, tempInsightsData);


                // Process data for Humidity
                const { chartData: humidityChartData, insightsData: humidityInsightsData } = processSensorData(apiResponse.data, selectedRange, 'humidities');
                updateHumidityChart(humidityChartData, selectedRange);
                updateHumidityInsights(humidityInsightsData);
                checkAndShowNoDataError('humidityChartContainer', humidityChartData, humidityInsightsData);

            } else {
                showErrorState(globalLoadingContainerId, apiResponse.message || 'Gagal memuat data.');
                updateTemperatureInsights(null);
                updateHumidityInsights(null);
            }
        })
        .catch(error => {
            hideLoadingState(globalLoadingContainerId);
            console.error('Error fetching historical data:', error);
            showErrorState(globalLoadingContainerId, `Gagal mengambil data: ${error.message}`);
            updateTemperatureInsights(null);
            updateHumidityInsights(null);
        });
}

// Helper to check for no data after processing and display error if needed.
function checkAndShowNoDataError(containerId, chartData, insightsData) {
    const hasDataForRange = Object.values(chartData).some(arr => arr.length > 0);
    if (!hasDataForRange) {
        showErrorState(containerId, 'Tidak ada data untuk periode terpilih.');
        // Ensure insights for this specific chart also show no data
        if (containerId === 'temperatureChartContainer') updateTemperatureInsights(null);
        if (containerId === 'humidityChartContainer') updateHumidityInsights(null);
    } else {
        // If there was an error message, clear it now that we have data.
        const container = document.getElementById(containerId);
        if (container) {
            const existingError = container.querySelector('.chart-error');
            if (existingError) existingError.remove();
        }
    }
}


// Processes raw API data for a given sensor type: filters for "1hour", downsamples for "1day", and calculates insights.
function processSensorData(apiData, selectedRange, sensorType) {
    let dataForInsightCalculation = apiData; 
    let dataForChartDisplayPoints = []; // Use a temporary array to build points for chart display

    if (selectedRange === "1hour") {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const hourlyFilteredData = apiData.filter(point => new Date(point.timestamp) >= oneHourAgo);
        dataForInsightCalculation = hourlyFilteredData;
        dataForChartDisplayPoints = hourlyFilteredData; // For 1hr, chart and insights use the same filtered data
    }

    const validSections = Object.keys(chartColors); 
    let trueMin = { value: Infinity, timestamp: null, section: null, originalPoint: null };
    let trueMax = { value: -Infinity, timestamp: null, section: null, originalPoint: null };
    let sumOfAverageValues = 0;
    let countOfAverageValues = 0;

    dataForInsightCalculation.forEach(point => { 
        const timestamp = new Date(point.timestamp); 
        validSections.forEach(sectionName => {
            if (point.data && point.data[sectionName] && 
                point.data[sectionName][sensorType] && 
                typeof point.data[sectionName][sensorType].avg === 'number') {
                
                const currentAvgValue = point.data[sectionName][sensorType].avg;
                if (currentAvgValue < trueMin.value) {
                    trueMin = { value: currentAvgValue, timestamp: timestamp, section: sectionName, originalPoint: point };
                }
                if (currentAvgValue > trueMax.value) {
                    trueMax = { value: currentAvgValue, timestamp: timestamp, section: sectionName, originalPoint: point };
                }
                if (sectionName === 'averages') {
                    sumOfAverageValues += currentAvgValue;
                    countOfAverageValues++;
                }
            }
        });
    });

    const insightsData = {
        min: trueMin.value !== Infinity ? { value: trueMin.value, timestamp: trueMin.timestamp, section: trueMin.section } : null,
        max: trueMax.value !== -Infinity ? { value: trueMax.value, timestamp: trueMax.timestamp, section: trueMax.section } : null,
        overallAverage: countOfAverageValues > 0 ? (sumOfAverageValues / countOfAverageValues) : null
    };

    // Prepare dataForChartDisplay based on selectedRange
    if (selectedRange === "1day") {
        const DOWNSAMPLE_INTERVAL_MINUTES = 15; 
        if (apiData.length > 0) {
            dataForChartDisplayPoints.push(apiData[0]); 
            let lastSelectedTime = new Date(apiData[0].timestamp).getTime();

            for (let i = 1; i < apiData.length -1; i++) { 
                const currentTime = new Date(apiData[i].timestamp).getTime();
                if (currentTime - lastSelectedTime >= DOWNSAMPLE_INTERVAL_MINUTES * 60 * 1000) {
                    dataForChartDisplayPoints.push(apiData[i]);
                    lastSelectedTime = currentTime;
                }
            }
            if (apiData.length > 1 && dataForChartDisplayPoints[dataForChartDisplayPoints.length -1] !== apiData[apiData.length -1]) {
                 dataForChartDisplayPoints.push(apiData[apiData.length - 1]); 
            }
        }
    } else if (selectedRange === "7day" || selectedRange === "30day") {
        // For 7day and 30day, start with all API data for the period.
        dataForChartDisplayPoints = [...apiData];
    }
    // For "1hour", dataForChartDisplayPoints is already set to hourlyFilteredData.

    // For "1day", "7day", and "30day", explicitly add true Min/Max points
    // and then de-duplicate and sort. This ensures these key points are on the chart.
    if (selectedRange !== "1hour") {
        if (trueMin.originalPoint) {
            dataForChartDisplayPoints.push(trueMin.originalPoint);
        }
        if (trueMax.originalPoint) {
            dataForChartDisplayPoints.push(trueMax.originalPoint);
        }

        // De-duplicate (based on timestamp) and sort
        const uniquePointsMap = new Map();
        dataForChartDisplayPoints.forEach(p => {
            if (p && p.timestamp) { // Ensure point and timestamp exist
                uniquePointsMap.set(new Date(p.timestamp).getTime(), p);
            }
        });
        dataForChartDisplayPoints = Array.from(uniquePointsMap.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }
    
    // This is the final array of points that will be used to construct chart datasets.
    const finalDataForChartDisplay = dataForChartDisplayPoints;

    const chartData = {
        dewasa: [],
        remaja: [],
        penyemaian: [],
        averages: []
    };

    finalDataForChartDisplay.forEach(point => {
        const timestamp = new Date(point.timestamp); 
        validSections.forEach(sectionName => {
            if (point.data && point.data[sectionName] && 
                point.data[sectionName][sensorType] && 
                typeof point.data[sectionName][sensorType].avg === 'number') {
                
                chartData[sectionName].push({
                    x: timestamp, 
                    y: point.data[sectionName][sensorType].avg 
                });
            }
        });
    });

    return { chartData, insightsData };
}

// Updates the Chart.js instance with new data and adjusts X-axis formatting.
function updateTemperatureChart(chartData, selectedRange) {
    // This function is now specific to temperature, but its logic can be a template for humidity
    updateGenericChart(temperatureChart, chartData, selectedRange, "Suhu");
}

function updateHumidityChart(chartData, selectedRange) {
    updateGenericChart(humidityChart, chartData, selectedRange, "Kelembaban");
}

function updateGenericChart(chartInstance, chartData, selectedRange, sensorLabel) {
    chartInstance.data.datasets = []; // Clear previous datasets.

    Object.keys(chartData).forEach(sectionName => {
        if (chartData[sectionName] && chartData[sectionName].length > 0) {
            const isAverages = sectionName === 'averages';
            const color = chartColors[sectionName] || 'rgba(0, 0, 0, 0.5)';
            
            const backgroundColor = isAverages 
                ? color.replace('1)', '0.2)') 
                : color.replace('1)', '0.1)'); 

            const dataset = {
                label: `${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)} ${sensorLabel}`,
                data: chartData[sectionName],
                borderColor: color,
                backgroundColor: backgroundColor,
                tension: 0.1, 
                borderWidth: 2,
                pointRadius: selectedRange === "1hour" ? 3 : (selectedRange === "1day" ? 2 : 0), 
                pointHoverRadius: 5,
                fill: isAverages ? 'origin' : false, 
            };

            if (isAverages) {
                dataset.order = 1; 
            } else {
                dataset.order = 2; 
            }
            chartInstance.data.datasets.push(dataset);
        }
    });

    // Dynamically adjust X-axis time unit, tooltip format, and display formats based on selectedRange.
    // This logic is common for both charts, so it's applied to the passed chartInstance.
    if (selectedRange === "1hour") {
        chartInstance.options.scales.x.time.unit = 'minute';
        chartInstance.options.scales.x.time.tooltipFormat = 'HH:mm:ss'; 
        chartInstance.options.scales.x.time.displayFormats = { minute: 'HH:mm' };
        chartInstance.options.scales.x.ticks.stepSize = 5; 
    } else if (selectedRange === "1day") { 
        chartInstance.options.scales.x.time.unit = 'hour';
        chartInstance.options.scales.x.time.tooltipFormat = 'HH:mm';
        chartInstance.options.scales.x.time.displayFormats = { hour: 'HH:mm' };
        chartInstance.options.scales.x.ticks.stepSize = undefined; 
    } else if (selectedRange === "7day") { 
        chartInstance.options.scales.x.time.unit = 'day';
        chartInstance.options.scales.x.time.tooltipFormat = 'MMM d, HH:mm';
        chartInstance.options.scales.x.time.displayFormats = { day: 'MMM d' };
        chartInstance.options.scales.x.ticks.stepSize = undefined;
    } else { // "30day"
        chartInstance.options.scales.x.time.unit = 'day';
        chartInstance.options.scales.x.time.tooltipFormat = 'MMM d, yyyy';
        chartInstance.options.scales.x.time.displayFormats = { day: 'MMM d' };
        chartInstance.options.scales.x.ticks.stepSize = undefined;
    }
    
    if (selectedRange !== "1hour") {
        chartInstance.options.scales.x.ticks.stepSize = undefined;
    }

    chartInstance.update(); // Re-renders the chart with new data and options.
}


// Updates the Min/Max/Avg temperature insight boxes below the chart.
function updateTemperatureInsights(insights) {
    updateGenericInsights(insights, 'Temp', '°C', 'Terendah di', 'Tertinggi di', 'Rata-rata periode');
}

function updateHumidityInsights(insights) {
    updateGenericInsights(insights, 'Humidity', '%', 'Terendah di', 'Tertinggi di', 'Rata-rata periode');
}

function updateGenericInsights(insights, sensorPrefix, unit, minLabelPrefix, maxLabelPrefix, avgLabelSubtext) {
    const minValEl = document.getElementById(`min${sensorPrefix}InsightValue`);
    const minSubtextEl = document.getElementById(`min${sensorPrefix}InsightSubtext`);
    const maxValEl = document.getElementById(`max${sensorPrefix}InsightValue`);
    const maxSubtextEl = document.getElementById(`max${sensorPrefix}InsightSubtext`);
    const avgValEl = document.getElementById(`avg${sensorPrefix}InsightValue`);
    const avgSubtextEl = document.getElementById(`avg${sensorPrefix}InsightSubtext`);

    const formatDateForInsight = (date) => {
        if (!date) return 'N/A';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) + 
               ', ' + 
               date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const capitalizeFirstLetter = (string) => {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    };

    if (insights && insights.min) {
        minValEl.textContent = `${insights.min.value.toFixed(1)}${unit}`;
        minSubtextEl.textContent = `${minLabelPrefix} ${capitalizeFirstLetter(insights.min.section)} pada ${formatDateForInsight(insights.min.timestamp)}`;
    } else {
        minValEl.textContent = '--';
        minSubtextEl.textContent = 'Tidak ada data';
    }

    if (insights && insights.max) {
        maxValEl.textContent = `${insights.max.value.toFixed(1)}${unit}`;
        maxSubtextEl.textContent = `${maxLabelPrefix} ${capitalizeFirstLetter(insights.max.section)} pada ${formatDateForInsight(insights.max.timestamp)}`;
    } else {
        maxValEl.textContent = '--';
        maxSubtextEl.textContent = 'Tidak ada data';
    }

    if (insights && insights.overallAverage !== null) {
        avgValEl.textContent = `${insights.overallAverage.toFixed(1)}${unit}`;
        avgSubtextEl.textContent = avgLabelSubtext;
    } else {
        avgValEl.textContent = '--';
        avgSubtextEl.textContent = 'Tidak ada data';
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
        loadingEl.textContent = 'Memuat data...'; // Indonesian
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
    // Clear previous error before showing new one
    const existingError = container.querySelector('.chart-error');
    if (existingError) existingError.remove();

    const errorEl = document.createElement('div');
    errorEl.className = 'chart-error';
    errorEl.textContent = message; // Message is already localized or an error string
    container.appendChild(errorEl);
}