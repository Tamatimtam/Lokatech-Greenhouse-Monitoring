from flask import Blueprint

bp = Blueprint('sensor', __name__, url_prefix='/api/sensor')

from . import routes
from . import mqtt  # Import MQTT handling module