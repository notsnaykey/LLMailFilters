// --- Constants ---
const PROFILE_STORAGE_KEY = 'jobProfiles';
// const PROFILE_SIDEBAR_ID = 'profile-sidebar'; // Removed
// const PROFILE_LIST_ID = 'profile-list'; // Replaced
// const PROFILE_TOGGLE_BTN_ID = 'profile-sidebar-toggle'; // Removed
// const MAIN_CONTENT_ID = 'main-content'; // Removed (not needed for this logic)
const PROFILE_DROPDOWN_CONTAINER_ID = 'profile-dropdown-container'; // New
const PROFILE_DROPDOWN_TOGGLE_ID = 'profile-dropdown-toggle'; // New
const PROFILE_DROPDOWN_MENU_ID = 'profile-dropdown-menu'; // New
const PROFILE_DROPDOWN_LIST_ID = 'profile-dropdown-list'; // New
const SAVE_MODAL_ID = 'save-profile-modal'; // New
const PROFILE_NAME_INPUT_ID = 'profile-name-input'; // New
const MODAL_SAVE_BTN_ID = 'modal-save-btn'; // New
const MODAL_CANCEL_BTN_ID = 'modal-cancel-btn'; // New

const SCENARIO_FIELD_ID = 'scenario';
const SUBJECT_FIELD_ID = 'subject';
const BODY_FIELD_ID = 'body';
const SAVE_PROFILE_BTN_ID = 'save-profile-btn';

// --- DOM Elements ---
// let profileSidebar = null; // Removed
let profileList = null; // Will point to dropdown list now
// let profileToggleBtn = null; // Removed
// let mainContent = null; // Removed
let profileDropdownContainer = null; // New
let profileDropdownToggle = null; // New
let profileDropdownMenu = null; // New
let saveModal = null; // New
let profileNameInput = null; // New
let modalSaveBtn = null; // New
let modalCancelBtn = null; // New

let scenarioSelect = null;
let subjectInput = null;
let bodyTextarea = null;
let saveProfileBtn = null;

// --- Helper Functions ---

/**
 * Gets all saved profiles from localStorage.
 * @returns {object} An object where keys are profile names and values are profile data.
 */
function getProfiles() {
    try {
        const profiles = localStorage.getItem(PROFILE_STORAGE_KEY);
        return profiles ? JSON.parse(profiles) : {};
    } catch (e) {
        console.error("Error reading profiles from localStorage:", e);
        return {};
    }
}

/**
 * Saves a specific profile to localStorage.
 * @param {string} name - The name of the profile.
 * @param {object} data - The profile data (scenario, subject, body).
 */
function saveProfile(name, data) {
    const profiles = getProfiles();
    profiles[name] = data;
    try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
        console.log(`Profile '${name}' saved.`);
        return true;
    } catch (e) {
        console.error(`Error saving profile '${name}':`, e);
        alert("Error saving profile. LocalStorage might be full or disabled.");
        return false;
    }
}

/**
 * Deletes a profile from localStorage.
 * @param {string} name - The name of the profile to delete.
 */
async function deleteProfile(name) {
    // Use custom confirmation
    const confirmed = await showConfirmation(`Are you sure you want to delete the profile "${name}"?`, 'Delete Profile');
    if (!confirmed) {
        console.log(`Deletion of profile '${name}' cancelled.`);
        return false;
    }

    const profiles = getProfiles();
    if (profiles[name]) {
        delete profiles[name];
        try {
            localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
            console.log(`Profile '${name}' deleted.`);
            showNotification(`Profile "${name}" deleted.`, 'info');
            return true;
        } catch (e) {
            console.error(`Error deleting profile '${name}':`, e);
            showNotification("Error deleting profile.", 'error');
            return false;
        }
    }
    return false;
}

/**
 * Loads profile data into the form fields.
 * @param {string} name - The name of the profile to load.
 */
function loadProfileIntoForm(name) {
    const profiles = getProfiles();
    const profileData = profiles[name];

    if (!profileData) {
        console.warn(`Profile '${name}' not found for loading.`);
        return;
    }

    if (scenarioSelect) {
        scenarioSelect.value = profileData.scenario || '';
    }
    if (subjectInput) {
        subjectInput.value = profileData.subject || '';
    }
    if (bodyTextarea) {
        bodyTextarea.value = profileData.body || '';
    }
    console.log(`Profile '${name}' loaded into form.`);
    // Close dropdown after loading
    closeProfileDropdown();
}

/**
 * Populates the profile list in the dropdown menu.
 */
function populateProfileList() {
    if (!profileList) return;

    const profiles = getProfiles();
    const profileNames = Object.keys(profiles).sort();

    profileList.innerHTML = ''; // Clear existing list

    if (profileNames.length === 0) {
        profileList.innerHTML = '<p class="no-profiles">No profiles saved yet.</p>';
        return;
    }

    profileNames.forEach(name => {
        // Create list items suitable for a dropdown
        const listItem = document.createElement('div');
        listItem.className = 'profile-dropdown-item'; // Use dropdown item class

        const loadBtn = document.createElement('button');
        loadBtn.className = 'profile-load-btn';
        loadBtn.textContent = name;
        loadBtn.title = `Load profile: ${name}`;
        loadBtn.onclick = () => loadProfileIntoForm(name);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'profile-delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.title = `Delete profile: ${name}`;
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            // Use custom confirmation (already handled inside deleteProfile)
            if (await deleteProfile(name)) {
                populateProfileList();
            }
        };

        listItem.appendChild(loadBtn);
        listItem.appendChild(deleteBtn);
        profileList.appendChild(listItem);
    });
}

/**
 * Toggles the visibility of the profile dropdown menu.
 */
function toggleProfileDropdown() {
    if (profileDropdownMenu) {
        let isDisplayed = profileDropdownMenu.style.display === 'block';
        profileDropdownMenu.style.display = isDisplayed ? 'none' : 'block';
        // Toggle arrow direction
        const arrow = profileDropdownToggle.querySelector('.arrow');
        if (arrow) {
            arrow.innerHTML = isDisplayed ? '&#9662;' : '&#9652;'; // Down/Up arrow
        }
    }
}

/**
 * Closes the profile dropdown menu.
 */
function closeProfileDropdown() {
    if (profileDropdownMenu) {
        profileDropdownMenu.style.display = 'none';
        const arrow = profileDropdownToggle.querySelector('.arrow');
        if (arrow) {
            arrow.innerHTML = '&#9662;'; // Reset to Down arrow
        }
    }
}

/**
 * Shows the custom save profile modal.
 */
function showSaveProfileModal() {
    if (saveModal && profileNameInput) {
        profileNameInput.value = '';
        saveModal.style.display = 'flex';
        profileNameInput.focus();
    }
}

/**
 * Hides the custom save profile modal.
 */
function hideSaveProfileModal() {
    if (saveModal) {
        saveModal.style.display = 'none';
    }
}

/**
 * Handles the click event for the main "Save as Profile" button.
 */
function handleSaveProfileClick() {
    const currentScenario = scenarioSelect ? scenarioSelect.value : '';
    const currentSubject = subjectInput ? subjectInput.value : '';
    const currentBody = bodyTextarea ? bodyTextarea.value : '';

    if (!currentScenario && !currentSubject && !currentBody) {
        showNotification("Nothing to save. Please select a scenario or enter subject/body.", 'warning');
        return;
    }
    showSaveProfileModal();
}

/**
 * Handles the actual profile saving from the modal context.
 */
async function saveProfileFromModal() {
    const profileName = profileNameInput ? profileNameInput.value.trim() : '';
    if (!profileName) {
        showNotification("Please enter a name for the profile.", 'warning');
        profileNameInput.focus();
        return;
    }

    const profiles = getProfiles();
    if (profiles[profileName]) {
        const confirmed = await showConfirmation(`A profile named "${profileName}" already exists. Overwrite it?`, 'Overwrite Profile');
        if (!confirmed) {
            console.log("Profile overwrite cancelled.");
            return;
        }
    }

    const profileData = {
        scenario: scenarioSelect ? scenarioSelect.value : '',
        subject: subjectInput ? subjectInput.value : '',
        body: bodyTextarea ? bodyTextarea.value : ''
    };

    if (saveProfile(profileName, profileData)) {
        populateProfileList();
        hideSaveProfileModal();
        showNotification(`Profile "${profileName}" saved!`, 'success');
    } else {
        showNotification("Failed to save profile.", 'error');
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Profiles.js DOMContentLoaded"); // Log script start

    // Assign NEW DOM elements
    profileList = document.getElementById(PROFILE_DROPDOWN_LIST_ID);
    profileDropdownContainer = document.getElementById(PROFILE_DROPDOWN_CONTAINER_ID);
    profileDropdownToggle = document.getElementById(PROFILE_DROPDOWN_TOGGLE_ID);
    profileDropdownMenu = document.getElementById(PROFILE_DROPDOWN_MENU_ID);
    scenarioSelect = document.getElementById(SCENARIO_FIELD_ID);
    subjectInput = document.getElementById(SUBJECT_FIELD_ID);
    bodyTextarea = document.getElementById(BODY_FIELD_ID);
    saveProfileBtn = document.getElementById(SAVE_PROFILE_BTN_ID);
    saveModal = document.getElementById(SAVE_MODAL_ID);
    profileNameInput = document.getElementById(PROFILE_NAME_INPUT_ID);
    modalSaveBtn = document.getElementById(MODAL_SAVE_BTN_ID);
    modalCancelBtn = document.getElementById(MODAL_CANCEL_BTN_ID);

    // Log found elements (or null if not found)
    console.log({ profileList, profileDropdownToggle, saveProfileBtn, saveModal, profileNameInput });

    // Populate initial profile list if element exists
    if (profileList) {
        console.log("Populating profile list...");
        populateProfileList();
    }

    // Add event listeners if elements exist
    if (profileDropdownToggle) {
        profileDropdownToggle.addEventListener('click', toggleProfileDropdown);
    } else {
        console.warn("Profile dropdown toggle button not found");
    }

    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', handleSaveProfileClick);
        console.log("Save Profile button listener attached.");
    } else {
        console.warn("Save Profile button not found");
    }

    // Add Modal Button Listeners
    if (modalSaveBtn) {
        modalSaveBtn.addEventListener('click', saveProfileFromModal);
    } else {
        console.warn("Modal Save button not found");
    }
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', hideSaveProfileModal);
    } else {
        console.warn("Modal Cancel button not found");
    }

    // Add listener to close dropdown when clicking outside
    if (profileDropdownContainer) {
        document.addEventListener('click', function(event) {
            if (!profileDropdownContainer.contains(event.target)) {
                closeProfileDropdown();
            }
        });
    }
    
    // Add listener to close modal when clicking overlay
    if (saveModal) {
        saveModal.addEventListener('click', function(event) {
            if (event.target === saveModal) {
                hideSaveProfileModal();
            }
        });
    }
}); 