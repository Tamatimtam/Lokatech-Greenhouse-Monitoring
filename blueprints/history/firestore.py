"""
Module for handling Firestore database interactions related to historical data
"""
import firebase_admin
from firebase_admin import credentials, firestore
import datetime
import os
import pytz

_db = None
_history_initialized_project_id = None # Track initialized project for history
wib_timezone = pytz.timezone('Asia/Jakarta')

def get_firestore_db():
    global _db, _history_initialized_project_id
    if _db is None:
        expected_project_id = "codenameamber-7b92a" # From your credentials
        try:
            cred_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                'secrets',
                'firebase-credentials.json'
            )
            if not os.path.exists(cred_path):
                print(f"ERROR (History DB): Credentials file not found at {cred_path}")
                if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
                    print("INFO (History DB): Attempting GCP default credentials for Firebase.")
                    # If history uses default app, it should be initialized by main app.py or once.
                    # For safety, let's try to initialize a named one if no default, or get default.
                    try:
                        default_app = firebase_admin.get_app()
                        app_to_use = default_app
                        print(f"INFO (History DB): Using existing DEFAULT Firebase app.")
                    except ValueError:
                        print(f"INFO (History DB): Initializing new Firebase app 'lokatech-history-gcp' via GCP default.")
                        firebase_admin.initialize_app(name='lokatech-history-gcp')
                        app_to_use = firebase_admin.get_app(name='lokatech-history-gcp')
                    
                    _db = firestore.client(app=app_to_use)
                    _history_initialized_project_id = app_to_use.project_id
                    print(f"INFO (History DB): Firebase initialized via GCP default for project: {_history_initialized_project_id}")

                else:
                    print("ERROR (History DB): No local credentials and GOOGLE_APPLICATION_CREDENTIALS not set.")
                    return None
            else:
                cred = credentials.Certificate(cred_path)
                if cred.project_id != expected_project_id:
                    print(f"WARNING (History DB): Credentials file project_id '{cred.project_id}' does not match expected '{expected_project_id}'")

                # History typically uses the default app, ensure it's initialized
                try:
                    app_to_use = firebase_admin.get_app() # Try to get default app
                    print(f"INFO (History DB): Using existing DEFAULT Firebase app.")
                except ValueError:
                    print(f"INFO (History DB): Initializing DEFAULT Firebase app for history.")
                    firebase_admin.initialize_app(cred) # Initialize default app
                    app_to_use = firebase_admin.get_app()
                
                _db = firestore.client(app=app_to_use) # Client from default app
                _history_initialized_project_id = app_to_use.project_id
                print(f"INFO (History DB): Firebase (default app) initialized for project: {_history_initialized_project_id}")

            if _history_initialized_project_id != expected_project_id:
                print(f"CRITICAL WARNING (History DB): Connected to project '{_history_initialized_project_id}' BUT EXPECTED '{expected_project_id}'!")

        except Exception as e:
            print(f"ERROR (History DB): Error initializing Firestore: {e}")
            import traceback
            traceback.print_exc()
            _db = None # Ensure db is None if init fails
            return None
    elif _history_initialized_project_id != "codenameamber-7b92a":
        print(f"WARNING (History DB): Re-checked. Still connected to project '{_history_initialized_project_id}' instead of 'codenameamber-7b92a'.")
    return _db

def get_historical_data(section=None, days=7, data_type=None):
    """
    Retrieve historical greenhouse data from Firestore.
    
    Args:
        section (str, optional): The greenhouse section: 'dewasa', 'remaja', 'penyemaian', or 'averages'. 
                                 If None, returns data for all sections.
        days (int, optional): Number of days of history. Defaults to 7.
        data_type (str, optional): 'temps', 'humidities', or 'lights'. If None, all types.
    
    Returns:
        list: List of data points ordered by timestamp
    """
    db = get_firestore_db()
    if not db: return []
    
    try:
        # Calculate date limit in WIB, then convert to UTC for Firestore query
        now_wib = datetime.datetime.now(wib_timezone)
        date_limit_wib = now_wib - datetime.timedelta(days=days)
        date_limit_utc = date_limit_wib.astimezone(datetime.timezone.utc)
        
        query = db.collection('greenhouse_data').where('timestamp', '>=', date_limit_utc).order_by('timestamp')
        docs = query.stream()
        results = []

        for doc in docs:
            data = doc.to_dict()
            timestamp = data.get('timestamp')
            # Convert Firestore timestamp (assumed UTC if no tzinfo) to WIB
            timestamp_wib = None
            if isinstance(timestamp, datetime.datetime):
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=datetime.timezone.utc) # Assume UTC if no tzinfo
                timestamp_wib = timestamp.astimezone(wib_timezone)

            result_point = {'timestamp': timestamp_wib.isoformat() if timestamp_wib else None, 'data': {}} # Use ISO format for JS
            
            stats_data = data.get('stats', {})
            
            # Valid sections now include 'remaja'
            valid_sections = ['dewasa', 'remaja', 'penyemaian', 'averages']

            if section and section in valid_sections:
                if section in stats_data:
                    section_stats = stats_data[section]
                    if data_type:
                        if data_type in section_stats and section_stats[data_type] is not None: # Check for None
                            result_point['data'][section] = {data_type: section_stats[data_type]}
                    elif section_stats is not None: # Check for None
                        result_point['data'][section] = section_stats
            elif not section: # All sections
                for sec_name, sec_stats in stats_data.items():
                    if sec_name not in valid_sections or sec_stats is None: continue # Skip if not valid or None
                    
                    if data_type:
                        if data_type in sec_stats and sec_stats[data_type] is not None: # Check for None
                            if sec_name not in result_point['data']: result_point['data'][sec_name] = {}
                            result_point['data'][sec_name][data_type] = sec_stats[data_type]
                    else:
                        result_point['data'][sec_name] = sec_stats
            
            if result_point['data']: # Only add if there's some data
                results.append(result_point)
        
        return results
    except Exception as e:
        print(f"Error retrieving historical data: {e}")
        import traceback
        traceback.print_exc()
        return []

def get_latest_data():
    db = get_firestore_db()
    if not db: return None
    try:
        query = db.collection('greenhouse_data').order_by('timestamp', direction=firestore.Query.DESCENDING).limit(1)
        docs = query.stream()
        for doc in docs:
            data = doc.to_dict()
            timestamp = data.get('timestamp')
            # Convert Firestore timestamp (assumed UTC if no tzinfo) to WIB
            timestamp_wib = None
            if isinstance(timestamp, datetime.datetime):
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=datetime.timezone.utc) # Assume UTC if no tzinfo
                timestamp_wib = timestamp.astimezone(wib_timezone)

            return {
                'timestamp': timestamp_wib.isoformat() if timestamp_wib else None,
                'data': data.get('stats', {}),
                'metadata': data.get('metadata', {})
            }
        return None
    except Exception as e:
        print(f"Error retrieving latest data: {e}")
        return None
