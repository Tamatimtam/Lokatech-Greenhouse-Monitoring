from flask import render_template, session
from . import bp
from ..decorators import isloggedin
from ..sensor.mqtt import sensor_manager
import logging

logger = logging.getLogger(__name__)

@bp.route("/")
@isloggedin
def dashboard():
    logger.debug(f"Serving dashboard for user: {session['user']['email']}")
    sensor_data = sensor_manager.get_data()
    return render_template("dashboard.html", user=session['user'], sensor_data=sensor_data)
