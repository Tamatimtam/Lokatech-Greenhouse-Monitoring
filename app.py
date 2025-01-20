from flask import Flask, render_template, session, redirect, request
import firebase_admin
from firebase_admin import credentials, auth
from functools import wraps
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'  # Change this to a real secret key

# Initialize Firebase
cred = credentials.Certificate("codenameamber-7b92a-firebase-adminsdk-fbsvc-91917bcd0a.json")
firebase_admin.initialize_app(cred)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return redirect('/')
        return f(*args, **kwargs)
    return decorated_function

@app.route('/')
def home():
    return render_template('login.html')

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html', user=session['user'])

@app.route('/login', methods=['POST'])
def login():
    id_token = request.json['idToken']
    try:
        user = auth.verify_id_token(id_token)
        session['user'] = {
            'email': user['email'],
            'name': user.get('name', 'User'),
            'picture': user.get('picture', 'default_avatar.png')
        }
        return {'status': 'success'}
    except:
        return {'status': 'error'}, 400

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/')

if __name__ == '__main__':
    app.run(debug=True, port=4321, host='0.0.0.0')