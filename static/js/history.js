// History page JavaScript

let temperatureChart, humidityChart, lightChart;
let currentDays = 1; 

// Colors for chart lines - ensure 'remaja' has a color if 'peremajaan' was used
const chartColors = {
    dewasa: 'rgba(54, 162, 235, 1)',    // Blued
    remaja: 'rgba(255, 159, 64, 1)',   // Orange
    penyemaian: 'rgba(75, 192, 192, 1)', // Teal/Aqua
    averages: 'rgba(153, 102, 255, 1)'  // Purple
};


document.addEventListener('DOMContentLoaded', function() {
    setupTimeRangeButtons();
    initCharts();
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

function initCharts() {
    const commonOptions = {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false, },
        plugins: { legend: { position: 'top', }, tooltip: { enabled: true } },
        scales: { x: { type: 'category', title: { display: true, text: 'Time' } } }
    };
    
    const tempCtx = document.getElementById('temperatureChart').getContext('2d');
    temperatureChart = new Chart(tempCtx, {
        type: 'line', data: { datasets: [] },
        options: { ...commonOptions, scales: { ...commonOptions.scales, y: { title: { display: true, text: 'Temperature (°C)' } } } }
    });
    
    const humidityCtx = document.getElementById('humidityChart').getContext('2d');
    humidityChart = new Chart(humidityCtx, {
        type: 'line', data: { datasets: [] },
        options: { ...commonOptions, scales: { ...commonOptions.scales, y: { title: { display: true, text: 'Humidity (%)' }, min: 0, max: 100 } } }
    });
    
    const lightCtx = document.getElementById('lightChart').getContext('2d');
    lightChart = new Chart(lightCtx, {
        type: 'line', data: { datasets: [] },
        options: { ...commonOptions, scales: { ...commonOptions.scales, y: { title: { display: true, text: 'Light (lux)' } } } }
    });
}

function loadHistoricalData(days) {
    showLoadingState();
    fetch(`/history/data?days=${days}`)
        .then(response => response.ok ? response.json() : Promise.reject('Network response was not ok'))
        .then(data => data.success ? processHistoricalData(data.data) : showError('Failed to load data'))
        .catch(error => {
            console.error('Error fetching historical data:', error);
            showError('Error loading data from server');
        });
}

function processHistoricalData(data) {
    hideLoadingState();
    const chartData = { temperature: {}, humidity: {}, light: {} };
    // UPDATED sections array
    const sections = ['dewasa', 'remaja', 'penyemaian', 'averages']; 
    
    sections.forEach(section => {
        chartData.temperature[section] = [];
        chartData.humidity[section] = [];
        chartData.light[section] = [];
    });
    
    data.forEach(point => {
        // Timestamps from backend are now ISO strings
        const timestamp = new Date(point.timestamp); 
        
        Object.keys(point.data).forEach(section => {
            if (!sections.includes(section)) return; // Ensure we only process expected sections

            const sectionData = point.data[section];
            if (sectionData.temps && sectionData.temps.avg !== undefined && sectionData.temps.avg !== null) {
                chartData.temperature[section].push({ x: timestamp, y: sectionData.temps.avg });
            }
            if (sectionData.humidities && sectionData.humidities.avg !== undefined && sectionData.humidities.avg !== null) {
                chartData.humidity[section].push({ x: timestamp, y: sectionData.humidities.avg });
            }
            if (sectionData.lights && sectionData.lights.avg !== undefined && sectionData.lights.avg !== null) {
                chartData.light[section].push({ x: timestamp, y: sectionData.lights.avg });
            }
        });
    });
    updateCharts(chartData);
}

function updateCharts(chartData) {
    updateSingleChart(temperatureChart, chartData.temperature, 'Temperature');
    updateSingleChart(humidityChart, chartData.humidity, 'Humidity');
    updateSingleChart(lightChart, chartData.light, 'Light');
}

function updateSingleChart(chart, data, label) {
    chart.data.datasets = [];
    Object.keys(data).forEach(section => {
        if (data[section].length > 0) {
            const sectionLabel = section.charAt(0).toUpperCase() + section.slice(1);
            chart.data.datasets.push({
                label: `${sectionLabel} ${label}`,
                data: data[section],
                borderColor: chartColors[section] || '#CCCCCC', // Fallback color
                backgroundColor: (chartColors[section] || '#CCCCCC').replace('1)', '0.1)'),
                borderWidth: 2, tension: 0.3, pointRadius: 2, pointHoverRadius: 5
            });
        }
    });
    
    if (chart.options.scales.x.type !== 'time' && chart.data.datasets.some(ds => ds.data.length > 0)) {
        chart.options.scales.x = {
            type: 'time',
            time: { unit: currentDays <= 1 ? 'hour' : 'day', tooltipFormat: 'PPpp', displayFormats: { hour: 'HH:mm', day: 'MMM d'}}, // Added displayFormats
            title: { display: true, text: 'Time' }
        };
    } else if (chart.data.datasets.length === 0) { // Revert to category if no data
         chart.options.scales.x = { type: 'category', title: { display: true, text: 'Time' } };
    }
    chart.update();
}

function showLoadingState() {
    document.querySelectorAll('.chart-container').forEach(container => {
        if (!container.querySelector('.loading')) {
            const loading = document.createElement('div');
            loading.className = 'loading'; loading.textContent = 'Loading data...';
            container.appendChild(loading);
        }
        const errorMsg = container.querySelector('.error-message');
        if (errorMsg) errorMsg.style.display = 'none'; // Hide error when loading
    });
}

function hideLoadingState() {
    document.querySelectorAll('.loading').forEach(el => el.remove());
}

function showError(message) {
    hideLoadingState();
    document.querySelectorAll('.chart-container').forEach(container => {
        let errorEl = container.querySelector('.error-message');
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.className = 'error-message';
            container.appendChild(errorEl);
        }
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    });
}
