/**
 * @file history.js
 * @description Handles the functionality of the greenhouse sensor data history page.
 * This includes fetching data from the backend, processing it for display,
 * rendering interactive charts using Chart.js for temperature, humidity, and light intensity,
 * and displaying key insights (min, max, average) for selected time ranges.
 */

// --- Global Variables ---

/** @type {Chart} Stores the Chart.js instance for the temperature chart. */
let temperatureChart;
/** @type {Chart} Stores the Chart.js instance for the humidity chart. */
let humidityChart;
/** @type {Chart} Stores the Chart.js instance for the light intensity chart. */
let lightChart;
/** @type {string} Tracks the currently selected time range filter (e.g., "1hour", "1day"). Defaults to "1day". */
let currentSelectedRange = "1day";

// Function to get the current selected range, callable by history_export.js
// This function might no longer be needed by history_export.js if export buttons have fixed ranges.
// However, it's kept for now as it might be used by other parts of history.js or for future features.
function getCurrentTimeRange() {
    return currentSelectedRange;
}

/**
 * @constant {Object<string, string>} chartColors
 * Defines a consistent color palette for different greenhouse sections in the charts.
 * Keys are section names (lowercase), values are RGBA color strings.
 */
const chartColors = {
    dewasa: 'rgba(231, 76, 60, 1)',     // Red
    remaja: 'rgba(52, 152, 219, 1)',    // Blue
    penyemaian: 'rgba(46, 204, 113, 1)',// Green
    averages: 'rgba(155, 89, 182, 1)'   // Purple for overall average lines
};

// --- Initialization ---

/**
 * Fires when the initial HTML document has been completely loaded and parsed.
 * This is the entry point for initializing the page's JavaScript functionality.
 */
document.addEventListener('DOMContentLoaded', function() {
    setupTimeRangeButtons();
    initTemperatureChart();
    initHumidityChart();
    initLightChart();
    initScrollAnimations(); // Initialize scroll animations
    loadHistoricalData(currentSelectedRange); // Load data for the default time range.
});

// --- Event Handlers & UI Setup ---

/**
 * Sets up click event listeners for the time range selection buttons.
 * When a button is clicked, it updates the active state, changes the
 * `currentSelectedRange`, and reloads the historical data.
 */
function setupTimeRangeButtons() {
    // Select only time range buttons that are not export buttons OR that have a data-range attribute.
    // Using :not(.export-btn) is cleaner if export buttons are the only other .time-range-btn
    const buttons = document.querySelectorAll('.time-range-btn:not(.export-btn)');
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // Ensure the button clicked is indeed a range selection button
            if (!this.hasAttribute('data-range')) return;

            // Update active class for visual feedback
            buttons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            // Update the global time range and trigger data reload
            currentSelectedRange = this.getAttribute('data-range');
            loadHistoricalData(currentSelectedRange);
        });
    });
}

// --- Chart Initialization Functions ---

/**
 * Initializes the temperature chart with Chart.js.
 * Sets up the chart type, initial empty data structure, and options
 * including responsiveness, scales (X and Y axes), and plugins (legend, tooltip).
 * Y-axis label: "Suhu (°C)".
 */
function initTemperatureChart() {
    const ctx = document.getElementById('temperatureChart').getContext('2d');
    temperatureChart = new Chart(ctx, {
        type: 'line',
        data: { datasets: [] }, // Datasets are populated dynamically
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: { tooltipFormat: 'MMM d, yyyy HH:mm' },
                    title: { display: true, text: 'Waktu' },
                    ticks: { source: 'auto', maxRotation: 0, autoSkipPadding: 20 }
                },
                y: {
                    title: { display: true, text: 'Suhu (°C)' },
                    beginAtZero: false // Temperature doesn't necessarily start at zero
                }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'nearest', axis: 'x', intersect: false }
            }
        }
    });
}

/**
 * Initializes the humidity chart with Chart.js.
 * Similar setup to `initTemperatureChart`, but with Y-axis label "Kelembaban (%)".
 */
function initHumidityChart() {
    const ctx = document.getElementById('humidityChart').getContext('2d');
    humidityChart = new Chart(ctx, {
        type: 'line',
        data: { datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: { tooltipFormat: 'MMM d, yyyy HH:mm' },
                    title: { display: true, text: 'Waktu' },
                    ticks: { source: 'auto', maxRotation: 0, autoSkipPadding: 20 }
                },
                y: {
                    title: { display: true, text: 'Kelembaban (%)' },
                    beginAtZero: false // Humidity can fluctuate, not always starting at 0
                    // suggestedMax: 100 // Optionally set a max for humidity
                }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'nearest', axis: 'x', intersect: false }
            }
        }
    });
}

/**
 * Initializes the light intensity chart with Chart.js.
 * Similar setup, with Y-axis label "Intensitas Cahaya (lux)" and `beginAtZero: true`
 * as light intensity typically starts from zero.
 */
function initLightChart() {
    const ctx = document.getElementById('lightChart').getContext('2d');
    lightChart = new Chart(ctx, {
        type: 'line',
        data: { datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: { tooltipFormat: 'MMM d, yyyy HH:mm' },
                    title: { display: true, text: 'Waktu' },
                    ticks: { source: 'auto', maxRotation: 0, autoSkipPadding: 20 }
                },
                y: {
                    title: { display: true, text: 'Intensitas Cahaya (lux)' },
                    beginAtZero: true // Light intensity starts from 0
                }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'nearest', axis: 'x', intersect: false }
            }
        }
    });
}

// --- Data Fetching and Orchestration ---

/**
 * Fetches historical sensor data from the backend API based on the `selectedRange`.
 * It then orchestrates the processing and updating of all charts and insights.
 * @param {string} selectedRange - The desired time range (e.g., "1hour", "1day").
 */
function loadHistoricalData(selectedRange) {
    // Use a common container for a global loading message initially.
    // This could be enhanced for per-chart loading states in the future.
    const globalLoadingContainerId = 'temperatureChartContainer';
    showLoadingState(globalLoadingContainerId); // Show loading UI

    // Clear previous insights before loading new data
    updateTemperatureInsights(null);
    updateHumidityInsights(null);
    updateLightInsights(null);

    // Determine the number of days of data to request from the API.
    // For "1hour", we still fetch 1 day of data and filter client-side.
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
            hideLoadingState(globalLoadingContainerId); // Hide loading UI

            if (apiResponse.success && apiResponse.data) {
                // Process and update Temperature chart and insights
                const { chartData: tempChartData, insightsData: tempInsightsData } = processSensorData(apiResponse.data, selectedRange, 'temps');
                updateTemperatureChart(tempChartData, selectedRange);
                updateTemperatureInsights(tempInsightsData);
                checkAndShowNoDataError('temperatureChartContainer', tempChartData, tempInsightsData);

                // Process and update Humidity chart and insights
                const { chartData: humidityChartData, insightsData: humidityInsightsData } = processSensorData(apiResponse.data, selectedRange, 'humidities');
                updateHumidityChart(humidityChartData, selectedRange);
                updateHumidityInsights(humidityInsightsData);
                checkAndShowNoDataError('humidityChartContainer', humidityChartData, humidityInsightsData);

                // Process and update Light Intensity chart and insights
                const { chartData: lightChartData, insightsData: lightInsightsData } = processSensorData(apiResponse.data, selectedRange, 'lights');
                updateLightChart(lightChartData, selectedRange);
                updateLightInsights(lightInsightsData);
                checkAndShowNoDataError('lightChartContainer', lightChartData, lightInsightsData);

            } else {
                // Handle cases where API reports success:false or no data
                showErrorState(globalLoadingContainerId, apiResponse.message || 'Gagal memuat data.');
                updateTemperatureInsights(null);
                updateHumidityInsights(null);
                updateLightInsights(null);
            }
        })
        .catch(error => {
            hideLoadingState(globalLoadingContainerId);
            console.error('Error fetching historical data:', error);
            showErrorState(globalLoadingContainerId, `Gagal mengambil data: ${error.message}`);
            // Clear insights on error
            updateTemperatureInsights(null);
            updateHumidityInsights(null);
            updateLightInsights(null);
        });
}

// --- Data Processing Logic ---

/**
 * Processes raw API data for a specific sensor type. This involves:
 * 1. Filtering data for the "1hour" range (client-side).
 * 2. Identifying true minimum and maximum values from the relevant data subset for insights.
 * 3. Downsampling data for the "1day" range for better chart performance.
 * 4. Ensuring that the exact data points corresponding to the true min/max are included in the chart data
 *    for "1day", "7day", and "30day" ranges, so insights align with visible chart points.
 * 5. Formatting data into a structure suitable for Chart.js datasets.
 *
 * @param {Array<Object>} apiData - The raw data array from the backend API.
 * @param {string} selectedRange - The current time range (e.g., "1hour", "1day").
 * @param {string} sensorType - The type of sensor data to process (e.g., 'temps', 'humidities', 'lights').
 * @returns {{chartData: Object, insightsData: Object}} An object containing:
 *          - `chartData`: Data formatted for Chart.js datasets.
 *          - `insightsData`: Calculated min, max, and overall average values.
 */
function processSensorData(apiData, selectedRange, sensorType) {
    let dataForInsightCalculation = apiData;
    let dataForChartDisplayPoints = []; // Holds the points that will actually be plotted

    // 1. Client-side filtering for "1hour" range
    // For "1hour", insights and chart data are based on the last 60 minutes.
    if (selectedRange === "1hour") {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const hourlyFilteredData = apiData.filter(point => new Date(point.timestamp) >= oneHourAgo);
        dataForInsightCalculation = hourlyFilteredData;
        dataForChartDisplayPoints = hourlyFilteredData; // Chart uses this directly for 1hr
    }

    // 2. Identify true Min/Max for insights from the relevant data subset
    const validSections = Object.keys(chartColors); // e.g., ['dewasa', 'remaja', ...]
    let trueMin = { value: Infinity, timestamp: null, section: null, originalPoint: null };
    let trueMax = { value: -Infinity, timestamp: null, section: null, originalPoint: null };
    let sumOfAverageValues = 0; // For calculating overall average from 'averages' section
    let countOfAverageValues = 0;

    dataForInsightCalculation.forEach(point => {
        const timestamp = new Date(point.timestamp);
        validSections.forEach(sectionName => {
            // Check nested structure carefully
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
                // Sum 'averages' section data for overall average calculation
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

    // 3. Prepare `dataForChartDisplayPoints` based on `selectedRange`
    if (selectedRange === "1day") {
        // Downsample for "1day" range to improve chart performance
        const DOWNSAMPLE_INTERVAL_MINUTES = 15;
        if (apiData.length > 0) {
            dataForChartDisplayPoints.push(apiData[0]); // Always include the first point
            let lastSelectedTime = new Date(apiData[0].timestamp).getTime();

            for (let i = 1; i < apiData.length - 1; i++) { // Iterate up to second to last
                const currentTime = new Date(apiData[i].timestamp).getTime();
                if (currentTime - lastSelectedTime >= DOWNSAMPLE_INTERVAL_MINUTES * 60 * 1000) {
                    dataForChartDisplayPoints.push(apiData[i]);
                    lastSelectedTime = currentTime;
                }
            }
            // Always include the last point if it wasn't added by downsampling
            if (apiData.length > 1 && dataForChartDisplayPoints[dataForChartDisplayPoints.length - 1] !== apiData[apiData.length - 1]) {
                dataForChartDisplayPoints.push(apiData[apiData.length - 1]);
            }
        }
    } else if (selectedRange === "7day" || selectedRange === "30day") {
        // For longer ranges, initially use all API data. Min/Max points will be added.
        dataForChartDisplayPoints = [...apiData];
    }
    // Note: For "1hour", `dataForChartDisplayPoints` is already set from `hourlyFilteredData`.

    // 4. Ensure true Min/Max points are included in chart data for "1day", "7day", "30day"
    // This guarantees that insight values correspond to visible points on the chart.
    if (selectedRange !== "1hour") {
        if (trueMin.originalPoint) {
            dataForChartDisplayPoints.push(trueMin.originalPoint);
        }
        if (trueMax.originalPoint) {
            dataForChartDisplayPoints.push(trueMax.originalPoint);
        }

        // De-duplicate points (based on timestamp) and sort chronologically
        const uniquePointsMap = new Map();
        dataForChartDisplayPoints.forEach(p => {
            if (p && p.timestamp) { // Ensure point and timestamp are valid
                uniquePointsMap.set(new Date(p.timestamp).getTime(), p);
            }
        });
        dataForChartDisplayPoints = Array.from(uniquePointsMap.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    // `dataForChartDisplayPoints` now contains the final set of points to be plotted.
    const finalDataForChartDisplay = dataForChartDisplayPoints;

    // 5. Format data for Chart.js datasets
    const chartData = { dewasa: [], remaja: [], penyemaian: [], averages: [] };
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

// --- Chart Update Functions ---

/** Wrapper to call `updateGenericChart` for the temperature chart. */
function updateTemperatureChart(chartData, selectedRange) {
    updateGenericChart(temperatureChart, chartData, selectedRange, "Suhu");
}

/** Wrapper to call `updateGenericChart` for the humidity chart. */
function updateHumidityChart(chartData, selectedRange) {
    updateGenericChart(humidityChart, chartData, selectedRange, "Kelembaban");
}

/** Wrapper to call `updateGenericChart` for the light intensity chart. */
function updateLightChart(chartData, selectedRange) {
    updateGenericChart(lightChart, chartData, selectedRange, "Intensitas Cahaya");
}

/**
 * Generic function to update a Chart.js instance with new data and configurations.
 * @param {Chart} chartInstance - The Chart.js object to update.
 * @param {Object} chartData - Processed data from `processSensorData`.
 * @param {string} selectedRange - The current time range.
 * @param {string} sensorLabel - The label for the sensor (e.g., "Suhu", "Kelembaban").
 */
function updateGenericChart(chartInstance, chartData, selectedRange, sensorLabel) {
    chartInstance.data.datasets = []; // Clear previous datasets

    Object.keys(chartData).forEach(sectionName => {
        if (chartData[sectionName] && chartData[sectionName].length > 0) {
            const isAverages = sectionName === 'averages';
            const color = chartColors[sectionName] || 'rgba(0,0,0,0.5)'; // Fallback color
            const backgroundColor = isAverages ? color.replace('1)', '0.2)') : color.replace('1)', '0.1)');

            const dataset = {
                label: `${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)} ${sensorLabel}`,
                data: chartData[sectionName],
                borderColor: color,
                backgroundColor: backgroundColor,
                tension: 0.1, // Slight curve to lines
                borderWidth: 2,
                // Adjust point radius based on range: larger for 1hr, smaller for 1day, none for 7/30day
                pointRadius: selectedRange === "1hour" ? 3 : (selectedRange === "1day" ? 2 : 0),
                pointHoverRadius: 5,
                fill: isAverages ? 'origin' : false, // Fill 'averages' line to origin
                order: isAverages ? 1 : 2 // Render 'averages' potentially on top/bottom
            };
            chartInstance.data.datasets.push(dataset);
        }
    });

    // Dynamically adjust X-axis time unit, tooltip format, and display formats
    // based on `selectedRange` for optimal readability.
    if (selectedRange === "1hour") {
        chartInstance.options.scales.x.time.unit = 'minute';
        chartInstance.options.scales.x.time.tooltipFormat = 'HH:mm:ss';
        chartInstance.options.scales.x.time.displayFormats = { minute: 'HH:mm' };
        chartInstance.options.scales.x.ticks.stepSize = 5; // e.g., every 5 minutes
    } else if (selectedRange === "1day") {
        chartInstance.options.scales.x.time.unit = 'hour';
        chartInstance.options.scales.x.time.tooltipFormat = 'HH:mm';
        chartInstance.options.scales.x.time.displayFormats = { hour: 'HH:mm' };
        chartInstance.options.scales.x.ticks.stepSize = undefined; // Auto step size
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

    // Ensure stepSize is auto for ranges other than 1hour if previously set
    if (selectedRange !== "1hour") {
        chartInstance.options.scales.x.ticks.stepSize = undefined;
    }

    chartInstance.update(); // Re-render the chart
}

// --- Insight Update Functions ---

/** Wrapper to call `updateGenericInsights` for temperature. */
function updateTemperatureInsights(insights) {
    updateGenericInsights(insights, 'Temp', '°C', 'Terendah di', 'Tertinggi di', 'Rata-rata periode');
}

/** Wrapper to call `updateGenericInsights` for humidity. */
function updateHumidityInsights(insights) {
    updateGenericInsights(insights, 'Humidity', '%', 'Terendah di', 'Tertinggi di', 'Rata-rata periode');
}

/** Wrapper to call `updateGenericInsights` for light intensity. */
function updateLightInsights(insights) {
    // Note: Space before 'lux' for consistent formatting with °C and %
    updateGenericInsights(insights, 'Light', ' lux', 'Terendah di', 'Tertinggi di', 'Rata-rata periode');
}

/**
 * Generic function to update the Min/Max/Avg insight boxes below a chart.
 * @param {Object|null} insights - The insights data (min, max, overallAverage) or null to clear.
 * @param {string} sensorPrefix - Prefix for HTML element IDs (e.g., "Temp", "Humidity").
 * @param {string} unit - The unit of measurement (e.g., "°C", "%").
 * @param {string} minLabelPrefix - Localized prefix for min insight subtext.
 * @param {string} maxLabelPrefix - Localized prefix for max insight subtext.
 * @param {string} avgLabelSubtext - Localized subtext for average insight.
 */
function updateGenericInsights(insights, sensorPrefix, unit, minLabelPrefix, maxLabelPrefix, avgLabelSubtext) {
    const minValEl = document.getElementById(`min${sensorPrefix}InsightValue`);
    const minSubtextEl = document.getElementById(`min${sensorPrefix}InsightSubtext`);
    const maxValEl = document.getElementById(`max${sensorPrefix}InsightValue`);
    const maxSubtextEl = document.getElementById(`max${sensorPrefix}InsightSubtext`);
    const avgValEl = document.getElementById(`avg${sensorPrefix}InsightValue`);
    const avgSubtextEl = document.getElementById(`avg${sensorPrefix}InsightSubtext`);

    // Helper to format date for display in insights (e.g., "14:30, Okt 27")
    const formatDateForInsight = (date) => {
        if (!date) return 'N/A';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) +
               ', ' +
               date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    // Helper to capitalize the first letter of a string (for section names)
    const capitalizeFirstLetter = (string) => {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    };

    // Update Min Insight
    if (insights && insights.min) {
        minValEl.textContent = `${insights.min.value.toFixed(1)}${unit}`;
        minSubtextEl.textContent = `${minLabelPrefix} ${capitalizeFirstLetter(insights.min.section)} pada ${formatDateForInsight(insights.min.timestamp)}`;
    } else {
        minValEl.textContent = '--';
        minSubtextEl.textContent = 'Tidak ada data';
    }

    // Update Max Insight
    if (insights && insights.max) {
        maxValEl.textContent = `${insights.max.value.toFixed(1)}${unit}`;
        maxSubtextEl.textContent = `${maxLabelPrefix} ${capitalizeFirstLetter(insights.max.section)} pada ${formatDateForInsight(insights.max.timestamp)}`;
    } else {
        maxValEl.textContent = '--';
        maxSubtextEl.textContent = 'Tidak ada data';
    }

    // Update Average Insight
    if (insights && insights.overallAverage !== null) {
        avgValEl.textContent = `${insights.overallAverage.toFixed(1)}${unit}`;
        avgSubtextEl.textContent = avgLabelSubtext;
    } else {
        avgValEl.textContent = '--';
        avgSubtextEl.textContent = 'Tidak ada data';
    }
}

// --- UI Feedback Functions (Loading/Error States) ---

/**
 * Displays a loading message with a spinner within the specified chart container.
 * @param {string} containerId - The ID of the chart container element.
 */
function showLoadingState(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Remove any existing error message first
    const existingError = container.querySelector('.chart-error');
    if (existingError) existingError.remove();

    // Add loading message if not already present
    if (!container.querySelector('.chart-loading')) {
        const loadingEl = document.createElement('div');
        loadingEl.className = 'chart-loading';
        
        const spinnerEl = document.createElement('div');
        spinnerEl.className = 'spinner'; // CSS class for the spinner
        
        const textEl = document.createElement('span');
        textEl.textContent = 'Memuat data...'; // Localized loading text
        
        loadingEl.appendChild(spinnerEl);
        loadingEl.appendChild(textEl);
        container.appendChild(loadingEl);
    }
}

/**
 * Hides the loading message from the specified chart container.
 * @param {string} containerId - The ID of the chart container element.
 */
function hideLoadingState(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const loadingEl = container.querySelector('.chart-loading');
    if (loadingEl) {
        loadingEl.remove();
    }
}

/**
 * Displays an error message within the specified chart container.
 * @param {string} containerId - The ID of the chart container element.
 * @param {string} message - The error message to display.
 */
function showErrorState(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;

    hideLoadingState(containerId); // Remove loading message if present
    // Clear previous error before showing a new one
    const existingError = container.querySelector('.chart-error');
    if (existingError) existingError.remove();

    const errorEl = document.createElement('div');
    errorEl.className = 'chart-error';
    errorEl.textContent = message;
    container.appendChild(errorEl);
}

/**
 * Checks if processed chart data is empty and, if so, displays a "no data" error
 * message in the specified container and clears its associated insights.
 * @param {string} containerId - The ID of the chart container.
 * @param {Object} chartData - The processed chart data object.
 * @param {Object} insightsData - The insights data object (used to determine if insights should be cleared).
 */
function checkAndShowNoDataError(containerId, chartData, insightsData) {
    // Check if all arrays within chartData (dewasa, remaja, etc.) are empty
    const hasDataForRange = Object.values(chartData).some(arr => arr.length > 0);

    if (!hasDataForRange) {
        showErrorState(containerId, 'Tidak ada data untuk periode terpilih.');
        // Ensure insights for this specific chart also show "Tidak ada data"
        if (containerId === 'temperatureChartContainer') updateTemperatureInsights(null);
        if (containerId === 'humidityChartContainer') updateHumidityInsights(null);
        if (containerId === 'lightChartContainer') updateLightInsights(null);
    } else {
        // If there was an error message (e.g., "no data") but now we have data, clear it.
        const container = document.getElementById(containerId);
        if (container) {
            const existingError = container.querySelector('.chart-error');
            if (existingError) existingError.remove();
        }
    }
}

// --- Scroll Animation ---

/**
 * Initializes IntersectionObserver to animate cards when they scroll into view.
 */
function initScrollAnimations() {
    const animatedCards = document.querySelectorAll('.card-animate-on-scroll');

    if (!animatedCards.length) return;

    const observerOptions = {
        root: null, // relative to document viewport
        rootMargin: '0px',
        threshold: 0.1 // trigger when 10% of the element is visible
    };

    const observerCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target); // Stop observing once animated
            }
        });
    };

    const scrollObserver = new IntersectionObserver(observerCallback, observerOptions);
    animatedCards.forEach(card => scrollObserver.observe(card));
}