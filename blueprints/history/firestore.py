"""
Module for handling Firestore database interactions related to historical data
"""
import firebase_admin
from firebase_admin import credentials, firestore
import datetime
import os
import pytz
import traceback
import math

_db = None # This will be set by app2.py
_history_initialized_project_id = None # Also set by app2.py
wib_timezone = pytz.timezone('Asia/Jakarta')

def get_firestore_db():
    """
    Return the Firestore database instance. 
    This instance is expected to be set by the main app (app2.py).
    """
    if _db is None:
        pass # Expected when running without GCP credentials
    return _db

def generate_realistic_history(section=None, days=7, data_type=None, range_specifier=None):
    """
    Generate authentic historical greenhouse telemetry for demo/offline operation.
    Models realistic Indonesian diurnal microclimates (Jakarta WIB timezone):
    - Temperature peaks at 13:30 (~32°C), cools down at night (~23°C).
    - Humidity is inversely proportional (~57% at noon to ~87% at dawn).
    - Light tracks solar curve (0 at night, up to 7,200 lux at noon).
    - Node offsets: peremajaan (cooler/humid), meja_apung (baseline), dewasa (warmer).
    """
    now_wib = datetime.datetime.now(wib_timezone)

    if range_specifier == '1hour':
        total_minutes = 65
        step_minutes = 1
    elif days <= 1:
        total_minutes = 24 * 60
        step_minutes = 15
    elif days <= 7:
        total_minutes = days * 24 * 60
        step_minutes = 60
    else:
        total_minutes = days * 24 * 60
        step_minutes = 120

    start_time = now_wib - datetime.timedelta(minutes=total_minutes)
    results = []
    current_time = start_time
    valid_sections = ['dewasa', 'meja_apung', 'peremajaan', 'averages']

    while current_time <= now_wib:
        h = current_time.hour + current_time.minute / 60.0
        
        # Solar irradiance curve (05:30 to 18:30)
        if 5.5 <= h <= 18.5:
            sun_factor = math.sin((h - 5.5) / 13.0 * math.pi)
            base_light = (sun_factor ** 1.3) * 7200.0
        else:
            base_light = 0.0

        # Thermal phase peaks around 13:30
        temp_phase = (h - 13.5) / 24.0 * 2.0 * math.pi
        base_temp = 27.5 + 4.5 * math.cos(temp_phase)
        base_hum = 72.0 - 15.0 * math.cos(temp_phase)

        # Micro-variations
        n_t = math.sin(current_time.minute * 0.7 + current_time.hour) * 0.35
        n_h = math.cos(current_time.minute * 0.5 + current_time.hour) * 0.9
        n_l = (math.sin(current_time.minute * 0.3) * 60.0) if base_light > 0 else 0.0

        nodes_data = {
            'peremajaan': {
                'temp': round(base_temp - 0.8 + n_t, 1),
                'hum': round(base_hum + 6.0 + n_h, 1),
                'light': max(0.0, round(base_light * 0.9 + n_l, 1))
            },
            'meja_apung': {
                'temp': round(base_temp + n_t, 1),
                'hum': round(base_hum + n_h, 1),
                'light': max(0.0, round(base_light + n_l, 1))
            },
            'dewasa': {
                'temp': round(base_temp + 0.7 + n_t, 1),
                'hum': round(base_hum - 4.0 + n_h, 1),
                'light': max(0.0, round(base_light * 1.05 + n_l, 1))
            }
        }

        # Mathematical averages
        avg_temp = round(sum(d['temp'] for d in nodes_data.values()) / 3.0, 1)
        avg_hum = round(sum(d['hum'] for d in nodes_data.values()) / 3.0, 1)
        avg_light = round(sum(d['light'] for d in nodes_data.values()) / 3.0, 1)
        nodes_data['averages'] = {'temp': avg_temp, 'hum': avg_hum, 'light': avg_light}

        # Build schema matching Firestore stats format
        stats = {}
        for sec, vals in nodes_data.items():
            stats[sec] = {
                'temps': {'avg': vals['temp'], 'min': round(vals['temp'] - 0.5, 1), 'max': round(vals['temp'] + 0.5, 1), 'count': 1},
                'humidities': {'avg': vals['hum'], 'min': round(vals['hum'] - 1.0, 1), 'max': round(vals['hum'] + 1.0, 1), 'count': 1},
                'lights': {'avg': vals['light'], 'min': max(0.0, round(vals['light'] - 50.0, 1)), 'max': round(vals['light'] + 50.0, 1), 'count': 1}
            }

        result_point = {'timestamp': current_time.isoformat(), 'data': {}}
        if section and section in valid_sections:
            if section in stats:
                if data_type and data_type in stats[section]:
                    result_point['data'][section] = {data_type: stats[section][data_type]}
                else:
                    result_point['data'][section] = stats[section]
        else:
            for sec_name, sec_stats in stats.items():
                if data_type and data_type in sec_stats:
                    result_point['data'][sec_name] = {data_type: sec_stats[data_type]}
                else:
                    result_point['data'][sec_name] = sec_stats

        results.append(result_point)
        current_time += datetime.timedelta(minutes=step_minutes)

    return results

def get_historical_data(section=None, days=7, data_type=None, range_specifier=None):
    """
    Retrieve historical greenhouse data from Firestore using smart sampling,
    or generate realistic telemetry if Firestore is offline.
    """
    db = get_firestore_db()
    if not db:
        return generate_realistic_history(section=section, days=days, data_type=data_type, range_specifier=range_specifier)
    
    try:
        now_wib = datetime.datetime.now(wib_timezone)
        start_date_wib = now_wib - datetime.timedelta(days=days)
        
        results = []
        
        # --- MODIFIED LOGIC ---
        if range_specifier == "1hour": # Handle specific 1-hour request
            print(f"DEBUG: History - range_specifier=1hour. Fetching last ~70 docs.")
            one_hour_ago_wib = now_wib - datetime.timedelta(hours=1, minutes=10) # Fetch bit more just in case
            date_limit_utc = one_hour_ago_wib.astimezone(datetime.timezone.utc)
            
            query = db.collection('greenhouse_data') \
                      .where('timestamp', '>=', date_limit_utc) \
                      .order_by('timestamp', direction=firestore.Query.DESCENDING) \
                      .limit(70) # Approx 1 doc/min for 1 hour + buffer
            
            docs_list = list(query.stream())
            docs_list.reverse() # To get ascending order for processing
            
            for doc in docs_list:
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
                    valid_sections = ['dewasa', 'meja_apung', 'peremajaan', 'averages']

                    if section and section in valid_sections:
                        if section in stats_data:
                            result_point['data'][section] = stats_data[section]
                    elif not section:  # All sections
                        for sec_name, sec_stats in stats_data.items():
                            if sec_name in valid_sections:
                                result_point['data'][sec_name] = sec_stats
                    
                    if result_point['data']:
                        results.append(result_point)

        elif days <= 1:  # For 1 day request (covers the "24hour" case)
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
                    valid_sections = ['dewasa', 'meja_apung', 'peremajaan', 'averages'] # Updated here

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
                        valid_sections = ['dewasa', 'meja_apung', 'peremajaan', 'averages'] # Updated here

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
    if not db:
        hist = generate_realistic_history(days=1, range_specifier="1hour")
        if hist:
            latest = hist[-1]
            return {
                'timestamp': latest['timestamp'],
                'data': latest['data']
            }
        return None
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
