// Global variables
let temperatureChart;
let currentSelectedRange = "1day"; // Default to "1day" (24 hours)

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
    loadHistoricalData(currentSelectedRange);
});

function setupTimeRangeButtons() {
    const buttons = document.querySelectorAll('.time-range-btn');
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            buttons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            currentSelectedRange = this.getAttribute('data-range');
            loadHistoricalData(currentSelectedRange);
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

function loadHistoricalData(selectedRange) {
    const chartContainerId = 'temperatureChartContainer'; 
    showLoadingState(chartContainerId);
    updateTemperatureInsights(null);

    let daysToFetchAPI = 1; // Default for API call
    if (selectedRange.endsWith('day')) {
        daysToFetchAPI = parseInt(selectedRange);
    }
    // For "1hour", we still fetch 1 day of data and filter on frontend.

    fetch(`/history/data?days=${daysToFetchAPI}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(apiResponse => {
            hideLoadingState(chartContainerId);
            if (apiResponse.success && apiResponse.data) {
                const { chartData, insightsData } = processTemperatureData(apiResponse.data, selectedRange);
                updateTemperatureChart(chartData, selectedRange);
                updateTemperatureInsights(insightsData);

                // Check based on processed chartData for the specific range, not just apiResponse.data
                const hasDataForRange = Object.values(chartData).some(arr => arr.length > 0);
                if (!hasDataForRange) {
                    showErrorState(chartContainerId, 'No data available for the selected period.');
                    updateTemperatureInsights(null); // Ensure insights also show no data
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

function processTemperatureData(apiData, selectedRange) {
    let dataForInsightCalculation = apiData; // Data used for insights calculation
    let dataForChartDisplay = apiData;    // Data used for chart points

    if (selectedRange === "1hour") {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const hourlyFilteredData = apiData.filter(point => new Date(point.timestamp) >= oneHourAgo);
        dataForInsightCalculation = hourlyFilteredData;
        dataForChartDisplay = hourlyFilteredData;
    } else if (selectedRange === "1day") {
        // For "1day", insights use full data, chart uses downsampled data.
        // dataForInsightCalculation remains apiData (all points for the day).
        
        const DOWNSAMPLE_INTERVAL_MINUTES = 15;
        const downsampledPoints = [];
        if (apiData.length > 0) {
            downsampledPoints.push(apiData[0]); // Always include the first point
            let lastSelectedTime = new Date(apiData[0].timestamp).getTime();

            for (let i = 1; i < apiData.length; i++) {
                const currentTime = new Date(apiData[i].timestamp).getTime();
                
                // If it's the last point, add it if it's not already the last selected one.
                if (i === apiData.length - 1) {
                    if (downsampledPoints[downsampledPoints.length - 1] !== apiData[i]) {
                        downsampledPoints.push(apiData[i]);
                    }
                    break; 
                }
                
                // If current point is past the interval from the last selected point
                if (currentTime - lastSelectedTime >= DOWNSAMPLE_INTERVAL_MINUTES * 60 * 1000) {
                    downsampledPoints.push(apiData[i]);
                    lastSelectedTime = currentTime;
                }
            }
        }
        dataForChartDisplay = downsampledPoints;
    }
    // For "7day" and "30day", both insights and chart use the full apiData for that range.

    const chartData = {
        dewasa: [],
        remaja: [],
        penyemaian: [],
        averages: []
    };
    const validSections = Object.keys(chartData);

    // Populate chartData using dataForChartDisplay
    dataForChartDisplay.forEach(point => {
        const timestamp = new Date(point.timestamp); 
        validSections.forEach(sectionName => {
            if (point.data && point.data[sectionName] && 
                point.data[sectionName].temps && 
                typeof point.data[sectionName].temps.avg === 'number') {
                
                const currentAvgTemp = point.data[sectionName].temps.avg;
                chartData[sectionName].push({
                    x: timestamp,
                    y: currentAvgTemp
                });
            }
        });
    });

    // Calculate insights using dataForInsightCalculation
    let minTemp = { value: Infinity, timestamp: null, section: null };
    let maxTemp = { value: -Infinity, timestamp: null, section: null };
    let sumOfAverageTemps = 0;
    let countOfAverageTemps = 0;

    dataForInsightCalculation.forEach(point => { 
        const timestamp = new Date(point.timestamp); 
        validSections.forEach(sectionName => {
            if (point.data && point.data[sectionName] && 
                point.data[sectionName].temps && 
                typeof point.data[sectionName].temps.avg === 'number') {
                
                const currentAvgTemp = point.data[sectionName].temps.avg;
                if (currentAvgTemp < minTemp.value) {
                    minTemp = { value: currentAvgTemp, timestamp: timestamp, section: sectionName };
                }
                if (currentAvgTemp > maxTemp.value) {
                    maxTemp = { value: currentAvgTemp, timestamp: timestamp, section: sectionName };
                }
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

function updateTemperatureChart(chartData, selectedRange) {
    temperatureChart.data.datasets = []; 

    Object.keys(chartData).forEach(sectionName => {
        if (chartData[sectionName] && chartData[sectionName].length > 0) {
            const isAverages = sectionName === 'averages';
            const color = chartColors[sectionName] || 'rgba(0, 0, 0, 0.5)'; 
            
            const backgroundColor = isAverages 
                ? color.replace('1)', '0.2)') 
                : color.replace('1)', '0.1)'); 

            const dataset = {
                label: `${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)} Temp`,
                data: chartData[sectionName],
                borderColor: color,
                backgroundColor: backgroundColor,
                tension: 0.1, 
                borderWidth: 2,
                pointRadius: selectedRange === "1hour" ? 3 : (selectedRange === "1day" ? 2 : 0), // Show points for 1hr & 1day
                pointHoverRadius: 5,
                fill: isAverages ? 'origin' : false, 
            };

            if (isAverages) {
                dataset.order = 1; 
            } else {
                dataset.order = 2; 
            }
            temperatureChart.data.datasets.push(dataset);
        }
    });

    // Adjust X-axis time unit and display formats based on the selected range
    if (selectedRange === "1hour") {
        temperatureChart.options.scales.x.time.unit = 'minute';
        temperatureChart.options.scales.x.time.tooltipFormat = 'HH:mm:ss'; // More precise for minutes
        temperatureChart.options.scales.x.time.displayFormats = { minute: 'HH:mm' };
        temperatureChart.options.scales.x.ticks.stepSize = 5; // Example: tick every 5 minutes
                                                               // Or use maxTicksLimit for auto adjustment
        // temperatureChart.options.scales.x.ticks.maxTicksLimit = 12; // Show about 12 ticks
    } else if (selectedRange === "1day") { 
        temperatureChart.options.scales.x.time.unit = 'hour';
        temperatureChart.options.scales.x.time.tooltipFormat = 'HH:mm';
        temperatureChart.options.scales.x.time.displayFormats = { hour: 'HH:mm' };
        temperatureChart.options.scales.x.ticks.stepSize = undefined; // Let Chart.js auto-determine
        // temperatureChart.options.scales.x.ticks.maxTicksLimit = 12; 
    } else if (selectedRange === "7day") { 
        temperatureChart.options.scales.x.time.unit = 'day';
        temperatureChart.options.scales.x.time.tooltipFormat = 'MMM d, HH:mm';
        temperatureChart.options.scales.x.time.displayFormats = { day: 'MMM d' };
        temperatureChart.options.scales.x.ticks.stepSize = undefined;
        // temperatureChart.options.scales.x.ticks.maxTicksLimit = undefined; 
    } else { // 30day
        temperatureChart.options.scales.x.time.unit = 'day';
        temperatureChart.options.scales.x.time.tooltipFormat = 'MMM d, yyyy';
        temperatureChart.options.scales.x.time.displayFormats = { day: 'MMM d' };
        temperatureChart.options.scales.x.ticks.stepSize = undefined;
        // temperatureChart.options.scales.x.ticks.maxTicksLimit = undefined; 
    }
    
    // Ensure stepSize is explicitly undefined if not "1hour" to rely on auto ticks or maxTicksLimit
    if (selectedRange !== "1hour") {
        temperatureChart.options.scales.x.ticks.stepSize = undefined;
    }


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