# 📊 System Logs Feature Documentation

## 🎯 1. Overview

The System Logs feature provides a centralized mechanism for recording and viewing important system-level events within the Lokatech Greenhouse Monitoring application. These logs are stored in Firestore and can be accessed via a dedicated "System Logs" tab in the web interface.

### 🏆 Primary Goals
- 📝 **Capture Events**: Record critical events, errors, automated actions, and user-initiated control changes
- 🖥️ **User Interface**: Provide a user-friendly interface for viewing, filtering, and exporting logs
- 🔍 **Diagnostics**: Aid in diagnosing issues, understanding system performance, and providing audit trails

---

<details>
<summary><strong>🔧 2. Backend Implementation</strong></summary>

> **💡 Note**: The backend handles data storage, API endpoints, and log generation logic.

<details>
<summary><strong>🗄️ 2.1. Firestore Logger (blueprints/logs/firestore_logger.py)</strong></summary>

This module is the **core logging system** on the backend.

#### 📋 Key Components

##### 🏷️ **LogType Enum** - Event Categories
```python
class LogType(Enum):
    # Sensor Events
    SENSOR_ERROR = "SENSOR_ERROR"           # 🚨 Sensor malfunction
    SENSOR_OPERATIONAL = "SENSOR_OPERATIONAL" # ✅ Sensor recovered
    
    # Connection Events  
    CONNECTION_LOST = "CONNECTION_LOST"         # 🔌 Lost connection
    CONNECTION_RESTORED = "CONNECTION_RESTORED" # 🔗 Connection restored
    
    # Automated Actions
    FAN_ON_AUTO = "FAN_ON_AUTO"           # 🌀 Fan turned on automatically
    FAN_OFF_AUTO = "FAN_OFF_AUTO"         # 🛑 Fan turned off automatically
    LIGHT_ON_AUTO = "LIGHT_ON_AUTO"       # 💡 Light turned on automatically  
    LIGHT_OFF_AUTO = "LIGHT_OFF_AUTO"     # 🌙 Light turned off automatically
    
    # Node Status
    NODE_OFFLINE = "NODE_OFFLINE"         # 📴 Satellite node offline
    NODE_ONLINE = "NODE_ONLINE"           # 📶 Satellite node online
    
    # User Actions (Note: Device control actions like USER_FAN_ON, etc., are now primarily logged to 'user_logs' via log_user_action. These enums might be used if other system parts log user interactions directly to system_logs.)
    USER_FAN_ON = "USER_FAN_ON"           # 👤🌀 User turned fan on
    USER_FAN_OFF = "USER_FAN_OFF"         # 👤🛑 User turned fan off
    USER_LIGHT_ON = "USER_LIGHT_ON"       # 👤💡 User turned light on
    USER_LIGHT_OFF = "USER_LIGHT_OFF"     # 👤🌙 User turned light off
    USER_CONTROL_ACTION = "USER_CONTROL_ACTION" # 👤⚙️ Generic user action
```

##### 📊 **LogLevel Enum** - Severity Levels
| Level | Icon | Description | Use Case |
|-------|------|-------------|----------|
| `INFO` | ℹ️ | Informational | Routine operations |
| `WARNING` | ⚠️ | Potential issues | Non-critical problems |
| `ERROR` | ❌ | System errors | Failed operations |
| `CRITICAL` | 🆘 | Severe errors | System-impacting issues |

#### 🔑 **Core Functions**

##### 📝 `log_event()` - Main Logging Function
```python
def log_event(
    log_type: LogType,     # 🏷️ What happened
    level: LogLevel,       # 📊 How severe
    node: str = None,      # 🏠 Which node affected
    sensor_type: str = None, # 🌡️ Which sensor (if applicable)
    details: str = None,   # 📄 Detailed description
    source: str = "system", # 📍 Where it came from
    username: str = None   # 👤 Who did it (for user actions not covered by user_logs)
) -> bool
```

##### 🎯 **Convenience Functions** - Easy-to-use wrappers
```python
# 🚨 Sensor Issues
log_sensor_error(node, sensor_type, details, source)
log_sensor_operational(node, sensor_type, details, source)

# 🔌 Connection Issues  
log_connection_lost(details, source, node)
log_connection_restored(details, source, node)

# 📶 Node Status
log_node_offline(node_name, details, level, source)
log_node_online(node_name, details, source)

# 👤 User Actions (Note: This function now logs to the 'user_logs' collection, not 'system_logs')
log_user_action(username, action_description, device, node_affected, source) # Now includes ip_address
```

##### 📊 `get_system_logs()` - Retrieve Logs
**Supports filtering by:**
- 📅 `days`: Number of past days
- 🏷️ `log_type_filter`: Specific event type
- 📊 `level_filter`: Specific severity level  
- 🏠 `node_filter`: Specific node/component
- 🔢 `limit`: Maximum results (default: 100)

</details>

<details>
<summary><strong>🌐 2.2. API Endpoints (blueprints/logs/routes.py)</strong></summary>

#### 📡 **GET /logs/system-logs**
> 🔒 **Authentication Required** (`@isloggedin`)

**Purpose**: Fetch system logs for the frontend  
**Query Parameters**: 
- `days`, `type`, `level`, `node`, `limit`  
**Response**: JSON array of log objects

#### 📥 **GET /logs/export-system-logs-csv**
> 🔒 **Authentication Required** (`@isloggedin`)

**Purpose**: Export system logs to CSV file  
**Query Parameters**: 
- `days`, `type`, `level`, `node`, `limit` (default: 5000 for export)  
**Response**: CSV file download (`system_logs_YYYYMMDD_HHMMSS.csv`)

**CSV Columns**: 
| Column | Description |
|--------|-------------|
| Timestamp (WIB) | 🕐 When it happened |
| Level | 📊 Severity level |
| Type | 🏷️ Event category |
| Node | 🏠 Affected component |
| Sensor Type | 🌡️ Sensor involved |
| Source | 📍 Origin module |
| Details | 📄 Full description |
<!-- Removed "Username" column as it's no longer in the system_logs CSV export -->

</details>

<details>
<summary><strong>🗄️ 2.3. Firestore Collection Structure</strong></summary>

#### 📊 Collection: `system_logs`
Each document contains:

```json
{
  "timestamp": "2023-10-27T14:30:45.123Z",     // 🕐 UTC timestamp
  "timestamp_wib": "2023-10-27T21:30:45.123",  // 🌍 WIB timestamp
  "type": "NODE_OFFLINE",                       // 🏷️ Event type
  "level": "CRITICAL",                          // 📊 Severity
  "node": "dewasa",                            // 🏠 Affected node
  "sensor_type": "temp",                       // 🌡️ Sensor (optional)
  "details": "Node dewasa is sending null...", // 📄 Description
  "source": "flask_sensor_manager",           // 📍 Origin
  "username": "user@example.com"              // 👤 User (optional, though device control actions are now in user_logs)
}
```

</details>

</details>

---

<details>
<summary><strong>🎨 3. Frontend Implementation</strong></summary>

> **💡 Note**: The frontend provides the user interface for viewing, filtering, and exporting logs.

<details>
<summary><strong>⚡ 3.1. System Logs JavaScript (static/js/logs-system.js)</strong></summary>

This script manages the **"System Logs"** tab functionality.

#### 🔄 **Key Functions**

##### 📊 `loadSystemLogs(filters, silentRefresh)`
- 🌐 Fetches logs from `/logs/system-logs`
- 🔇 `silentRefresh`: Hides loading indicators (for auto-refresh)
- ⚠️ Handles errors with retry mechanism

##### 🖼️ `displaySystemLogsUI()`
- 🏗️ Generates HTML for filter controls and table
- 🎛️ Creates dropdowns for type, level, node filtering
- 📥 Adds "Export to CSV" button
- 🎧 Attaches event listeners

##### 📋 `populateTableBody()`
- 🧹 Clears and re-populates log table
- ⏰ **Time Grouping**: Groups logs by 10-minute intervals
- 🎨 Formats each log entry with icons and colors

##### 🔧 `createLogRow(log)`
- 🏗️ Creates HTML table row for each log
- 🎨 Applies color-coded level badges
- 🖼️ Uses `getLogTypeIcon()` for visual indicators
- 👤 Shows username for user actions
- 📄 Formats details with JSON pretty-printing

#### 🎨 **Visual Features**

##### 🖼️ **Icon Mapping** (`getLogTypeIcon()`)
| Log Type | Icon | Color | Description |
|----------|------|-------|-------------|
| Sensor Error | 🚨 `fa-exclamation-triangle` | Gray | Sensor malfunction |
| Sensor Operational | ✅ `fa-check-circle` | Green | Sensor recovered |
| Connection Lost | 🔌 `fa-plug` | Orange | Connection issues |
| Node Offline | 📴 `fa-server` | Red | Node down |
| Node Online | 📶 `fa-server` | Green | Node restored |
| User Fan On | 👤🌀 `fa-fan` | Green | User turned fan on |
| User Light Off | 👤🌙 `fa-lightbulb` | Gray | User turned light off |

##### 🎯 **Level Badges**
- ℹ️ **INFO**: Blue background
- ⚠️ **WARNING**: Orange background  
- ❌ **ERROR**: Red background
- 🆘 **CRITICAL**: Dark red background + **bold text**

##### ✨ **Special Effects**
- 💥 **Pulsing Animation**: CRITICAL level logs pulse for attention
- 🌈 **Row Highlighting**: CRITICAL logs get light red background
- ⏰ **Time Groups**: 10-minute interval headers for easy scanning

#### 🔄 **Auto-Refresh**
- ⏱️ Refreshes every **30 seconds** when tab is active
- 🔇 Silent refresh (no loading indicators)
- ⏸️ Stops when tab becomes inactive

</details>

<details>
<summary><strong>🎨 3.2. System Logs CSS (static/css/logs-system.css)</strong></summary>

#### 🎯 **Key Styling Features**

##### 📊 **Log Level Styling**
```css
.log-level-INFO    { background: #e3f2fd; color: #2962ff; }  /* ℹ️ Blue */
.log-level-WARNING { background: #fff8e1; color: #ff8f00; }  /* ⚠️ Orange */
.log-level-ERROR   { background: #ffebee; color: #d50000; }  /* ❌ Red */
.log-level-CRITICAL{ background: #c62828; color: #ffffff; }  /* 🆘 Dark Red */
```

##### 🆘 **CRITICAL Log Styling**
- 🌹 Light red row background
- 💪 Bold text weight
- 💥 Pulsing icon animation

##### 👤 **User Action Icons**
```css
.user-action.fan-on    { background: #e8f5e8; color: #27ae60; }  /* 🌀 Green */
.user-action.fan-off   { background: #ffeaea; color: #e74c3c; }  /* 🛑 Red */
.user-action.light-on  { background: #fff8e1; color: #f39c12; }  /* 💡 Orange */
.user-action.light-off { background: #f5f5f5; color: #95a5a6; }  /* 🌙 Gray */
```

##### ⏰ **Time Group Headers**
- 🎨 Light background with clock icon
- 📅 Shows 10-minute time ranges
- 🔍 Makes log scanning easier

</details>

<details>
<summary><strong>📄 3.3. Logs Page HTML (templates/logs.html)</strong></summary>

#### 📑 **Tab Structure**
```html
<!-- 📊 System Logs Tab -->
<div id="tab-system" class="tab-content active">
  <button id="exportSystemLogsCsvBtn">📥 Export System Logs to CSV</button>
  <!-- Content populated by logs-system.js -->
</div>

<!-- 👤 User Logs Tab -->
<div id="tab-user" class="tab-content">
  <!-- Content populated by logs-user.js -->
</div>

<!-- 📈 Performance Logs Tab -->
<div id="tab-performance" class="tab-content">
  <!-- Performance metrics and latency data -->
</div>
```

</details>

</details>

---

<details>
<summary><strong>🔗 4. Integration Points (How Logs are Generated)</strong></summary>

> **💡 Note**: Log entries are automatically generated by various system components.

<details>
<summary><strong>🌐 4.1. Node Status Monitoring (blueprints/sensor/mqtt.py)</strong></summary>

#### 📴 **Offline Detection**
```python
# 🚨 When node sections are missing from MQTT
if not section_data_present_and_valid:
    level = LogLevel.CRITICAL if section_name == "remaja" else LogLevel.WARNING
    log_node_offline(node_name=section_name, details=details_msg, level=level)
```

**Triggers:**
- 📭 MQTT section missing from payload
- 🔢 All sensor values are `null`  
- ⏰ No MQTT data for >15 seconds (staleness)

#### 📶 **Online Detection**
```python
# ✅ When node data is restored
if section_data_present_and_valid:
    log_node_online(node_name=section_name, details=f"Node {section_name} data received.")
```

</details>

<details>
<summary><strong>👤 4.2. User Control Actions (blueprints/dashboard/routes.py)</strong></summary>

#### 🎛️ **Manual Control Logging**
```python
# 📝 When user changes actuator settings
if system_logger_available: # This check might need to be for the user_logger or a general logger availability
    user_email = session['user'].get('email', 'unknown_user')
    action_details = f"Set {device} to {'ON' if state else 'OFF'}, mode to {mode}."
    # Note: log_user_action now logs to 'user_logs' collection and includes IP address.
    # Ensure ip_address (e.g., request.remote_addr) is passed here.
    # Example: firestore_logger.log_user_action(username=user_email, action_description=action_details, device=device, node_affected=node_name, source="dashboard_controls", ip_address=request.remote_addr)
    log_user_action(username=user_email, action_description=action_details, device=device, node_affected="remaja", source="dashboard_controls", ip_address="<ip_address_here>")
```

**Captures (in `user_logs`):**
- 👤 **Who**: User email address
- 🎯 **What**: Device and action (Fan ON/OFF, Light ON/OFF), and other event_details
- 🕐 **When**: Timestamp of action
- 🏠 **Where**: Target node (usually "remaja")
- 🌐 **IP Address**: User's IP address

</details>

<details>
<summary><strong>🌡️ 4.3. Sensor Data Processing (blueprints/sensor/mqtt.py)</strong></summary>

#### 🚨 **Error Detection**
```python
# 🔍 Monitor sensor value changes
if new_value_is_error and not old_value_was_error:
    log_sensor_error(node=section_name, sensor_type=sensor_key, 
                    details=f"Sensor {sensor_key} started reporting 0 (error state)")
```

#### ✅ **Recovery Detection**
```python
# 🎉 Sensor recovered from error
if not new_value_is_error and old_value_was_error:
    log_sensor_operational(node=section_name, sensor_type=sensor_key,
                          details=f"Sensor {sensor_key} is now operational. Value: {new_value}")
```

</details>

<details>
<summary><strong>🔌 4.4. Connection Monitoring</strong></summary>

#### 📡 **MQTT Connection Events**
```python
# 🔗 Connection restored
def on_connect(self, client, userdata, flags, rc):
    if rc == 0:
        log_event(LogType.CONNECTION_RESTORED, LogLevel.INFO, 
                 details="Successfully connected to MQTT Broker.")

# 🔌 Connection lost  
def on_disconnect(self, client, userdata, rc):
    log_event(LogType.CONNECTION_LOST, LogLevel.WARNING,
             details=f"Disconnected from MQTT Broker. Result code: {rc}")
```

</details>

</details>

---

<details>
<summary><strong>🧪 5. How to Use/Test</strong></summary>

<details>
<summary><strong>📊 5.1. Viewing Logs</strong></summary>

1. **🌐 Access**: Navigate to "System Logs & Latency" page
2. **👁️ View Elements**:
   - 🕐 **Timestamp**: When the event occurred (WIB timezone)
   - 📊 **Level**: Color-coded severity badge
   - 🏷️ **Type**: Event category with descriptive icon
   - 🏠 **Node**: Affected component
   - 📍 **Source**: Originating module
   - 👤 **User**: Username for user-initiated actions
   - 📄 **Details**: Full description (hover for complete text)

</details>

<details>
<summary><strong>🔍 5.2. Filtering & Controls</strong></summary>

#### 🎛️ **Filter Options**
- 📅 **Days**: 1-90 days of history
- 🏷️ **Type**: Specific event categories
- 📊 **Level**: INFO, WARNING, ERROR, CRITICAL
- 🏠 **Node**: penyemaian, remaja, dewasa, server

#### 🔄 **Controls**
- 🔄 **Refresh**: Manual reload
- ⏱️ **Auto-refresh**: Every 30 seconds
- 📥 **Export CSV**: Download filtered logs

</details>

<details>
<summary><strong>🧪 5.3. Testing Scenarios</strong></summary>

#### 📴 **Test Node Offline/Online**
```bash
# 1. 🛑 Stop sending "penyemaian" section in MQTT
# Expected: ⚠️ NODE_OFFLINE (WARNING) log for Penyemaian

# 2. 🔄 Restore "penyemaian" section  
# Expected: ✅ NODE_ONLINE (INFO) log

# 3. ⏹️ Stop MQTT simulator for >15 seconds
# Expected: 🆘 NODE_OFFLINE (CRITICAL) log for Remaja (red row highlight)

# 4. ▶️ Restart simulator
# Expected: ✅ NODE_ONLINE (INFO) log for Remaja
```

#### 👤 **Test User Controls**
```bash
# 1. 🌐 Go to Dashboard
# 2. 🎛️ Turn fan ON/OFF or change mode to Auto/Manual  
# 3. 📊 Check User Logs (not System Logs)
# Expected: Log entry in 'user_logs' collection with action_type 'DEVICE_CONTROL', your username, IP address, and event details.
```

#### 📥 **Test CSV Export**
```bash
# 1. 🎛️ Apply desired filters
# 2. 📥 Click "Export System Logs to CSV"
# 3. ✅ Verify CSV download with all columns populated
```

</details>

</details>

---

<details>
<summary><strong>🔄 6. Data Flow Diagram</strong></summary>

```
🌡️ Hardware Sensors → 📡 MQTT → 🖥️ Server → 🗄️ Firestore → 🌐 Frontend
                                     ↓
                               📝 System Logger
                                     ↓
                            🏷️ Log Types & Levels
                                     ↓
                              📊 Database Storage
                                     ↓
                               🎨 UI Visualization
```

</details>

---

<details>
<summary><strong>⚡ 7. Quick Reference</strong></summary>

<details>
<summary><strong>🏷️ Log Types at a Glance</strong></summary>

| Category | Types | Icons |
|----------|-------|-------|
| **🌡️ Sensors** | ERROR, OPERATIONAL | 🚨 ✅ |
| **🔌 Connection** | LOST, RESTORED | 🔌 🔗 |
| **🏠 Nodes** | OFFLINE, ONLINE | 📴 📶 |
| **🤖 Auto Actions** | FAN_AUTO, LIGHT_AUTO | 🤖🌀 🤖💡 |
<!-- User device control actions are now primarily in user_logs. System logs might still contain other user-related LogTypes if logged directly via log_event. -->

</details>

<details>
<summary><strong>📊 Severity Levels</strong></summary>

| Level | Color | When to Use |
|-------|-------|-------------|
| ℹ️ **INFO** | 🔵 Blue | Normal operations |
| ⚠️ **WARNING** | 🟠 Orange | Minor issues |
| ❌ **ERROR** | 🔴 Red | Failed operations |
| 🆘 **CRITICAL** | 🔴 Dark Red | System-threatening |

</details>

</details>

---

**📚 This documentation provides a comprehensive guide to the System Logs feature, designed to be accessible for junior developers while maintaining full technical detail.**

<style>
/* Add some styling for better drawer appearance */
details {
    margin: 1rem 0;
    padding: 0.5rem;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background-color: #fafafa;
}

details[open] {
    background-color: #ffffff;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

summary {
    cursor: pointer;
    padding: 0.5rem;
    margin: -0.5rem;
    border-radius: 4px;
    background-color: #f5f5f5;
    font-weight: 600;
    transition: background-color 0.2s ease;
}

summary:hover {
    background-color: #e8e8e8;
}

details[open] > summary {
    margin-bottom: 1rem;
    border-bottom: 1px solid #e0e0e0;
}

/* Nested details styling */
details details {
    margin-left: 1rem;
    border-left: 3px solid #007acc;
    border-radius: 4px;
    background-color: #f9f9f9;
}

details details summary {
    background-color: #f0f8ff;
    font-weight: 500;
}

details details[open] summary {
    background-color: #e6f3ff;
}
</style>