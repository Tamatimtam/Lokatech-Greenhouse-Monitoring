from flask import render_template, session, request, jsonify
from . import bp
from ..decorators import isloggedin
# Import the global sensor_manager to access MQTT data for comparison with optimal ranges
from ..sensor.mqtt import sensor_manager
import logging
import json

logger = logging.getLogger(__name__)

# Define plant data with optimal growing conditions
PLANT_DATA = {
    'bayam': {
        'name': 'Bayam',
        'scientific_name': 'Amaranthus spp.',
        'description': 'Bayam adalah sayuran hijau yang kaya akan nutrisi, termasuk zat besi, kalsium, dan vitamin A, C, dan K. Sangat baik untuk pertumbuhan dan menjaga kesehatan tubuh.',
        'growing_time': '21-30 hari',
        'optimal_conditions': {
            'temperature': {'min': 25, 'max': 30, 'unit': '°C', 'label_min': 'Rendah', 'label_max': 'Tinggi'},
            'humidity': {'min': 60, 'max': 80, 'unit': '%', 'label_min': 'Rendah', 'label_max': 'Tinggi'},
            'light': {'min': 10000, 'max': 25000, 'unit': 'lux', 'label_min': 'Rendah', 'label_max': 'Tinggi'},
        },
        'image': 'bayam.jpg'
    },
    'kale': {
        'name': 'Kale',
        'scientific_name': 'Brassica oleracea var. sabellica',
        'description': 'Kale adalah sayuran superfood yang kaya akan vitamin A, C, dan K, serta antioksidan. Memiliki rasa yang sedikit pahit namun sangat bermanfaat untuk kesehatan.',
        'growing_time': '55-75 hari',
        'optimal_conditions': {
            'temperature': {'min': 15, 'max': 20, 'unit': '°C', 'label_min': 'Rendah', 'label_max': 'Tinggi'},
            'humidity': {'min': 50, 'max': 70, 'unit': '%', 'label_min': 'Rendah', 'label_max': 'Tinggi'},
            'light': {'min': 8000, 'max': 18000, 'unit': 'lux', 'label_min': 'Rendah', 'label_max': 'Tinggi'},
        },
        'image': 'kale.jpg'
    }
}

@bp.route("/")
@isloggedin
def plants_page():
    """Route for rendering the plants growing guide page"""
    logger.debug(f"Serving plants page for user: {session['user']['email']}")
    # Get current sensor data for comparison with optimal ranges
    current_data = sensor_manager.get_data()
    return render_template("plants.html", user=session['user'], sensor_data=current_data)

@bp.route("/<plant_id>")
@isloggedin
def plant_detail(plant_id):
    """Route for rendering a specific plant detail page"""
    if plant_id not in PLANT_DATA:
        logger.warning(f"User {session['user']['email']} requested non-existent plant: {plant_id}")
        return render_template("plants.html", user=session['user'], error="Tanaman tidak ditemukan")
    
    # Get current sensor data for comparison with optimal ranges
    current_data = sensor_manager.get_data()
    
    logger.debug(f"Serving plant detail page for {plant_id} to user: {session['user']['email']}")
    return render_template(
        "plant_detail.html", 
        user=session['user'], 
        plant=PLANT_DATA[plant_id], 
        plant_id=plant_id,
        sensor_data=current_data
    )

# We've removed the old controls API endpoint as it's no longer needed for the plants feature
