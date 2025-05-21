from flask import render_template, jsonify, request # Added request
from . import logs_bp
from ..decorators import isloggedin
from . import firestore_logger # Import the new logger

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
        
        logs = firestore_logger.get_system_logs(
            days=days,
            log_type_filter=log_type,
            level_filter=level,
            node_filter=node,
            limit=limit
        )
        return jsonify(logs)
    except Exception as e:
        print(f"Error in get_system_logs_route: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "details": traceback.format_exc()}), 500

@logs_bp.route('/data')
@isloggedin
def get_log_data():
    """Fetch log data (placeholder)."""
    # This will be implemented later to fetch data from Firestore
    return jsonify([]) # Return empty list for now
