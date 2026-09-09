from flask import redirect, session
from . import simulation_bp
from blueprints.decorators import isloggedin

@simulation_bp.route('/')
@isloggedin
def index():
    return redirect('/dashboard')
