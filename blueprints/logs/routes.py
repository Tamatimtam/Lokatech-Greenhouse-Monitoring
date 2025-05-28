from flask import render_template, jsonify, request, send_file, Response
from . import logs_bp
from ..decorators import isloggedin
from . import firestore_logger # Import the new logger
import csv
from io import StringIO
import datetime
import json # For flattening event_details

@logs_bp.route('/')
@isloggedin
def logs_page():
    """Render the logs page."""
    return render_template('logs.html')

@logs_bp.route('/system-logs') # This is the endpoint logs-system.js calls
@isloggedin
def get_system_logs_route(): # Renamed function to avoid conflict if any
    """Fetch system logs from Firestore with filtering."""
    try:
        days = request.args.get('days', 7, type=int)
        log_type = request.args.get('type', None)
        level = request.args.get('level', None)
        node = request.args.get('node', None)
        limit = request.args.get('limit', 100, type=int)
        
        print(f"DEBUG: get_system_logs_route called with params - days: {days}, type: {log_type}, level: {level}, node: {node}, limit: {limit}")
        
        logs = firestore_logger.get_system_logs(
            days=days,
            log_type_filter=log_type,
            level_filter=level,
            node_filter=node,
            limit=limit
        )
        
        print(f"DEBUG: Successfully retrieved {len(logs)} logs from firestore_logger")
        print(f"DEBUG: Sample log entry: {logs[0] if logs else 'No logs found'}")
        
        return jsonify(logs)
    except Exception as e:
        print(f"ERROR in get_system_logs_route: {e}")
        import traceback
        error_trace = traceback.format_exc()
        print(f"ERROR traceback: {error_trace}")
        return jsonify({"error": str(e), "details": error_trace}), 500

@logs_bp.route('/data')
@isloggedin
def get_log_data():
    """Fetch log data (placeholder)."""
    # This will be implemented later to fetch data from Firestore
    return jsonify([]) # Return empty list for now

@logs_bp.route('/export-system-logs-csv')
@isloggedin
def export_system_logs_csv():
    try:
        days = request.args.get('days', 7, type=int)
        log_type = request.args.get('type', None)
        level = request.args.get('level', None)
        node = request.args.get('node', None)
        limit = request.args.get('limit', 5000, type=int)

        logs = firestore_logger.get_system_logs(
            days=days,
            log_type_filter=log_type,
            level_filter=level,
            node_filter=node,
            limit=limit 
        )

        if not logs:
            return jsonify({"message": "No logs found for the selected criteria to export."}), 404

        si = StringIO()
        cw = csv.writer(si)
        
        headers = ['Timestamp (WIB)', 'Level', 'Type', 'Node', 'Sensor Type', 'Source', 'Details'] # Removed 'Username'
        cw.writerow(headers)

        for log_entry in logs:
            timestamp_wib_str = log_entry.get('timestamp_wib', log_entry.get('timestamp', 'N/A'))
            if isinstance(timestamp_wib_str, datetime.datetime):
                 timestamp_wib_str = timestamp_wib_str.isoformat()
            
            try:
                dt_obj = datetime.datetime.fromisoformat(timestamp_wib_str.replace('Z', '+00:00'))
                formatted_ts = dt_obj.astimezone(firestore_logger.wib_timezone).strftime('%Y-%m-%d %H:%M:%S')
            except:
                formatted_ts = timestamp_wib_str

            # Format log type for better CSV readability
            log_type_val = log_entry.get('type', '') # Renamed to avoid conflict with 'log_type' parameter
            # Removed USER_ specific formatting as they are no longer in system_logs
            # if log_type_val in ['USER_FAN_ON', 'USER_FAN_OFF', 'USER_LIGHT_ON', 'USER_LIGHT_OFF']:
            #     log_type_val = log_type_val.replace('USER_', 'User ').replace('_', ' ')


            row = [
                formatted_ts,
                log_entry.get('level', ''),
                log_type_val, # Use renamed variable
                log_entry.get('node', ''),
                log_entry.get('sensor_type', ''),
                log_entry.get('source', ''),
                # log_entry.get('username', ''), # Removed username from row data
                log_entry.get('details', '')
            ]
            cw.writerow(row)
        
        output = si.getvalue()
        
        filename_timestamp = datetime.datetime.now(firestore_logger.wib_timezone).strftime("%Y%m%d_%H%M%S")
        filename = f"system_logs_{filename_timestamp}.csv"

        return Response(
            output,
            mimetype="text/csv",
            headers={"Content-disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        print(f"ERROR in export_system_logs_csv: {e}")
        import traceback
        return jsonify({"error": str(e), "details": traceback.format_exc()}), 500


# --- User Activity Log Endpoints ---

@logs_bp.route('/user-activities')
@isloggedin
def get_user_activities_route():
    """Fetch user activity logs from Firestore with filtering."""
    try:
        # Log all received query parameters for detailed debugging
        print(f"DEBUG (get_user_activities_route): Received request.args: {request.args}")

        days = request.args.get('days', 7, type=int)
        log_type = request.args.get('type', None) # Filters by UserActionType string value
        username = request.args.get('username', None)
        limit = request.args.get('limit', 100, type=int)
        
        # Explicitly check if log_type is an empty string from query params and treat it as None
        # This ensures that if "All Types" (value="") is selected, no type filter is applied.
        if log_type == "":
            print(f"DEBUG (get_user_activities_route): log_type was an empty string, setting to None.")
            log_type = None
        
        print(f"DEBUG (get_user_activities_route): Parsed filters - days: {days}, log_type: {log_type}, username: {username}, limit: {limit}")
        
        logs = firestore_logger.get_user_logs(
            days=days,
            log_type_filter=log_type,
            username_filter=username,
            limit=limit
        )
        
        return jsonify(logs)
    except Exception as e:
        print(f"ERROR in get_user_activities_route: {e}")
        import traceback
        error_trace = traceback.format_exc()
        print(f"ERROR traceback: {error_trace}")
        return jsonify({"error": str(e), "details": error_trace}), 500

@logs_bp.route('/export-user-activities-csv')
@isloggedin
def export_user_activities_csv():
    """Export user activity logs to a CSV file."""
    try:
        days = request.args.get('days', 7, type=int)
        log_type = request.args.get('type', None)
        username = request.args.get('username', None)
        limit = request.args.get('limit', 5000, type=int) # Default higher limit for export

        logs = firestore_logger.get_user_logs(
            days=days,
            log_type_filter=log_type,
            username_filter=username,
            limit=limit 
        )

        if not logs:
            return jsonify({"message": "No user activity logs found for the selected criteria to export."}), 404

        si = StringIO()
        cw = csv.writer(si)
        
        # CSV columns: Timestamp (WIB), Username, Action Type, IP Address, Source, Details (flattened event_details)
        headers = ['Timestamp (WIB)', 'Username', 'Action Type', 'IP Address', 'Source', 'Details']
        cw.writerow(headers)

        for log_entry in logs:
            timestamp_wib_str = log_entry.get('timestamp_wib', log_entry.get('timestamp', 'N/A'))
            if isinstance(timestamp_wib_str, datetime.datetime):
                 timestamp_wib_str = timestamp_wib_str.isoformat()
            
            try:
                # Ensure correct parsing for ISO format strings, including those with 'Z'
                if 'Z' in timestamp_wib_str:
                    dt_obj = datetime.datetime.fromisoformat(timestamp_wib_str.replace('Z', '+00:00'))
                else:
                    dt_obj = datetime.datetime.fromisoformat(timestamp_wib_str)
                formatted_ts = dt_obj.astimezone(firestore_logger.wib_timezone).strftime('%Y-%m-%d %H:%M:%S')
            except ValueError: # Fallback if parsing fails
                formatted_ts = timestamp_wib_str
            except Exception: # General fallback
                 formatted_ts = str(timestamp_wib_str)


            event_details_str = ""
            if 'event_details' in log_entry and isinstance(log_entry['event_details'], dict):
                try:
                    event_details_str = json.dumps(log_entry['event_details'])
                except TypeError:
                    event_details_str = str(log_entry['event_details']) # Fallback if not JSON serializable
            elif 'event_details' in log_entry:
                 event_details_str = str(log_entry['event_details'])


            row = [
                formatted_ts,
                log_entry.get('username', ''),
                log_entry.get('action_type', ''),
                log_entry.get('ip_address', ''),
                log_entry.get('source', ''),
                event_details_str
            ]
            cw.writerow(row)
        
        output = si.getvalue()
        
        filename_timestamp = datetime.datetime.now(firestore_logger.wib_timezone).strftime("%Y%m%d_%H%M%S")
        filename = f"user_activity_logs_{filename_timestamp}.csv"

        return Response(
            output,
            mimetype="text/csv",
            headers={"Content-disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        print(f"ERROR in export_user_activities_csv: {e}")
        import traceback
        return jsonify({"error": str(e), "details": traceback.format_exc()}), 500
