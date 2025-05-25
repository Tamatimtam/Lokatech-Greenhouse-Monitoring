# File: /simpleLogin/blueprints/logs/firestore_logger.py
import firebase_admin # Keep for LogType, LogLevel if they are here
from firebase_admin import firestore # Keep for type hinting if needed
import datetime
import os
import pytz
from enum import Enum
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from typing import Optional  # Add this import

# Constants for log types (keep as is)
class LogType(Enum):
    # ... your LogType enum ...
    SENSOR_ERROR = "SENSOR_ERROR"
    SENSOR_OPERATIONAL = "SENSOR_OPERATIONAL"
    CONNECTION_LOST = "CONNECTION_LOST"
    CONNECTION_RESTORED = "CONNECTION_RESTORED"
    FAN_ON_AUTO = "FAN_ON_AUTO"
    FAN_OFF_AUTO = "FAN_OFF_AUTO"
    LIGHT_ON_AUTO = "LIGHT_ON_AUTO"
    LIGHT_OFF_AUTO = "LIGHT_OFF_AUTO"

class LogLevel(Enum):
    # ... your LogLevel enum ...
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"

# Global variables
_db = None  # This will be set by app2.py
_initialized_project_id = None # This can also be set by app2.py if needed for checks
wib_timezone = pytz.timezone('Asia/Jakarta')

def get_firestore_db():
    """
    Return the Firestore database instance. 
    This instance is expected to be set by the main app (app2.py).
    """
    if _db is None:
        print("CRITICAL ERROR (System Logger): Firestore DB client (_db) was NOT SET by the main application. Logging will fail.")
    return _db

def log_event(
    log_type: LogType,
    level: LogLevel,
    node: str = None,
    sensor_type: str = None,
    details: str = None,
    source: str = "system"
) -> bool:
    db_client_instance = get_firestore_db()
    if not db_client_instance:
        print(f"FALLBACK_LOG (log_event): Firestore DB not available. Log Type: {log_type.value if isinstance(log_type, Enum) else log_type}, Level: {level.value if isinstance(level, Enum) else level}, Details: {details}, Source: {source}")
        return False

    try:
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        now_wib = now_utc.astimezone(wib_timezone)
        
        log_data = {
            "timestamp": now_utc,
            "timestamp_wib": now_wib.isoformat(),
            "type": log_type.value if isinstance(log_type, Enum) else log_type,
            "level": level.value if isinstance(level, Enum) else level,
            "source": source
        }
        
        if node: log_data["node"] = node
        if sensor_type: log_data["sensor_type"] = sensor_type
        if details: log_data["details"] = details
        
        # --- MODIFICATION: Create a custom document ID using WIB ---
        # Format: YYYY-MM-DD HH:MM:SS.ffffff (using WIB for visual consistency in console)
        # Adding microseconds and a small random element to further decrease collision chance if logs are extremely rapid.
        random_suffix = os.urandom(3).hex() # 6 random hex characters
        log_id = f"{now_wib.strftime('%Y-%m-%d %H:%M:%S.%f')}-{random_suffix}" # Use now_wib here
        # --- END MODIFICATION ---

        print(f"DEBUG: Attempting to log event with ID '{log_id}': Type={log_type.value}, Level={level.value}, Node={node}, Source={source}")
        print(f"DEBUG: log_data to be added: {log_data}")
        
        # --- MODIFICATION: Use .document(log_id).set() instead of .add() ---
        db_client_instance.collection('system_logs').document(log_id).set(log_data)
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

def log_sensor_operational(node: str, sensor_type: str, details: str, source: str = "sensor_monitor"):
    log_event(LogType.SENSOR_OPERATIONAL, LogLevel.INFO, node=node, sensor_type=sensor_type, details=details, source=source)

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
    log_type_filter: str = None,
    level_filter: str = None,
    node_filter: str = None,
    limit: int = 100
):
    db_client_instance = get_firestore_db()
    if not db_client_instance: 
        return []
    
    def _query_firestore():
        """Inner function to execute the Firestore query."""
        try:
            now_utc = datetime.datetime.now(datetime.timezone.utc)
            start_date_utc = now_utc - datetime.timedelta(days=days)

            # Start with a simple query
            query = db_client_instance.collection('system_logs')
            query = query.where('timestamp', '>=', start_date_utc)
            
            # Apply other filters only if specified
            if log_type_filter:
                query = query.where('type', '==', log_type_filter)
            if level_filter:
                query = query.where('level', '==', level_filter)
            if node_filter:
                query = query.where('node', '==', node_filter)
            
            # Reduce initial limit to prevent timeout
            actual_limit = min(limit, 25)  # Even smaller limit
            query = query.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(actual_limit)
            
            print(f"DEBUG: Executing Firestore query with limit {actual_limit}")
            docs = query.stream()
            
            results = []
            for doc in docs:
                log_entry = doc.to_dict()
                log_entry['id'] = doc.id 
                if isinstance(log_entry.get('timestamp'), datetime.datetime):
                    log_entry['timestamp'] = log_entry['timestamp'].isoformat()
                results.append(log_entry)
            
            return results
            
        except Exception as e:
            print(f"Error in _query_firestore: {e}")
            return []
    
    try:
        # Use ThreadPoolExecutor with timeout instead of signal
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_query_firestore)
            try:
                results = future.result(timeout=10)  # 10 second timeout
                print(f"DEBUG: Successfully retrieved {len(results)} logs")
                return results
            except FutureTimeoutError:
                print("ERROR: Firestore query timed out after 10 seconds")
                return []
                
    except Exception as e:
        print(f"Error retrieving system logs: {e}")
        import traceback
        traceback.print_exc()
        return []
