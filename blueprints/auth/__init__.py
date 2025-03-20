from flask import Blueprint

bp = Blueprint('auth', __name__, url_prefix='/auth')

from . import routes  # Import routes after blueprint creation to avoid circular imports