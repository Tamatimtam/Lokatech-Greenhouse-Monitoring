from flask import Blueprint

bp = Blueprint('plants', __name__, url_prefix='/plants')

from . import routes