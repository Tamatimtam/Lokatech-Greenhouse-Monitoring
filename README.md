# 🌱 LokaTech Greenhouse Monitoring & Automation System

> Smart IoT monitoring and automation for hydroponic greenhouses at Lokatani, leveraging ESP32, ESP-NOW, MQTT, Fuzzy Logic, and Flask.

[![Project Status: Active](https://img.shields.io/badge/Project_Status-Active-green?style=for-the-badge)](https://github.com/Tamatimtam/simpleLogin)
[![PBL Project](https://img.shields.io/badge/PBL-6th_Semester-blue?style=for-the-badge)](https://github.com/Tamatimtam/simpleLogin)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

<div align="center">

<img src="/static/images/lokatech-logo.png" width="70%" alt="LokaTech Greenhouse System">

</div>

## 🌟 Overview

This smart IoT-based system provides automated monitoring and control for environmental conditions (temperature, humidity, light) in hydroponic greenhouses at Lokatani. It aims to improve efficiency, reduce manual intervention, and enable data-driven cultivation practices. Built as a 6th semester Project-Based Learning (PBL) and Special Topic Project.

## 🔍 Why It Matters

| Current Challenges | Our Solution |
|---|---|
| ❌ Manual fan & exhaust operation | ✅ Automated climate control via Fuzzy Logic |
| ❌ Inefficient response to changes | ✅ Real-time monitoring & status dashboard |
| ❌ Requires constant human attention | ✅ Remote access and manual override capability |
| ❌ Prone to human error | ✅ Data-driven insights (status summary) |
| ❌ Limited environmental data | ✅ Comprehensive data aggregation from multiple zones |

## ✨ Features

| Feature                     | Status          | Description                                                                                                                     |
| :-------------------------- | :-------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| Environmental Monitoring    | ✅ Implemented  | Temperature (DHT22), Humidity (DHT22), Light Intensity (BH1750) across 3 sections (Penyemaian, Peremajaan, Dewasa).                |
| IoT Data Transmission       | ✅ Implemented  | ESP-NOW chain (`Penyemaian -> Peremajaan -> Dewasa`) + MQTT from Dewasa node (Master) to broker.                                  |
| User Authentication         | ✅ Implemented  | Secure login via Firebase Authentication (Email/Password).                                                                        |
| Data Storage                | ✅ Implemented  | Real-time data stored in backend memory (via Python `SensorDataManager`). No persistent historical storage yet.               |
| Dashboard & Visualization | ✅ Implemented  | Web dashboard (Flask/Jinja2) showing real-time gauges (averages), section data, status summary, actuator state/mode.           |
| Equipment Control           | ✅ Implemented  | **Auto Mode:** Fuzzy logic on Dewasa node controls simulated Fan/Light LEDs. **Manual Mode:** Override via Web UI -> API -> MQTT command. |
| User Profile Management     | ✅ Implemented  | View/update display name, change password (with validation). Profile picture preview (local storage only).                         |
| Deployment                  | ✅ Implemented  | Basic Dockerfile for containerization.                                                                                          |
| Alerts & Notifications    | ⏱️ Planned     | (e.g., Trigger alerts for critical conditions)                                                                                |
| Historical Data Analysis    | ⏱️ Planned     | (e.g., Implement database storage, add trend charts)                                                                            |
| Mobile App                  | ⏱️ Planned     | Kotlin-based mobile application.                                                                                                |
| CI/CD                       | ⏱️ Planned     | Automation for deployment (e.g., to Google Cloud Run).                                                                        |

## 🔧 Tech Stack

<div align="center">

### Hardware
<img src="https://img.shields.io/badge/PlatformIO-FF7F00?style=for-the-badge&logo=platformio&logoColor=white" alt="PlatformIO"/>
<img src="https://img.shields.io/badge/ESP32-E7352C?style=for-the-badge&logo=espressif&logoColor=white" alt="ESP32"/>
<img src="https://img.shields.io/badge/ESP--NOW-00796B?style=for-the-badge" alt="ESP-NOW"/>
<img src="https://img.shields.io/badge/DHT22-3C7D91?style=for-the-badge" alt="DHT22"/>
<img src="https://img.shields.io/badge/BH1750-F9A03C?style=for-the-badge" alt="BH1750"/>
<img src="https://img.shields.io/badge/eFLL-4CAF50?style=for-the-badge" alt="eFLL Fuzzy Logic"/>
<img src="https://img.shields.io/badge/LED-FF5722?style=for-the-badge" alt="LED Actuator Simulation"/>

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
<!-- <img src="https://img.shields.io/badge/Google_Cloud_Run-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white" alt="Google Cloud Run"/> --> <!-- Keep commented if deployment not finalized -->

</div>

## 🏗️ Architecture Diagram

```mermaid
graph LR
    subgraph Hardware Nodes
        direction LR
        A[Sensors DHT22, BH1750] --> B(Penyemaian Node);
        B -- ESP-NOW --> C(Peremajaan Node);
        C -- ESP-NOW --> D(Dewasa Node);
        D -- Auto Mode --> E[Fuzzy Logic];
        E -- Control --> J[Actuators (LEDs)];
    end

    subgraph Backend & Cloud
        direction TB
        D -- MQTT Sensor & Actuator Data --> K{MQTT Broker};
        F[Flask Backend] -- Subscribes --> K;
        F -- Stores Data --> G[In-Memory State];
        I(Flask API) -- Reads Data --> G;
        I -- Manual Control Cmd --> K;
        K -- Manual Control Cmd --> D;
    end

    subgraph Frontend
        direction TB
        H[Web UI] -- API Request (Data) --> I;
        I -- API Response (Data) --> H;
        H -- API Request (Control) --> I;
    end

    D -- Manual Mode --> J;

    style Hardware Nodes fill:#f9f,stroke:#333,stroke-width:2px
    style Backend & Cloud fill:#ccf,stroke:#333,stroke-width:2px
    style Frontend fill:#cfc,stroke:#333,stroke-width:2px
```

## 📊 Project Status

### Core Functionality (Implemented)
- ✅ **Hardware:** Sensor reading (DHT22, BH1750), ESP-NOW communication chain (`Penyemaian -> Peremajaan -> Dewasa`), Fuzzy Logic controller ('auto' mode for LEDs), MQTT publishing (sensor data + actuator state/mode), MQTT command subscription ('manual' override).
- ✅ **Backend:** Flask app structure with blueprints, Firebase Authentication (Email/Password), MQTT data reception & storage (in-memory `SensorDataManager`), Sensor Data API (`/api/sensor/data`), Control Command API (`/controls/api/set_state`), Profile Update/Password Change API.
- ✅ **Frontend:** Login page, Dashboard display (real-time gauges, section data, status summary, control switches with mode indicators), Control switch interaction (sending manual commands), Profile page (view/update name, change password, local picture preview).

### Key Areas for Future Development
- ⏱️ **Persistent Data Storage:** Replace in-memory storage with a database (e.g., PostgreSQL, InfluxDB) for historical data and trends.
- ⏱️ **Hardware Control Refinements:** Implement logic for switching back from "Manual" to "Auto" mode. Use actual relays for real equipment control.
- ⏱️ **Alerts & Notifications:** Implement backend logic and notification channels (e.g., email, Telegram) for critical environmental conditions or system errors.
- ⏱️ **Historical Data Visualization:** Add charts/graphs to the frontend to display sensor trends over time.
- ⏱️ **Error Handling & Robustness:** Enhance error handling and recovery mechanisms across hardware, backend, and frontend.
- ⏱️ **Deployment:** Refine Docker configuration, implement CI/CD pipeline (e.g., to Google Cloud Run), manage secrets securely.
- ⏱️ **Security:** Implement MQTT authentication/TLS, consider ESP-NOW encryption, add CSRF protection to Flask APIs/forms.
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

## 🚀 Quick Setup Guide

### Prerequisites
- Python 3.9+ (check `Dockerfile`)
- Firebase account and project
- Firebase Admin SDK credentials file (`firebase-credentials.json`)
- PlatformIO Core CLI or VS Code Extension (for hardware)

### Installation (Backend/Frontend)

```bash
# Clone the repository
git clone https://github.com/Tamatimtam/simpleLogin.git
cd simpleLogin

# Create secrets directory (if it doesn't exist)
mkdir -p secrets

# Place your Firebase Admin SDK credentials file here:
# ./secrets/firebase-credentials.json

# Install Python dependencies
pip install -r requirements.txt

# Run the Flask application
# (Ensure FIREBASE_API_KEY is correctly extracted or configured if needed by profile password reset)
python app2.py
```
The application will typically run on `http://0.0.0.0:4443`.

<div align="left">

### Installation (Hardware)

1.  **Navigate** to the `Hardware/` directory: `cd Hardware`
2.  **Detailed Instructions:** Refer to the `Hardware/new.md` file for comprehensive steps on:
    *   Finding ESP32 MAC Addresses.
    *   Configuring MAC addresses in `DeWasaNode_Master.cpp`, `PeremajaanNode.cpp`, and `PenyemaianNode.cpp`.
    *   Verifying and setting the ESP-NOW WiFi channel (default is 6).
    *   Configuring WiFi/MQTT settings in `DeWasaNode_Master.cpp`.
    *   Building and uploading firmware using PlatformIO (e.g., `pio run -e dewasa_master -t upload`).
    *   Monitoring serial output (`pio device monitor -b 115200`).
3.  **Summary:** Ensure PlatformIO is installed, update node configurations (MACs, WiFi, MQTT, Channel) in the respective `.cpp` files, then use PlatformIO to build and upload to each ESP32 board.

</div>

## 📸 Project Gallery

<div align="center">
    <details>
        <summary>📊 <b>View Screenshots (PLACEHOLDERS - Replace with actual images)</b></summary>
        <br>
        <!-- TODO: Replace these placeholder URLs with actual screenshot URLs -->
        <img src="https://user-images.githubusercontent.com/12345/screenshot_placeholder_1.png" width="45%" alt="Dashboard Screenshot"/>
        <img src="https://user-images.githubusercontent.com/12345/screenshot_placeholder_2.png" width="45%" alt="Controls Screenshot"/>
        <!-- Add more screenshots or a GIF here -->
    </details>
</div>

<div align="left">

## 📄 License

Distributed under the MIT License. [MIT License](https://opensource.org/licenses/MIT) for more information.

---

<div align="center">
<p>🌱 <b>Growing Technology for Sustainable Farming</b> 🌱</p>
<p>Made with ❤️ by LokaTech PBL Team @ PNJ</p>
</div>