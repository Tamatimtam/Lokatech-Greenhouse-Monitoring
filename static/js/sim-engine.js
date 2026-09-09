/**
 * LokaGrow IoT Microclimate & Physics Simulation Engine
 * Replaces physical hardware & cloud MQTT broker with an in-browser digital twin simulation.
 * Simulates:
 * - 24h Day/Night solar cycle & irradiance
 * - Thermodynamics (temperature cooling via exhaust fans, heat accumulation)
 * - Psychrometrics (relative humidity dynamics, misting pulses)
 * - 3 Distinct ESP32 nodes: Penyemaian (Seeding), Peremajaan (Juvenile), Dewasa (Mature/Master)
 * - Actuators: Exhaust Fan, Horticultural Grow Lights, Misting System
 * - Fault injection for demo testing (Node dropouts, sensor alarms)
 */

class GreenhouseSimEngine {
    constructor() {
        // Simulation Time: 0.0 to 24.0 hours (default starts at 11:30 AM)
        this.timeOfDay = 11.5; 
        this.timeSpeed = 0.5; // Real seconds per sim hour if running auto
        this.isPlaying = false;
        this.autoPlayTimer = null;

        // Actuator States
        this.actuators = {
            fan: false,
            lights: false,
            mist: false
        };

        // Actuator Control Modes ('auto' or 'manual')
        this.modes = {
            fan: 'auto',
            lights: 'auto',
            mist: 'manual'
        };

        // Auto Thresholds based on fuzzy greenhouse criteria
        this.thresholds = {
            tempHigh: 30.0, // °C: Fan turns ON if temp > 30.0
            tempLow: 28.8,  // °C: Fan turns OFF when cooled to <= 28.8
            lightLow: 2000, // lux: Grow lights turn ON if light < 2000 lux (or night)
            lightHigh: 3800 // lux: Grow lights turn OFF if natural light >= 3800 lux
        };

        // Node Hardware Health (penyemaian, remaja, dewasa matching dashboard keys)
        this.nodesHealth = {
            penyemaian: { online: true, sensors: { temp: true, humidity: true, light: true } },
            remaja: { online: true, sensors: { temp: true, humidity: true, light: true } },
            dewasa: { online: true, sensors: { temp: true, humidity: true, light: true } }
        };
        // Backwards compatibility alias
        this.nodesHealth.peremajaan = this.nodesHealth.remaja;

        // Environmental Baseline (Outdoor / Ambient)
        this.ambient = {
            temp: 28.0,
            humidity: 70.0,
            light: 5000.0
        };

        // Internal State per Node
        this.state = {
            penyemaian: { temp: 26.5, humidity: 82.0, light: 5200, lastTemp: 26.5 },
            remaja: { temp: 27.8, humidity: 68.0, light: 5800, lastTemp: 27.8 },
            dewasa: { temp: 29.0, humidity: 64.0, light: 6200, lastTemp: 29.0 }
        };
        // Backwards compatibility alias
        this.state.peremajaan = this.state.remaja;

        // Event listeners
        this.listeners = new Set();

        // Start internal simulation clock
        this.lastTickTime = performance.now();
        this.startEngineLoop();
    }

    /** Subscribe to simulation state updates */
    onUpdate(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /** Set Actuator Mode ('auto' | 'manual') */
    setActuatorMode(device, mode) {
        const devKey = device === 'light' ? 'lights' : device;
        if (this.modes.hasOwnProperty(devKey)) {
            this.modes[devKey] = mode;
            this.notify('modeChange', { device: devKey, mode });
            this.recalculatePhysics(0.2);
            this.broadcast();
        }
    }

    /** Toggle Actuator (fan, lights, mist) with optional manual override */
    setActuator(name, active, isManual = false) {
        const devKey = name === 'light' ? 'lights' : name;
        if (this.actuators.hasOwnProperty(devKey)) {
            this.actuators[devKey] = !!active;
            if (isManual) {
                this.modes[devKey] = 'manual';
            }
            this.recalculatePhysics(0.5);
            this.notify('actuatorChange', { name: devKey, active: this.actuators[devKey], mode: this.modes[devKey] });
            this.broadcast();
        }
    }

    notify(event, data) {
        this.listeners.forEach(cb => {
            try { cb(event, data); } catch (e) { console.error('SimEngine listener error:', e); }
        });
    }

    /** Set time of day directly (0 to 24) */
    setTimeOfDay(hour) {
        this.timeOfDay = Math.max(0, Math.min(24, hour));
        this.recalculatePhysics(0.1);
        this.broadcast();
    }

    /** Toggle play/pause 24h timelapse */
    togglePlay(play) {
        this.isPlaying = play !== undefined ? play : !this.isPlaying;
        this.notify('playState', { isPlaying: this.isPlaying });
    }

    /** Set Node Online / Offline for testing alarms */
    setNodeOnline(nodeName, online) {
        if (this.nodesHealth[nodeName]) {
            this.nodesHealth[nodeName].online = !!online;
            this.notify('healthChange', { node: nodeName, status: this.nodesHealth[nodeName] });
            this.broadcast();
        }
    }

    /** Set Sensor health for testing */
    setSensorWorking(nodeName, sensorType, working) {
        if (this.nodesHealth[nodeName]?.sensors.hasOwnProperty(sensorType)) {
            this.nodesHealth[nodeName].sensors[sensorType] = !!working;
            this.notify('healthChange', { node: nodeName, status: this.nodesHealth[nodeName] });
            this.broadcast();
        }
    }

    /** Physics calculation based on sun position and active actuators */
    recalculatePhysics(dt = 0.1) {
        const h = this.timeOfDay;

        // Solar Elevation / Curve (Sunrise at 6.0, Solar Noon at 12.0, Sunset at 18.0)
        let sunElevation = 0;
        let sunIntensity = 0;
        if (h >= 6.0 && h <= 18.0) {
            // Sine wave over the 12 daylight hours
            const angle = ((h - 6.0) / 12.0) * Math.PI;
            sunElevation = Math.sin(angle); // 0 to 1
            sunIntensity = Math.pow(sunElevation, 1.2); // natural curve
        }

        // Ambient outdoor temperature: coldest at 5:00 AM (23°C), hottest at 14:00 (33°C)
        const tempPeakHour = 14.0;
        const tempPhase = ((h - tempPeakHour + 24) % 24) / 24 * Math.PI * 2;
        this.ambient.temp = 28.0 + 5.0 * Math.cos(tempPhase); // 23°C to 33°C

        // Ambient light in lux (0 lux at night to 7200 lux at midday)
        const outdoorLight = Math.round(sunIntensity * 7200.0);
        this.ambient.light = outdoorLight;

        // Ambient humidity: generally inverse to temperature (50% midday to 88% night)
        this.ambient.humidity = +(70.0 - 18.0 * (sunIntensity - 0.3)).toFixed(1);

        // Calculate each node's microclimate (penyemaian, remaja, dewasa)
        const nodes = ['penyemaian', 'remaja', 'dewasa'];
        nodes.forEach(node => {
            const current = this.state[node];
            current.lastTemp = current.temp;

            // 1. Light Calculation in Lux (0 - 10,000 lux)
            let targetLight = outdoorLight;
            if (this.actuators.lights) {
                // Grow lights add +2400 lux to the canopy
                targetLight = Math.min(10000, targetLight + 2400);
            }
            // Small micro-variation between zones
            const zoneLightDelta = node === 'penyemaian' ? -300 : (node === 'dewasa' ? +350 : 0);
            // Minimum 15 lux so it doesn't trigger zero-sensor disconnect checks
            current.light = Math.max(15, Math.min(10000, targetLight + zoneLightDelta));

            // 2. Temperature Calculation
            // Greenhouse effect adds +3 to +5.5°C under intense solar radiation
            let greenhouseGain = sunIntensity * 5.5;

            // Exhaust Fan cooling effect: lowers heat buildup by 75%
            if (this.actuators.fan) {
                greenhouseGain *= 0.25;
            }

            // Grow lights add slight warmth (+0.6°C)
            const lightHeat = this.actuators.lights ? 0.6 : 0.0;

            // Node specific targets
            let nodeTempOffset = 0;
            if (node === 'penyemaian') nodeTempOffset = -1.2; // closer to moist ground / sheltered
            if (node === 'dewasa') nodeTempOffset = +1.0;     // near roof / higher biomass heat

            const targetTemp = this.ambient.temp + greenhouseGain + lightHeat + nodeTempOffset;
            
            // Smoothly move toward target temperature
            current.temp = +(current.temp + (targetTemp - current.temp) * Math.min(1.0, dt * 2.0)).toFixed(1);

            // 3. Humidity Calculation
            let targetHum = this.ambient.humidity - (greenhouseGain * 2.5);

            // Zone specific humidity profiles:
            if (node === 'penyemaian') {
                targetHum += 14.0; // Seeding zone is kept significantly more humid
            }

            // Misting effect: boosts humidity by +20%
            if (this.actuators.mist) {
                targetHum = Math.min(95.0, targetHum + 22.0);
            }

            // Fans reduce trapped humidity by venting air
            if (this.actuators.fan) {
                targetHum = Math.max(45.0, targetHum - 8.0);
            }

            current.humidity = +(current.humidity + (targetHum - current.humidity) * Math.min(1.0, dt * 2.0)).toFixed(1);
        });

        // Mirror remaja to peremajaan
        this.state.peremajaan = this.state.remaja;

        // 4. Closed-Loop Automation Engine (Auto Threshold Handling)
        const avgTemp = (this.state.penyemaian.temp + this.state.remaja.temp + this.state.dewasa.temp) / 3.0;
        const avgLight = (this.state.penyemaian.light + this.state.remaja.light + this.state.dewasa.light) / 3.0;

        // Fan Auto Mode: Check temperature threshold (> 30.0°C)
        if (this.modes.fan === 'auto') {
            if (avgTemp > this.thresholds.tempHigh && !this.actuators.fan) {
                this.actuators.fan = true;
                this.notify('actuatorChange', { name: 'fan', active: true, mode: 'auto', reason: 'auto_temp_high' });
            } else if (avgTemp <= this.thresholds.tempLow && this.actuators.fan) {
                this.actuators.fan = false;
                this.notify('actuatorChange', { name: 'fan', active: false, mode: 'auto', reason: 'auto_temp_normal' });
            }
        }

        // Grow Lights Auto Mode: Check light threshold (< 2000 lux or dark)
        if (this.modes.lights === 'auto') {
            if (avgLight < this.thresholds.lightLow && !this.actuators.lights) {
                this.actuators.lights = true;
                this.notify('actuatorChange', { name: 'lights', active: true, mode: 'auto', reason: 'auto_light_low' });
            } else if (avgLight >= this.thresholds.lightHigh && this.actuators.lights) {
                this.actuators.lights = false;
                this.notify('actuatorChange', { name: 'lights', active: false, mode: 'auto', reason: 'auto_light_sufficient' });
            }
        }
    }

    /** Determine trend icon based on temperature difference */
    calculateTrend(node, type) {
        if (!this.nodesHealth[node]?.online || !this.nodesHealth[node]?.sensors[type] || !this.state[node]) {
            return 'circle-exclamation';
        }
        const diff = this.state[node].temp - this.state[node].lastTemp;
        if (Math.abs(diff) < 0.1) return 'equals';
        return diff > 0 ? 'arrow-up' : 'arrow-down';
    }

    /** Generate payload matching original MQTT / Flask sensor API */
    getLatestPayload() {
        const sectionsData = {};
        const avgCollectors = { temp: [], humidity: [], light: [] };

        const targetNodes = ['penyemaian', 'remaja', 'dewasa'];
        targetNodes.forEach(node => {
            const health = this.nodesHealth[node] || { online: true, sensors: { temp: true, humidity: true, light: true } };
            if (!health.online) {
                sectionsData[node] = {};
                return;
            }

            const readings = {};
            const trends = {};
            const st = this.state[node];

            ['temp', 'humidity', 'light'].forEach(type => {
                if (health.sensors[type] && st) {
                    readings[type] = st[type];
                    trends[type] = type === 'temp' ? this.calculateTrend(node, 'temp') : 'equals';
                    avgCollectors[type].push(st[type]);
                }
            });

            sectionsData[node] = {
                ...readings,
                trends: trends
            };
        });

        // Mirror for backward compatibility
        sectionsData.peremajaan = { ...sectionsData.remaja };

        // Calculate averages from active sensors
        const averages = {};
        ['temp', 'humidity', 'light'].forEach(type => {
            if (avgCollectors[type].length > 0) {
                const sum = avgCollectors[type].reduce((a, b) => a + b, 0);
                if (type === 'light') {
                    averages[type] = Math.round(sum / avgCollectors[type].length);
                } else {
                    averages[type] = +(sum / avgCollectors[type].length).toFixed(1);
                }
            } else {
                averages[type] = null;
            }
        });

        return {
            timestamp: new Date().toISOString(),
            timeOfDay: this.timeOfDay,
            averages: averages,
            sections: sectionsData,
            actuators: {
                fan: { state: this.actuators.fan, mode: this.modes.fan },
                light: { state: this.actuators.lights, mode: this.modes.lights },
                mist: { state: this.actuators.mist, mode: this.modes.mist },
                fanState: this.actuators.fan,
                lightsState: this.actuators.lights,
                mistState: this.actuators.mist
            }
        };
    }

    /** Notify all listeners with latest telemetry payload */
    broadcast() {
        const payload = this.getLatestPayload();
        try {
            localStorage.setItem('lokagrow_sim_data', JSON.stringify(payload));
        } catch (e) {}
        this.notify('telemetry', payload);
        // Custom DOM event so any outside module can listen easily
        window.dispatchEvent(new CustomEvent('lokagrow:telemetry', { detail: payload }));
    }

    /** Main high-frequency simulation loop */
    startEngineLoop() {
        const loop = (now) => {
            const deltaMs = now - this.lastTickTime;
            this.lastTickTime = now;
            const dt = Math.min(0.5, deltaMs / 1000.0);

            // If 24h timelapse is running, advance time
            if (this.isPlaying) {
                // 1 real second = 0.5 sim hour (full 24h in 48s)
                this.timeOfDay = (this.timeOfDay + dt * 0.75) % 24.0;
                this.notify('timeUpdate', { timeOfDay: this.timeOfDay });
            }

            this.recalculatePhysics(dt);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);

        // Broadcast telemetry data at 1Hz (every 1000ms) for smooth dashboard consumption
        setInterval(() => {
            this.broadcast();
        }, 1000);
    }

    /** Formatted time string (e.g. "14:30") */
    getFormattedTime() {
        const hours = Math.floor(this.timeOfDay);
        const minutes = Math.floor((this.timeOfDay - hours) * 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
}

// Attach class and singleton to window
window.GreenhouseSimEngine = GreenhouseSimEngine;
window.SimEngine = new GreenhouseSimEngine();
console.log('🌱 LokaGrow SimEngine initialized.');
