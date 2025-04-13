import dataclasses
import requests
import time
import os
import re
import hashlib
import uuid
from functools import wraps
from dotenv import load_dotenv # Import dotenv
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash # More secure than plain SHA256
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField, IntegerField, HiddenField
from wtforms.validators import DataRequired, Length, EqualTo, Email, ValidationError # Added ValidationError

load_dotenv() # Load .env file BEFORE accessing variables

# --- Configuration ---
# Load from environment variables, .env file provides these if set
API_KEY = os.getenv("COMPETITION_API_KEY") # Keep placeholder as fallback
API_SERVER = os.getenv("API_SERVER", "https://llmailinject.azurewebsites.net") # Allow overriding server too
DATABASE_FILE = os.getenv("DATABASE_FILE", "app.db") # Allow overriding DB file name

# --- Flask App Setup ---
app = Flask(__name__)
# IMPORTANT: Load from .env or environment, raise error if missing
SECRET_KEY = os.getenv('FLASK_SECRET_KEY')
if not SECRET_KEY:
    raise ValueError("No Flask SECRET_KEY set. Please set it in .env or environment.")
app.config['SECRET_KEY'] = SECRET_KEY
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DATABASE_FILE}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- Database Setup ---
db = SQLAlchemy(app)

# --- Login Manager Setup ---
login_manager = LoginManager(app)
login_manager.login_view = 'login' # Route name for the login page
login_manager.login_message_category = 'info' # Flash message category

# --- Database Models ---
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False) # Increased length for hash
    is_admin = db.Column(db.Boolean, default=False, nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<User {self.username}>'

class RegistrationToken(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    is_used = db.Column(db.Boolean, default=False, nullable=False)
    uses_left = db.Column(db.Integer, default=1, nullable=False) # Allow multi-use tokens

    def __repr__(self):
        status = 'Used' if self.is_used else (f'{self.uses_left} uses left' if self.uses_left > 0 else 'Expired')
        return f'<Token {self.token[:8]}... ({status})>'


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id)) # Use db.session.get for primary key lookup


# --- Forms ---
class LoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    submit = SubmitField('Login')

class RegistrationForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired(), Length(min=4, max=80)])
    password = PasswordField('Password', validators=[DataRequired(), Length(min=6)])
    confirm_password = PasswordField('Confirm Password', validators=[DataRequired(), EqualTo('password', message='Passwords must match.')])
    registration_token = StringField('Registration Token', validators=[DataRequired()])
    submit = SubmitField('Register')

    def validate_username(self, username):
        user = User.query.filter_by(username=username.data).first()
        if user:
            raise ValidationError('Username already exists. Please choose a different one.')

    def validate_registration_token(self, registration_token):
        token_entry = RegistrationToken.query.filter_by(token=registration_token.data).first()
        if not token_entry or token_entry.is_used or token_entry.uses_left <= 0:
            raise ValidationError('Invalid or expired registration token.')

class PasswordChangeForm(FlaskForm):
    current_password = PasswordField('Current Password', validators=[DataRequired()])
    new_password = PasswordField('New Password', validators=[DataRequired(), Length(min=6)])
    confirm_new_password = PasswordField('Confirm New Password', validators=[DataRequired(), EqualTo('new_password', message='New passwords must match.')])
    submit = SubmitField('Change Password')

class TokenGenerationForm(FlaskForm):
    uses = IntegerField('Number of Uses', default=1, validators=[DataRequired()])
    submit = SubmitField('Generate Token')

# --- API Client Code ---

# Custom Exception for API Key issues
class APIKeyNotConfiguredError(Exception):
    pass

@dataclasses.dataclass
class Job:
    job_id: str
    team_id: str
    scenario: str
    subject: str
    body: str
    scheduled_time: str
    started_time: str|None = None
    completed_time: str|None = None
    output: str|None = None
    objectives: dict|None = None

    @property
    def is_completed(self):
        return self.completed_time is not None

@dataclasses.dataclass
class Team:
    team_id: str
    name: str
    members: list[str]
    score: int | None = 0
    solved_scenarios: list | None = None
    is_enabled: bool | None = None

class CompetitionClient:
    def __init__(self, api_key: str, api_server: str):
        # Store the key, even if it's the placeholder
        self.api_key = api_key
        self.api_server = api_server
        self.headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Accept': 'application/json; charset=utf-8',
            'Content-Type': 'application/json; charset=utf-8'
        }

    def _is_key_placeholder(self):
        return self.api_key == "YOUR_API_KEY_HERE"

    def _check_response_error(self, resp: requests.Response):
        """Raises an exception if the API response indicates an error."""
        if resp.ok:
            return
        try:
            error = resp.json()
            message = error.get('message', 'Unknown error')
            advice = error.get('advice', 'No advice provided')
            raise Exception(f"API Error ({resp.status_code}): {message} - {advice} (Trace ID: {error.get('trace_id', 'N/A')})")
        except requests.exceptions.JSONDecodeError:
            raise Exception(f"API Error ({resp.status_code}): {resp.text}")
        except Exception as e:
             raise Exception(f"API Error ({resp.status_code}): {resp.text} (Parsing error details failed: {e})")

    def create_job(self, scenario: str, subject: str, body: str) -> Job:
        """Submits a new job. Raises error if API key is placeholder."""
        if self._is_key_placeholder():
            raise APIKeyNotConfiguredError("Cannot create job: API Key is not configured.")
        payload = {'scenario': scenario, 'subject': subject, 'body': body}
        resp = requests.post(f"{self.api_server}/api/teams/mine/jobs", headers=self.headers, json=payload)
        self._check_response_error(resp)
        return Job(**resp.json())

    def get_job(self, job_id: str) -> Job | None:
        """Retrieves details for a specific job. Returns None if API key is placeholder."""
        if self._is_key_placeholder():
            return None # Indicate key is missing
        resp = requests.get(f"{self.api_server}/api/teams/mine/jobs/{job_id}", headers=self.headers)
        # Allow 404s to be handled gracefully in the route
        if resp.status_code == 404:
            return None
        self._check_response_error(resp)
        return Job(**resp.json())

    def list_jobs(self) -> list[Job]:
        """Lists jobs. Returns empty list if API key is placeholder."""
        if self._is_key_placeholder():
            return [] # Return empty list if key is missing
        resp = requests.get(f"{self.api_server}/api/teams/mine/jobs", headers=self.headers)
        self._check_response_error(resp)
        return [Job(**job_data) for job_data in resp.json()]

    def get_my_team(self) -> Team | None:
        """Gets team details. Returns None if API key is placeholder."""
        if self._is_key_placeholder():
            return None # Indicate key is missing
        resp = requests.get(f"{self.api_server}/api/teams/mine", headers=self.headers)
         # Allow 404s (e.g., key valid but no team registered) to be handled gracefully
        if resp.status_code == 404:
            return None
        self._check_response_error(resp)
        return Team(**resp.json())

    def update_my_team(self, members: list[str]) -> Team:
        """Updates team members. Raises error if API key is placeholder."""
        if self._is_key_placeholder():
            raise APIKeyNotConfiguredError("Cannot update team: API Key is not configured.")
        payload = {'members': members}
        resp = requests.patch(f"{self.api_server}/api/teams/mine", headers=self.headers, json=payload)
        self._check_response_error(resp)
        return Team(**resp.json())

# Initialize CompetitionClient directly
# The methods above will now handle the placeholder key internally
client = CompetitionClient(api_key=API_KEY, api_server=API_SERVER)

# --- Helper Function to Parse Scenarios ---
def get_scenarios_from_html(html_content: str) -> list[dict]:
    """Extracts scenario IDs and display names from the provided HTML snippet."""
    scenarios = []
    # Regex to find the text content inside the specific div elements
    pattern = r'<div data-v-e2c99c4a="" class="select-item">(.*?)<span class="tag'
    matches = re.findall(pattern, html_content)

    for display_name_full in matches:
        display_name = display_name_full.strip()
        # Derive the ID: Find first colon, take text before it,
        # convert to lowercase, remove spaces.
        match_id_part = re.match(r"^(.*?):", display_name)
        if match_id_part:
            scenario_id = match_id_part.group(1).lower().replace(" ", "")
            scenarios.append({'id': scenario_id, 'display': display_name})
        else:
            print(f"Warning: Could not derive ID from scenario display name: {display_name}")
            # Optionally append with a dummy/display name as ID, or skip
            # scenarios.append({'id': display_name, 'display': display_name})

    return scenarios

# Load scenarios at startup
try:
    with open("jobs.html", "r", encoding="utf-8") as f:
        jobs_html_content = f.read()
    AVAILABLE_SCENARIOS = get_scenarios_from_html(jobs_html_content)
except FileNotFoundError:
    print("Warning: jobs.html not found. Scenario list will be empty.")
    AVAILABLE_SCENARIOS = []
except Exception as e:
    print(f"Warning: Failed to parse jobs.html: {e}")
    AVAILABLE_SCENARIOS = []

# --- Authentication Routes ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data).first()
        if user and user.check_password(form.password.data):
            login_user(user)
            flash('Logged in successfully.', 'success')
            next_page = request.args.get('next')
            return redirect(next_page) if next_page else redirect(url_for('index'))
        else:
            flash('Login Unsuccessful. Please check username and password', 'danger')
    return render_template('login.html', title='Login', form=form)

@app.route('/logout')
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    form = RegistrationForm()
    if form.validate_on_submit():
        token_entry = RegistrationToken.query.filter_by(token=form.registration_token.data).first()
        # Double-check token validity (already done in form validator, but good practice)
        if not token_entry or token_entry.is_used or token_entry.uses_left <= 0:
            flash('Invalid or expired registration token.', 'danger')
            return render_template('register.html', title='Register', form=form)

        # Create new user
        user = User(username=form.username.data)
        user.set_password(form.password.data)
        # First user registered automatically becomes admin
        if User.query.count() == 0:
            user.is_admin = True
            flash('Admin account created successfully!', 'success')
        else:
             user.is_admin = False # Ensure non-first users are not admin by default

        # Update token usage
        token_entry.uses_left -= 1
        if token_entry.uses_left <= 0:
             token_entry.is_used = True # Mark as fully used if uses reach 0


        try:
            db.session.add(user)
            db.session.commit()
            flash(f'Account created for {form.username.data}! You can now log in.', 'success')
            return redirect(url_for('login'))
        except Exception as e:
            db.session.rollback()
            flash(f'An error occurred during registration: {e}', 'danger')

    return render_template('register.html', title='Register', form=form)

@app.route('/change_password', methods=['GET', 'POST'])
@login_required
def change_password():
    form = PasswordChangeForm()
    if form.validate_on_submit():
        # Verify current password
        if current_user.check_password(form.current_password.data):
            # Set new password
            current_user.set_password(form.new_password.data)
            db.session.commit()
            flash('Your password has been updated!', 'success')
            return redirect(url_for('index')) # Or redirect to a profile page if you add one
        else:
            flash('Incorrect current password.', 'danger')
    return render_template('change_password.html', title='Change Password', form=form)

# --- Core Application Routes ---
@app.route('/')
@login_required
def index():
    """Main page: Create job form and team details."""
    team_details = None
    api_error = None
    if client._is_key_placeholder():
        flash("API Key not configured. API features (jobs, team details) are disabled.", "warning")
    else:
        try:
            team_details = client.get_my_team()
            if team_details is None:
                 flash("Could not fetch API team details. Is the API Key valid and associated with a team?", "info")
        except Exception as e:
            api_error = f"Failed to fetch team details from API: {e}"
            flash(api_error, 'danger')

    return render_template('index.html', scenarios=AVAILABLE_SCENARIOS, team=team_details, api_error=api_error, client=client)

@app.route('/create_job', methods=['POST'])
@login_required
def create_job_route():
    """Handles new job submission via API. Returns JSON."""
    scenario = request.form.get('scenario')
    subject = request.form.get('subject')
    body = request.form.get('body')

    if not all([scenario, subject, body]):
        # Return JSON error for validation
        return jsonify({'error': 'Scenario, Subject, and Body are required.'}), 400

    # Check if the submitted scenario ID exists in our list of known scenario IDs
    known_scenario_ids = [s['id'] for s in AVAILABLE_SCENARIOS]
    if scenario not in known_scenario_ids and AVAILABLE_SCENARIOS:
         # Log this warning server-side if needed, flashing won't work
         app.logger.warning(f"Submitted scenario ID '{scenario}' was not found in the list derived from jobs.html.")

    try:
        job = client.create_job(scenario=scenario, subject=subject, body=body)
        # Return JSON on success
        return jsonify({'job_id': job.job_id, 'status': 'processing'}), 200
    except APIKeyNotConfiguredError as e:
        app.logger.error(f"API Key error during job creation: {e}")
        return jsonify({'error': str(e)}), 503 # Service Unavailable
    except Exception as e:
        app.logger.error(f"Exception during job creation: {e}")
        return jsonify({'error': f"Error creating job via API: {e}"}), 500

@app.route('/job/<job_id>')
@login_required
def get_job_route(job_id):
    """Displays details for a specific job from API."""
    job = None
    api_error = None
    if client._is_key_placeholder():
        flash("API Key not configured. Cannot fetch job details.", "warning")
    else:
        try:
            job = client.get_job(job_id=job_id)
            if job is None:
                flash(f"Job '{job_id}' not found or API key is invalid.", 'warning')
                # Optionally redirect, or let template handle job=None
                # return redirect(url_for('list_jobs_route'))
        except Exception as e:
            api_error = f"Error fetching job {job_id} from API: {e}"
            flash(api_error, 'danger')
            # return redirect(url_for('list_jobs_route')) # Redirect on error?

    # Render template even if job is None or error occurred, let template decide display
    return render_template('job_details.html', job=job, api_error=api_error)

@app.route('/jobs')
@login_required
def list_jobs_route():
    """Displays a list of all jobs for the team from API."""
    jobs = []
    api_error = None
    if client._is_key_placeholder():
         flash("API Key not configured. Cannot list jobs.", "warning")
    else:
        try:
            jobs = client.list_jobs()
            jobs.sort(key=lambda j: j.scheduled_time, reverse=True)
        except Exception as e:
            api_error = f"Error listing jobs from API: {e}"
            flash(api_error, 'danger')

    return render_template('job_list.html', jobs=jobs, api_error=api_error)

@app.route('/team')
@login_required
def get_team_route():
    """Displays the current team details from API and allows updates."""
    team = None
    api_error = None
    if client._is_key_placeholder():
        flash("API Key not configured. Cannot fetch team details.", "warning")
    else:
        try:
            team = client.get_my_team()
            if team is None:
                 flash("Could not fetch API team details. Is the API Key valid and associated with a team?", "info")
        except Exception as e:
            api_error = f"Error fetching team details from API: {e}"
            flash(api_error, 'danger')

    # Pass team and error status to template
    return render_template('team_details.html', team=team, api_error=api_error, api_key_missing=client._is_key_placeholder())

@app.route('/update_team', methods=['POST'])
@login_required
def update_team_route():
    """Handles updating team members via API."""
    members_str = request.form.get('members')
    if not members_str:
        flash('Members list cannot be empty.', 'error')
        return redirect(url_for('get_team_route'))

    members = [m.strip() for m in members_str.split(',') if m.strip()]
    if not members:
        flash('At least one member username is required.', 'error')
        return redirect(url_for('get_team_route'))

    try:
        team = client.update_my_team(members=members)
        flash(f"Team '{team.name}' members updated successfully via API.", 'success')
    except APIKeyNotConfiguredError as e:
        flash(str(e), 'danger')
    except Exception as e:
        flash(f"Error updating team via API: {e}", 'danger')
    return redirect(url_for('get_team_route'))

# --- Admin Routes ---

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            flash("Admin access required for this page.", "warning")
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/admin')
@login_required
@admin_required
def admin_dashboard():
    return render_template('admin/dashboard.html', title='Admin Dashboard')

@app.route('/admin/users')
@login_required
@admin_required
def admin_users():
    users = User.query.all()
    return render_template('admin/users.html', title='Manage Users', users=users)

@app.route('/admin/tokens')
@login_required
@admin_required
def admin_tokens():
    form = TokenGenerationForm()
    tokens = RegistrationToken.query.order_by(RegistrationToken.id.desc()).all()
    return render_template('admin/tokens.html', title='Manage Tokens', tokens=tokens, form=form)

@app.route('/admin/generate_token', methods=['POST'])
@login_required
@admin_required
def generate_token():
    form = TokenGenerationForm() # Process the submitted form
    if form.validate_on_submit():
        uses = form.uses.data
        if uses <= 0:
            flash('Number of uses must be positive.', 'warning')
        else:
            token = RegistrationToken(uses_left=uses)
            db.session.add(token)
            db.session.commit()
            flash(f'New registration token generated: {token.token}', 'success')
    else:
        flash('Invalid input for token generation.', 'error')
    return redirect(url_for('admin_tokens'))

@app.route('/admin/delete_token/<int:token_id>', methods=['POST'])
@login_required
@admin_required
def delete_token(token_id):
     token = db.session.get(RegistrationToken, token_id)
     if token:
         db.session.delete(token)
         db.session.commit()
         flash(f'Token {token.token[:8]}... deleted.', 'success')
     else:
         flash('Token not found.', 'error')
     return redirect(url_for('admin_tokens'))

# --- API Endpoint for Job Status Polling ---
@app.route('/job_status/<job_id>')
@login_required
def job_status_route(job_id):
    """API endpoint to check job status (for AJAX polling)."""
    if client._is_key_placeholder():
         return jsonify({'error': 'API Key not configured.'}), 403 # Use 403 Forbidden

    try:
        job = client.get_job(job_id=job_id)
        if job is None:
             # Could be job not found or API key invalid
             return jsonify({'error': f'Job {job_id} not found or API access denied.'}), 404

        return jsonify({
            'completed': job.is_completed,
            'output': job.output,
            'objectives': job.objectives,
            'error': None
        })
    except Exception as e:
         # Catch other potential API errors
         return jsonify({'error': str(e)}), 500

# --- Initialization and Run ---
def initialize_database():
    # Get the absolute path for clarity
    db_path = os.path.abspath(DATABASE_FILE)
    print(f"Initializing database (checking path: {db_path})...")

    if not os.path.exists(db_path):
        print(f"Database file '{db_path}' not found, creating...")
        with app.app_context(): # Ensure operations are within app context
            db.create_all()
        print("Database created.")
    else:
        print(f"Database file '{db_path}' exists.")
        # Ensure all tables exist even if file exists
        with app.app_context(): # Ensure operations are within app context
            db.create_all()
        print("Ensured all tables are created.")

    # Create first admin user if no users exist
    with app.app_context(): # Ensure DB operations are within app context
        if User.query.count() == 0:
            print("No users found. Creating default admin user.")
            print("IMPORTANT: Please change the default admin password immediately after login.")
            admin_user = User(username='admin', is_admin=True)
            # Use a more secure default password, but still recommend changing it.
            default_admin_pass = os.getenv('DEFAULT_ADMIN_PASSWORD', 'changeme123')
            admin_user.set_password(default_admin_pass)
            db.session.add(admin_user)
            # Create a default token for the admin to register if needed
            first_token = RegistrationToken(uses_left=1)
            db.session.add(first_token)
            db.session.commit()
            print(f"Default admin user 'admin' created with password '{default_admin_pass}'.")
            print(f"A registration token has been created: {first_token.token}")
        else:
            print("Users found in database.")

if __name__ == '__main__':
    from wtforms.validators import ValidationError # Needed for RegistrationForm validator

    # Create database tables within app context if they don't exist
    # Moved initialization logic into the function called below
    initialize_database()

    # Ensure static and templates dirs exist
    if not os.path.exists('templates'): os.makedirs('templates')
    if not os.path.exists('static'): os.makedirs('static')
    if not os.path.exists('templates/admin'): os.makedirs('templates/admin')

    app.run(debug=True) 