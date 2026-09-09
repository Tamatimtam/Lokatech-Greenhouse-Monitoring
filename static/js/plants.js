document.addEventListener('DOMContentLoaded', function() {
    console.log('Plants guide page loaded with real-time simulation link');
    
    // 1. Add smooth transitions and card click handling
    const plantCards = document.querySelectorAll('.plant-card');
    plantCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.classList.add('plant-card--hover');
        });
        
        card.addEventListener('mouseleave', () => {
            card.classList.remove('plant-card--hover');
        });
        
        const detailLink = card.querySelector('a.button--primary');
        if (detailLink) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.button')) {
                    detailLink.click();
                }
            });
        }
    });
    
    // View transition API support
    if ('startViewTransition' in document) {
        document.querySelectorAll('a[href^="/plants/"]').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                const href = link.getAttribute('href');
                document.startViewTransition(() => {
                    window.location.href = href;
                });
            });
        });
    }

    // 2. Real-Time Microclimate Telemetry Updates
    const thresholds = {
        bayam: { tempMin: 20, tempMax: 31, humMin: 60, humMax: 75, lightMin: 25 },
        kale: { tempMin: 10, tempMax: 31, humMin: 55, humMax: 70, lightMin: 20 }
    };

    function updatePlantStatus(plantId, data) {
        if (!data || !data.averages) return;

        const tempEl = document.getElementById(`${plantId}-live-temp`);
        const humEl = document.getElementById(`${plantId}-live-hum`);
        const lightEl = document.getElementById(`${plantId}-live-light`);
        const badgeEl = document.getElementById(`${plantId}-health-badge`);

        const avg = data.averages;
        const temp = avg.temp !== undefined ? avg.temp : 27.5;
        const hum = avg.humidity !== undefined ? avg.humidity : 70.0;
        const light = avg.light !== undefined ? avg.light : 65.0;

        if (tempEl) tempEl.textContent = `${temp.toFixed(1)} °C`;
        if (humEl) humEl.textContent = `${hum.toFixed(0)} %`;
        if (lightEl) lightEl.textContent = `${light.toFixed(0)} %`;

        if (badgeEl) {
            const t = thresholds[plantId];
            if (temp > t.tempMax) {
                badgeEl.textContent = `⚠️ Panas (${temp}°C)`;
                badgeEl.style.background = 'rgba(231, 76, 60, 0.15)';
                badgeEl.style.color = '#e74c3c';
            } else if (light < t.lightMin) {
                badgeEl.textContent = '🌙 Malam (Lampu Aktif)';
                badgeEl.style.background = 'rgba(155, 89, 182, 0.15)';
                badgeEl.style.color = '#9b59b6';
            } else if (hum < t.humMin) {
                badgeEl.textContent = '⚠️ Kurang Lembap';
                badgeEl.style.background = 'rgba(243, 156, 18, 0.15)';
                badgeEl.style.color = '#f39c12';
            } else {
                badgeEl.textContent = '✓ Optimal (Sehat)';
                badgeEl.style.background = 'rgba(39, 174, 96, 0.15)';
                badgeEl.style.color = '#27ae60';
            }
        }
    }

    function renderTelemetry(data) {
        if (!data) return;
        updatePlantStatus('bayam', data);
        updatePlantStatus('kale', data);
    }

    // Read stored simulation telemetry
    const syncSimulation = () => {
        try {
            const raw = localStorage.getItem('lokagrow_sim_data');
            if (raw) {
                const parsed = JSON.parse(raw);
                renderTelemetry(parsed);
                return;
            }
        } catch (e) {}

        // Baseline fallback if simulation hasn't broadcasted yet
        renderTelemetry({
            averages: { temp: 27.8, humidity: 72.0, light: 65.0 }
        });
    };

    syncSimulation();

    // Listen across windows/tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'lokagrow_sim_data') {
            syncSimulation();
        }
    });

    // Periodic check
    setInterval(syncSimulation, 1000);

    // Socket.IO fallback
    if (typeof io !== 'undefined') {
        const socket = io();
        socket.on('sensor_update', (data) => {
            renderTelemetry(data);
        });
    }
});
