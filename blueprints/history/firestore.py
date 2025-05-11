"""
Module for handling Firestore database interactions related to historical data
"""
import firebase_admin
from firebase_admin import credentials, firestore
import datetime
import os
import pytz

_db = None
wib_timezone = pytz.timezone('Asia/Jakarta')

def get_firestore_db():
    global _db
    if _db is None:
        try:
            script_dir = os.path.dirname(os.path.abspath(__file__))
            project_root = os.path.dirname(os.path.dirname(os.path.dirname(script_dir))) # Up to simpleLogin's parent
            # Assuming simpleLogin is the root for secrets, adjust if secrets is outside simpleLogin
            # For /simpleLogin/secrets/firebase-credentials.json
            cred_path = os.path.join(project_root, 'simpleLogin', 'secrets', 'firebase-credentials.json')
            
            if not os.path.exists(cred_path):
                 # Try alternative if running from within simpleLogin directory directly
                alt_project_root = os.path.dirname(os.path.dirname(script_dir)) # Up to simpleLogin
                cred_path = os.path.join(alt_project_root, 'secrets', 'firebase-credentials.json')

            if not os.path.exists(cred_path):
                print(f"ERROR: Firebase credentials file not found. Checked: {cred_path} and variations.")
                # Fallback for cloud environment if GOOGLE_APPLICATION_CREDENTIALS is set
                if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
                    print("Attempting to initialize Firebase with GOOGLE_APPLICATION_CREDENTIALS.")
                    if not firebase_admin._apps:
                        firebase_admin.initialize_app()
                    _db = firestore.client()
                    return _db
                return None
            
            if not firebase_admin._apps:
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
            _db = firestore.client()
        except Exception as e:
            print(f"Error initializing Firestore: {e}")
            import traceback
            traceback.print_exc()
            return None
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
