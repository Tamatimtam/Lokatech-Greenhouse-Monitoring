from flask import Blueprint

simulation_bp = Blueprint('simulation', __name__, url_prefix='/simulation')

from . import routes
