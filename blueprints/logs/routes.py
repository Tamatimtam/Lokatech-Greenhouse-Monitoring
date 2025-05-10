from flask import render_template, jsonify
from . import logs_bp
from ..decorators import isloggedin
# from . import firestore_logger # Will be used later

@logs_bp.route('/')
@isloggedin
def logs_page():
    """Render the logs page."""
    return render_template('logs.html')

@logs_bp.route('/data')
@isloggedin
def get_log_data():
    """Fetch log data (placeholder)."""
    # This will be implemented later to fetch data from Firestore
    return jsonify([]) # Return empty list for now
