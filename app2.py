from flask import Flask, render_template, session, redirect, request    #For flask stuff
import firebase_admin                                                   #
from firebase_admin import credentials, auth                            #creds for init, auth
from functools import wraps
import secrets  # Adding this to generate a random key
import os


#INIT FLASK
app = Flask(__name__)
app.secret_key = secrets.token_hex(16)  # This creates a 32-character random hex string
port = int(os.environ.get('PORT', 4443))

#INIT FIREBASE
local_path = os.path.join(os.path.dirname(__file__), "secrets", "firebase-credentials.json")
cloud_path = "/secrets/firebase-credentials.json"
credentials_path = local_path if os.path.exists(local_path) else cloud_path
cred = credentials.Certificate(credentials_path)
firebase_admin.initialize_app(cred)

def isloggedin(f):
    @wraps(f)
    def dummy(*args, **kwargs):
        if 'user' not in session:
            return redirect("/")
        return f(*args, **kwargs)
    return dummy

@app.route("/")
def index():
    return render_template("login.html")

@app.route("/dashboard")
@isloggedin
def dashboard():
    return render_template("dashboard.html", user=session['user'])

@app.route("/login", methods=["POST"])
def login():
    id_token = request.json['idToken']
    try:
        google_user = auth.verify_id_token(id_token)
        session['user'] = {
            'email' : google_user['email'],
            'name' : google_user.get('name', google_user['email'].split('@')[0]),
            'picture': google_user.get('picture', 'default_avatar.png')
        }
        return {'status':'success'}
    except:
        return {'status' : 'error', 'message': 'Invalid credentials'}, 400
    
@app.route("/logout")
def logout():
    session.clear()
    return redirect("/")

if __name__ == '__main__':
    app.run(debug=True, port=port, host='0.0.0.0')