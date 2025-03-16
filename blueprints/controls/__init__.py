from flask import Blueprint

bp = Blueprint('controls', __name__, url_prefix='/controls')

from . import routes