from flask import render_template, session
from . import bp
from ..decorators import isloggedin
import logging

logger = logging.getLogger(__name__)

@bp.route("/")
@isloggedin
def controls():
    logger.debug(f"Serving controls page for user: {session['user']['email']}")
    return render_template("controls.html", user=session['user'])
