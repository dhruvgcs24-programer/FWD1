// patient.js (COMPLETE LOGIC with Prescription View)

// --- Global Configuration ---
const API_URL = 'http://localhost:3000/api';
// Temporarily set default for testing if check is commented out
const patientName = localStorage.getItem('current_patient_name') || 'Test Patient';
const authToken = localStorage.getItem('auth_token');

// Redirect if not logged in
if (!localStorage.getItem('current_patient_name') || !authToken) {
    redirectToLogin("Please log in.");
}

// --- GOAL TRACKER CONFIGURATION ---
const GOAL_TARGETS = {
    steps: 10000,
    water: 8, // Liters
    sleep: 8  // Hours
};

const DEFAULT_GOALS = {
    steps: 0,
    water: 0,
    sleep: 0
};

// --- HEALTH TIPS DATA ---
const HEALTH_TIPS = [
    "Drink at least 8 glasses of water a day to stay hydrated.",
    "Take a 5-minute break every hour to stretch and rest your eyes.",
    "Include more fiber in your diet with fruits, vegetables, and whole grains.",
    "Aim for 7-9 hours of quality sleep each night for better recovery.",
    "Practice deep breathing exercises to reduce stress levels.",
    "Limit processed sugar intake to boost your energy and immune system.",
    "Walk for at least 30 minutes a day to improve cardiovascular health.",
    "Wash your hands frequently to prevent the spread of infections.",
    "Maintain good posture while sitting to avoid back and neck pain.",
    "Limit screen time before bed to ensure a restful sleep."
];

// --- MODAL ELEMENTS ---
const doctorModal = document.getElementById('doctor-modal');
const sosModal = document.getElementById('sos-modal');
const doctorRequestForm = document.getElementById('doctor-request-form');
const confirmSosBtn = document.getElementById('confirm-sos-btn');
const cancelSosBtn = document.getElementById('cancel-sos-btn');

// --- API & DATA FUNCTIONS ---

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    };
}

// Global Notification Helper
function showCustomAlert(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return; // Fallback if container missing

    const toast = document.createElement('div');
    toast.className = `notification-toast toast-${type}`;

    let iconClass = 'fa-info-circle';
    let title = 'Info';

    if (type === 'success') { iconClass = 'fa-check-circle'; title = 'Success'; }
    if (type === 'error') { iconClass = 'fa-exclamation-circle'; title = 'Error'; }
    if (type === 'warning') { iconClass = 'fa-exclamation-triangle'; title = 'Warning'; }

    toast.innerHTML = `
        <i class="fas ${iconClass} notification-icon"></i>
        <div class="notification-content">
            <span class="notification-title">${title}</span>
            <span class="notification-message">${message}</span>
        </div>
        <button class="notification-close">&times;</button>
    `;

    container.appendChild(toast);

    // Close on click
    toast.querySelector('.notification-close').addEventListener('click', () => {
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => toast.remove());
    });

    // Auto close
    setTimeout(() => {
        if (toast && toast.parentNode) {
            toast.classList.add('hide');
            toast.addEventListener('animationend', () => toast.remove());
        }
    }, 5000);
}

function redirectToLogin(message = "Session expired. Please log in again.") {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_patient_name');
    localStorage.removeItem('patient_latitude');
    localStorage.removeItem('patient_longitude');

    showCustomAlert(message, 'warning');

    // DELAY Redirect so user can see the message
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 2000);
}

async function fetchGoals(name) {
    try {
        const response = await fetch(`${API_URL}/goals/${encodeURIComponent(name)}`, { headers: getAuthHeaders() });

        if (response.status === 404) {
            return DEFAULT_GOALS;
        }

        if (response.status === 401 || response.status === 403) {
            redirectToLogin("Session expired. Please log in again.");
            return DEFAULT_GOALS;
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching patient goals:', error);
        return DEFAULT_GOALS;
    }
}

async function updateGoalsAPI(goals) {
    try {
        const response = await fetch(`${API_URL}/goals`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ goals })
        });

        if (response.status === 401 || response.status === 403) {
            redirectToLogin("Session expired. Please log in again.");
            return false;
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return true;
    } catch (error) {
        console.error('Error updating goals:', error);
        showCustomAlert("Failed to save goals to the server.", "error");
        return false;
    }
}


// --- PRESCRIPTION VIEW LOGIC (NEW) ---

async function fetchPrescriptions() {
    try {
        const response = await fetch(`${API_URL}/prescriptions/${encodeURIComponent(patientName)}`, { headers: getAuthHeaders() });

        if (response.status === 401 || response.status === 403) {
            redirectToLogin("Session expired. Please log in again.");
            return [];
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching prescriptions:', error);
        return [];
    }
}

async function renderPrescriptions() {
    const prescriptions = await fetchPrescriptions();
    const listContainer = document.getElementById('prescriptions-list-container');
    listContainer.innerHTML = ''; // Clear previous content

    if (prescriptions.length === 0) {
        listContainer.innerHTML = '<p class="empty-list-message">No prescriptions found yet.</p>';
        return;
    }

    prescriptions.forEach(p => {
        const date = new Date(p.prescribedAt).toLocaleDateString();
        const time = new Date(p.prescribedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const item = document.createElement('div');
        item.className = 'card glass-panel prescription-item';
        item.innerHTML = `
            <div class="header">
                <i class="fas fa-user-md"></i>
                <div class="details">
                    <h4>Dr. ${p.doctor || 'Physician'}</h4>
                    <span class="date">${date} • ${time}</span>
                </div>
            </div>
            <div class="prescription-content">
                <p class="prescription-text">${p.prescription.replace(/\n/g, '<br>')}</p>
            </div>
            <div class="prescription-footer">
                <i class="fas fa-hospital-alt"></i>
                <span>Issued at: <strong>${p.hospitalName || 'JeevRakshak Hospital Network'}</strong></span>
            </div>
        `;
        listContainer.appendChild(item);
    });

    // Switch view
    showView('prescriptions-view');
}


// --- PROGRESS CALCULATION & RENDERING (UNCHANGED) ---

function calculateProgress(current, target) {
    return Math.min(100, (current / target) * 100);
}

function calculateOverallProgress(goals) {
    const stepsTarget = GOAL_TARGETS.steps > 0 ? GOAL_TARGETS.steps : 1;
    const waterTarget = GOAL_TARGETS.water > 0 ? GOAL_TARGETS.water : 1;
    const sleepTarget = GOAL_TARGETS.sleep > 0 ? GOAL_TARGETS.sleep : 1;

    const stepPct = calculateProgress(goals.steps, stepsTarget);
    const waterPct = calculateProgress(goals.water, waterTarget);
    const sleepPct = calculateProgress(goals.sleep, sleepTarget);

    return Math.round((stepPct + waterPct + sleepPct) / 3);
}

async function renderProgress() {
    const goals = await fetchGoals(patientName);

    const overallProgress = calculateOverallProgress(goals);
    document.getElementById('overall-progress-value').textContent = `${overallProgress}%`;
    document.querySelector('.progress-circle').style.setProperty('--progress-degree', `${overallProgress * 3.6}deg`);

    document.getElementById('steps-progress').style.width = `${calculateProgress(goals.steps, GOAL_TARGETS.steps)}%`;
    document.getElementById('steps-current').textContent = goals.steps;
    document.getElementById('steps-target').textContent = GOAL_TARGETS.steps;

    document.getElementById('water-progress').style.width = `${calculateProgress(goals.water, GOAL_TARGETS.water)}%`;
    document.getElementById('water-current').textContent = goals.water;
    document.getElementById('water-target').textContent = GOAL_TARGETS.water;

    document.getElementById('sleep-progress').style.width = `${calculateProgress(goals.sleep, GOAL_TARGETS.sleep)}%`;
    document.getElementById('sleep-current').textContent = goals.sleep;
    document.getElementById('sleep-target').textContent = GOAL_TARGETS.sleep;

    // Use current values only for progress display, not for input fields on load
    // document.getElementById('steps-input').value = goals.steps;
    // document.getElementById('water-input').value = goals.water;
    // document.getElementById('sleep-input').value = goals.sleep;
}


// --- BUTTON & VIEW HANDLERS ---

// NEW: Function to manage view switching
function showView(viewId) {
    // Hide all main content views
    document.querySelector('.dashboard-container').style.display = 'none';
    const prescriptionsView = document.getElementById('prescriptions-view');
    if (prescriptionsView) prescriptionsView.style.display = 'none';

    // Deactivate all nav links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
    });

    // Show the requested view
    const requestedView = document.getElementById(viewId);
    if (requestedView) {
        requestedView.style.display = 'block';
        // Activate the corresponding nav link
        document.getElementById(`${viewId.replace('-view', '')}-link`).classList.add('active');
    }

    // Special case for dashboard-container, which has no ID in patient.html, so we check for 'dashboard'
    if (viewId === 'dashboard') {
        document.querySelector('.dashboard-container').style.display = 'flex';
        document.getElementById('dashboard-link').classList.add('active');
    }
}

// Function to handle the initial load and navigation to the Dashboard
function showDashboard() {
    showView('dashboard');
    // Reload progress data for the dashboard
    renderProgress();
}


async function handleGoalUpdate(event) {
    event.preventDefault();

    const steps = parseInt(document.getElementById('steps-input').value) || 0;
    const water = parseFloat(document.getElementById('water-input').value) || 0;
    const sleep = parseFloat(document.getElementById('sleep-input').value) || 0;

    const newGoals = { steps, water, sleep };

    const success = await updateGoalsAPI(newGoals);

    if (success) {
        showCustomAlert("Goals updated successfully and saved to the server!", "success");
        renderProgress();
    }
}

function handleBmiCalculation() {
    const weight = parseFloat(document.getElementById('weight-input').value);
    const heightCm = parseFloat(document.getElementById('height-input').value);

    if (isNaN(weight) || isNaN(heightCm) || weight <= 0 || heightCm <= 0) {
        document.getElementById('bmi-result').innerHTML = "<p style='color: var(--danger);'>Please enter valid weight and height.</p>";
        return;
    }

    const heightM = heightCm / 100;
    const bmi = weight / (heightM * heightM);

    let category = '';
    let color = '';

    if (bmi < 18.5) {
        category = 'Underweight';
        color = '#ff7675';
    } else if (bmi >= 18.5 && bmi < 24.9) {
        category = 'Normal weight';
        color = '#00b894';
    } else if (bmi >= 25 && bmi < 29.9) {
        category = 'Overweight';
        color = '#fdcb6e';
    } else {
        category = 'Obesity';
        color = '#ef4444';
    }

    document.getElementById('bmi-result').innerHTML = `
        <p>Your BMI is <strong>${bmi.toFixed(2)}</strong></p>
        <p style="color: ${color};">Category: <strong>${category}</strong></p>
    `;
}

// 1. Doctor Request Form Submission Handler (MODIFIED: now gets location)
async function handleDoctorRequestForm(event) {
    event.preventDefault();

    const issue = document.getElementById('issue-input').value;
    const criticality = document.getElementById('criticality-select').value;

    // First, try to get the user's location
    getLocationAndSendRequest(
        '/doctor-request', // Endpoint
        {
            patientName: patientName,
            reason: issue,
            criticality: criticality
        },
        'DOCTOR_CONNECT', // Request Type
        doctorModal // Modal to close/update
    );

    // Close the modal immediately to show the "Request Sent" status if needed (optional)
    // doctorModal.style.display = 'none';
}


// 2. SOS Confirmation Button Handler (MODIFIED: now gets location)
function handleConfirmSos() {
    const reason = document.getElementById('sos-reason-input').value || 'Immediate Emergency';

    // First, try to get the user's location
    getLocationAndSendRequest(
        '/sos', // Endpoint
        {
            patientName: patientName,
            reason: reason,
        },
        'SOS', // Request Type
        sosModal // Modal to update
    );
}

// 3. Geolocation Helper (UNCHANGED)
function getLocationAndSendRequest(endpoint, requestData, type, modalToUpdate) {
    if ("geolocation" in navigator) {
        const statusTitle = document.getElementById('status-title');
        const statusMessage = document.getElementById('status-message');
        const requestStatusStep = document.getElementById('request-status-step');
        const confirmStep = document.getElementById('sos-confirm-step');

        // Show status step immediately for feedback
        if (type === 'SOS') {
            confirmStep.style.display = 'none';
            requestStatusStep.style.display = 'block';
            statusTitle.innerHTML = `<i class="fas fa-spinner fa-spin" style="color: var(--text-muted);"></i> Locating...`;
            statusMessage.innerHTML = `Attempting to pinpoint your location for emergency dispatch.`;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                // Save location to local storage (optional, for later use)
                localStorage.setItem('patient_latitude', lat);
                localStorage.setItem('patient_longitude', lng);

                // Add location to the request payload
                requestData.location = { lat: parseFloat(lat), lng: parseFloat(lng) };

                // Now send the request with location
                sendRequest(endpoint, requestData, type);

            },
            (error) => {
                let errMsg;
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errMsg = "Permission to access location was denied.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errMsg = "Location information is unavailable.";
                        break;
                    case error.TIMEOUT:
                        errMsg = "The request to get user location timed out.";
                        break;
                    default:
                        errMsg = "An unknown error occurred.";
                        break;
                }

                // Show failure state in modal
                if (type === 'SOS') {
                    statusTitle.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: var(--danger-red);"></i> Location Failed`;
                    statusMessage.innerHTML = `Error: ${errMsg}. Please enable GPS and try again, or call emergency services directly.`;
                } else {
                    showCustomAlert(`Location Error: ${errMsg}. Please ensure GPS is on.`, "error");
                    modalToUpdate.style.display = 'none';
                }
            },
            { enableHighAccuracy: false, timeout: 15000 } // Relaxed accuracy and increased timeout for better success rate
        );
    } else {
        showCustomAlert("Geolocation is not supported by your browser or disabled.", "error");
        modalToUpdate.style.display = 'none';
    }
}


// 4. API Request Sender (MODIFIED: to handle Doctor Connect pop-up)
async function sendRequest(endpoint, requestData, type) {
    console.log(`[sendRequest] Payload:`, requestData);
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        console.log(`[sendRequest] Response Status: ${response.status}`);
        const result = await response.json();
        console.log(`[sendRequest] Response Body:`, result);
        const success = response.ok;

        // POP-UP BOX UPDATE LOGIC
        const statusTitle = document.getElementById('status-title');
        const statusMessage = document.getElementById('status-message');
        const requestStatusStep = document.getElementById('request-status-step');
        const confirmStep = document.getElementById('sos-confirm-step');

        if (type === 'SOS') {
            // Already in SOS modal view
            if (success) {
                statusTitle.innerHTML = `<i class="fas fa-check-circle" style="color: var(--success-green);"></i> SOS Request Sent!`;
                statusMessage.innerHTML = `The nearest hospital (**${result.hospitalName || 'Central'}**) has been notified of your **HIGH** priority emergency. Distance: ~${result.distance ? result.distance.toFixed(2) : '2.5'} km.`;
            } else {
                statusTitle.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: var(--danger-red);"></i> SOS Failed`;
                statusMessage.innerHTML = `Request failed: ${result.message || 'Could not dispatch request.'} Please call emergency services directly.`;
            }
        } else { // DOCTOR_CONNECT
            doctorModal.style.display = 'none';
            // Use SOS modal as a generic status update modal for now
            confirmStep.style.display = 'none';
            requestStatusStep.style.display = 'block';
            sosModal.style.display = 'block';

            if (success) {
                statusTitle.innerHTML = `<i class="fas fa-user-md" style="color: var(--primary-dark);"></i> Consultation Requested`;
                statusMessage.innerHTML = `Your **${requestData.criticality}** priority request has been sent to **${result.hospitalName || 'Central'}**. A doctor will connect with you soon.`;
            } else {
                statusTitle.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: var(--danger-red);"></i> Request Failed`;
                statusMessage.innerHTML = `Request failed: ${result.message || 'Could not send request.'}`;
            }
        }


    } catch (error) {
        console.error('API Request Error:', error);

        // Fail-safe status update for both types
        const statusTitle = document.getElementById('status-title');
        const statusMessage = document.getElementById('status-message');
        const requestStatusStep = document.getElementById('request-status-step');
        const confirmStep = document.getElementById('sos-confirm-step');

        if (type === 'SOS') {
            confirmStep.style.display = 'none';
            requestStatusStep.style.display = 'block';
            sosModal.style.display = 'block';
        } else {
            doctorModal.style.display = 'none';
            confirmStep.style.display = 'none';
            requestStatusStep.style.display = 'block';
            sosModal.style.display = 'block';
        }

        statusTitle.innerHTML = `<i class="fas fa-times-circle" style="color: var(--danger-red);"></i> Connection Error`;
        statusMessage.innerHTML = `Failed to connect to the server. Please check your network and try again.`;
    }
}

// 5. Doctor Request/Book Now Button Handler (UNCHANGED)
function handleDoctorRequest() {
    // Reset form before opening
    doctorRequestForm.reset();
    doctorModal.style.display = 'block';
}

// 6. SOS Button Handler (UNCHANGED)
function handleSosButton() {
    // Show the confirmation step and hide status step
    document.getElementById('sos-confirm-step').style.display = 'block';
    document.getElementById('request-status-step').style.display = 'none';
    // Remove the 'required' attribute temporarily just in case
    document.getElementById('sos-reason-input').value = '';
    sosModal.style.display = 'block';
}

// 7. Logout Handler (UNCHANGED)
function handleLogout() {
    redirectToLogin("You have been logged out.");
}

// 8. Nearby Service Map Opener
function openNearbyServiceMap(serviceType) {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition((position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const encodedServiceType = encodeURIComponent(serviceType);

            // Construct the Google Maps URL to search for the service near the coordinates.
            const mapUrl = `https://www.google.com/maps/search/${encodedServiceType}/@${lat},${lng},15z`; // 15z is zoom level

            // Open the map in a new tab
            window.open(mapUrl, '_blank');
        }, (error) => {
            console.error("Error getting location:", error);
            let message;
            switch (error.code) {
                case error.PERMISSION_DENIED: message = "Permission to access location was denied. Please allow location access to use this feature."; break;
                case error.POSITION_UNAVAILABLE: message = "Location information is unavailable."; break;
                case error.TIMEOUT: message = "The request to get user location timed out."; break;
                default: message = "An unknown error occurred while trying to get location.";
            }
            showCustomAlert(`Location Error: ${message}`, "error");
        }, { enableHighAccuracy: false, timeout: 15000 });
    } else {
        showCustomAlert("Geolocation is not supported by your browser or disabled.", "error");
    }
}

// 9. Health Tips Logic (NEW)
function renderRandomHealthTip() {
    const tipElement = document.getElementById('health-tip-text');
    if (!tipElement) return;

    const randomIndex = Math.floor(Math.random() * HEALTH_TIPS.length);
    tipElement.textContent = `"${HEALTH_TIPS[randomIndex]}"`;

    // Add a simple fade animation effect
    tipElement.style.opacity = 0;
    setTimeout(() => {
        tipElement.style.transition = 'opacity 0.5s';
        tipElement.style.opacity = 1;
    }, 100);
}

// 10. Profile Dropdown Logic (NEW)
function toggleProfileDropdown(event) {
    // Prevent event bubbling so the window click listener doesn't immediately close it
    event.stopPropagation();
    const dropdown = document.getElementById('profile-dropdown');
    dropdown.classList.toggle('show');
}


// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {

    // 1. Initial Load: Render patient name and progress
    const dropdownNameDisplay = document.getElementById('dropdown-user-name');
    if (dropdownNameDisplay) {
        dropdownNameDisplay.textContent = patientName;
    }

    // Initial Health Tip
    renderRandomHealthTip();
    // Auto-reload health tip every 10 minutes (600,000 ms)
    setInterval(renderRandomHealthTip, 600000);

    // Start on Dashboard
    showDashboard();

    // --- Event Listeners (Linking HTML to JS) ---

    // Nav Links (NEW/MODIFIED)
    document.getElementById('dashboard-link').addEventListener('click', (event) => {
        event.preventDefault();
        showDashboard();
    });

    // LOGO click to go home
    document.querySelector('.logo').addEventListener('click', () => {
        showDashboard();
    });

    document.getElementById('prescriptions-link').addEventListener('click', (event) => {
        event.preventDefault();
        renderPrescriptions();
    });

    // About Us Link Scroll
    const aboutUsLink = document.getElementById('about-us-link');
    if (aboutUsLink) {
        aboutUsLink.addEventListener('click', (event) => {
            event.preventDefault();
            showDashboard(); // Ensure we are on the dashboard
            setTimeout(() => {
                const section = document.getElementById('about-us');
                if (section) {
                    section.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100); // Small delay to allow view switch
        });
    }

    // 1. Goal Update Form Submission
    document.getElementById('goal-update-form').addEventListener('submit', handleGoalUpdate);

    // 2. BMI Calculation Button
    document.querySelector('.calculate-btn').addEventListener('click', handleBmiCalculation);

    // 3. Doctor Request/Book Now Button (Opens Modal)
    document.querySelector('.book-now-btn').addEventListener('click', handleDoctorRequest);
    document.getElementById('doctor-request-form').addEventListener('submit', handleDoctorRequestForm); // Form submission

    // 4. SOS Floating Button (Opens Modal)
    document.querySelector('.sos-button').addEventListener('click', handleSosButton);
    document.getElementById('confirm-sos-btn').addEventListener('click', handleConfirmSos); // SOS Confirmation

    // 5. Logout Button
    document.getElementById('logout-patient-btn').addEventListener('click', handleLogout);

    // 6. Nearby Services Buttons
    document.getElementById('search-pharmacy-btn').addEventListener('click', (event) => {
        const serviceType = event.currentTarget.getAttribute('data-service-type'); // 'pharmacy'
        openNearbyServiceMap(serviceType);
    });

    document.getElementById('search-clinic-btn').addEventListener('click', (event) => {
        const serviceType = event.currentTarget.getAttribute('data-service-type'); // 'clinic'
        openNearbyServiceMap(serviceType);
    });

    // 7. Health Tip Refresh Button
    const refreshTipBtn = document.getElementById('refresh-tip-btn');
    if (refreshTipBtn) {
        refreshTipBtn.addEventListener('click', () => {
            const icon = refreshTipBtn.querySelector('i');
            icon.classList.add('fa-spin');
            renderRandomHealthTip();
            setTimeout(() => icon.classList.remove('fa-spin'), 500); // Remove spin
        });
    }

    // 8. Profile Dropdown Trigger
    const profileTrigger = document.getElementById('profile-trigger');
    if (profileTrigger) {
        profileTrigger.addEventListener('click', toggleProfileDropdown);
    }

    // Close modals when clicking the X button
    document.querySelectorAll('.modal .close-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.target.closest('.modal').style.display = 'none';
        });
    });

    // Close modals when clicking outside of them
    window.addEventListener('click', (event) => {
        if (event.target === doctorModal) {
            doctorModal.style.display = 'none';
        }
        if (event.target === sosModal) {
            // Only allow closing if it's the confirmation step, not the status step
            if (document.getElementById('sos-confirm-step').style.display !== 'none') {
                sosModal.style.display = 'none';
            }
        }

        // Close Profile Dropdown if clicking outside
        if (!event.target.closest('.profile-dropdown-container')) {
            const dropdown = document.getElementById('profile-dropdown');
            if (dropdown && dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
            }
        }
    });
});