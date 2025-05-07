from flask import Blueprint

bp = Blueprint('auth', __name__, url_prefix='/auth')

from . import routes  # This line is crucial. It imports routes.py from the current package.