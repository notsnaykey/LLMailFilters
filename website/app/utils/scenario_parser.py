import re

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