# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

HTML5, Vanilla CSS, Vanilla JavaScript, Three.js (3D Digital Twin), GSAP (Animations & Camera Tweens), Chart.js / SVG telemetry visualizations. Deployable as a 100% free zero-dependency static web app (GitHub Pages, Vercel) while maintaining optional Python/Flask local compatibility.

## Users

- **Primary User:** Technical recruiters, portfolio reviewers, engineering leads, and agricultural technology evaluators.
- **Operator Context:** Evaluators inspecting a smart agricultural IoT system without needing physical hardware, active GCP cloud billing, or Firebase credentials.
- **End-User Persona (Original):** Greenhouse operators and hydroponic farm managers at Lokatani monitoring and regulating 3 distinct microclimate growth zones.

## Product Purpose

LokaGrow Smart Greenhouse is an end-to-end IoT microclimate automation and monitoring platform built for precision hydroponics. It enables real-time environmental supervision (temperature, humidity, light) across three crop lifecycle stages (Penyemaian, Peremajaan, Dewasa) with automated climate actuators (exhaust fans, supplemental grow lights, misting).

The web showcase delivers a high-fidelity **3D Digital Twin** simulation that allows public visitors to interact with physical nodes, run day/night cycles, inject sensor faults, and see tactile actuator responses in real time.

## Positioning

Unlike generic static portfolio screenshots or mock dashboards with hardcoded numbers, LokaGrow provides an interactive physics-driven digital twin where every toggle (fans, lights, sun cycle) updates real 3D hardware elements and cascades into realistic microclimate telemetry.

## Zones & Hardware Architecture

1. **Zone 1: Penyemaian (Seeding / Germination)**
   - High humidity requirement, gentle temperature regulation, germination light cycles.
2. **Zone 2: Peremajaan (Juvenile / Vegetative NFT)**
   - Moderate temperature, active ventilation, nutrient flow tracking.
3. **Zone 3: Dewasa (Mature / Harvest - Master ESP32 Node)**
   - High light exposure, heat dissipation via exhaust fans, master gateway coordination.
