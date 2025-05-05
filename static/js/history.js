// History page JavaScript

// Global variables for charts and data
let temperatureChart, humidityChart, lightChart;
let currentDays = 1; // Default to 1 day of history

// Colors for chart lines - matching the green theme
const chartColors = {
    dewasa: 'rgba(40, 98, 71, 1)',      // Primary green
    peremajaan: 'rgba(53, 116, 86, 1)',  // Lighter green
    penyemaian: 'rgba(3, 92, 29, 1)',   // Darker green
    averages: 'rgba(25, 135, 84, 1)'    // Another green shade
};

// Initialize the page when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Set up time range buttons
    setupTimeRangeButtons();
    
    // Initialize charts
    initCharts();
    
    // Load initial data (1 day by default)
    loadHistoricalData(currentDays);
});

// Set up event listeners for time range buttons
function setupTimeRangeButtons() {
    const buttons = document.querySelectorAll('.time-range-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            buttons.forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            this.classList.add('active');
            
            // Get the days value from data attribute
            const days = parseInt(this.getAttribute('data-days'));
            currentDays = days;
            
            // Load data for the selected time range
            loadHistoricalData(days);
        });
    });
}

// Initialize Chart.js charts
function initCharts() {
    // Common options for all charts
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                position: 'top',
            },
            tooltip: {
                enabled: true
            }
        },
        scales: {
            x: {
                // Use category scale first, we'll update to time when data is loaded
                type: 'category',
                title: {
                    display: true,
                    text: 'Time'
                }
            }
        }
    };
    
    // Temperature chart
    const tempCtx = document.getElementById('temperatureChart').getContext('2d');
    temperatureChart = new Chart(tempCtx, {
        type: 'line',
        data: {
            datasets: []
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    title: {
                        display: true,
                        text: 'Temperature (°C)'
                    }
                }
            }
        }
    });
    
    // Humidity chart
    const humidityCtx = document.getElementById('humidityChart').getContext('2d');
    humidityChart = new Chart(humidityCtx, {
        type: 'line',
        data: {
            datasets: []
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    title: {
                        display: true,
                        text: 'Humidity (%)'
                    },
                    min: 0,
                    max: 100
                }
            }
        }
    });
    
    // Light chart
    const lightCtx = document.getElementById('lightChart').getContext('2d');
    lightChart = new Chart(lightCtx, {
        type: 'line',
        data: {
            datasets: []
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    title: {
                        display: true,
                        text: 'Light (lux)'
                    }
                }
            }
        }
    });
}

// Load historical data from the server
function loadHistoricalData(days) {
    // Show loading state
    showLoadingState();
    
    // Fetch data from our history API
    fetch(`/history/data?days=${days}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Process and display the data
                processHistoricalData(data.data);
            } else {
                showError('Failed to load data');
            }
        })
        .catch(error => {
            console.error('Error fetching historical data:', error);
            showError('Error loading data from server');
        });
}

// Process the historical data and update charts
function processHistoricalData(data) {
    // Clear loading state
    hideLoadingState();
    
    // Organize data by section and type
    const chartData = {
        temperature: {},
        humidity: {},
        light: {}
    };
    
    // Initialize datasets for each section
    const sections = ['dewasa', 'peremajaan', 'penyemaian', 'averages'];
    
    sections.forEach(section => {
        chartData.temperature[section] = [];
        chartData.humidity[section] = [];
        chartData.light[section] = [];
    });
    
    // Process each data point
    data.forEach(point => {
        const timestamp = new Date(point.timestamp);
        
        // Process each section's data
        Object.keys(point.data).forEach(section => {
            const sectionData = point.data[section];
            
            // Temperature data
            if (sectionData.temps && sectionData.temps.avg !== undefined) {
                chartData.temperature[section].push({
                    x: timestamp,
                    y: sectionData.temps.avg
                });
            }
            
            // Humidity data
            if (sectionData.humidities && sectionData.humidities.avg !== undefined) {
                chartData.humidity[section].push({
                    x: timestamp,
                    y: sectionData.humidities.avg
                });
            }
            
            // Light data
            if (sectionData.lights && sectionData.lights.avg !== undefined) {
                chartData.light[section].push({
                    x: timestamp,
                    y: sectionData.lights.avg
                });
            }
        });
    });
    
    // Update charts with the processed data
    updateCharts(chartData);
}

// Update all charts with the new data
function updateCharts(chartData) {
    // Update temperature chart
    updateSingleChart(temperatureChart, chartData.temperature, 'Temperature');
    
    // Update humidity chart
    updateSingleChart(humidityChart, chartData.humidity, 'Humidity');
    
    // Update light chart
    updateSingleChart(lightChart, chartData.light, 'Light');
}

// Update a single chart with the provided data
function updateSingleChart(chart, data, label) {
    // Clear existing datasets
    chart.data.datasets = [];
    
    // Add datasets for each section
    Object.keys(data).forEach(section => {
        // Only add the dataset if it has data points
        if (data[section].length > 0) {
            const sectionLabel = section.charAt(0).toUpperCase() + section.slice(1);
            chart.data.datasets.push({
                label: `${sectionLabel} ${label}`,
                data: data[section],
                borderColor: chartColors[section],
                backgroundColor: chartColors[section].replace('1)', '0.1)'),
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 2,
                pointHoverRadius: 5
            });
        }
    });
    
    // Switch to time scale if we have data and chart is not already using time scale
    if (chart.options.scales.x.type !== 'time' && chart.data.datasets.length > 0) {
        chart.options.scales.x = {
            type: 'time',
            time: {
                unit: currentDays <= 1 ? 'hour' : 'day',
            },
            title: {
                display: true,
                text: 'Time'
            }
        };
    }
    
    // Update the chart
    chart.update();
}

// Show loading state
function showLoadingState() {
    // Add loading indicators to each chart container
    document.querySelectorAll('.chart-container').forEach(container => {
        // Only add if not already present
        if (!container.querySelector('.loading')) {
            const loading = document.createElement('div');
            loading.className = 'loading';
            loading.textContent = 'Loading data...';
            container.appendChild(loading);
        }
    });
}

// Hide loading state
function hideLoadingState() {
    // Remove all loading indicators
    document.querySelectorAll('.loading').forEach(el => el.remove());
}

// Show error message
function showError(message) {
    hideLoadingState();
    
    // Add error message to each chart container
    document.querySelectorAll('.chart-container').forEach(container => {
        // Remove existing error message if any
        const existingError = container.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
        
        // Create new error message
        const error = document.createElement('div');
        error.className = 'error-message';
        error.style.display = 'block';
        error.textContent = message;
        container.appendChild(error);
    });
}
