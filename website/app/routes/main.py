from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from flask_login import login_required, current_user
import re
import os

from app.utils.api_client import client, APIKeyNotConfiguredError
from app.utils.scenario_parser import get_scenarios_from_html

main_bp = Blueprint('main', __name__)

# Load scenarios at blueprint initialization
try:
    with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "jobs.html"), "r", encoding="utf-8") as f:
        jobs_html_content = f.read()
    AVAILABLE_SCENARIOS = get_scenarios_from_html(jobs_html_content)
except FileNotFoundError:
    print("Warning: jobs.html not found. Scenario list will be empty.")
    AVAILABLE_SCENARIOS = []
except Exception as e:
    print(f"Warning: Failed to parse jobs.html: {e}")
    AVAILABLE_SCENARIOS = []

@main_bp.route('/')
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

@main_bp.route('/create_job', methods=['POST'])
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
         print(f"Submitted scenario ID '{scenario}' was not found in the list derived from jobs.html.")

    try:
        job = client.create_job(scenario=scenario, subject=subject, body=body)
        # Return JSON on success
        return jsonify({'job_id': job.job_id, 'status': 'processing'}), 200
    except APIKeyNotConfiguredError as e:
        print(f"API Key error during job creation: {e}")
        return jsonify({'error': str(e)}), 503 # Service Unavailable
    except Exception as e:
        print(f"Exception during job creation: {e}")
        return jsonify({'error': f"Error creating job via API: {e}"}), 500

@main_bp.route('/job/<job_id>')
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
        except Exception as e:
            api_error = f"Error fetching job {job_id} from API: {e}"
            flash(api_error, 'danger')

    return render_template('job_details.html', job=job, api_error=api_error)

@main_bp.route('/jobs')
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

@main_bp.route('/team')
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

@main_bp.route('/update_team', methods=['POST'])
@login_required
def update_team_route():
    """Handles updating team members via API."""
    members_str = request.form.get('members')
    if not members_str:
        flash('Members list cannot be empty.', 'error')
        return redirect(url_for('main.get_team_route'))

    members = [m.strip() for m in members_str.split(',') if m.strip()]
    if not members:
        flash('At least one member username is required.', 'error')
        return redirect(url_for('main.get_team_route'))

    try:
        team = client.update_my_team(members=members)
        flash(f"Team '{team.name}' members updated successfully via API.", 'success')
    except APIKeyNotConfiguredError as e:
        flash(str(e), 'danger')
    except Exception as e:
        flash(f"Error updating team via API: {e}", 'danger')
    return redirect(url_for('main.get_team_route'))

@main_bp.route('/job_status/<job_id>')
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