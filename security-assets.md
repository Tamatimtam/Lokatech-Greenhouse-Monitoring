# Security Assets for LokaTech Greenhouse Monitoring System

## Introduction
This document outlines the key security-related assets within the LokaTech Greenhouse Monitoring system. Identifying and understanding these assets is crucial for implementing and maintaining a robust security posture.

## 1. Credentials and Secrets
These are highly sensitive assets; their compromise can lead to significant security breaches.

### 1.1. Firebase Service Account Credentials (Server-Side)
-   **Asset:** Service Account JSON Key File (`firebase-credentials.json`)
-   **Location(s):** `secrets/firebase-credentials.json` (referenced by `app2.py`, `Hardware/simulation/mqtt_to_firestore.py`, `blueprints/history/firestore.py`)
-   **Description:** Contains `project_id`, `private_key_id`, `private_key`, `client_email`, etc. Grants privileged server-side access to Firebase services (Auth, Firestore).
-   **Security Relevance:** **Highly sensitive.** Compromise allows full administrative access to the Firebase project.
-   **Existing Measures:** The JSON key file is stored in a `secrets/` directory, and Python scripts are configured to find and use this file.
-   **Recommendations/Considerations:** Use a robust secrets management solution (e.g., Google Secret Manager, HashiCorp Vault) in production. Ensure strict file permissions. Avoid committing to version control if possible, or use git-crypt/secrets scanning.

### 1.2. Flask Application Secret Key
-   **Asset:** Flask `app.secret_key`
-   **Location(s):** `app2.py` (generated using `secrets.token_hex(16)`)
-   **Description:** Used to sign session cookies and other security-related tokens.
-   **Security Relevance:** **Highly sensitive.** If compromised, attackers can forge session cookies.
-   **Existing Measures:** A new, random secret key is generated each time the Flask application starts.
-   **Recommendations/Considerations:** For production/scaled environments requiring persistent sessions across restarts, this key must be static, securely generated, and managed as a secret (e.g., via environment variable or secrets manager).

### 1.3. MQTT Broker Credentials
-   **Asset:** MQTT Username and Password
-   **Location(s):**
    -   `Hardware/simulation/mqtt_to_firestore.py` (MQTT_USER, MQTT_PASSWORD)
    -   `Hardware/simulation/mqtt_simulator.py` (MQTT_USER, MQTT_PASSWORD)
-   **Description:** Credentials for authenticating with the HiveMQ Cloud MQTT broker.
-   **Security Relevance:** Compromise allows unauthorized publishing/subscribing to MQTT topics.
-   **Existing Measures:** The username and password are currently written directly into the Python scripts. The connection to the MQTT broker is secured using TLS encryption (`client.tls_set()`).
-   **Recommendations/Considerations:** Manage as secrets (environment variables, secrets manager) in production, not hardcoded. Regularly review and rotate credentials. Utilize MQTT broker ACLs for fine-grained topic access control.

### 1.4. User Passwords
-   **Asset:** User account passwords.
-   **Location(s):** Managed by Firebase Authentication service. Not stored directly by the Flask application.
-   **Description:** Used by users to log into the system.
-   **Security Relevance:** Primary means of user identification.
-   **Existing Measures:** User passwords are not stored by our application directly. Firebase Authentication securely manages them by hashing passwords and verifying them during login. Firebase also provides features for password resets and requires password re-verification for account deletion.
-   **Recommendations/Considerations:** Educate users on strong password practices. Enforce MFA through Firebase if possible.

## 2. Configuration Data & Parameters
Misconfiguration of these assets can lead to vulnerabilities or operational issues.

### 2.1. Firebase Project Configuration (Client-Side)
-   **Asset:** Firebase Web SDK Configuration Object
-   **Location(s):** `static/js/firebase-init.js`
-   **Description:** Contains `apiKey`, `authDomain`, `projectId`, etc., for client-side Firebase SDK initialization.
-   **Security Relevance:** The `apiKey` is generally public but should be protected against abuse (e.g., quota exhaustion).
-   **Existing Measures:** This configuration is designed to be used by the client-side JavaScript in the user's web browser.
-   **Recommendations/Considerations:** Restrict API key usage in Firebase console (HTTP referrers, App Check).

### 2.2. Firebase API Key (Server-Side Usage for Password Verification)
-   **Asset:** Firebase Web API Key (distinct from Service Account private key)
-   **Location(s):** Extracted in `app2.py` from `static/js/firebase-init.js`; used in `blueprints/profile/routes.py`.
-   **Description:** A server-restricted API key for specific Firebase REST API calls (e.g., `signInWithPassword`).
-   **Security Relevance:** If compromised and not properly restricted in Google Cloud Console, could be abused for certain API calls.
-   **Existing Measures:** The server-side application currently reads this API key from the client-side `firebase-init.js` file.
-   **Recommendations/Considerations:** Create a separate, server-restricted API key in Google Cloud Console specifically for this backend purpose. Restrict its use by IP address if possible. Manage as a secret.

### 2.3. Allowed Email Domains for Registration
-   **Asset:** List of allowed email domains for new user registration.
-   **Location(s):** `blueprints/auth/routes.py` (`ALLOWED_DOMAINS`)
-   **Description:** Restricts account creation to users with specific email domains.
-   **Security Relevance:** Business rule enforcement; bypassing could allow unauthorized registration.
-   **Existing Measures:** The backend application checks the email domain against a predefined list during the user registration process.
-   **Recommendations/Considerations:** Keep the list updated as per organizational policy.

### 2.4. CORS Configuration
-   **Asset:** Cross-Origin Resource Sharing (CORS) settings.
-   **Location(s):** `app2.py` (`CORS(app)`)
-   **Description:** Controls which external domains can make requests to the backend API.
-   **Security Relevance:** Misconfiguration can expose the API to unintended cross-origin requests.
-   **Existing Measures:** The Flask application is currently configured to allow requests from any web domain (`CORS(app)`).
-   **Recommendations/Considerations:** In production, restrict origins to known frontend domains: `CORS(app, resources={r"/api/*": {"origins": "your_frontend_domain.com"}})`.

### 2.5. Socket.IO Configuration
-   **Asset:** Socket.IO server settings, including allowed origins.
-   **Location(s):** `app2.py` (`SocketIO(app, ..., cors_allowed_origins=[...])`)
-   **Description:** Configuration for real-time bidirectional communication.
-   **Security Relevance:** `cors_allowed_origins` is critical to prevent unauthorized WebSocket connections.
-   **Existing Measures:** The Socket.IO server is configured with a specific list of allowed web domains for `cors_allowed_origins`.
-   **Recommendations/Considerations:** Ensure `cors_allowed_origins` is strictly limited to trusted frontend domains. Implement authentication/authorization for Socket.IO events/namespaces.

### 2.6. ESP-NOW Network Parameters
-   **Asset:** MAC Addresses of sensor nodes, WiFi Channel.
-   **Location(s):** `Hardware/lib/Common/NodeConfig.h` (implicitly, via `MAC_ADDR_PENYEMAIAN`, `MAC_ADDR_DEWASA`, `WIFI_CHANNEL`)
-   **Description:** Configuration for the ESP-NOW wireless communication between gateway and sensor nodes.
-   **Security Relevance:** Knowledge of these could aid in local network sniffing or spoofing if the ESP-NOW network is physically accessible and unencrypted.
-   **Existing Measures:** Device MAC addresses and the WiFi channel are defined directly in the firmware code. ESP-NOW communication encryption is currently disabled (`false`) in the Gateway node's firmware.
-   **Recommendations/Considerations:** Enable ESP-NOW encryption if supported and feasible. Protect physical access to devices. Consider if these parameters need to be configurable rather than hardcoded for easier rotation.

### 2.7. Serial Communication Parameters (Gateway-Remaja)
-   **Asset:** Baud rate, serial pins.
-   **Location(s):** `GatewayNode.cpp` (`SERIAL_TO_REMAJA_MASTER.begin(...)`), `Hardware/lib/Common/NodeConfig.h` (`SERIAL_BAUD_RATE`)
-   **Description:** Configuration for wired serial communication between Gateway and Remaja Master.
-   **Security Relevance:** Physical access is required to tap this line. Ensuring data integrity over this link might be a concern.
-   **Existing Measures:** Parameters like baud rate and pin assignments for serial communication are set directly in the firmware code.
-   **Recommendations/Considerations:** If data integrity is critical, consider adding checksums or a simple message authentication code to the serial protocol.

### 2.8. MQTT Topic Names
-   **Asset:** Specific MQTT topic strings.
-   **Location(s):** `Hardware/simulation/mqtt_to_firestore.py`, `Hardware/simulation/mqtt_simulator.py` (`MQTT_SUBSCRIBE_TOPIC`, `MQTT_PUBLISH_TOPIC`)
-   **Description:** Designated channels for publishing/subscribing to data.
-   **Security Relevance:** Predictable or unsecured topics can be targeted.
-   **Existing Measures:** The MQTT topic names are defined directly within the Python scripts.
-   **Recommendations/Considerations:** Use non-trivial, potentially configurable topic names. Rely on MQTT broker ACLs for securing access to topics.

### 2.9. `Dockerfile` Configuration
-   **Asset:** Container build definition.
-   **Location(s):** `Dockerfile`
-   **Description:** Instructions to build the application container image, including base image, exposed ports, and run commands.
-   **Security Relevance:** The security of the base image, unnecessary exposed ports, or insecure configurations can introduce vulnerabilities into the deployed application.
-   **Existing Measures:** The `Dockerfile` uses `python:3.9-slim` as its base image, exposes port `8080` for the application, and runs the application using `gunicorn` with `eventlet` workers.
-   **Recommendations/Considerations:** Regularly update the base image. Scan images for vulnerabilities. Run containers with least privilege. Ensure only necessary ports are exposed.

## 3. Identity, Session, and Access Control Mechanisms

### 3.1. Firebase ID Tokens (JWT)
-   **Asset:** JSON Web Tokens issued by Firebase Authentication.
-   **Location(s):** Generated client-side, verified server-side (`/auth/login`).
-   **Description:** Short-lived tokens proving user identity to the backend.
-   **Security Relevance:** Interception allows impersonation until expiry.
-   **Existing Measures:** The backend verifies these tokens using the Firebase Admin SDK. Tokens have a limited validity period, and HTTPS is used to protect them during transmission.
-   **Recommendations/Considerations:** Ensure strict HTTPS enforcement.

### 3.2. Flask User Session Data & Management
-   **Asset:** Server-side session data and management logic.
-   **Location(s):** Managed by Flask, signed by `app.secret_key`.
-   **Description:** Stores authenticated user's info (`email`, `name`, `picture`).
-   **Security Relevance:** Weak session management or `app.secret_key` compromise can lead to session hijacking.
-   **Existing Measures:** User sessions are cryptographically signed using the `app.secret_key`. Access to protected pages is controlled by the `@isloggedin` decorator, and sessions are cleared when a user logs out.
-   **Recommendations/Considerations:** Ensure `app.secret_key` is strong and secure. Configure secure cookie attributes (HttpOnly, Secure, SameSite) in production.

### 3.3. `@isloggedin` Decorator
-   **Asset:** Access control decorator for Flask routes.
-   **Location(s):** `blueprints/decorators.py`, used across various route files.
-   **Description:** Ensures only authenticated users can access protected endpoints.
-   **Security Relevance:** Central mechanism for protecting authenticated routes.
-   **Existing Measures:** This decorator checks if user information exists in the current session (`session['user']`) to determine if a user is logged in.
-   **Recommendations/Considerations:** Ensure it's applied consistently to all sensitive routes.

### 3.4. Input Validation Logic
-   **Asset:** Code validating user-supplied input.
-   **Location(s):** Client-side JS (UX), Server-side Python route handlers (security).
-   **Description:** Checks on data like display names, emails, passwords.
-   **Security Relevance:** Lack of server-side validation can lead to XSS, data integrity issues, etc.
-   **Existing Measures:** Server-side validation includes checks for email format and allowed domains during registration, ensures a password is provided for account deletion, and validates display names.
-   **Recommendations/Considerations:** Always prioritize robust server-side validation. Sanitize outputs to prevent XSS. Use parameterized queries if interacting with SQL DBs (not current setup).

## 4. Application Code and Logic

### 4.1. Backend API Endpoints
-   **Asset:** Flask application routes.
-   **Location(s):** Defined in `blueprints/*/routes.py`.
-   **Description:** Server-side logic handling client requests.
-   **Security Relevance:** Vulnerabilities in endpoint logic (e.g., insecure direct object references, business logic flaws) can lead to unauthorized access or actions.
-   **Existing Measures:** Access to many API endpoints is protected by the `@isloggedin` decorator, and some endpoints perform input validation.
-   **Recommendations/Considerations:** Conduct regular code reviews. Implement comprehensive error handling. Apply security best practices for web development.

### 4.2. Frontend JavaScript Logic
-   **Asset:** Client-side JavaScript code.
-   **Location(s):** `static/js/` directory.
-   **Description:** Handles UI, client-side validation, Firebase interactions.
-   **Security Relevance:** Vulnerabilities (e.g., XSS if dynamically rendering untrusted data, insecure handling of tokens) can compromise the user's session or data.
-   **Existing Measures:** The client-side JavaScript handles Firebase authentication and sends the user's ID token to the backend for verification.
-   **Recommendations/Considerations:** Sanitize all dynamic content. Store tokens securely (e.g., in memory; avoid localStorage for sensitive tokens if XSS is a high risk).

### 4.3. MQTT Data Ingestion Script (`mqtt_to_firestore.py`)
-   **Asset:** The script itself and its operational integrity.
-   **Location(s):** `Hardware/simulation/mqtt_to_firestore.py`
-   **Description:** Listens to MQTT, processes data, writes to Firestore.
-   **Security Relevance:** Compromise could stop data collection, inject false data, or leak credentials.
-   **Existing Measures:** The script uses MQTTS (MQTT over TLS) for secure communication with the broker and assumes it runs in a secure server environment.
-   **Recommendations/Considerations:** Secure the execution environment. Manage embedded credentials securely. Implement robust error handling and monitoring.

### 4.4. Gateway Node Firmware (`GatewayNode.cpp`)
-   **Asset:** Application logic running on the ESP32 Gateway.
-   **Location(s):** `Hardware/src/GatewayNode.cpp`
-   **Description:** Manages ESP-NOW communication, data aggregation from sensor nodes, serial communication with Remaja Master, and command handling.
-   **Security Relevance:** Compromise of this firmware could lead to false data reporting, incorrect actuator commands, or disruption of the local sensor network.
-   **Existing Measures:** The firmware code dictates the specific operational logic of the ESP32 Gateway device.
-   **Recommendations/Considerations:** Secure firmware update mechanism if remote updates are planned. Validate incoming data/commands. Physical security of the device.

### 4.5. Sensor Node Firmware (Penyemaian, Dewasa - Implied)
-   **Asset:** Application logic running on ESP32 sensor nodes.
-   **Location(s):** Not provided, but implied by `GatewayNode.cpp`'s interaction.
-   **Description:** Collects sensor data and transmits it via ESP-NOW. May receive commands.
-   **Security Relevance:** Compromise could lead to false sensor readings.
-   **Existing Measures:** The firmware on these nodes is responsible for sensor data collection and ESP-NOW transmission, as suggested by the Gateway's interaction logic.
-   **Recommendations/Considerations:** Similar to Gateway Node Firmware: secure updates, input validation, physical security.

## 5. Data Stores and Logs

### 5.1. User Profile Data
-   **Asset:** User's display name, email.
-   **Location(s):** Firebase Authentication, Flask session.
-   **Description:** Personally Identifiable Information (PII).
-   **Security Relevance:** Exposure can lead to privacy violations.
-   **Existing Measures:** Access to user profile data is managed by Firebase Authentication and the application's own authentication mechanisms.
-   **Recommendations/Considerations:** Adhere to data privacy regulations (e.g., GDPR, CCPA) if applicable. Minimize PII storage.

### 5.2. Greenhouse Sensor Data
-   **Asset:** Historical and real-time sensor readings.
-   **Location(s):** Firestore (`greenhouse_data`, `lokatech_db`), MQTT messages, API responses.
-   **Description:** Operational data from the greenhouse.
-   **Security Relevance:** Integrity and availability are key. Tampering could lead to incorrect actions.
-   **Existing Measures:** The backend accesses Firestore using the Admin SDK, which bypasses Firestore security rules. Data is protected during transit using MQTTS and HTTPS.
-   **Recommendations/Considerations:** Implement robust Firestore Security Rules if any client-side or less trusted components access Firestore directly. Regularly back up data.

### 5.3. Application Logs
-   **Asset:** Logs generated by the application.
-   **Location(s):** `app.log`, potentially Firestore (`blueprints.logs.firestore_logger`).
-   **Description:** Operational info, errors, potentially sensitive data (emails, IPs).
-   **Security Relevance:** Can reveal internal workings or sensitive info if not secured.
-   **Existing Measures:** The application currently performs basic logging to a file (`app.log`) and potentially to Firestore.
-   **Recommendations/Considerations:** Restrict access to log files/stores. Sanitize logs to remove sensitive PII before storage where possible. Implement log rotation and retention policies.

## 6. Communication Channels & Protocols

### 6.1. HTTPS Channels
-   **Asset:** Secure channels between user browsers and Flask backend.
-   **Description:** TLS/SSL encryption for HTTP traffic.
-   **Security Relevance:** Protects data in transit from eavesdropping/tampering.
-   **Existing Measures:** It is assumed that in a production environment, a web server or load balancer will handle HTTPS termination, ensuring encrypted communication.
-   **Recommendations/Considerations:** Enforce HTTPS strictly (e.g., HSTS). Use strong TLS configurations.

### 6.2. MQTTS Channels
-   **Asset:** Secure channels between MQTT clients and broker.
-   **Description:** TLS/SSL encryption for MQTT traffic.
-   **Security Relevance:** Protects sensor data and MQTT credentials in transit.
-   **Existing Measures:** MQTT scripts use `client.tls_set()` to establish a secure, encrypted connection to the MQTT broker.
-   **Recommendations/Considerations:** Ensure correct CA certificates and broker TLS configuration.

### 6.3. Socket.IO Channels
-   **Asset:** Secure real-time communication channels.
-   **Description:** Uses WebSocket, typically over TLS (WSS).
-   **Security Relevance:** Protects real-time data in transit.
-   **Existing Measures:** Socket.IO communication relies on the underlying HTTPS to enable WSS (WebSocket Secure). Specific origins are permitted via `cors_allowed_origins`.
-   **Recommendations/Considerations:** Ensure WSS is used in production. Authenticate and authorize users for Socket.IO connections and events.

### 6.4. ESP-NOW Communication Protocol
-   **Asset:** Wireless communication between gateway and sensor nodes.
-   **Location(s):** Logic in `GatewayNode.cpp`.
-   **Description:** Custom ESP-NOW based communication.
-   **Security Relevance:** Currently configured without encryption (`penyemaianPeer.encrypt = false`). Susceptible to sniffing/injection if an attacker is within radio range.
-   **Existing Measures:** Communication currently relies on matching MAC addresses for peer identification, and encryption is disabled.
-   **Recommendations/Considerations:** **Strongly recommend enabling ESP-NOW encryption.** This requires exchanging keys between peers.

### 6.5. Serial Communication Protocol (Gateway-Remaja)
-   **Asset:** Wired communication protocol.
-   **Location(s):** Logic in `GatewayNode.cpp`.
-   **Description:** JSON-based messages over serial.
-   **Security Relevance:** Requires physical access to intercept. Data integrity might be a concern.
-   **Existing Measures:** A specific JSON-based message format is used for communication over the serial line.
-   **Recommendations/Considerations:** If high integrity is needed, add checksums or simple MACs to messages.

### 6.6. API Data Structures
-   **Asset:** JSON payloads for MQTT/HTTP, `ActuatorCommand` struct.
-   **Description:** Defined formats for data exchange.
-   **Security Relevance:** Malformed or unexpected data structures can cause errors or be exploited if not handled carefully by parsers.
-   **Existing Measures:** The structure of data exchanged via APIs (MQTT, HTTP) is defined by the application's code.
-   **Recommendations/Considerations:** Use robust parsing libraries. Validate data against expected schemas.

## 7. Development & Deployment Lifecycle Assets

### 7.1. Source Code Repository & Version Control
-   **Asset:** Git repository.
-   **Security Relevance:** Unauthorized access can lead to IP theft, malicious code injection, exposure of committed secrets.
-   **Existing Measures:** Security relies on the features and measures provided by the Git hosting platform (e.g., GitHub, GitLab).
-   **Recommendations/Considerations:** Enforce MFA for contributors. Use branch protection rules. Regularly scan for secrets accidentally committed.

### 7.2. Dependency Management & Third-party Libraries
-   **Asset:** External libraries (`requirements.txt`).
-   **Security Relevance:** Vulnerabilities in dependencies can be inherited.
-   **Existing Measures:** External Python libraries are listed in the `requirements.txt` file.
-   **Recommendations/Considerations:** Regularly scan dependencies (Snyk, Dependabot). Keep packages updated. Only include necessary dependencies.

## 8. External Dependencies & Infrastructure (User Investigation Required)
This section lists assets and configurations typically managed outside the application codebase, requiring your direct attention for a secure production environment.

### 8.1. Hosting Environment Security
-   **Examples:** Google Cloud Run, VMs, Kubernetes.
-   **Security Relevance:** The security of the underlying infrastructure is paramount (OS hardening, patching, network configuration, IAM roles).
-   **Recommendations/Considerations:** Follow security best practices for your chosen platform. Apply principle of least privilege for service accounts/roles. Configure network firewalls.

### 8.2. Container Runtime Security
-   **Examples:** Docker runtime on a VM, Google Cloud Run's container environment.
-   **Security Relevance:** Secure configuration of the container runtime environment.
-   **Recommendations/Considerations:** If managing the runtime, keep it updated. Use security-enhancing options (e.g., AppArmor, Seccomp). For PaaS like Cloud Run, understand its shared responsibility model.

### 8.3. Firestore Database Security Rules
-   **Location(s):** Firebase Console.
-   **Security Relevance:** **Crucial** for protecting data at rest in Firestore, especially if any client-side applications or less-trusted server components interact directly with Firestore (not just via Admin SDK).
-   **Recommendations/Considerations:** Define granular rules that enforce the principle of least privilege. Test rules thoroughly. The current backend uses Admin SDK, which bypasses these rules; ensure this is the intended access pattern for all Firestore interactions or implement rules accordingly.

### 8.4. MQTT Broker Security (HiveMQ Cloud or other)
-   **Location(s):** MQTT Broker's management console/configuration.
-   **Security Relevance:** Proper configuration of authentication, authorization (ACLs), quotas, and TLS.
-   **Recommendations/Considerations:** Enforce strong authentication for all clients. Use ACLs to restrict client publish/subscribe permissions to only necessary topics. Monitor usage and logs. Keep broker software updated if self-hosting.

### 8.5. Production Secrets Management
-   **Examples:** Google Secret Manager, HashiCorp Vault, environment variables injected by PaaS.
-   **Security Relevance:** Secure storage, access control, and rotation of all secrets (API keys, service account files, `app.secret_key`, database credentials).
-   **Recommendations/Considerations:** **Do not hardcode secrets or commit them to version control in production.** Integrate a dedicated secrets management solution.

### 8.6. DNS Security
-   **Relevance:** If using custom domains.
-   **Recommendations/Considerations:** Secure DNS records. Consider DNSSEC. Protect against domain hijacking.

### 8.7. Web Application Firewall (WAF)
-   **Relevance:** For public-facing web applications.
-   **Recommendations/Considerations:** Consider deploying a WAF (e.g., Google Cloud Armor, Cloudflare) to protect against common web exploits (SQLi, XSS, etc.) and DDoS attacks.

### 8.8. Backup and Recovery Strategy
-   **Relevance:** For data in Firestore and application logs.
-   **Recommendations/Considerations:** Define and test a backup and recovery plan for critical data to ensure business continuity in case of data loss or corruption.

### 8.9. Monitoring and Alerting
-   **Relevance:** For application performance, errors, and security events.
-   **Recommendations/Considerations:** Implement comprehensive monitoring of application health, resource usage, and security logs. Set up alerts for suspicious activities or critical errors.
