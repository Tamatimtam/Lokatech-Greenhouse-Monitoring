// Global variables
let temperatureChart;
let currentDays = 1; // Default to 1 day (24 hours)

// Define colors for different greenhouse sections
// Using a consistent color palette helps in distinguishing data series.
const chartColors = {
    dewasa: 'rgba(231, 76, 60, 1)',     // Red
    remaja: 'rgba(52, 152, 219, 1)',    // Blue
    penyemaian: 'rgba(46, 204, 113, 1)',// Green
    averages: 'rgba(155, 89, 182, 1)'   // Purple
};


document.addEventListener('DOMContentLoaded', function() {
    setupTimeRangeButtons();
    initTemperatureChart();
    loadHistoricalData(currentDays);
});

function setupTimeRangeButtons() {
    const buttons = document.querySelectorAll('.time-range-btn');
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            buttons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            currentDays = parseInt(this.getAttribute('data-days'));
            loadHistoricalData(currentDays);
        });
    });
}

function initTemperatureChart() {
    const ctx = document.getElementById('temperatureChart').getContext('2d');
    temperatureChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [] // Populated by updateTemperatureChart
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time', // Crucial for time series data
                    time: {
                        // Dynamically set unit based on currentDays in updateTemperatureChart
                        tooltipFormat: 'MMM d, yyyy HH:mm' // Example format
                    },
                    title: {
                        display: true,
                        text: 'Time'
                    },
                    ticks: {
                        source: 'auto', // Let Chart.js determine optimal ticks
                        maxRotation: 0, // Prevent label rotation if possible
                        autoSkipPadding: 20, // Add padding to auto-skip more effectively
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Temperature (°C)'
                    },
                    beginAtZero: false // Adjust as needed, temperature can be negative
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            }
        }
    });
}

function loadHistoricalData(days) {
    const chartContainerId = 'temperatureChartContainer'; // Target specific container
    showLoadingState(chartContainerId);
    // Reset insights on new data load
    updateTemperatureInsights(null);

    fetch(`/history/data?days=${days}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(apiResponse => {
            hideLoadingState(chartContainerId);
            if (apiResponse.success && apiResponse.data) {
                const { chartData, insightsData } = processTemperatureData(apiResponse.data);
                updateTemperatureChart(chartData);
                updateTemperatureInsights(insightsData);

                if (apiResponse.data.length === 0) {
                    showErrorState(chartContainerId, 'No data available for the selected period.');
                    // Ensure insights also show no data
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

function processTemperatureData(apiData) {
    // Initialize an object to hold data arrays for each section
    const chartData = {
        dewasa: [],
        remaja: [],
        penyemaian: [],
        averages: []
    };
    const validSections = Object.keys(chartData);

    let minTemp = { value: Infinity, timestamp: null, section: null };
    let maxTemp = { value: -Infinity, timestamp: null, section: null };
    let sumOfAverageTemps = 0;
    let countOfAverageTemps = 0;

    apiData.forEach(point => {
        const timestamp = new Date(point.timestamp); // API provides ISO string

        validSections.forEach(sectionName => {
            if (point.data && point.data[sectionName] && 
                point.data[sectionName].temps && 
                typeof point.data[sectionName].temps.avg === 'number') {
                
                const currentAvgTemp = point.data[sectionName].temps.avg;
                chartData[sectionName].push({
                    x: timestamp,
                    y: currentAvgTemp
                });

                // For overall Min/Max, consider avg temp of each section at each point
                if (currentAvgTemp < minTemp.value) {
                    minTemp = { value: currentAvgTemp, timestamp: timestamp, section: sectionName };
                }
                if (currentAvgTemp > maxTemp.value) {
                    maxTemp = { value: currentAvgTemp, timestamp: timestamp, section: sectionName };
                }

                // Specifically for overall average, use the 'averages' section's avg
                if (sectionName === 'averages') {
                    sumOfAverageTemps += currentAvgTemp;
                    countOfAverageTemps++;
                }
            }
        });
    });

    const insightsData = {
        minTemp: minTemp.value !== Infinity ? minTemp : null,
        maxTemp: maxTemp.value !== -Infinity ? maxTemp : null,
        overallAverageTemp: countOfAverageTemps > 0 ? (sumOfAverageTemps / countOfAverageTemps) : null
    };

    return { chartData, insightsData };
}

function updateTemperatureChart(chartData) {
    temperatureChart.data.datasets = []; // Clear previous datasets

    Object.keys(chartData).forEach(sectionName => {
        if (chartData[sectionName] && chartData[sectionName].length > 0) {
            const isAverages = sectionName === 'averages';
            const color = chartColors[sectionName] || 'rgba(0, 0, 0, 0.5)'; // Fallback color
            
            // For 'averages', use a fill and a semi-transparent background
            // For other sections, use the line color with minimal transparency for background (area under line)
            const backgroundColor = isAverages 
                ? color.replace('1)', '0.2)') // More transparent for fill to origin
                : color.replace('1)', '0.1)'); // Standard slight transparency for area under line

            const dataset = {
                label: `${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)} Temp`,
                data: chartData[sectionName],
                borderColor: color,
                backgroundColor: backgroundColor,
                tension: 0.1, // Slight curve to lines
                borderWidth: 2,
                pointRadius: currentDays <= 7 ? 2 : 0, 
                pointHoverRadius: 5,
                fill: isAverages ? 'origin' : false, // Fill 'averages' to origin, others default (or 'false')
                                                    // 'origin' fills to the x-axis (0 on y-axis if not otherwise specified)
                                                    // Use 'start' to fill to the bottom of the chart drawing area
            };

            if (isAverages) {
                // Optional: Make the averages line slightly thicker or dashed for more distinction
                // dataset.borderWidth = 3;
                // dataset.borderDash = [5, 5]; // Example: dashed line
                dataset.order = 1; // Attempt to draw averages on top of other fills if they overlap
            } else {
                dataset.order = 2; // Other lines
            }

            temperatureChart.data.datasets.push(dataset);
        }
    });

    // Sort datasets to attempt to draw 'averages' last if it has a fill,
    // so its fill might appear "over" other lines if they also had fills.
    // However, Chart.js draw order for fills can be complex.
    // The `order` property on dataset is a more direct way.
    // temperatureChart.data.datasets.sort((a, b) => (a.label.includes('Averages') ? 1 : -1));


    // Adjust X-axis time unit and display formats based on the selected range
    if (currentDays <= 1) { // 24 Hours
        temperatureChart.options.scales.x.time.unit = 'hour';
        temperatureChart.options.scales.x.time.tooltipFormat = 'HH:mm';
        temperatureChart.options.scales.x.time.displayFormats = { hour: 'HH:mm' };
        // Remove explicit stepSize to let Chart.js auto-determine ticks
        // If more control is needed, maxTicksLimit can be an option:
        // temperatureChart.options.scales.x.ticks.maxTicksLimit = 12; // e.g., for ~2hr intervals
    } else if (currentDays <= 7) { // 7 Days
        temperatureChart.options.scales.x.time.unit = 'day';
        temperatureChart.options.scales.x.time.tooltipFormat = 'MMM d, HH:mm';
        temperatureChart.options.scales.x.time.displayFormats = { day: 'MMM d' };
        // temperatureChart.options.scales.x.ticks.maxTicksLimit = undefined; // Reset if set for 24h
    } else { // 30 Days
        temperatureChart.options.scales.x.time.unit = 'day';
        temperatureChart.options.scales.x.time.tooltipFormat = 'MMM d, yyyy';
        temperatureChart.options.scales.x.time.displayFormats = { day: 'MMM d' };
        // temperatureChart.options.scales.x.ticks.maxTicksLimit = undefined; // Reset if set for 24h
    }
    // Ensure stepSize is not lingering if it was ever set
    temperatureChart.options.scales.x.ticks.stepSize = undefined;


    temperatureChart.update();
}

function updateTemperatureInsights(insights) {
    const minTempValueEl = document.getElementById('minTempInsightValue');
    const minTempSubtextEl = document.getElementById('minTempInsightSubtext');
    const maxTempValueEl = document.getElementById('maxTempInsightValue');
    const maxTempSubtextEl = document.getElementById('maxTempInsightSubtext');
    const avgTempValueEl = document.getElementById('avgTempInsightValue');
    const avgTempSubtextEl = document.getElementById('avgTempInsightSubtext');

    const formatDateForInsight = (date) => {
        if (!date) return 'N/A';
        // Format: "HH:mm, Mon Day" e.g., "16:20, May 12"
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) + 
               ', ' + 
               date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const capitalizeFirstLetter = (string) => {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    };

    if (insights && insights.minTemp) {
        minTempValueEl.textContent = `${insights.minTemp.value.toFixed(1)}°C`;
        minTempSubtextEl.textContent = `Lowest in ${capitalizeFirstLetter(insights.minTemp.section)} at ${formatDateForInsight(insights.minTemp.timestamp)}`;
    } else {
        minTempValueEl.textContent = '--';
        minTempSubtextEl.textContent = 'No data available';
    }

    if (insights && insights.maxTemp) {
        maxTempValueEl.textContent = `${insights.maxTemp.value.toFixed(1)}°C`;
        maxTempSubtextEl.textContent = `Highest in ${capitalizeFirstLetter(insights.maxTemp.section)} at ${formatDateForInsight(insights.maxTemp.timestamp)}`;
    } else {
        maxTempValueEl.textContent = '--';
        maxTempSubtextEl.textContent = 'No data available';
    }

    if (insights && insights.overallAverageTemp !== null) {
        avgTempValueEl.textContent = `${insights.overallAverageTemp.toFixed(1)}°C`;
        avgTempSubtextEl.textContent = `Period average`;
    } else {
        avgTempValueEl.textContent = '--';
        avgTempSubtextEl.textContent = 'No data available';
    }
}


// UI Feedback Functions
function showLoadingState(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    // Remove any existing error message
    const existingError = container.querySelector('.chart-error');
    if (existingError) existingError.remove();
    
    // Add loading message if not already present
    if (!container.querySelector('.chart-loading')) {
        const loadingEl = document.createElement('div');
        loadingEl.className = 'chart-loading';
        loadingEl.textContent = 'Loading data...';
        container.appendChild(loadingEl);
    }
}

function hideLoadingState(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const loadingEl = container.querySelector('.chart-loading');
    if (loadingEl) {
        loadingEl.remove();
    }
}

function showErrorState(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;
    // Remove any existing loading or error message
    hideLoadingState(containerId); // Also removes loading
    const existingError = container.querySelector('.chart-error');
    if (existingError) existingError.remove();

    const errorEl = document.createElement('div');
    errorEl.className = 'chart-error';
    errorEl.textContent = message;
    container.appendChild(errorEl);
}