"""
Module for handling Firestore database interactions related to historical data
"""

import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import datetime
import os

# Singleton pattern for Firestore client
_db = None

def get_firestore_db():
    """Get a Firestore database client, initializing it if necessary."""
    global _db
    
    if _db is None:
        try:
            # Get the absolute path to the credentials file
            script_dir = os.path.dirname(os.path.abspath(__file__))
            project_root = os.path.dirname(os.path.dirname(script_dir))  # Up to simpleLogin folder
            cred_path = os.path.join(project_root, 'secrets', 'firebase-credentials.json')
            
            if not os.path.exists(cred_path):
                print(f"ERROR: Firebase credentials file not found at {cred_path}")
                return None
            
            # Initialize Firebase if not already initialized
            try:
                app = firebase_admin.get_app()
            except ValueError:
                # App not initialized yet
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
        section (str, optional): The greenhouse section to filter by: 'dewasa', 'peremajaan', 'penyemaian', or 'averages'. 
                                 If None, returns data for all sections.
        days (int, optional): Number of days of history to retrieve. Defaults to 7.
        data_type (str, optional): Type of data to retrieve: 'temps', 'humidities', or 'lights'.
                                   If None, returns all data types.
    
    Returns:
        list: List of data points ordered by timestamp
    """
    db = get_firestore_db()
    
    try:
        # Calculate the date limit
        date_limit = datetime.datetime.now() - datetime.timedelta(days=days)
        
        # Query the data
        query = db.collection('greenhouse_data').where('timestamp', '>=', date_limit).order_by('timestamp')
        
        # Execute the query
        docs = query.stream()
        
        # Process the documents
        results = []
        for doc in docs:
            data = doc.to_dict()
            
            # Extract the timestamp
            timestamp = data.get('timestamp')
            
            # Create a result structure that includes only the requested section and data type
            result = {
                'timestamp': timestamp,
                'data': {}
            }
            
            # Extract stats for the specified section
            stats = data.get('stats', {})
            
            if section:
                # Filter for a specific section
                if section in stats:
                    section_stats = stats[section]
                    
                    if data_type:
                        # Filter for a specific data type
                        if data_type in section_stats:
                            result['data'][section] = {data_type: section_stats[data_type]}
                    else:
                        # Include all data types for this section
                        result['data'][section] = section_stats
            else:
                # Include data for all sections
                if data_type:
                    # Filter for a specific data type across all sections
                    for sec, sec_stats in stats.items():
                        if data_type in sec_stats:
                            if sec not in result['data']:
                                result['data'][sec] = {}
                            result['data'][sec][data_type] = sec_stats[data_type]
                else:
                    # Include all data
                    result['data'] = stats
            
            # Only add non-empty results
            if result['data']:
                results.append(result)
        
        return results
    except Exception as e:
        print(f"Error retrieving historical data: {e}")
        return []


def get_latest_data():
    """
    Retrieve the most recent greenhouse data point from Firestore.
    
    Returns:
        dict: The most recent data point, or None if no data exists
    """
    db = get_firestore_db()
    
    try:
        # Query for the most recent document
        query = db.collection('greenhouse_data').order_by('timestamp', direction=firestore.Query.DESCENDING).limit(1)
        docs = query.stream()
        
        # Get the first (and only) document
        for doc in docs:
            data = doc.to_dict()
            return {
                'timestamp': data.get('timestamp'),
                'data': data.get('stats', {}),
                'metadata': data.get('metadata', {})
            }
        
        # No documents found
        return None
    except Exception as e:
        print(f"Error retrieving latest data: {e}")
        return None
