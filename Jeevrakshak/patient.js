// patient.js (COMPLETE LOGIC)

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

// --- MODAL ELEMENTS ---
const doctorModal = document.getElementById('doctor-modal');
const sosModal = document.getElementById('sos-modal');
const doctorRequestForm = document.getElementById('doctor-request-form');
const confirmSosBtn = document.getElementById('confirm-sos-btn');
const cancelSosBtn = document.getElementById('cancel-sos-btn');

// --- API & DATA FUNCTIONS (UNCHANGED) ---

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    };
}

function redirectToLogin(message = "Session expired. Please log in again.") {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_patient_name');
    localStorage.removeItem('patient_latitude');
    localStorage.removeItem('patient_longitude');
    alert(message);
    window.location.href = 'login.html';
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
        alert("Failed to save goals to the server.");
        return false;
    }
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

    document.getElementById('steps-input').value = goals.steps;
    document.getElementById('water-input').value = goals.water;
    document.getElementById('sleep-input').value = goals.sleep;
}


// --- BUTTON HANDLERS (UNCHANGED) ---

async function handleGoalUpdate(event) {
    event.preventDefault(); 
    
    const steps = parseInt(document.getElementById('steps-input').value) || 0;
    const water = parseFloat(document.getElementById('water-input').value) || 0;
    const sleep = parseFloat(document.getElementById('sleep-input').value) || 0;

    const newGoals = { steps, water, sleep };

    const success = await updateGoalsAPI(newGoals);
    
    if (success) {
        // Use alert temporarily, ideally use a small custom toast message here too
        alert("Goals updated successfully and saved to the server!"); 
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
        color = '#d63031';
    }

    document.getElementById('bmi-result').innerHTML = `
        <p>Your BMI is: <strong style="color: ${color};">${bmi.toFixed(2)}</strong></p>
        <p>Category: <span style="color: ${color}; font-weight: bold;">${category}</span></p>
    `;
}

// 3. Central Request Handler for Doctor Connect and SOS
async function sendRequest(reason, criticality, type) {
    const patientLat = localStorage.getItem('patient_latitude');
    const patientLng = localStorage.getItem('patient_longitude');
    
    const modalToUpdate = (type === 'SOS' ? sosModal : doctorModal);
    
    if (!patientLat || !patientLng) {
        alert("Error: Your location was not set during login. Cannot send request.");
        modalToUpdate.style.display = 'none'; // Close modal if open
        return;
    }
    
    const endpoint = type === 'SOS' ? '/sos-request' : '/doctor-request';
    const requestData = {
        patientName: patientName,
        reason: reason,
        criticality: criticality.toUpperCase(),
        location: {
            lat: parseFloat(patientLat),
            lng: parseFloat(patientLng)
        }
    };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(requestData)
        });

        const result = await response.json();
        const success = response.ok;
        
        // POP-UP BOX UPDATE LOGIC
        const statusTitle = document.getElementById('status-title');
        const statusMessage = document.getElementById('status-message');
        const requestStatusStep = document.getElementById('request-status-step');
        const confirmStep = document.getElementById('sos-confirm-step');

        if (type === 'SOS') {
            confirmStep.style.display = 'none';
            requestStatusStep.style.display = 'block';

            if (success) {
                statusTitle.innerHTML = `<i class="fas fa-check-circle" style="color: var(--secondary);"></i> SOS Request Sent!`;
                statusMessage.innerHTML = `The nearest hospital (**${result.hospitalName}**) has been notified of your **HIGH** priority emergency. Arrival time: ~${result.distance.toFixed(2)} km.`;
            } else {
                statusTitle.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i> SOS Failed`;
                statusMessage.innerHTML = `Request failed: ${result.message || 'Could not dispatch request.'} Please call emergency services directly.`;
            }
            // The modal remains open until the user clicks 'Close'
        } else { // DOCTOR_CONNECT
            doctorModal.style.display = 'none';
            alert(`Doctor Request Sent! The nearest hospital (${result.hospitalName} - ${result.distance.toFixed(2)} km) has been notified. Check your Prescription tab for updates.`);
        }
        
    } catch (error) {
        console.error(`${type} Request Error:`, error);
        alert(`A network error occurred. Could not connect to the Jeevrakshak server for ${type} request.`);
        modalToUpdate.style.display = 'none';
    }
}


// 4. Doctor Request/Book Now Button Handler
function handleDoctorRequest() {
    // Reset form before opening
    doctorRequestForm.reset();
    doctorModal.style.display = 'block';
}

// 5. SOS Button Handler (MODIFIED FOR MODAL)
function handleSosButton() {
    // Show the confirmation step and hide status step
    document.getElementById('sos-confirm-step').style.display = 'block';
    document.getElementById('request-status-step').style.display = 'none';
    // Remove the 'required' attribute temporarily just in case
    document.getElementById('sos-reason-input').removeAttribute('required'); 
    document.getElementById('sos-reason-input').value = '';
    sosModal.style.display = 'block';
}

// 6. Logout Handler (UNCHANGED)
function handleLogout() {
    redirectToLogin("You have been logged out.");
}


// --- Modal Event Listeners ---

// Close modals when clicking the X button
document.querySelectorAll('.close-btn').forEach(button => {
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
        sosModal.style.display = 'none';
    }
});


// Doctor Request Form Submission
doctorRequestForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const reason = document.getElementById('issue-input').value.trim();
    const criticality = document.getElementById('criticality-select').value;
    
    if (reason && criticality) {
        sendRequest(reason, criticality, 'DOCTOR_CONNECT'); 
    } else {
        alert("Please describe your issue and select a criticality level.");
    }
});

// SOS Confirmation Button - *** THIS IS THE MODIFIED PART ***
confirmSosBtn.addEventListener('click', () => {
    let reason = document.getElementById('sos-reason-input').value.trim();
    
    // If the user did not enter a reason, use a default, but DO NOT prevent the request.
    if (!reason) {
        reason = "Unspecified High Criticality Emergency (Quick Tap)";
    }
    
    // Criticality is assumed HIGH for SOS
    sendRequest(reason, 'HIGH', 'SOS'); 
});

// SOS Cancel Button
cancelSosBtn.addEventListener('click', () => {
    sosModal.style.display = 'none';
});


// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    
    renderProgress(); 
    
    // 1. Goal Update Form Button
    document.getElementById('goal-update-form').addEventListener('submit', handleGoalUpdate);
    
    // 2. BMI Calculation Button
    document.querySelector('.calculate-btn').addEventListener('click', handleBmiCalculation);
    
    // 3. Doctor Request/Book Now Button (Opens Modal)
    document.querySelector('.book-now-btn').addEventListener('click', handleDoctorRequest);

    // 4. SOS Floating Button (Opens Modal)
    document.querySelector('.sos-button').addEventListener('click', handleSosButton);

    // 5. Logout Button
    document.getElementById('logout-patient-btn').addEventListener('click', handleLogout);
    
    // 6. Patient Name Display (Header)
    const patientProfileDiv = document.querySelector('.user-profile');
    const logoutLink = document.getElementById('logout-patient-btn');

    if (patientProfileDiv && logoutLink) {
        patientProfileDiv.innerHTML = `<i class="fas fa-user-circle"></i> <span id="patient-name-display">${patientName}</span>`;
        patientProfileDiv.appendChild(logoutLink);
    }
});