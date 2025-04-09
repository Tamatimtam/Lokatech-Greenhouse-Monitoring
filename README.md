# 🌱 LokaTech Greenhouse Monitoring & Automation System

> Smart IoT monitoring and automation for hydroponic greenhouses at Lokatani

[![Project Status: Active](https://img.shields.io/badge/Project_Status-Active-green?style=for-the-badge)](https://github.com/Tamatimtam/simpleLogin) <!-- Placeholder URL -->
[![PBL Project](https://img.shields.io/badge/PBL-6th_Semester-blue?style=for-the-badge)](https://github.com/Tamatimtam/simpleLogin) <!-- Placeholder URL -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

<div align="center">

<img src="/static/images/lokatech-logo.png" width="70%" alt="LokaTech Greenhouse System">

</div>

## 🌟 Overview

This smart IoT-based system provides automated monitoring and control for environmental conditions (temperature, humidity, light) in hydroponic greenhouses at Lokatani, using ESP32 nodes, ESP-NOW, MQTT, and a Flask web application. Built as a 6th semester Project-Based Learning (PBL) and Special Topic Project.

## 🔍 Why It Matters

| Current Challenges | Our Solution |
|---|---|
| ❌ Manual fan & exhaust operation | ✅ Automated climate control |
| ❌ Inefficient response to changes | ✅ Real-time monitoring and alerts |
| ❌ Requires constant human attention | ✅ Remote access and management |
| ❌ Prone to human error | ✅ Data-driven decision making |
| ❌ Limited environmental data | ✅ Comprehensive data collection |

## ✨ Features

| Feature                     | Status          | Description                                                                                                |
| :-------------------------- | :-------------- | :--------------------------------------------------------------------------------------------------------- |
| Environmental Monitoring    | ✅ Implemented  | Temperature (DHT22), Humidity (DHT22), Light Intensity (BH1750) across 3 sections.                          |
| IoT Data Transmission       | ✅ Implemented  | ESP-NOW chain (Penyemaian -> Peremajaan -> Dewasa) + MQTT from Dewasa node to broker.                        |
| User Authentication         | ✅ Implemented  | Secure login via Firebase Authentication (Email/Password).                                                   |
| Data Storage                | ✅ Implemented  | Real-time data stored in backend memory (Python variable via `SensorDataManager`).                           |
| Dashboard & Visualization | ✅ Implemented  | Web dashboard (Flask/Jinja2) showing real-time gauges, section data, status summary, actuator state/mode. |
| Equipment Control           | ✅ Implemented  | Fuzzy logic on Dewasa node (auto mode), Manual override via Web UI -> API -> MQTT command.                 |
| Alerts & Notifications    | ⏱️ Planned     | (e.g., Telegram/email for critical conditions)                                                             |
| Historical Data Analysis    | ⏱️ Planned     | (e.g., Database storage, trend charts)                                                                     |
| User Profile Management     | ✅ Implemented  | Basic profile view and update functionality.                                                               |
| Deployment                  | 🔄 In Progress  | Dockerfile created, CI/CD to Google Cloud Run configured (experimental).                                   |
| Mobile App                  | ⏱️ Planned     | Kotlin-based mobile application.                                                                           |

## 🔧 Tech Stack

<div align="center">

### Hardware
<img src="https://img.shields.io/badge/PlatformIO-FF7F00?style=for-the-badge&logo=platformio&logoColor=white" alt="PlatformIO"/>
<img src="https://img.shields.io/badge/ESP32-E7352C?style=for-the-badge&logo=espressif&logoColor=white" alt="ESP32"/>
<img src="https://img.shields.io/badge/ESP--NOW-00796B?style=for-the-badge" alt="ESP-NOW"/>
<img src="https://img.shields.io/badge/DHT22-3C7D91?style=for-the-badge" alt="DHT22"/>
<img src="https://img.shields.io/badge/BH1750-F9A03C?style=for-the-badge" alt="BH1750"/>
<img src="https://img.shields.io/badge/Relay_Module-565656?style=for-the-badge" alt="Relay Module"/> <!-- Kept Relay Module as requested -->

### Backend & Communication
<img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python"/>
<img src="https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask"/>
<img src="https://img.shields.io/badge/MQTT-3C5280?style=for-the-badge&logo=eclipse-mosquitto&logoColor=white" alt="MQTT"/>
<img src="https://img.shields.io/badge/Firebase_Auth-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase Auth"/>

### Frontend (Web)
<img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5"/>
<img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3"/>
<img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript"/>
<img src="https://img.shields.io/badge/Jinja2-B41717?style=for-the-badge&logo=jinja&logoColor=white" alt="Jinja2"/>

### Frontend (Mobile - Planned)
<img src="https://img.shields.io/badge/Kotlin-7F52FF?style=for-the-badge&logo=kotlin&logoColor=white" alt="Kotlin"/>

### Deployment
<img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/>
<img src="https://img.shields.io/badge/Google_Cloud_Run-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white" alt="Google Cloud Run"/>

</div>

## 🏗️ Architecture Diagram

```mermaid
graph LR
    subgraph Hardware Nodes
        direction LR
        A[Sensors] --> B(Penyemaian Node);
        B -- ESP-NOW --> C(Peremajaan Node);
        C -- ESP-NOW --> D(Dewasa Node);
        D -- Fuzzy Logic --> J[Actuators];
    end

    subgraph Backend & Cloud
        direction TB
        D -- MQTT Sensor Data --> E{MQTT Broker};
        F[Flask Backend] -- Subscribes --> E;
        F -- Stores Data --> G[In-Memory State];
        I(Flask API) -- Reads Data --> G;
        I -- MQTT Cmd --> E;
        E -- MQTT Cmd --> D;
    end

    subgraph Frontend
        direction TB
        H[Web UI] -- API Request --> I;
        I -- API Response --> H;
        H -- Control Cmd --> I;
    end

    D -- Manual Override --> J;

    style Hardware Nodes fill:#f9f,stroke:#333,stroke-width:2px
    style Backend & Cloud fill:#ccf,stroke:#333,stroke-width:2px
    style Frontend fill:#cfc,stroke:#333,stroke-width:2px
```

## 📊 Project Status

### Core Functionality
- ✅ **Hardware:** Sensor reading (DHT22, BH1750), ESP-NOW communication chain, Fuzzy Logic controller (auto mode), MQTT publishing (sensor data + actuator state/mode), MQTT command subscription (manual override).
- ✅ **Backend:** Flask app structure, Firebase Authentication, MQTT data reception & storage (in-memory), Sensor Data API (`/api/sensor/data`), Control Command API (`/api/controls/set_state`).
- ✅ **Frontend:** Login page, Dashboard display (gauges, section data, status summary, control switches), Real-time updates via polling, Control switch interaction (sending manual commands), Profile page (basic).

### Key Areas for Future Development
- ⏱️ **Persistent Data Storage:** Replace in-memory storage with a database (e.g., PostgreSQL, InfluxDB) for historical data.
- ⏱️ **Hardware Control Refinements:** Implement logic for switching back from "Manual" to "Auto" mode. Use actual relays instead of LEDs.
- ⏱️ **Alerts & Notifications:** Implement backend logic and notification channels (e.g., email, Telegram) for critical conditions.
- ⏱️ **Historical Data Visualization:** Add charts/graphs to show trends over time.
- ⏱️ **Error Handling & Robustness:** Improve error handling across hardware, backend, and frontend.
- ⏱️ **Deployment:** Refine Docker/Cloud Run deployment, manage secrets securely.
- ⏱️ **Security:** Implement MQTT authentication, consider ESP-NOW encryption, add CSRF protection to Flask forms/APIs.
- ⏱️ **Mobile App:** Develop the planned Kotlin mobile application.

## 👨‍💻 Contributors

<div align="center">
<table>
  <tr>
    <td align="center">
      <a href="https://github.com/Tamatimtam">
        <img src="https://avatars.githubusercontent.com/Tamatimtam" width="120px" alt="Pratama"/>
        <br />
        <sub><b>Pratama Varian</b></sub>
      </a>
      <br />
      <sub>2207421040</sub>
      <br />
      <sub><span title="Project Leadership | Backend | Frontend | IoT | Cloud | API | Security">🚀 Project Lead & Full-Stack Developer</span></sub>
      <br />
      <a href="https://github.com/Tamatimtam" title="GitHub Profile"><img src="https://img.shields.io/badge/Tamatimtam-333?style=flat&logo=github" /></a>
    </td>
    <td align="center">
      <a href="https://github.com/reiarm">
        <img src="https://avatars.githubusercontent.com/reiarm" width="120px" alt="Reishafa"/>
        <br />
        <sub><b>Reishafa Armelia</b></sub>
      </a>
      <br />
      <sub>2207421037</sub>
      <br />
      <sub><span title="Mobile App Development | IoT Systems | Hardware Integration">📱 App Developer & IoT Engineer</span></sub>
      <br />
      <a href="https://github.com/reiarm" title="GitHub Profile"><img src="https://img.shields.io/badge/reiarm-333?style=flat&logo=github" /></a>
    </td>
    <td align="center">
      <a href="https://github.com/chrispurba007">
        <img src="https://avatars.githubusercontent.com/chrispurba007" width="120px" alt="Christian"/>
        <br />
        <sub><b>Christian Nataniel</b></sub>
      </a>
      <br />
      <sub>2207421043</sub>
      <br />
      <sub><span title="Frontend | User Testing | IoT Implementation">🖥️ Frontend & User Testing Specialist</span></sub>
      <br />
      <a href="https://github.com/chrispurba007" title="GitHub Profile"><img src="https://img.shields.io/badge/chrispurba007-333?style=flat&logo=github" /></a>
    </td>
    <td align="center">
      <a href="https://github.com/chacabilla">
        <img src="https://avatars.githubusercontent.com/chacabilla" width="120px" alt="Salsabilla"/>
        <br />
        <sub><b>Salsabilla Aulia</b></sub>
      </a>
      <br />
      <sub>2207421049</sub>
      <br />
      <sub><span title="UI/UX Design | Documentation | App Development | API Testing">🎨 Designer & QA Engineer</span></sub>
      <br />
      <a href="https://github.com/chacabilla" title="GitHub Profile"><img src="https://img.shields.io/badge/chacabilla-333?style=flat&logo=github" /></a>
    </td>
  </tr>
</table>
</div>


<!-- <link rel="stylesheet" href="static/css/skills.css"> -->

## 🚀 Quick Setup Guide

### Prerequisites
- Python 3.7+
- Firebase account with credentials

### Installation (Backend/Frontend)

```bash
# Clone the repository
git clone https://github.com/Tamatimtam/simpleLogin.git # Placeholder URL
cd simpleLogin

# Install dependencies
pip install -r requirements.txt

# Set up Firebase credentials (if they don't exist)
mkdir -p secrets
# Place your firebase-credentials.json file in the secrets/ directory

# Run the Flask application
python app2.py
```
<div align="left">

### Installation (Hardware)

1.  Install [PlatformIO Core CLI](https://docs.platformio.org/en/latest/core/installation.html) or use the [PlatformIO IDE extension for VS Code](https://platformio.org/platformio-ide).
2.  Navigate to the `Hardware/` directory: `cd Hardware`
3.  **Configure:** Update MAC addresses, WiFi credentials, and MQTT topics in `src/DeWasaNode_Master.cpp`, `src/PeremajaanNode.cpp`, and `src/PenyemaianNode.cpp` as needed. Ensure the ESP-NOW channel (default 6) matches your network or is updated consistently across all node files.
4.  **Build & Upload:** Use PlatformIO commands (e.g., `pio run -e dewasa_master -t upload`, `pio run -e peremajaan_node -t upload`, etc.). See `Hardware/new.md` for details.
5.  **Monitor:** Use `pio device monitor -b 115200` to view serial output.
</div>


## 📸 Project Gallery

<div align="center">
    <details open>
        <summary>📊 <b>View Screenshots</b></summary>
        <br>
        <img src="https://user-images.githubusercontent.com/12345/screenshot_placeholder_1.png" width="45%" alt="Dashboard Screenshot"/> <!-- Placeholder - Replace with actual image URL -->
        <img src="https://user-images.githubusercontent.com/12345/screenshot_placeholder_2.png" width="45%" alt="Controls Screenshot"/> <!-- Placeholder - Replace with actual image URL -->
        <!-- Add more screenshots or a GIF here -->
    </details>
</div>

<div align="left">

## 📄 License

Distributed under the MIT License. See [LICENSE](https://opensource.org/licenses/MIT) for more information.

---

<div align="center">
<p>🌱 <b>Growing Technology for Sustainable Farming</b> 🌱</p>
<p>Made with ❤️ by LokaTech PBL Team @ PNJ</p>
</div>

