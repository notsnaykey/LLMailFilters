// --- Constants ---
const TAGS_STORAGE_KEY = 'jobTags'; // For localStorage
const JOB_TAGS_STORAGE_KEY = 'jobTagsMapping'; // For localStorage
const JOB_CACHE_KEY = 'jobDataCache'; // For storing job bodies/content

// --- State Variables ---
let allJobs = []; // Will hold all jobs from the page
let jobDataCache = {}; // Will hold job body content
let activeFilters = {
    scenario: 'all',
    status: 'all',
    objective: 'all',
    objectiveStatus: 'any',
    subject: '',
    tags: []
};
let activeSorting = 'date-desc';
let referenceJobId = null; // For similarity comparison
let selectedJobsForComparison = new Set(); // For multi-job comparison

// --- DOM Elements ---
let jobListContainer;
let scenarioFilterSelect;
let statusFilterSelect;
let objectiveFilterSelect;
let objectiveStatusSelect;
let subjectSearchInput;
let tagsContainer;
let sortBySelect;
let applyFiltersBtn;
let resetFiltersBtn;
let manageTagsBtn;
let tagModal;
let newTagInput;
let allTagsContainer;
let tagModalCloseBtn;
let similarityModal;
let referenceJobsList;
let similarityModalCloseBtn;
let compareBtn;
let comparisonModal;

// --- Utility Functions ---

/**
 * Loads cached job data from localStorage
 */
function loadJobCache() {
    try {
        const cachedData = localStorage.getItem(JOB_CACHE_KEY);
        return cachedData ? JSON.parse(cachedData) : {};
    } catch (e) {
        console.error('Error loading job cache:', e);
        return {};
    }
}

/**
 * Saves job data to localStorage cache
 */
function saveJobCache(jobId, data) {
    try {
        const cache = loadJobCache();
        cache[jobId] = data;
        localStorage.setItem(JOB_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.error('Error saving job cache:', e);
    }
}

/**
 * Extracts job data from DOM elements and builds a structured job object
 */
function extractJobData() {
    const jobElements = document.querySelectorAll('.job-box');
    const jobs = [];
    jobDataCache = loadJobCache();

    jobElements.forEach(jobElement => {
        // Extract job ID from the "View Details" link
        const detailsLink = jobElement.querySelector('a[href*="/job/"]');
        const jobId = detailsLink ? detailsLink.href.split('/').pop() : null;
        
        if (!jobId) return; // Skip if no job ID found
        
        // Extract basic job info
        const scenario = jobElement.querySelector('.job-scenario')?.textContent.trim() || '';
        const subject = jobElement.querySelector('.job-subject')?.textContent.trim() || '';
        
        // Extract date
        const dateElement = jobElement.querySelector('.job-time');
        const dateText = dateElement ? dateElement.textContent.trim() : '';
        const dateIso = dateElement ? dateElement.getAttribute('data-iso-date') : '';
        
        // Determine status
        const isProcessing = jobElement.classList.contains('status-processing');
        const isSuccess = jobElement.classList.contains('status-success');
        const isFailed = jobElement.classList.contains('status-failed');
        
        // Extract objectives
        const failedObjectives = Array.from(
            jobElement.querySelectorAll('.failed-objective')
        ).map(el => el.textContent.trim());
        
        const succeededObjectives = Array.from(
            jobElement.querySelectorAll('.succeeded-objective')
        ).map(el => el.textContent.trim());
        
        // Build a structured job object
        const job = {
            id: jobId,
            element: jobElement, // Store reference to DOM element
            scenario: scenario,
            subject: subject,
            dateText: dateText,
            dateIso: dateIso,
            status: isProcessing ? 'processing' : (isSuccess ? 'success' : (isFailed ? 'failed' : 'unknown')),
            failedObjectives: failedObjectives,
            succeededObjectives: succeededObjectives,
            allObjectives: [...failedObjectives, ...succeededObjectives],
            successRate: succeededObjectives.length / (failedObjectives.length + succeededObjectives.length) || 0,
            tags: getJobTags(jobId),
            // Cache may contain body content if we've fetched it before
            body: jobDataCache[jobId] ? jobDataCache[jobId].body : null
        };
        
        jobs.push(job);
    });
    
    return jobs;
}

/**
 * Fetches a job's full details from the server
 * @param {string} jobId - The ID of the job to fetch
 * @returns {Promise<object>} - Promise resolving to the job data
 */
async function fetchJobDetails(jobId) {
    try {
        // Check cache first
        if (jobDataCache[jobId]) {
            return jobDataCache[jobId];
        }
        
        // Fetch from server
        const response = await fetch(`/job/${jobId}`);
        if (!response.ok) {
            throw new Error(`Error fetching job: ${response.status}`);
        }
        
        const html = await response.text();
        
        // Create a DOM parser
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Extract job body from the job details page
        const bodyContent = doc.querySelector('#job-body-content');
        
        if (!bodyContent) {
            throw new Error('Could not find job body content');
        }
        
        const jobData = {
            body: bodyContent.textContent
        };
        
        // Save to cache
        saveJobCache(jobId, jobData);
        return jobData;
    } catch (error) {
        console.error(`Error fetching job ${jobId}:`, error);
        return null;
    }
}

/**
 * Tags System Functions
 */
function getAllTags() {
    try {
        const tagsJson = localStorage.getItem(TAGS_STORAGE_KEY);
        return tagsJson ? JSON.parse(tagsJson) : [];
    } catch (e) {
        console.error('Error loading tags:', e);
        return [];
    }
}

function saveAllTags(tags) {
    try {
        localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags));
    } catch (e) {
        console.error('Error saving tags:', e);
    }
}

function getJobTagsMapping() {
    try {
        const mappingJson = localStorage.getItem(JOB_TAGS_STORAGE_KEY);
        return mappingJson ? JSON.parse(mappingJson) : {};
    } catch (e) {
        console.error('Error loading job tags mapping:', e);
        return {};
    }
}

function saveJobTagsMapping(mapping) {
    try {
        localStorage.setItem(JOB_TAGS_STORAGE_KEY, JSON.stringify(mapping));
    } catch (e) {
        console.error('Error saving job tags mapping:', e);
    }
}

function getJobTags(jobId) {
    const mapping = getJobTagsMapping();
    return mapping[jobId] || [];
}

function addTagToJob(jobId, tag) {
    const mapping = getJobTagsMapping();
    if (!mapping[jobId]) {
        mapping[jobId] = [];
    }
    if (!mapping[jobId].includes(tag)) {
        mapping[jobId].push(tag);
        saveJobTagsMapping(mapping);
    }
}

function removeTagFromJob(jobId, tag) {
    const mapping = getJobTagsMapping();
    if (mapping[jobId]) {
        mapping[jobId] = mapping[jobId].filter(t => t !== tag);
        saveJobTagsMapping(mapping);
    }
}

function createNewTag(tagName) {
    if (!tagName.trim()) return;
    
    const allTags = getAllTags();
    if (!allTags.includes(tagName)) {
        allTags.push(tagName);
        saveAllTags(allTags);
        refreshTagDisplay();
    }
}

function deleteTag(tagName) {
    const allTags = getAllTags();
    const updatedTags = allTags.filter(tag => tag !== tagName);
    saveAllTags(updatedTags);
    
    // Also remove this tag from all jobs
    const mapping = getJobTagsMapping();
    for (const jobId in mapping) {
        mapping[jobId] = mapping[jobId].filter(tag => tag !== tagName);
    }
    saveJobTagsMapping(mapping);
    
    // Update filter if active
    if (activeFilters.tags.includes(tagName)) {
        activeFilters.tags = activeFilters.tags.filter(tag => tag !== tagName);
    }
    
    refreshTagDisplay();
}

/**
 * Filtering Functions
 */
function filterJobs() {
    allJobs.forEach(job => {
        const isVisible = 
            filterByScenario(job) && 
            filterByStatus(job) && 
            filterByObjective(job) &&
            filterBySubject(job) &&
            filterByTags(job);
        
        job.element.style.display = isVisible ? '' : 'none';
    });
}

function filterByScenario(job) {
    return activeFilters.scenario === 'all' || job.scenario === activeFilters.scenario;
}

function filterByStatus(job) {
    return activeFilters.status === 'all' || job.status === activeFilters.status;
}

function filterByObjective(job) {
    if (activeFilters.objective === 'all') return true;
    
    if (activeFilters.objectiveStatus === 'success') {
        return job.succeededObjectives.includes(activeFilters.objective);
    } else if (activeFilters.objectiveStatus === 'failed') {
        return job.failedObjectives.includes(activeFilters.objective);
    } else {
        // 'any' status - check if objective exists in either list
        return job.allObjectives.includes(activeFilters.objective);
    }
}

function filterBySubject(job) {
    if (!activeFilters.subject) return true;
    
    const searchTerm = activeFilters.subject.toLowerCase();
    return job.subject.toLowerCase().includes(searchTerm);
}

function filterByTags(job) {
    if (activeFilters.tags.length === 0) return true;
    
    // Return true if job has ANY of the selected tags
    return activeFilters.tags.some(tag => job.tags.includes(tag));
}

/**
 * Sorting Functions
 */
function sortJobs() {
    const sortedJobs = [...allJobs].sort((a, b) => {
        switch (activeSorting) {
            case 'date-desc':
                return new Date(b.dateIso) - new Date(a.dateIso);
            case 'date-asc':
                return new Date(a.dateIso) - new Date(b.dateIso);
            case 'scenario':
                return a.scenario.localeCompare(b.scenario);
            case 'success-rate':
                return b.successRate - a.successRate;
            case 'similarity':
                if (!referenceJobId) return 0;
                const refJob = allJobs.find(job => job.id === referenceJobId);
                if (!refJob) return 0;
                return calculateSimilarity(b, refJob) - calculateSimilarity(a, refJob);
            default:
                return 0;
        }
    });
    
    // Reorder elements in the DOM
    const parent = jobListContainer;
    sortedJobs.forEach(job => {
        parent.appendChild(job.element);
    });
}

/**
 * Text Similarity Functions
 */
function calculateSimilarity(job1, job2) {
    // Simple similarity based on scenario and objectives
    let score = 0;
    
    // Scenario match
    if (job1.scenario === job2.scenario) {
        score += 2;
    }
    
    // Subject similarity (very basic)
    const subject1Words = job1.subject.toLowerCase().split(/\s+/);
    const subject2Words = job2.subject.toLowerCase().split(/\s+/);
    const commonWords = subject1Words.filter(word => subject2Words.includes(word));
    score += commonWords.length / Math.max(subject1Words.length, subject2Words.length);
    
    // Objectives similarity
    const job1SucceededSet = new Set(job1.succeededObjectives);
    const job2SucceededSet = new Set(job2.succeededObjectives);
    const job1FailedSet = new Set(job1.failedObjectives);
    const job2FailedSet = new Set(job2.failedObjectives);
    
    // Count matches in succeeded objectives
    let succeededMatches = 0;
    job1SucceededSet.forEach(obj => {
        if (job2SucceededSet.has(obj)) succeededMatches++;
    });
    
    // Count matches in failed objectives
    let failedMatches = 0;
    job1FailedSet.forEach(obj => {
        if (job2FailedSet.has(obj)) failedMatches++;
    });
    
    // Add to score
    score += (succeededMatches + failedMatches) / 
             (job1.allObjectives.length + job2.allObjectives.length) * 2;
    
    return score; // Higher score means more similar
}

function showSimilarityModal() {
    if (similarityModal) {
        populateReferenceJobsList();
        similarityModal.style.display = 'flex';
    }
}

function populateReferenceJobsList() {
    if (!referenceJobsList) return;
    
    referenceJobsList.innerHTML = '';
    
    allJobs.forEach(job => {
        const jobItem = document.createElement('div');
        jobItem.className = 'reference-job-item';
        jobItem.innerHTML = `
            <strong>${job.scenario}</strong>
            <span>${job.subject}</span>
            <span class="ref-job-date">${job.dateText}</span>
        `;
        
        jobItem.addEventListener('click', () => {
            referenceJobId = job.id;
            similarityModal.style.display = 'none';
            activeSorting = 'similarity';
            sortBySelect.value = 'similarity';
            applyFiltersAndSort();
        });
        
        referenceJobsList.appendChild(jobItem);
    });
}

/**
 * UI Update Functions
 */
function populateScenarioFilter() {
    if (!scenarioFilterSelect) return;
    
    // Get unique scenarios
    const scenarios = [...new Set(allJobs.map(job => job.scenario))];
    
    // Clear existing options (except the first one)
    while (scenarioFilterSelect.options.length > 1) {
        scenarioFilterSelect.remove(1);
    }
    
    // Add new options
    scenarios.forEach(scenario => {
        const option = document.createElement('option');
        option.value = scenario;
        option.textContent = scenario;
        scenarioFilterSelect.appendChild(option);
    });
}

function populateObjectiveFilter() {
    if (!objectiveFilterSelect) return;
    
    // Get unique objectives from all jobs
    const objectives = new Set();
    allJobs.forEach(job => {
        job.allObjectives.forEach(obj => objectives.add(obj));
    });
    
    // Clear existing options (except the first one)
    while (objectiveFilterSelect.options.length > 1) {
        objectiveFilterSelect.remove(1);
    }
    
    // Add new options
    Array.from(objectives).sort().forEach(objective => {
        const option = document.createElement('option');
        option.value = objective;
        option.textContent = objective;
        objectiveFilterSelect.appendChild(option);
    });
}

function refreshTagDisplay() {
    if (!tagsContainer || !allTagsContainer) return;
    
    const allTags = getAllTags();
    
    // Update tags filter
    tagsContainer.innerHTML = '';
    
    allTags.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.className = `tag-item ${activeFilters.tags.includes(tag) ? 'active' : ''}`;
        tagElement.textContent = tag;
        tagElement.addEventListener('click', () => {
            // Toggle tag in filters
            if (activeFilters.tags.includes(tag)) {
                activeFilters.tags = activeFilters.tags.filter(t => t !== tag);
                tagElement.classList.remove('active');
            } else {
                activeFilters.tags.push(tag);
                tagElement.classList.add('active');
            }
            applyFiltersAndSort();
        });
        tagsContainer.appendChild(tagElement);
    });
    
    // Update all tags in modal
    allTagsContainer.innerHTML = '';
    
    allTags.forEach(tag => {
        const tagElement = document.createElement('div');
        tagElement.className = 'tag-manager-item';
        
        const tagLabel = document.createElement('span');
        tagLabel.textContent = tag;
        tagElement.appendChild(tagLabel);
        
        const tagActions = document.createElement('div');
        tagActions.className = 'tag-actions';
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tag-delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', () => deleteTag(tag));
        tagActions.appendChild(deleteBtn);
        
        tagElement.appendChild(tagActions);
        allTagsContainer.appendChild(tagElement);
    });
    
    // Also refresh job tag display
    refreshJobTagDisplay();
}

function refreshJobTagDisplay() {
    // Add tag displays to each job card
    allJobs.forEach(job => {
        // Remove existing tag display if any
        const existingTagDisplay = job.element.querySelector('.job-tags-display');
        if (existingTagDisplay) {
            existingTagDisplay.remove();
        }
        
        // Get current job tags
        const jobTags = getJobTags(job.id);
        
        // Skip if no tags
        if (jobTags.length === 0) return;
        
        // Create new tag display
        const tagDisplay = document.createElement('div');
        tagDisplay.className = 'job-tags-display';
        
        jobTags.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.className = 'job-tag';
            tagElement.textContent = tag;
            tagDisplay.appendChild(tagElement);
        });
        
        // Add to job card (after header)
        const header = job.element.querySelector('.job-box-header');
        if (header) {
            header.after(tagDisplay);
        }
    });
}

function showTagModal() {
    if (tagModal) {
        tagModal.style.display = 'flex';
    }
}

function applyFiltersAndSort() {
    filterJobs();
    sortJobs();
}

function resetFilters() {
    activeFilters = {
        scenario: 'all',
        status: 'all',
        objective: 'all',
        objectiveStatus: 'any',
        subject: '',
        tags: []
    };
    
    // Reset UI
    if (scenarioFilterSelect) scenarioFilterSelect.value = 'all';
    if (statusFilterSelect) statusFilterSelect.value = 'all';
    if (objectiveFilterSelect) objectiveFilterSelect.value = 'all';
    if (objectiveStatusSelect) objectiveStatusSelect.value = 'any';
    if (subjectSearchInput) subjectSearchInput.value = '';
    
    // Reset sorting
    activeSorting = 'date-desc';
    if (sortBySelect) sortBySelect.value = 'date-desc';
    
    // Clear tags
    refreshTagDisplay();
    
    // Apply changes
    applyFiltersAndSort();
}

/**
 * Copy job content to clipboard
 */
async function copyJobContent(jobId) {
    try {
        // Find the job in our array
        const job = allJobs.find(j => j.id === jobId);
        if (!job) throw new Error('Job not found');
        
        // If we don't have the body content yet, fetch it
        if (!job.body) {
            const jobData = await fetchJobDetails(jobId);
            if (!jobData) throw new Error('Failed to fetch job details');
            job.body = jobData.body;
        }
        
        // Copy to clipboard
        await navigator.clipboard.writeText(job.body);
        
        // Show success notification
        showNotification('Prompt copied to clipboard!', 'success');
        return true;
    } catch (error) {
        console.error('Error copying job content:', error);
        showNotification('Failed to copy prompt: ' + error.message, 'error');
        return false;
    }
}

/**
 * Show a notification message
 */
function showNotification(message, type = 'info', duration = 3000) {
    // Check if the notifications.js is loaded and the function exists
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type, duration);
    } else {
        // Simple fallback if the global function isn't available
        alert(message);
    }
}

// --- Job-specific Tag Management ---
// --- Replace the addJobTagsManagement function with this improved version ---

function addJobTagsManagement() {
    console.log("Setting up job tag management UI");
    
    // For each job, add tag management dropdown
    allJobs.forEach(job => {
        const actionsContainer = job.element.querySelector('.job-box-actions');
        if (!actionsContainer) return;
        
        // Create tag button if it doesn't exist
        let tagButton = job.element.querySelector('.job-tag-btn');
        if (!tagButton) {
            console.log(`Creating tag button for job ${job.id}`);
            
            tagButton = document.createElement('button');
            tagButton.className = 'btn btn-sm btn-secondary job-tag-btn';
            tagButton.innerHTML = '<i class="fas fa-tag"></i>';
            tagButton.title = 'Manage tags';
            
            // Insert before the View Details button
            const viewDetailsBtn = actionsContainer.querySelector('a.btn');
            if (viewDetailsBtn) {
                actionsContainer.insertBefore(tagButton, viewDetailsBtn);
            } else {
                actionsContainer.appendChild(tagButton);
            }
            
            // Remove any existing popup for this job (cleanup)
            const existingPopup = document.querySelector(`.job-tag-popup[data-job-id="${job.id}"]`);
            if (existingPopup) {
                existingPopup.remove();
            }
            
            // Create a new tag popup and add it to the BODY (not job element)
            // This prevents positioning and z-index issues
            const tagPopup = document.createElement('div');
            tagPopup.className = 'job-tag-popup';
            tagPopup.setAttribute('data-job-id', job.id);
            tagPopup.style.display = 'none';
            document.body.appendChild(tagPopup);
            
            // Add available tags
            const allTags = getAllTags();
            const jobTags = getJobTags(job.id);
            
            // Create tag items
            createTagPopupContent(tagPopup, job.id);
            
            // Toggle popup visibility
            tagButton.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                console.log(`Tag button clicked for job ${job.id}`);
                
                // Close all other popups first
                document.querySelectorAll('.job-tag-popup').forEach(popup => {
                    if (popup.getAttribute('data-job-id') !== job.id) {
                        popup.style.display = 'none';
                    }
                });
                
                const isCurrentlyVisible = tagPopup.style.display === 'block';
                
                if (isCurrentlyVisible) {
                    // Hide the popup
                    tagPopup.style.display = 'none';
                    console.log(`Hiding popup for job ${job.id}`);
                } else {
                    // Show the popup and position it
                    const buttonRect = tagButton.getBoundingClientRect();
                    tagPopup.style.top = `${buttonRect.bottom + window.scrollY}px`;
                    tagPopup.style.left = `${buttonRect.left + window.scrollX}px`;
                    tagPopup.style.display = 'block';
                    
                    // Update tag list
                    createTagPopupContent(tagPopup, job.id);
                    console.log(`Showing popup for job ${job.id}`);
                }
            });
        }
        
        // Add copy button if it doesn't exist
        let copyButton = job.element.querySelector('.job-copy-btn');
        if (!copyButton) {
            copyButton = document.createElement('button');
            copyButton.className = 'btn btn-sm btn-info job-copy-btn';
            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
            copyButton.title = 'Copy prompt';
            
            // Insert after tag button
            const tagBtn = actionsContainer.querySelector('.job-tag-btn');
            if (tagBtn) {
                actionsContainer.insertBefore(copyButton, tagBtn.nextSibling);
            } else {
                const viewDetailsBtn = actionsContainer.querySelector('a.btn');
                if (viewDetailsBtn) {
                    actionsContainer.insertBefore(copyButton, viewDetailsBtn);
                } else {
                    actionsContainer.appendChild(copyButton);
                }
            }
            
            // Add click event
            copyButton.addEventListener('click', () => {
                copyJobContent(job.id);
            });
        }
        
        // Add compare checkbox if it doesn't exist
        let compareCheckbox = job.element.querySelector('.job-compare-checkbox');
        if (!compareCheckbox) {
            const compareContainer = document.createElement('div');
            compareContainer.className = 'job-compare-container';
            
            compareCheckbox = document.createElement('input');
            compareCheckbox.type = 'checkbox';
            compareCheckbox.className = 'job-compare-checkbox';
            compareCheckbox.id = `compare-${job.id}`;
            compareCheckbox.title = 'Select for comparison';
            
            const compareLabel = document.createElement('label');
            compareLabel.htmlFor = compareCheckbox.id;
            compareLabel.textContent = 'Compare';
            compareLabel.className = 'job-compare-label';
            
            compareContainer.appendChild(compareCheckbox);
            compareContainer.appendChild(compareLabel);
            
            // Insert at the beginning of actions
            if (actionsContainer.firstChild) {
                actionsContainer.insertBefore(compareContainer, actionsContainer.firstChild);
            } else {
                actionsContainer.appendChild(compareContainer);
            }
            
            // Add change event
            compareCheckbox.addEventListener('change', () => {
                if (compareCheckbox.checked) {
                    selectedJobsForComparison.add(job.id);
                } else {
                    selectedJobsForComparison.delete(job.id);
                }
                updateCompareButtonState();
            });
        }
    });
    
    // Add the compare button to the top of the job list
    if (!compareBtn) {
        compareBtn = document.createElement('button');
        compareBtn.id = 'compare-selected-btn';
        compareBtn.className = 'btn btn-primary compare-selected-btn';
        compareBtn.textContent = 'Compare Selected Prompts';
        compareBtn.disabled = true;
        compareBtn.addEventListener('click', showComparisonModal);
        
        // Insert before the job list
        if (jobListContainer) {
            jobListContainer.parentNode.insertBefore(compareBtn, jobListContainer);
        }
    }
}

// --- Add this new helper function ---

function createTagPopupContent(popup, jobId) {
    // Clear existing content
    popup.innerHTML = '';
    
    // Get tags data
    const allTags = getAllTags();
    const jobTags = getJobTags(jobId);
    
    if (allTags.length === 0) {
        // No tags defined yet
        const noTagsMsg = document.createElement('div');
        noTagsMsg.className = 'no-tags-message';
        noTagsMsg.textContent = 'No tags defined. Click "Manage All Tags" to create some.';
        popup.appendChild(noTagsMsg);
    } else {
        // Create tag items
        allTags.forEach(tag => {
            const tagItem = document.createElement('div');
            tagItem.className = 'job-tag-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = jobTags.includes(tag);
            checkbox.id = `tag-${jobId}-${tag.replace(/\s+/g, '-')}`;
            
            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = tag;
            
            tagItem.appendChild(checkbox);
            tagItem.appendChild(label);
            
            // Add event listener to checkbox
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                if (checkbox.checked) {
                    addTagToJob(jobId, tag);
                } else {
                    removeTagFromJob(jobId, tag);
                }
                // Update the job's tags array
                const jobObj = allJobs.find(job => job.id === jobId);
                if (jobObj) jobObj.tags = getJobTags(jobId);
                
                refreshJobTagDisplay();
            });
            
            popup.appendChild(tagItem);
        });
    }
    
    // Add button to show full tag manager
    const manageAllBtn = document.createElement('button');
    manageAllBtn.className = 'btn btn-sm btn-secondary';
    manageAllBtn.textContent = 'Manage All Tags';
    manageAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showTagModal();
        popup.style.display = 'none';
    });
    popup.appendChild(manageAllBtn);
}

function updateCompareButtonState() {
    if (compareBtn) {
        // Enable button if 2 or more jobs are selected
        compareBtn.disabled = selectedJobsForComparison.size < 2;
    }
}

function refreshTagPopup(popup, jobId) {
    const allTags = getAllTags();
    const jobTags = getJobTags(jobId);
    
    // Remove existing tag items
    const existingItems = popup.querySelectorAll('.job-tag-item');
    existingItems.forEach(item => item.remove());
    
    // Get the manage button (last element)
    const manageBtn = popup.querySelector('button');
    
    // Create tag items
    allTags.forEach(tag => {
        const tagItem = document.createElement('div');
        tagItem.className = 'job-tag-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = jobTags.includes(tag);
        checkbox.id = `tag-${jobId}-${tag.replace(/\s+/g, '-')}`;
        
        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = tag;
        
        tagItem.appendChild(checkbox);
        tagItem.appendChild(label);
        
        // Add event listener to checkbox
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                addTagToJob(jobId, tag);
            } else {
                removeTagFromJob(jobId, tag);
            }
            refreshJobTagDisplay();
        });
        
        // Insert before the manage button
        if (manageBtn) {
            popup.insertBefore(tagItem, manageBtn);
        } else {
            popup.appendChild(tagItem);
        }
    });
}

/**
 * Multi-Job Comparison Functions
 */
async function showComparisonModal() {
    if (selectedJobsForComparison.size < 2) {
        showNotification('Please select at least 2 jobs to compare', 'warning');
        return;
    }
    
    // Create comparison modal if it doesn't exist
    if (!comparisonModal) {
        comparisonModal = document.createElement('div');
        comparisonModal.id = 'comparison-modal';
        comparisonModal.className = 'modal-overlay';
        comparisonModal.innerHTML = `
            <div class="modal-box comparison-modal-box">
                <h3>Prompt Comparison</h3>
                <div id="comparison-content" class="comparison-content">
                    <div class="comparison-loading">Loading job content...</div>
                </div>
                <div class="comparison-actions">
                    <button id="comparison-close-btn" class="btn btn-secondary">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(comparisonModal);
        
        // Add close button event
        document.getElementById('comparison-close-btn').addEventListener('click', () => {
            comparisonModal.style.display = 'none';
        });
        
        // Close when clicking outside
        comparisonModal.addEventListener('click', (e) => {
            if (e.target === comparisonModal) {
                comparisonModal.style.display = 'none';
            }
        });
    }
    
    // Show the modal
    comparisonModal.style.display = 'flex';
    
    // Get the content container
    const contentContainer = document.getElementById('comparison-content');
    contentContainer.innerHTML = '<div class="comparison-loading">Loading job content...</div>';
    
    // Load job data and perform comparison
    await performComparisonAnalysis(contentContainer);
}

async function performComparisonAnalysis(container) {
    try {
        // Get selected jobs
        const selectedJobs = allJobs.filter(job => selectedJobsForComparison.has(job.id));
        
        // Fetch full job data for each selected job
        for (const job of selectedJobs) {
            if (!job.body) {
                const jobData = await fetchJobDetails(job.id);
                if (jobData) {
                    job.body = jobData.body;
                }
            }
        }
        
        // Build comparison content
        let comparisonHtml = '<div class="comparison-header">';
        
        // Create tabs for different comparison views
        comparisonHtml += `
            <div class="comparison-tabs">
                <button class="comparison-tab active" data-view="side-by-side">Side by Side</button>
                <button class="comparison-tab" data-view="similarity">Similarity Analysis</button>
                <button class="comparison-tab" data-view="difference">Difference Highlight</button>
            </div>
        `;
        comparisonHtml += '</div>';
        
        // Create comparison content container
        comparisonHtml += '<div class="comparison-body">';
        
        // Side by side view (default)
        comparisonHtml += '<div class="comparison-view side-by-side-view" style="display:block;">';
        comparisonHtml += '<div class="side-by-side-container">';
        
        selectedJobs.forEach(job => {
            comparisonHtml += `
                <div class="job-column">
                    <div class="job-column-header">
                        <div class="job-column-title">${job.scenario}</div>
                        <div class="job-column-subtitle">${job.subject}</div>
                    </div>
                    <pre class="job-column-body">${job.body || 'Content not available'}</pre>
                </div>
            `;
        });
        
        comparisonHtml += '</div>'; // End side-by-side-container
        comparisonHtml += '</div>'; // End side-by-side-view
        
        // Similarity analysis view
        comparisonHtml += '<div class="comparison-view similarity-view" style="display:none;">';
        comparisonHtml += '<table class="similarity-table">';
        comparisonHtml += '<thead><tr><th>Job</th>';
        
        // Headers
        selectedJobs.forEach(job => {
            comparisonHtml += `<th>${job.scenario} (${job.dateText})</th>`;
        });
        comparisonHtml += '</tr></thead>';
        
        // Body
        comparisonHtml += '<tbody>';
        selectedJobs.forEach(job1 => {
            comparisonHtml += `<tr><td>${job1.scenario} (${job1.dateText})</td>`;
            
            selectedJobs.forEach(job2 => {
                const similarity = calculateSimilarity(job1, job2);
                const similarityPercent = Math.round((similarity / 5) * 100); // Normalize to percentage
                
                // Color code: higher similarity = more green
                const colorClass = similarityPercent > 80 ? 'very-similar' : 
                                  (similarityPercent > 60 ? 'similar' : 
                                  (similarityPercent > 40 ? 'somewhat-similar' : 
                                  (similarityPercent > 20 ? 'less-similar' : 'not-similar')));
                
                comparisonHtml += `<td class="similarity-cell ${colorClass}">${similarityPercent}%</td>`;
            });
            
            comparisonHtml += '</tr>';
        });
        comparisonHtml += '</tbody></table>';
        
        // Add detailed similarity notes
        comparisonHtml += '<div class="similarity-notes">';
        comparisonHtml += '<h4>Similarity Analysis</h4>';
        comparisonHtml += '<ul>';
        
        // Compare each pair of jobs
        for (let i = 0; i < selectedJobs.length; i++) {
            for (let j = i + 1; j < selectedJobs.length; j++) {
                const job1 = selectedJobs[i];
                const job2 = selectedJobs[j];
                
                comparisonHtml += `<li><strong>${job1.scenario} vs ${job2.scenario}</strong>: `;
                
                // Compare objectives
                const commonSucceeded = job1.succeededObjectives.filter(obj => job2.succeededObjectives.includes(obj));
                const commonFailed = job1.failedObjectives.filter(obj => job2.failedObjectives.includes(obj));
                
                if (commonSucceeded.length > 0) {
                    comparisonHtml += `Both succeeded in: ${commonSucceeded.join(', ')}. `;
                }
                
                if (commonFailed.length > 0) {
                    comparisonHtml += `Both failed in: ${commonFailed.join(', ')}. `;
                }
                
                // Compare subject words
                const words1 = job1.subject.toLowerCase().split(/\s+/);
                const words2 = job2.subject.toLowerCase().split(/\s+/);
                const commonWords = words1.filter(word => words2.includes(word));
                
                if (commonWords.length > 0) {
                    comparisonHtml += `Common subject terms: ${commonWords.join(', ')}. `;
                }
                
                // Overall similarity
                const similarity = calculateSimilarity(job1, job2);
                const similarityPercent = Math.round((similarity / 5) * 100);
                comparisonHtml += `<span class="overall-similarity">Overall similarity: ${similarityPercent}%</span>`;
                
                comparisonHtml += '</li>';
            }
        }
        
        comparisonHtml += '</ul>';
        comparisonHtml += '</div>'; // End similarity-notes
        comparisonHtml += '</div>'; // End similarity-view
        
        // Difference highlight view - IMPROVED VERSION
        comparisonHtml += '<div class="comparison-view difference-view" style="display:none;">';
        
        // If we have exactly 2 jobs, show a direct diff with our improved algorithm
        if (selectedJobs.length === 2) {
            // Create a legend to explain the highlighting
            comparisonHtml += `
                <div class="diff-legend">
                    <div class="diff-legend-item">
                        <div class="diff-legend-color unchanged"></div>
                        <span>Identical content</span>
                    </div>
                    <div class="diff-legend-item">
                        <div class="diff-legend-color partial"></div>
                        <span>Similar content with small differences</span>
                    </div>
                    <div class="diff-legend-item">
                        <div class="diff-legend-color different"></div>
                        <span>Different content</span>
                    </div>
                </div>
            `;
            
            const diffResult = highlightDifferences(selectedJobs[0].body || '', selectedJobs[1].body || '');
            
            comparisonHtml += `
                <div class="diff-container">
                    <div class="diff-header">
                        <div class="diff-title">${selectedJobs[0].scenario}</div>
                        <div class="diff-title">${selectedJobs[1].scenario}</div>
                    </div>
                    <div class="diff-content">
                        <div class="diff-column">${diffResult.text1}</div>
                        <div class="diff-column">${diffResult.text2}</div>
                    </div>
                </div>
            `;
            
            // Generate a semantic difference summary for more high-level understanding
            comparisonHtml += `
                <div class="semantic-diff-summary">
                    <h4>Key Structural Differences</h4>
                    ${generateSemanticDiffSummary(selectedJobs[0].body || '', selectedJobs[1].body || '')}
                </div>
            `;
            
        } else {
            comparisonHtml += '<p>Detailed difference highlighting is available when comparing exactly 2 prompts.</p>';
            
            // For 3+ jobs, just list some high-level differences
            comparisonHtml += '<div class="multi-diff-container">';
            
            // Compare unique words across all prompts
            const allWords = new Map(); // word -> array of job indices that contain it
            
            selectedJobs.forEach((job, index) => {
                if (job.body) {
                    const words = job.body.toLowerCase().split(/\W+/).filter(w => w.length > 3);
                    words.forEach(word => {
                        if (!allWords.has(word)) {
                            allWords.set(word, []);
                        }
                        if (!allWords.get(word).includes(index)) {
                            allWords.get(word).push(index);
                        }
                    });
                }
            });
            
            // Find words unique to each prompt
            comparisonHtml += '<h4>Unique Keywords by Prompt</h4>';
            
            selectedJobs.forEach((job, index) => {
                comparisonHtml += `<h5>${job.scenario}</h5><ul class="unique-words-list">`;
                
                // Find words that only appear in this job
                const uniqueWords = [];
                allWords.forEach((indices, word) => {
                    if (indices.length === 1 && indices[0] === index) {
                        uniqueWords.push(word);
                    }
                });
                
                // Sort by length (longer words first) and limit to 20
                uniqueWords.sort((a, b) => b.length - a.length).slice(0, 20).forEach(word => {
                    comparisonHtml += `<li>${word}</li>`;
                });
                
                comparisonHtml += '</ul>';
            });
            
            comparisonHtml += '</div>'; // End multi-diff-container
        }
        
        comparisonHtml += '</div>'; // End difference-view
        
        comparisonHtml += '</div>'; // End comparison-body
        
        // Set the HTML
        container.innerHTML = comparisonHtml;
        
        // Add tab switching functionality
        const tabs = container.querySelectorAll('.comparison-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Show corresponding view
                const viewName = tab.getAttribute('data-view');
                container.querySelectorAll('.comparison-view').forEach(view => {
                    view.style.display = 'none';
                });
                container.querySelector(`.${viewName}-view`).style.display = 'block';
            });
        });
        
    } catch (error) {
        console.error('Error performing comparison:', error);
        container.innerHTML = `<div class="comparison-error">Error: ${error.message}</div>`;
    }
}

/**
 * Generates a semantic difference summary between two pieces of text
 * Focuses on structure, key points, and important differences
 */
function generateSemanticDiffSummary(text1, text2) {
    try {
        // Split into sentences
        const sentences1 = splitIntoSentences(text1);
        const sentences2 = splitIntoSentences(text2);
        
        // Identify structural parts (headers, steps, etc)
        const structures1 = identifyStructures(sentences1);
        const structures2 = identifyStructures(sentences2);
        
        let summary = '<ul class="semantic-diff-list">';
        
        // Compare structure counts
        if (structures1.steps.length !== structures2.steps.length) {
            summary += `<li>Prompt 1 has ${structures1.steps.length} numbered steps while Prompt 2 has ${structures2.steps.length}.</li>`;
        }
        
        // Compare instruction emphasis
        const emphasis1 = countEmphasisPatterns(text1);
        const emphasis2 = countEmphasisPatterns(text2);
        
        if (emphasis1 !== emphasis2) {
            summary += `<li>Prompt 1 uses ${emphasis1} emphasized terms (**bold** or UPPERCASE) while Prompt 2 uses ${emphasis2}.</li>`;
        }
        
        // Check for specific instruction differences
        const requireKeywords = ['must', 'required', 'need to', 'critical', 'important'];
        const req1 = countKeywordOccurrences(text1.toLowerCase(), requireKeywords);
        const req2 = countKeywordOccurrences(text2.toLowerCase(), requireKeywords);
        
        if (Math.abs(req1 - req2) > 2) {
            summary += `<li>Prompt ${req1 > req2 ? '1' : '2'} puts more emphasis on requirements (${Math.max(req1, req2)} vs ${Math.min(req1, req2)} instances).</li>`;
        }
        
        // Check for JSON format differences
        const json1 = text1.includes('JSON');
        const json2 = text2.includes('JSON');
        
        if (json1 !== json2) {
            summary += `<li>Only Prompt ${json1 ? '1' : '2'} explicitly mentions JSON formatting.</li>`;
        }
        
        // Look for specific keywords differences
        const uniqueWords1 = findUniqueSignificantWords(text1, text2);
        const uniqueWords2 = findUniqueSignificantWords(text2, text1);
        
        if (uniqueWords1.length > 0) {
            summary += `<li>Unique significant terms in Prompt 1: ${uniqueWords1.slice(0, 5).join(', ')}${uniqueWords1.length > 5 ? '...' : ''}</li>`;
        }
        
        if (uniqueWords2.length > 0) {
            summary += `<li>Unique significant terms in Prompt 2: ${uniqueWords2.slice(0, 5).join(', ')}${uniqueWords2.length > 5 ? '...' : ''}</li>`;
        }
        
        // If no significant differences found
        if (summary === '<ul class="semantic-diff-list">') {
            summary += '<li>The prompts are structurally very similar with only minor wording differences.</li>';
        }
        
        summary += '</ul>';
        return summary;
    } catch (error) {
        console.error('Error generating semantic diff summary:', error);
        return '<p>Error analyzing differences.</p>';
    }
}

/**
 * Counts occurrences of emphasis patterns like **text** or UPPERCASE
 */
function countEmphasisPatterns(text) {
    const boldCount = (text.match(/\*\*[^*]+\*\*/g) || []).length;
    const uppercaseCount = (text.match(/\b[A-Z]{4,}\b/g) || []).length;
    return boldCount + uppercaseCount;
}

/**
 * Counts occurrences of keywords in text
 */
function countKeywordOccurrences(text, keywords) {
    let count = 0;
    keywords.forEach(keyword => {
        const regex = new RegExp('\\b' + keyword + '\\b', 'gi');
        const matches = text.match(regex);
        if (matches) {
            count += matches.length;
        }
    });
    return count;
}

/**
 * Finds unique significant words in text1 that don't appear in text2
 */
function findUniqueSignificantWords(text1, text2) {
    // Tokenize both texts
    const tokens1 = tokenize(text1.toLowerCase());
    const tokens2 = tokenize(text2.toLowerCase());
    
    // Convert to sets
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    
    // Find words in set1 but not in set2
    const uniqueWords = [];
    set1.forEach(word => {
        if (!set2.has(word) && word.length > 4) { // Only include significant words
            uniqueWords.push(word);
        }
    });
    
    return uniqueWords;
}

/**
 * Identifies structural elements in a list of sentences
 */
function identifyStructures(sentences) {
    const structures = {
        steps: [],
        sections: [],
        lists: []
    };
    
    sentences.forEach((sentence, index) => {
        // Identify numbered steps
        if (/^\d+\.\s/.test(sentence)) {
            structures.steps.push({index, text: sentence});
        }
        
        // Identify sections (headings)
        if (/^\*\*[^*]+\*\*/.test(sentence)) {
            structures.sections.push({index, text: sentence});
        }
        
        // Identify list items
        if (/^[*-]\s/.test(sentence)) {
            structures.lists.push({index, text: sentence});
        }
    });
    
    return structures;
}

/**
 * Improved function to highlight differences between two text strings
 * Much more tolerant of minor formatting differences
 */
function highlightDifferences(text1, text2) {
    console.log("Starting comparison with improved algorithm");
    
    // Clean both texts to normalize whitespace and other formatting
    const cleanText1 = cleanTextForComparison(text1);
    const cleanText2 = cleanTextForComparison(text2);
    
    // Split into chunks by meaningful units - try to keep JSON structures together
    const chunks1 = splitIntoChunks(cleanText1);
    const chunks2 = splitIntoChunks(cleanText2);
    
    console.log(`Split into ${chunks1.length} and ${chunks2.length} chunks`);
    
    // Arrays to track the status of each chunk
    const status1 = Array(chunks1.length).fill('different');
    const status2 = Array(chunks2.length).fill('different');
    
    // First pass: Find exact matches
    for (let i = 0; i < chunks1.length; i++) {
        for (let j = 0; j < chunks2.length; j++) {
            if (status2[j] !== 'different') continue;
            
            if (normalizeChunk(chunks1[i]) === normalizeChunk(chunks2[j])) {
                status1[i] = 'identical';
                status2[j] = 'identical';
                break;
            }
        }
    }
    
    // Second pass: Find similar chunks
    for (let i = 0; i < chunks1.length; i++) {
        if (status1[i] !== 'different') continue;
        
        let bestMatch = -1;
        let bestScore = 0.7; // Threshold for similarity
        
        for (let j = 0; j < chunks2.length; j++) {
            if (status2[j] !== 'different') continue;
            
            const similarity = calculateChunkSimilarity(chunks1[i], chunks2[j]);
            if (similarity > bestScore) {
                bestScore = similarity;
                bestMatch = j;
            }
        }
        
        if (bestMatch >= 0) {
            status1[i] = 'similar';
            status2[bestMatch] = 'similar';
        }
    }
    
    // Build HTML output with appropriate highlighting
    let html1 = '';
    let html2 = '';
    
    for (let i = 0; i < chunks1.length; i++) {
        const chunk = chunks1[i];
        const escapedChunk = escapeHtml(chunk);
        
        if (status1[i] === 'identical') {
            html1 += escapedChunk;
        } else if (status1[i] === 'similar') {
            html1 += `<span class="diff-partial">${escapedChunk}</span>`;
        } else {
            html1 += `<span class="diff-highlight">${escapedChunk}</span>`;
        }
    }
    
    for (let j = 0; j < chunks2.length; j++) {
        const chunk = chunks2[j];
        const escapedChunk = escapeHtml(chunk);
        
        if (status2[j] === 'identical') {
            html2 += escapedChunk;
        } else if (status2[j] === 'similar') {
            html2 += `<span class="diff-partial">${escapedChunk}</span>`;
        } else {
            html2 += `<span class="diff-highlight">${escapedChunk}</span>`;
        }
    }
    
    return { text1: html1, text2: html2 };
}

/**
 * Cleans text for comparison by normalizing whitespace, quotes, etc.
 */
function cleanTextForComparison(text) {
    return text
        .replace(/\r\n/g, '\n')          // Normalize line endings
        .replace(/\s+/g, ' ')            // Normalize whitespace
        .trim();                          // Remove leading/trailing whitespace
}

/**
 * Normalize a chunk for exact comparison
 */
function normalizeChunk(chunk) {
    return chunk
        .replace(/\s+/g, ' ')            // Normalize whitespace
        .replace(/['"`]/g, '"')          // Normalize quotes
        .trim()                           // Remove leading/trailing whitespace
        .toLowerCase();                   // Case-insensitive
}

/**
 * Split text into logical chunks for comparison
 */
function splitIntoChunks(text) {
    // Try to recognize JSON structure, steps, and numbered instructions
    
    // First check if this is a simple chunk (e.g., just a JSON object)
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        return [text];
    }
    
    // Special handling for prompts with steps
    const steps = [];
    const stepPattern = /\d+\.\s+(.+?)(?=\d+\.\s+|$)/gs;
    let match;
    let lastIndex = 0;
    
    // Look for numbered step patterns
    while ((match = stepPattern.exec(text)) !== null) {
        // Check if there's text before the first step
        if (match.index > lastIndex && lastIndex === 0) {
            steps.push(text.substring(0, match.index));
        }
        
        steps.push(match[0]);
        lastIndex = match.index + match[0].length;
    }
    
    // Add any remaining text
    if (lastIndex < text.length) {
        steps.push(text.substring(lastIndex));
    }
    
    // If we found steps, return them
    if (steps.length > 1) {
        return steps;
    }
    
    // If no steps found, try to split by sentences
    const sentences = text.match(/[^.!?:]+[.!?:]+/g) || [];
    
    // If we found sentences, return them
    if (sentences.length > 0) {
        return sentences;
    }
    
    // If all else fails, split by line breaks
    const lines = text.split(/\n+/);
    if (lines.length > 1) {
        return lines;
    }
    
    // If nothing worked, just return the whole text as one chunk
    return [text];
}

/**
 * Calculate similarity between two chunks
 */
function calculateChunkSimilarity(chunk1, chunk2) {
    const norm1 = normalizeChunk(chunk1);
    const norm2 = normalizeChunk(chunk2);
    
    // If identical after normalization
    if (norm1 === norm2) return 1.0;
    
    // If one is empty
    if (!norm1 || !norm2) return 0.0;
    
    // Simple character-based Jaccard similarity
    const set1 = new Set(norm1.split(''));
    const set2 = new Set(norm2.split(''));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    // Character Jaccard similarity
    const charSimilarity = intersection.size / union.size;
    
    // Word-based similarity
    const words1 = norm1.split(/\s+/);
    const words2 = norm2.split(/\s+/);
    
    const wordSet1 = new Set(words1);
    const wordSet2 = new Set(words2);
    
    const wordIntersection = new Set([...wordSet1].filter(x => wordSet2.has(x)));
    const wordUnion = new Set([...wordSet1, ...wordSet2]);
    
    // Word Jaccard similarity
    const wordSimilarity = wordIntersection.size / wordUnion.size;
    
    // Combine the two measures with more weight on words
    return (wordSimilarity * 0.7) + (charSimilarity * 0.3);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Calculate similarity between two jobs, handling edge cases to prevent NaN
 * @param {Object} job1 - First job
 * @param {Object} job2 - Second job
 * @returns {number} - Similarity score (0-5)
 */
function calculateSimilarity(job1, job2) {
    console.log("Calculating similarity between jobs");
    
    // If comparing the same job, return max similarity
    if (job1.id === job2.id) return 5;
    
    // Initialize score
    let score = 0;
    
    try {
        // Scenario match
        if (job1.scenario === job2.scenario) {
            score += 2;
        }
        
        // Subject similarity (very basic)
        const subject1Words = (job1.subject || "").toLowerCase().split(/\s+/).filter(w => w.length > 0);
        const subject2Words = (job2.subject || "").toLowerCase().split(/\s+/).filter(w => w.length > 0);
        
        // Handle empty subjects
        if (subject1Words.length > 0 && subject2Words.length > 0) {
            const commonWords = subject1Words.filter(word => subject2Words.includes(word));
            const subjectSimilarity = commonWords.length / Math.max(subject1Words.length, subject2Words.length);
            score += subjectSimilarity; // Add up to 1 point
        }
        
        // Objectives similarity
        const job1SucceededSet = new Set(job1.succeededObjectives || []);
        const job2SucceededSet = new Set(job2.succeededObjectives || []);
        const job1FailedSet = new Set(job1.failedObjectives || []);
        const job2FailedSet = new Set(job2.failedObjectives || []);
        
        // Count matches in succeeded objectives
        let succeededMatches = 0;
        job1SucceededSet.forEach(obj => {
            if (job2SucceededSet.has(obj)) succeededMatches++;
        });
        
        // Count matches in failed objectives
        let failedMatches = 0;
        job1FailedSet.forEach(obj => {
            if (job2FailedSet.has(obj)) failedMatches++;
        });
        
        // Calculate objective similarity safely
        const totalObjectives = (job1.allObjectives || []).length + (job2.allObjectives || []).length;
        if (totalObjectives > 0) {
            score += (succeededMatches + failedMatches) / totalObjectives * 2; // Add up to 2 points
        }
        
        // Add similarity based on prompt content if available
        if (job1.body && job2.body) {
            const contentSimilarity = calculateContentSimilarity(job1.body, job2.body);
            // Only count content similarity if we actually have content
            if (!isNaN(contentSimilarity)) {
                score += contentSimilarity; // Add up to 1 point
            }
        }
        
        // Return the score, ensuring it's a valid number between 0 and 5
        return Math.min(5, Math.max(0, score));
    } catch (error) {
        console.error("Error in similarity calculation:", error);
        // Return a default middle value if calculation fails
        return 2.5;
    }
}

/**
 * Calculate similarity between two text contents
 * @returns {number} Similarity score between 0 and 1
 */
function calculateContentSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    
    try {
        // Normalize texts
        const norm1 = text1.toLowerCase().replace(/\s+/g, ' ').trim();
        const norm2 = text2.toLowerCase().replace(/\s+/g, ' ').trim();
        
        // If identical
        if (norm1 === norm2) return 1;
        
        // Split into words and filter out empty strings
        const words1 = norm1.split(/\W+/).filter(w => w.length > 2);
        const words2 = norm2.split(/\W+/).filter(w => w.length > 2);
        
        // Handle empty word arrays
        if (words1.length === 0 || words2.length === 0) return 0;
        
        // Create sets for comparison
        const set1 = new Set(words1);
        const set2 = new Set(words2);
        
        // Calculate Jaccard similarity
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        
        // Safe division
        const denominator = set1.size + set2.size - intersection.size;
        if (denominator === 0) return 0;
        
        return intersection.size / denominator;
    } catch (error) {
        console.error("Error in content similarity calculation:", error);
        return 0;
    }
}

/**
 * Generate a semantic difference summary between two pieces of text
 * @returns {string} HTML summary of differences
 */
function generateSemanticDiffSummary(text1, text2) {
    try {
        if (!text1 || !text2) {
            return '<p>Unable to analyze: One or both prompts are empty.</p>';
        }
        
        // Normalize texts for comparison
        const clean1 = text1.replace(/\s+/g, ' ').trim();
        const clean2 = text2.replace(/\s+/g, ' ').trim();
        
        let summary = '<ul class="semantic-diff-list">';
        
        // Calculate overall text similarity
        const contentSimilarity = calculateContentSimilarity(clean1, clean2);
        const similarityPercent = Math.round(contentSimilarity * 100);
        
        summary += `<li>Overall text similarity: <strong>${similarityPercent}%</strong></li>`;
        
        // Check length difference
        const lengthDiff = Math.abs(clean1.length - clean2.length);
        const lengthPercent = Math.round((lengthDiff / Math.max(clean1.length, clean2.length)) * 100);
        
        if (lengthPercent > 10) {
            summary += `<li>Prompt ${clean1.length > clean2.length ? '1' : '2'} is ${lengthPercent}% longer than the other prompt.</li>`;
        }
        
        // Check for specific JSON structures
        const json1 = clean1.includes('JSON');
        const json2 = clean2.includes('JSON');
        
        if (json1 !== json2) {
            summary += `<li>Only Prompt ${json1 ? '1' : '2'} explicitly mentions JSON formatting.</li>`;
        }
        
        // Check for specific keywords
        const keywords = ['critical', 'requirement', 'must', 'important', 'strict', 'format', 'verify'];
        
        keywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            const count1 = (clean1.match(regex) || []).length;
            const count2 = (clean2.match(regex) || []).length;
            
            if (Math.abs(count1 - count2) > 1) {
                summary += `<li>Keyword "${keyword}": ${count1} occurrences in Prompt 1 vs ${count2} in Prompt 2.</li>`;
            }
        });
        
        // If no significant differences found
        if (summary === '<ul class="semantic-diff-list">') {
            summary += '<li>The prompts are very similar in content and structure with minimal differences.</li>';
        }
        
        summary += '</ul>';
        return summary;
    } catch (error) {
        console.error('Error generating semantic diff summary:', error);
        return '<p>Error analyzing differences.</p>';
    }
}