// hospital.js (FINALIZED API-DRIVEN LOGIC with Staff Admission and Deletion)

// --- Global Configuration ---
const API_URL = 'http://localhost:3000/api';
const authToken = localStorage.getItem('auth_token');
const REFRESH_INTERVAL = 15000; // 15 seconds for queue auto-update

// FIX: Only redirect if necessary. 
function redirectToLogin(message = "Session expired. Please log in again.") {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_patient_name');
    localStorage.removeItem('hospital_patients'); 
    localStorage.removeItem('hospital_staff'); 
    alert(message);
    
    // If the current path is the hospital page, we block the redirect
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes('hospital.html') || currentPath === '/') {
        console.warn("Auth token missing/expired. Alert triggered, but redirect blocked to remain on dashboard.");
        return; 
    }
    
    window.location.href = 'login.html';
}


// Helper function to create standard headers with Authorization
function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    };
}

// Helper function to format time difference
function formatTimeDifference(timestamp) {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    let interval = seconds / 60;

    if (interval >= 60) {
        interval = interval / 60;
        return Math.floor(interval) + (Math.floor(interval) === 1 ? " hr ago" : " hrs ago");
    }
    if (interval >= 1) {
        return Math.floor(interval) + " mins ago";
    }
    if (seconds > 10) {
        return seconds + " secs ago";
    }
    return "just now";
}


// --- 1. Data/API Fetch Functions ---

async function fetchDoctorRequests() {
    try {
        const response = await fetch(`${API_URL}/doctor-requests`, { headers: getAuthHeaders() });
        
        if (response.status === 401 || response.status === 403) {
            if (authToken) {
                redirectToLogin("Access denied or session expired.");
            }
            return [];
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching doctor requests:', error);
        return []; 
    }
}

// Function to fetch patients from the database
async function fetchPatients() {
    try {
        const response = await fetch(`${API_URL}/patients`, { headers: getAuthHeaders() });
        
        if (response.status === 401 || response.status === 403) {
            if (authToken) {
                redirectToLogin("Access denied or session expired.");
            }
            return [];
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching patient list:', error);
        return []; 
    }
}

// Function to fetch staff from the database 
async function fetchStaff() {
    try {
        const response = await fetch(`${API_URL}/staff`, { headers: getAuthHeaders() });
        
        if (response.status === 401 || response.status === 403) {
            if (authToken) {
                redirectToLogin("Access denied or session expired.");
            }
            return [];
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching staff list:', error);
        return []; 
    }
}


async function updateDashboardSummary(requests) {
    const sosRequests = requests.filter(r => r.type && r.type.toUpperCase() === 'SOS');
    const bookNowRequests = requests.filter(r => 
        !r.type || 
        r.type.toUpperCase() === 'BOOK_NOW' ||
        r.type.toUpperCase() === 'DOCTOR_CONNECT'
    );
    
    // FETCH PATIENT DATA DYNAMICALLY from API
    const allPatients = await fetchPatients();
    
    const totalPatientsServed = allPatients.length; 
    const criticalPatients = allPatients.filter(p => p.initialCondition.toLowerCase() === 'critical' || p.initialCondition.toLowerCase() === 'serious').length;
    const stablePatients = allPatients.filter(p => p.initialCondition.toLowerCase() === 'stable' || p.initialCondition.toLowerCase() === 'fair').length;

    document.getElementById('report-total-patients').textContent = totalPatientsServed;
    document.getElementById('report-critical-patients').textContent = sosRequests.length + criticalPatients; 
    document.getElementById('report-stable-patients').textContent = stablePatients;
    document.getElementById('report-doctor-requests').textContent = bookNowRequests.length; 
}

function renderSOSAlerts(requests) {
    const alertsContainer = document.getElementById('critical-alerts-content');
    if (!alertsContainer) return;
    
    const sosRequests = requests.filter(r => r.type && r.type.toUpperCase() === 'SOS');
    
    alertsContainer.innerHTML = '';
    
    if (sosRequests.length > 0) {
        sosRequests.forEach(request => {
            const timeAgo = formatTimeDifference(request.timestamp);
            const criticality = request.criticality ? request.criticality.toUpperCase() : 'HIGH';
            alertsContainer.innerHTML += `
                <div class="alert-item sos-alert" data-request-id="${request._id}">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div class="alert-info">
                        <h4>SOS! ${request.patientName} - ${criticality} PRIORITY</h4>
                        <p>Reason: ${request.reason || 'Immediate Assistance Required'}</p>
                    </div>
                    <span class="alert-time">${timeAgo}</span>
                    <button class="action-btn resolve" onclick="resolveRequest('${request._id}')">Acknowledge & Resolve</button>
                </div>
            `;
        });
        
    } else {
        alertsContainer.innerHTML = `
            <div class="alert-item default-alert">
                <i class="fas fa-check-circle"></i>
                <p><strong>Patient Status:</strong> All critical patients stable. No new SOS alerts.</p>
            </div>
        `;
    }
}

function renderBookNowQueue(requests) {
    const queueContainer = document.getElementById('request-queue-content');
    const queueCountBadge = document.getElementById('queue-count-badge');
    if (!queueContainer || !queueCountBadge) return;
    
    const queueRequests = requests.filter(r => 
        !r.type || 
        r.type.toUpperCase() === 'BOOK_NOW' ||
        r.type.toUpperCase() === 'DOCTOR_CONNECT'
    );

    queueContainer.innerHTML = ''; 
    queueCountBadge.textContent = queueRequests.length;

    if (queueRequests.length === 0) {
        queueContainer.innerHTML = '<p class="empty-queue-message">No pending doctor requests.</p>';
        return;
    }

    queueRequests.sort((a, b) => {
        const criticalityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'UNDEFINED': 0 };
        const critA = a.criticality ? a.criticality.toUpperCase() : 'LOW';
        const critB = b.criticality ? b.criticality.toUpperCase() : 'LOW';

        if (criticalityOrder[critB] !== criticalityOrder[critA]) {
            return criticalityOrder[critB] - criticalityOrder[critA];
        }
        return new Date(a.timestamp) - new Date(b.timestamp);
    });

    queueRequests.forEach((request, index) => {
        const patientName = request.patientName || 'Unknown Patient';
        const reason = request.reason || 'Standard Consultation';
        
        const criticality = request.criticality ? request.criticality.toLowerCase() : 'low';
        const priorityClass = `${criticality}-priority`;
        const timeAgo = formatTimeDifference(request.timestamp);
        
        queueContainer.innerHTML += `
            <div class="queue-item" data-request-id="${request._id}">
                <div class="queue-info">
                    <h4 class="patient-name">${index + 1}. ${patientName}</h4>
                    <small class="request-reason">${reason}</small>
                </div>
                <div class="queue-actions">
                    <span class="priority-tag ${priorityClass}">${criticality.toUpperCase()}</span>
                    <span class="request-time">${timeAgo}</span>
                    <button class="action-btn resolve hospital-btn" onclick="resolveRequest('${request._id}')">Resolve</button>
                </div>
            </div>
        `;
    });
}


async function resolveRequest(requestId) {
     if (!confirm(`Are you sure you want to resolve request ID: ${requestId}? This will remove it from the queue.`)) {
         return;
     }

    try {
        // NOTE: This endpoint is simulated and should be implemented in server.js
        const response = await fetch(`${API_URL}/doctor-request/${requestId}/resolve`, {
            method: 'PUT',
            headers: getAuthHeaders(),
        });
        
        if (response.status === 401 || response.status === 403) {
            if (authToken) {
                redirectToLogin("Access denied or session expired.");
            }
            return;
        }

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }
        
        loadAndRenderRequests();
        alert(`Request ${requestId} resolved successfully and removed from the queue.`);

    } catch (error) {
        console.error('Error resolving request:', error);
        alert('Failed to resolve request. Check console for details.');
    }
}

// Global function to load and render both alerts and queue
async function loadAndRenderRequests() {
    const requests = await fetchDoctorRequests();
    
    await updateDashboardSummary(requests); 
    renderSOSAlerts(requests);
    renderBookNowQueue(requests);
}

// --- 3. Patient and Staff View Functions ---

// Renders the patient list from the API
async function renderPatientList() {
    const patients = await fetchPatients();
    
    const tableBody = document.querySelector('#patient-details-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (patients.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="no-data-row">No patient records found.</td></tr>`;
        return;
    }

    patients.forEach(patient => {
        const row = tableBody.insertRow();
        
        // Map backend field names to frontend display
        const patientID = patient.id || patient._id; 
        const patientName = patient.name;
        const patientAge = patient.age;
        const patientRoom = patient.ward; 
        const patientCondition = patient.initialCondition;
        const patientAdmittedAt = new Date(patient.admittedAt).toLocaleDateString();
        
        const conditionClass = `status-badge ${patientCondition.toLowerCase()}-priority`;

        row.innerHTML = `
            <td>${patientID}</td>
            <td>${patientName}</td>
            <td>${patientAge}</td>
            <td>${patientRoom}</td>
            <td><span class="${conditionClass}">${patientCondition}</span></td>
            <td>${patientAdmittedAt}</td>
            <td>
                <button class="action-btn detail">View Profile</button>
            </td>
        `;
    });
    
    showView('patient-details-view');
}

// Sends patient admission data to the API
async function admitPatient(event) {
    event.preventDefault();
    
    const name = document.getElementById('new-patient-name').value;
    const age = parseInt(document.getElementById('new-patient-age').value);
    const ward = document.getElementById('new-patient-ward').value; 
    const initialCondition = document.getElementById('new-patient-condition').value;

    const patientData = {
        id: document.getElementById('new-patient-id').value,
        name: name, 
        age: age, 
        ward: ward, 
        initialCondition: initialCondition, 
    };
    
    try {
        const response = await fetch(`${API_URL}/admit-patient`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(patientData)
        });

        if (response.status === 401 || response.status === 403) {
            redirectToLogin("Access denied or session expired.");
            return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        alert(`Patient ${name} admitted successfully.`);
        document.getElementById('patient-admission-form').reset();
        
        showDashboard(); 
    } catch (error) {
        console.error('Admission Error:', error);
        alert('Failed to admit patient. Please check the server and console.');
    }
}

// Function to add new staff member 
async function addStaff(event) {
    event.preventDefault();
    
    const staffData = {
        id: document.getElementById('new-staff-id').value,
        name: document.getElementById('new-staff-name').value,
        role: document.getElementById('new-staff-role').value,
        shift: document.getElementById('new-staff-shift').value,
        contact: document.getElementById('new-staff-contact').value
    };
    
    try {
        const response = await fetch(`${API_URL}/staff`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(staffData)
        });

        if (response.status === 401 || response.status === 403) {
            redirectToLogin("Access denied or session expired.");
            return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        alert(`Staff member ${staffData.name} added successfully.`);
        document.getElementById('staff-admission-form').reset();
        
        // Return to the updated staffing report view
        showStaffingReport(); 
    } catch (error) {
        console.error('Add Staff Error:', error);
        alert('Failed to add staff member. Check the server and console.');
    }
}

// Function to delete a staff member (NEW)
async function deleteStaff(staffMongoId, staffName) {
    if (!confirm(`Are you sure you want to remove staff member ${staffName}? This action cannot be undone.`)) {
        return;
    }

    try {
        // Use DELETE method and pass the MongoDB _id in the URL parameter
        const response = await fetch(`${API_URL}/staff/${staffMongoId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.status === 401 || response.status === 403) {
            redirectToLogin("Access denied or session expired.");
            return;
        }

        if (response.status === 404) {
             alert('Staff member not found or they do not belong to this hospital.');
             showStaffingReport();
             return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        alert(`Staff member ${staffName} successfully removed.`);
        
        // Refresh the staffing report view to update the table
        showStaffingReport(); 
    } catch (error) {
        console.error('Delete Staff Error:', error);
        alert('Failed to remove staff member. Check the server and console.');
    }
}


// Renders the staff list from the API
async function showStaffingReport() {
    const staff = await fetchStaff(); // <-- Fetch from API
    
    const doctors = staff.filter(s => s.role.toLowerCase().includes('doctor') || s.role.toLowerCase().includes('physician') || s.role.toLowerCase().includes('surgeon'));
    const nurses = staff.filter(s => s.role.toLowerCase().includes('nurse'));
    const admin = staff.filter(s => s.role.toLowerCase().includes('admin') || s.role.toLowerCase().includes('admissions'));

    // Update summary counts
    document.getElementById('staff-doctors-count').textContent = doctors.length;
    document.getElementById('staff-nurses-count').textContent = nurses.length;
    document.getElementById('staff-admins-count').textContent = admin.length;


    // Render Detailed Staff List table
    const tableBody = document.getElementById('staffing-table-body');
    tableBody.innerHTML = '';
    
    if (staff.length === 0) {
        // Updated colspan to 6 to account for the new 'Actions' column
        tableBody.innerHTML = `<tr><td colspan="6" class="no-data-row">No staff records found for this hospital.</td></tr>`;
    } else {
        staff.forEach(s => {
            const row = tableBody.insertRow();
            
            // Logic to determine status class based on shift
            let statusText = s.shift;
            let statusClass = 'status-badge default-badge'; 
            if (s.shift.toLowerCase() === 'day') {
                statusText = 'On Duty (Day)';
                statusClass = 'status-badge low-priority';
            } else if (s.shift.toLowerCase() === 'night') {
                statusText = 'On Duty (Night)';
                statusClass = 'status-badge medium-priority';
            } else if (s.shift.toLowerCase() === 'on-call') {
                statusText = 'On Call';
                statusClass = 'status-badge default-badge';
            }
            
            row.innerHTML = `
                <td>${s.staffId}</td>
                <td>${s.name}</td>
                <td>${s.role}</td>
                <td><span class="${statusClass}">${statusText}</span></td>
                <td>${s.contact}</td>
                <td>
                    <button class="action-btn delete-btn" 
                        onclick="deleteStaff('${s._id}', '${s.name}')">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </td> `;
        });
    }

    showView('staffing-report-view');
}


/**
 * Logs the oxygen cylinder request to the console.
 */
function requestCylinders() {
    const quantityInput = document.getElementById('cylinder-quantity');
    const quantity = parseInt(quantityInput.value);
    
    // Placeholder for Hospital ID
    const hospitalId = "HOSP_JVKSHK_001"; 

    if (isNaN(quantity) || quantity <= 0) {
        alert("Please enter a valid quantity of oxygen cylinders (must be 1 or more).");
        return;
    }

    // Log the required information to the console
    console.log("--- Oxygen Cylinder Request Initiated ---");
    console.log(`Hospital ID: ${hospitalId}`);
    console.log(`Requested Quantity: ${quantity} cylinders`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log("-----------------------------------------");
    
    alert(`Request for ${quantity} oxygen cylinders logged to console (Simulation successful).`);
}


// --- 4. View Management Functions ---

function showView(viewId) {
    // All possible views must be hidden first
    document.getElementById('main-dashboard-view').style.display = 'none'; 
    document.getElementById('patient-details-view').style.display = 'none';
    document.getElementById('patient-admission-view').style.display = 'none';
    document.getElementById('staffing-report-view').style.display = 'none';
    document.getElementById('staff-admission-view').style.display = 'none'; // <-- New Staff View

    const requestedView = document.getElementById(viewId);
    if (requestedView) {
        // Handle all non-dashboard views
        if (viewId !== 'main-dashboard-view') {
            requestedView.style.display = 'block';
        } else {
            // Handle main dashboard view
            requestedView.style.display = 'flex'; 
        }
    }
}

function showDashboard() {
    showView('main-dashboard-view');
    loadAndRenderRequests(); 
}


// --- 5. Initialization ---

document.addEventListener('DOMContentLoaded', () => {

    // Initial load and auto-refresh setup
    showDashboard(); 
    setInterval(loadAndRenderRequests, REFRESH_INTERVAL); 

    // --- Event Listeners (Linking HTML to JS) ---
    
    const dashboardLink = document.querySelector('.logo h1'); 
    if (dashboardLink) {
        dashboardLink.style.cursor = 'pointer';
        dashboardLink.addEventListener('click', showDashboard);
    }
    
    // Quick Actions
    document.getElementById('admit-patient-btn').addEventListener('click', (event) => {
        event.preventDefault();
        showView('patient-admission-view');
    });

    document.getElementById('view-reports-btn').addEventListener('click', (event) => {
        event.preventDefault();
        renderPatientList();
    });

    document.getElementById('patient-admission-form').addEventListener('submit', admitPatient);

    // STAFF LOGIC LISTENERS
    document.getElementById('staff-admission-form').addEventListener('submit', addStaff);
    
    const addStaffBtn = document.getElementById('add-staff-btn');
    if (addStaffBtn) {
        addStaffBtn.addEventListener('click', (event) => {
            event.preventDefault();
            showView('staff-admission-view');
        });
    }

    // Back button from staff admission to staff report
    const backToStaffReportBtn = document.getElementById('back-to-staff-report-btn');
    if (backToStaffReportBtn) {
        backToStaffReportBtn.addEventListener('click', (event) => {
            event.preventDefault();
            showStaffingReport();
        });
    }

    // Navbar Links
    document.getElementById('staffing-link').addEventListener('click', (event) => {
        event.preventDefault();
        showStaffingReport(); 
    });
    
    document.getElementById('patient-details-link').addEventListener('click', (event) => {
        event.preventDefault();
        renderPatientList(); 
    });
    
    // Back Buttons (Navigation Fix)
    // NOTE: The IDs used here must match the buttons in hospital.html
    // If you used back-to-dashboard-from-admission-btn, it is also a back button
    // which should ideally call showDashboard() which loads requests again.
    document.getElementById('back-to-dashboard-from-patient-btn').addEventListener('click', (event) => {
        event.preventDefault();
        showDashboard();
    });
    document.getElementById('back-to-dashboard-from-admission-btn').addEventListener('click', (event) => {
        event.preventDefault();
        showDashboard();
    });
    
    // Logout Button
    document.getElementById('logout-hospital-btn').addEventListener('click', (event) => {
        event.preventDefault();
        redirectToLogin("You have been logged out.");
    });
});