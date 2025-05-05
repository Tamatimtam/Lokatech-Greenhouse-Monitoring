from flask import Blueprint, render_template, request, jsonify
from datetime import datetime, timedelta
from blueprints.decorators import isloggedin
from .firestore import get_historical_data, get_latest_data

# Create a blueprint for history routes
history = Blueprint('history', __name__, url_prefix='/history')

@history.route('/')
@isloggedin
def history_page():
    """Render the history page template"""
    return render_template('history.html')

@history.route('/data')
@isloggedin
def history_data():
    """API endpoint to get historical data"""
    # Get query parameters
    section = request.args.get('section', None)
    days = int(request.args.get('days', 7))
    data_type = request.args.get('type', None)
    
    # Get data from Firestore
    data = get_historical_data(section=section, days=days, data_type=data_type)
    
    return jsonify({
        'success': True,
        'data': data
    })

@history.route('/latest')
@isloggedin
def latest_data():
    """API endpoint to get most recent data"""
    data = get_latest_data()
    
    if data:
        return jsonify({
            'success': True,
            'data': data
        })
    else:
        return jsonify({
            'success': False,
            'message': 'No data available'
        }), 404