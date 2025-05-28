"""
Module for handling Firestore database interactions related to historical data
"""
import firebase_admin
from firebase_admin import credentials, firestore
import datetime
import os
import pytz

_db = None # This will be set by app2.py
_history_initialized_project_id = None # Also set by app2.py
wib_timezone = pytz.timezone('Asia/Jakarta')

def get_firestore_db():
    """
    Return the Firestore database instance. 
    This instance is expected to be set by the main app (app2.py).
    """
    if _db is None:
        print("CRITICAL ERROR (History DB): Firestore DB client (_db) was NOT SET by the main application. DB operations will fail.")
    return _db

def get_historical_data(section=None, days=7, data_type=None):
    """
    Retrieve historical greenhouse data from Firestore using smart sampling.
    
    Args:
        section (str, optional): The greenhouse section: 'dewasa', 'remaja', 'penyemaian', or 'averages'. 
                                 If None, returns data for all sections.
        days (int, optional): Number of days of history. Defaults to 7.
        data_type (str, optional): 'temps', 'humidities', or 'lights'. If None, all types.
    
    Returns:
        list: List of sampled data points ordered by timestamp
    """
    db = get_firestore_db()
    if not db: return []
    
    try:
        now_wib = datetime.datetime.now(wib_timezone)
        start_date_wib = now_wib - datetime.timedelta(days=days)
        
        results = []
        
        # --- MODIFIED LOGIC ---
        if days <= 1:  # For 1 day or less (covers the "1hour" case which requests days=1)
            print(f"DEBUG: History - days <= 1 ({days} days). Fetching more raw data.")
            
            # Convert date limit to UTC for Firestore query
            date_limit_utc = start_date_wib.astimezone(datetime.timezone.utc)
            
            # Query for all documents within the date range, ordered by timestamp
            query = db.collection('greenhouse_data') \
                      .where('timestamp', '>=', date_limit_utc) \
                      .order_by('timestamp') \
                      .limit(1500)  # Fetch up to 1500 most recent docs in the range
            
            docs = query.stream()
            for doc in docs:
                data = doc.to_dict()
                timestamp = data.get('timestamp')
                timestamp_wib_val = None
                
                if isinstance(timestamp, datetime.datetime):
                    if timestamp.tzinfo is None:
                        timestamp = timestamp.replace(tzinfo=datetime.timezone.utc)
                    timestamp_wib_val = timestamp.astimezone(wib_timezone)

                if timestamp_wib_val:
                    result_point = {'timestamp': timestamp_wib_val.isoformat(), 'data': {}}
                    stats_data = data.get('stats', {})
                    valid_sections = ['dewasa', 'remaja', 'penyemaian', 'averages']

                    if section and section in valid_sections:
                        if section in stats_data:
                            section_stats = stats_data[section]
                            if data_type:
                                if data_type in section_stats and section_stats[data_type] is not None:
                                    result_point['data'][section] = {data_type: section_stats[data_type]}
                            elif section_stats is not None:
                                result_point['data'][section] = section_stats
                    elif not section:  # All sections
                        for sec_name, sec_stats in stats_data.items():
                            if sec_name not in valid_sections or sec_stats is None: 
                                continue
                            if data_type:
                                if data_type in sec_stats and sec_stats[data_type] is not None:
                                    if sec_name not in result_point['data']: 
                                        result_point['data'][sec_name] = {}
                                    result_point['data'][sec_name][data_type] = sec_stats[data_type]
                            else:
                                result_point['data'][sec_name] = sec_stats
                    
                    if result_point['data']:
                        results.append(result_point)

        else:  # For days > 1, use the sampling logic
            print(f"DEBUG: History - days > 1 ({days} days). Using sampling logic.")
            
            # Determine target number of points based on date range
            points_to_target = 0
            if days <= 7:  # For 7 days (hourly samples)
                points_to_target = days * 24 
            else:  # For 30+ days (every 3 hours)
                points_to_target = days * 8 
            
            # Ensure minimum number of points
            points_to_target = max(points_to_target, 24)

            total_duration_seconds = days * 24 * 60 * 60
            if total_duration_seconds <= 0:
                total_duration_seconds = (now_wib - start_date_wib).total_seconds()

            if total_duration_seconds <= 0 or points_to_target == 0:
                 time_increment_seconds = 3600  # Default to 1 hour
            else:
                time_increment_seconds = total_duration_seconds / points_to_target
            
            current_query_target_wib = start_date_wib

            # Fetch spaced-out data points
            for i in range(int(points_to_target)):
                # Define search window around target time
                window_half_size_seconds = max(60, time_increment_seconds / 4)
                
                query_window_start_wib = current_query_target_wib - datetime.timedelta(seconds=window_half_size_seconds / 2)
                query_window_end_wib = current_query_target_wib + datetime.timedelta(seconds=window_half_size_seconds / 2)

                # Convert to UTC for Firestore
                query_window_start_utc = query_window_start_wib.astimezone(datetime.timezone.utc)
                query_window_end_utc = query_window_end_wib.astimezone(datetime.timezone.utc)

                # Fetch one document in this window
                query = db.collection('greenhouse_data') \
                          .where('timestamp', '>=', query_window_start_utc) \
                          .where('timestamp', '<=', query_window_end_utc) \
                          .order_by('timestamp') \
                          .limit(1)
                
                docs_in_window = list(query.stream())

                if docs_in_window:
                    doc = docs_in_window[0]
                    data = doc.to_dict()
                    timestamp = data.get('timestamp')
                    timestamp_wib_val = None

                    if isinstance(timestamp, datetime.datetime):
                        if timestamp.tzinfo is None:
                            timestamp = timestamp.replace(tzinfo=datetime.timezone.utc)
                        timestamp_wib_val = timestamp.astimezone(wib_timezone)

                    if timestamp_wib_val:
                        result_point = {'timestamp': timestamp_wib_val.isoformat(), 'data': {}}
                        stats_data = data.get('stats', {})
                        valid_sections = ['dewasa', 'remaja', 'penyemaian', 'averages']

                        if section and section in valid_sections:
                            if section in stats_data:
                                section_stats = stats_data[section]
                                if data_type:
                                    if data_type in section_stats and section_stats[data_type] is not None:
                                        result_point['data'][section] = {data_type: section_stats[data_type]}
                                elif section_stats is not None:
                                    result_point['data'][section] = section_stats
                        elif not section:  # All sections
                            for sec_name, sec_stats in stats_data.items():
                                if sec_name not in valid_sections or sec_stats is None: 
                                    continue
                                if data_type:
                                    if data_type in sec_stats and sec_stats[data_type] is not None:
                                        if sec_name not in result_point['data']: 
                                            result_point['data'][sec_name] = {}
                                        result_point['data'][sec_name][data_type] = sec_stats[data_type]
                                else:
                                    result_point['data'][sec_name] = sec_stats

                        if result_point['data']:
                            # Check for duplicates
                            is_duplicate = False
                            for res_item in results:
                                if res_item['timestamp'] == timestamp_wib_val.isoformat():
                                    is_duplicate = True
                                    break
                            if not is_duplicate:
                                results.append(result_point)
                
                current_query_target_wib += datetime.timedelta(seconds=time_increment_seconds)
                if current_query_target_wib > now_wib:
                    break
            
            # Sort results by timestamp
            results.sort(key=lambda x: x['timestamp'])
        
        print(f"DEBUG: History - Returning {len(results)} data points for {days} days request.")
        return results
    except Exception as e:
        print(f"Error retrieving historical data (modified): {e}")
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
            
            if isinstance(timestamp, datetime.datetime):
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=datetime.timezone.utc)
                timestamp_wib = timestamp.astimezone(wib_timezone)
                return {
                    'timestamp': timestamp_wib.isoformat(),
                    'data': data.get('stats', {})
                }
        return None
    except Exception as e:
        print(f"Error retrieving latest data: {e}")
        return None
