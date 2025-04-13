import dataclasses
import requests
import os

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
    started_time: str | None = None
    completed_time: str | None = None
    output: str | None = None
    objectives: dict | None = None

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
    def __init__(self, api_key=None, api_server=None):
        # Get from parameters or environment variables
        self.api_key = api_key or os.getenv("COMPETITION_API_KEY", "YOUR_API_KEY_HERE")
        self.api_server = api_server or os.getenv("API_SERVER", "https://llmailinject.azurewebsites.net")
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

# Create a singleton instance
client = CompetitionClient()