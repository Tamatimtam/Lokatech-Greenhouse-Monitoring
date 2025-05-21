"""
Module for handling system logs in Firestore.
Provides functions to log various system events and query log history.
"""
import firebase_admin
from firebase_admin import credentials, firestore
import datetime
import os
import pytz
from enum import Enum
from typing import Optional, Dict, Any, List, Union

# Constants for log types
class LogType(Enum):
    SENSOR_ERROR = "SENSOR_ERROR"
    CONNECTION_LOST = "CONNECTION_LOST"
    CONNECTION_RESTORED = "CONNECTION_RESTORED"
    FAN_ON_AUTO = "FAN_ON_AUTO"
    FAN_OFF_AUTO = "FAN_OFF_AUTO"
    LIGHT_ON_AUTO = "LIGHT_ON_AUTO"
    LIGHT_OFF_AUTO = "LIGHT_OFF_AUTO" # Ensure this is present
    # Add more types as needed, e.g., CRITICAL_LEVEL for future use

class LogLevel(Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"

# Global variables
_db = None
_initialized_project_id = None # Track initialized project
wib_timezone = pytz.timezone('Asia/Jakarta')

def get_firestore_db():
    """Initialize and return the Firestore database instance."""
    global _db, _initialized_project_id
    if _db is None:
        expected_project_id = "codenameamber-7b92a" # From your credentials
        try:
            cred_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                'secrets',
                'firebase-credentials.json'
            )
            if not os.path.exists(cred_path):
                print(f"ERROR (System Logger): Credentials file not found at {cred_path}")
                # Attempt GCP default if no local creds
                if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
                    print("INFO (System Logger): Attempting GCP default credentials for Firebase.")
                    firebase_admin.initialize_app(name='lokatech-system-logs-gcp')
                    app_to_use = firebase_admin.get_app(name='lokatech-system-logs-gcp')
                    _db = firestore.client(app=app_to_use)
                    _initialized_project_id = app_to_use.project_id
                    print(f"INFO (System Logger): Firebase initialized via GCP default for project: {_initialized_project_id}")
                else:
                    print("ERROR (System Logger): No local credentials and GOOGLE_APPLICATION_CREDENTIALS not set.")
                    return None
            else:
                cred = credentials.Certificate(cred_path)
                if cred.project_id != expected_project_id:
                    print(f"WARNING (System Logger): Credentials file project_id '{cred.project_id}' does not match expected '{expected_project_id}'")

                app_name_logs = 'lokatech-system-logs'
                try:
                    # Try to get app if already initialized (e.g. by main app.py)
                    app_to_use = firebase_admin.get_app(name=app_name_logs)
                    print(f"INFO (System Logger): Using existing Firebase app '{app_name_logs}'.")
                except ValueError:
                    # Initialize new app if specific one not found
                    print(f"INFO (System Logger): Initializing new Firebase app '{app_name_logs}'.")
                    firebase_admin.initialize_app(cred, name=app_name_logs)
                    app_to_use = firebase_admin.get_app(name=app_name_logs)
                
                _db = firestore.client(app=app_to_use)
                _initialized_project_id = app_to_use.project_id
                print(f"INFO (System Logger): Firebase initialized for project: {_initialized_project_id} using app '{app_name_logs}'")

            if _initialized_project_id != expected_project_id:
                print(f"CRITICAL WARNING (System Logger): Connected to project '{_initialized_project_id}' BUT EXPECTED '{expected_project_id}'!")

        except Exception as e:
            print(f"ERROR (System Logger): Error initializing Firestore: {e}")
            # Fallback to default app if one exists and is for the correct project
            if firebase_admin._apps and "[DEFAULT]" in str(e) or not firebase_admin._apps.get(app_name_logs):
                try:
                    default_app = firebase_admin.get_app() # Get default app
                    if default_app.project_id == expected_project_id:
                        _db = firestore.client() # Use default app's client
                        _initialized_project_id = default_app.project_id
                        print(f"INFO (System Logger): Using DEFAULT Firebase app for project: {_initialized_project_id}")
                        if _initialized_project_id != expected_project_id:
                             print(f"CRITICAL WARNING (System Logger): Default app connected to project '{_initialized_project_id}' BUT EXPECTED '{expected_project_id}'!")
                    else:
                        print(f"ERROR (System Logger): Default Firebase app is for project '{default_app.project_id}', expected '{expected_project_id}'. Cannot use.")
                        _db = None
                except Exception as e_default:
                    print(f"ERROR (System Logger): Could not initialize or use default Firebase app: {e_default}")
                    _db = None
            if _db is None:
                import traceback
                traceback.print_exc()
                return None
    elif _initialized_project_id != "codenameamber-7b92a": # Add this check on subsequent calls
        print(f"WARNING (System Logger): Re-checked. Still connected to project '{_initialized_project_id}' instead of 'codenameamber-7b92a'.")
    return _db

def log_event(
    log_type: LogType, 
    level: LogLevel, 
    node: Optional[str] = None,
    sensor_type: Optional[str] = None,
    details: Optional[str] = None,
    source: Optional[str] = "system" # Default source
) -> bool:
    """
    Log a system event to Firestore.
    
    Args:
        log_type: Type of log event (from LogType enum).
        level: Severity level (from LogLevel enum).
        node: The greenhouse node (e.g., 'penyemaian', 'server') or component.
        sensor_type: Type of sensor (e.g., 'temp', 'humidity') - for SENSOR_ERROR.
        details: Additional information about the event.
        source: The module or component generating the log.
        
    Returns:
        bool: True if log was successfully created, False otherwise.
    """
    db = get_firestore_db()
    if not db:
        print(f"ERROR (log_event): Firestore DB not available. Log Type: {log_type.value}, Details: {details}")
        return False
    
    # --- Add this check ---
    try:
        current_db_project = db.project # or db._client.project if db.project is not available
        expected_project_id = "codenameamber-7b92a"
        if current_db_project != expected_project_id:
            print(f"CRITICAL WARNING (log_event): db client project is '{current_db_project}' BUT EXPECTED '{expected_project_id}'!")
        else:
            print(f"DEBUG (log_event): db client project is '{current_db_project}', which is correct.")
    except Exception as e_proj_check:
        print(f"ERROR (log_event): Could not check db.project: {e_proj_check}")
    # --- End of added check ---

    try:
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        now_wib = now_utc.astimezone(wib_timezone)
        
        log_data = {
            "timestamp": now_utc, # Keep Firestore Timestamp for querying
            "timestamp_wib": now_wib.isoformat(), 
            "type": log_type.value,
            "level": level.value,
            "source": source
        }
        
        if node:
            log_data["node"] = node
        if sensor_type:
            log_data["sensor_type"] = sensor_type
        if details:
            log_data["details"] = details
        
        # --- MODIFICATION: Create a custom document ID using WIB ---
        # Format: YYYY-MM-DD HH:MM:SS.ffffff (using WIB for visual consistency in console)
        # Adding microseconds and a small random element to further decrease collision chance if logs are extremely rapid.
        random_suffix = os.urandom(3).hex() # 6 random hex characters
        log_id = f"{now_wib.strftime('%Y-%m-%d %H:%M:%S.%f')}-{random_suffix}" # Use now_wib here
        # --- END MODIFICATION ---

        print(f"DEBUG: Attempting to log event with ID '{log_id}': Type={log_type.value}, Level={level.value}, Node={node}, Source={source}")
        print(f"DEBUG: log_data to be added: {log_data}")
        
        # --- MODIFICATION: Use .document(log_id).set() instead of .add() ---
        db.collection('system_logs').document(log_id).set(log_data)
        # --- END MODIFICATION ---
        
        print(f"DEBUG: Log event successfully added/set to Firestore with ID '{log_id}'. Type={log_type.value}")
        return True
    
    except Exception as e:
        print(f"Error creating system log entry: {e}") # THIS IS IMPORTANT
        import traceback
        traceback.print_exc() # THIS TRACEBACK IS CRUCIAL
        return False

# --- Convenience functions for specific log types ---
def log_sensor_error(node: str, sensor_type: str, details: str, source: str = "sensor_monitor"):
    log_event(LogType.SENSOR_ERROR, LogLevel.ERROR, node=node, sensor_type=sensor_type, details=details, source=source)

def log_connection_lost(details: str, source: str = "connection_monitor", node: Optional[str] = "server"):
    log_event(LogType.CONNECTION_LOST, LogLevel.WARNING, details=details, source=source, node=node)

def log_connection_restored(details: str, source: str = "connection_monitor", node: Optional[str] = "server"):
    log_event(LogType.CONNECTION_RESTORED, LogLevel.INFO, details=details, source=source, node=node)

def log_fan_auto(node: str, state: bool, details: Optional[str] = None, source: str = "actuator_auto_control"):
    log_type = LogType.FAN_ON_AUTO if state else LogType.FAN_OFF_AUTO
    log_event(log_type, LogLevel.INFO, node=node, details=details, source=source)

def log_light_auto(node: str, state: bool, details: Optional[str] = None, source: str = "actuator_auto_control"):
    log_type = LogType.LIGHT_ON_AUTO if state else LogType.LIGHT_OFF_AUTO
    log_event(log_type, LogLevel.INFO, node=node, details=details, source=source)

# --- Function to retrieve logs (can be expanded later) ---
def get_system_logs(
    days: int = 7, 
    log_type_filter: Optional[str] = None,
    level_filter: Optional[str] = None,
    node_filter: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    db = get_firestore_db()
    if not db: return []

    try:
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        start_date_utc = now_utc - datetime.timedelta(days=days)

        query = db.collection('system_logs').where('timestamp', '>=', start_date_utc)

        if log_type_filter:
            query = query.where('type', '==', log_type_filter)
        if level_filter:
            query = query.where('level', '==', level_filter)
        if node_filter:
            query = query.where('node', '==', node_filter)
        
        query = query.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(limit)
        
        docs = query.stream()
        results = []
        for doc in docs:
            log_entry = doc.to_dict()
            log_entry['id'] = doc.id # Add document ID
            # Ensure timestamp is stringified for JSON response
            if isinstance(log_entry.get('timestamp'), datetime.datetime):
                log_entry['timestamp'] = log_entry['timestamp'].isoformat()
            # timestamp_wib is already stored as ISO string
            results.append(log_entry)
        return results
    except Exception as e:
        print(f"Error retrieving system logs: {e}")
        import traceback
        traceback.print_exc()
        return []