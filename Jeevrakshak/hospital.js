// hospital.js (FINALIZED API-DRIVEN LOGIC with Staff Admission, Deletion, and PATIENT WORKFLOW)

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

    showCustomAlert(message, 'warning');

    // DELAY Redirect
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 2000);
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
            const patientName = request.patientName || 'Unknown Patient'; // Ensure patientName is available

            alertsContainer.innerHTML += `
                <div class="alert-item sos-alert" data-request-id="${request._id}">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div class="alert-info">
                        <h4>SOS! ${patientName} - ${criticality} PRIORITY</h4>
                        <p>Reason: ${request.reason || 'Immediate Assistance Required'}</p>
                    </div>
                    <span class="alert-time">${timeAgo}</span>
                    <button class="action-btn resolve" 
                        onclick="resolveRequestStart('${request._id}', '${patientName}')">
                        Acknowledge & Resolve
                    </button>
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
                    <button class="action-btn resolve hospital-btn" 
                        onclick="resolveRequestStart('${request._id}', '${patientName}')">
                        Resolve
                    </button>
                </div>
            </div>
        `;
    });
}


// --- 2. Queue Resolution Functions (Using PROMPT for quick action on dashboard - Kept as is) ---

// Entry point for Resolution using a simple prompt (used for dashboard queue)
// Entry point for Resolution using the NEW MODAL
function resolveRequestStart(requestId, patientName) {
    const modal = document.getElementById('resolve-request-modal');
    if (!modal) {
        console.error("Resolve modal not found.");
        return;
    }

    document.getElementById('resolve-request-id').value = requestId;
    document.getElementById('resolve-patient-name').textContent = patientName;
    document.getElementById('resolve-prescription-text').value = ''; // Clear previous input

    modal.style.display = 'flex';
}

function closeResolveModal() {
    const modal = document.getElementById('resolve-request-modal');
    if (modal) modal.style.display = 'none';
}

// Handler for the new Resolve Modal Form Submission
async function submitResolveRequest(event) {
    event.preventDefault();

    const requestId = document.getElementById('resolve-request-id').value;
    const patientName = document.getElementById('resolve-patient-name').textContent;
    const prescriptionText = document.getElementById('resolve-prescription-text').value;

    if (!prescriptionText.trim()) {
        showMessageModal("Warning", "Prescription/Notes cannot be empty.", "warning");
        return;
    }

    // Call the core logic
    await givePrescriptionAndResolve(requestId, patientName, prescriptionText);

    // Close modal on success (logic inside givePrescriptionAndResolve handles success msg)
    closeResolveModal();
}


// Function to Save Prescription & Resolve Request (used for dashboard queue - Kept as is)
async function givePrescriptionAndResolve(requestId, patientName, prescriptionText) {

    // 1. Prepare Prescription Data
    const prescriptionData = {
        requestId: requestId,
        patientName: patientName,
        prescription: prescriptionText,
        doctorName: 'Queue Resolution Staff'
    };

    try {
        // --- STEP 1: SAVE PRESCRIPTION ---
        console.log("Saving prescription...");
        const saveResponse = await fetch(`${API_URL}/prescriptions`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(prescriptionData)
        });

        if (saveResponse.status === 401 || saveResponse.status === 403) {
            redirectToLogin("Access denied or session expired.");
            return;
        }

        if (!saveResponse.ok) {
            const errorData = await saveResponse.json();
            throw new Error(errorData.message || `Failed to save prescription: HTTP status ${saveResponse.status}`);
        }

        // --- STEP 2: RESOLVE REQUEST (DELETE FROM QUEUE) ---
        console.log("Resolving request and deleting from queue...");
        const resolveResponse = await fetch(`${API_URL}/doctor-request/${requestId}/resolve`, {
            method: 'PUT',
            headers: getAuthHeaders(),
        });

        if (resolveResponse.status === 401 || resolveResponse.status === 403) {
            redirectToLogin("Access denied or session expired.");
            return;
        }

        if (!resolveResponse.ok) {
            const data = await resolveResponse.json();
            throw new Error(data.message || `Failed to resolve request status: HTTP status ${resolveResponse.status}`);
        }

        // Final UI Update
        loadAndRenderRequests();
        // showMessageModal("Success", `Prescription for ${patientName} sent and Request resolved successfully.`, "success");

    } catch (error) {
        console.error('Prescription/Resolution Error:', error);
        showMessageModal("Error", 'Failed to complete process. Check console.', "error");
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

    patients.forEach(p => {
        const row = tableBody.insertRow();

        const patientID = p.id || p._id;
        const patientName = p.name;
        const patientAge = p.age;
        const patientWard = p.ward;
        const patientCondition = p.initialCondition;
        const patientAdmittedAt = new Date(p.admittedAt).toLocaleDateString();

        const conditionClass = `status-badge ${patientCondition.toLowerCase()}-priority`;
        const patientMongoId = p._id;

        row.innerHTML = `
            <td>${patientID}</td>
            <td>${patientName}</td>
            <td>${patientAge}</td>
            <td>${patientWard}</td>
            <td><span class="${conditionClass}">${patientCondition}</span></td>
            <td>${patientAdmittedAt}</td>
            <td>
                <button class="action-btn detail" onclick="viewPatientProfile('${patientMongoId}')">View Profile</button>
                <button class="action-btn primary-action-btn" onclick="showPatientPrescriptionModal('${patientMongoId}', '${patientName}')">Prescribe</button>
                <button class="action-btn danger-action-btn" onclick="deletePatient('${patientMongoId}', '${patientName}')">Delete</button>
            </td>
        `;
    });

    showView('patient-details-view');
}

// Function to view a patient's profile (UPDATED to fetch and render prescription history)
async function viewPatientProfile(patientId) {
    try {
        const response = await fetch(`${API_URL}/patients/${patientId}/details`, { headers: getAuthHeaders() });

        if (response.status === 404) {
            showMessageModal("Error", 'Patient not found.', "error");
            renderPatientList();
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const patient = await response.json();

        // Populate header and action buttons
        const patientHeader = document.getElementById('patient-details-header');
        if (patientHeader) patientHeader.textContent = `Comprehensive Report for ${patient.name}`;

        const writePrescriptionBtn = document.getElementById('write-prescription-btn');
        if (writePrescriptionBtn) writePrescriptionBtn.onclick = () => showPatientPrescriptionModal(patient._id, patient.name);

        const deletePatientBtn = document.getElementById('delete-patient-btn');
        if (deletePatientBtn) deletePatientBtn.onclick = () => deletePatient(patient._id, patient.name);

        // Populate basic info 
        const basicInfoDiv = document.getElementById('patient-basic-info');
        if (basicInfoDiv) {
            basicInfoDiv.innerHTML = `
                <p><strong>Patient ID:</strong> ${patient.id || patient._id}</p>
                <p><strong>Patient Name:</strong> ${patient.name}</p>
                <p><strong>Age/Gender:</strong> ${patient.age} / ${patient.gender || 'N/A'}</p>
                <p><strong>Contact:</strong> ${patient.contact || 'N/A'}</p>
                <p><strong>Admitted At:</strong> ${new Date(patient.admittedAt).toLocaleDateString()}</p>
                <p><strong>Ward/Room:</strong> ${patient.ward}</p>
                <p><strong>Primary Ailment:</strong> ${patient.primaryAilment || 'N/A'}</p>
                <p><strong>Initial Condition:</strong> <span class="status-badge ${patient.initialCondition.toLowerCase()}-status">${patient.initialCondition}</span></p>
            `;
        }

        // Populate prescription history
        const prescriptionsDiv = document.getElementById('patient-prescription-history');
        if (prescriptionsDiv) {
            prescriptionsDiv.innerHTML = '';

            if (patient.prescriptions && patient.prescriptions.length > 0) {
                // Sort by date descending
                patient.prescriptions.sort((a, b) => new Date(b.prescribedAt) - new Date(a.prescribedAt));

                patient.prescriptions.forEach(p => {
                    const date = new Date(p.prescribedAt).toLocaleDateString();
                    const time = new Date(p.prescribedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    prescriptionsDiv.innerHTML += `
                        <div class="prescription-card glass-panel-sm">
                            <div class="header">
                                <i class="fas fa-pills"></i>
                                <div class="details">
                                    <h4>Prescribed by Dr. ${p.doctor || 'Hospital Staff'}</h4>
                                    <span class="date">${date} at ${time}</span>
                                </div>
                            </div>
                            <p class="prescription-text">${p.prescription.replace(/\n/g, '<br>')}</p>
                        </div>
                    `;
                });
            } else {
                prescriptionsDiv.innerHTML = '<p class="empty-list-message">No prescription history found for this patient.</p>';
            }
        }

        // Switch view to the single patient profile
        showView('single-patient-profile-view');

    } catch (error) {
        console.error('View Patient Profile Error:', error);
        showMessageModal("Error", 'Failed to fetch patient details.', "error");
    }
}

// Function to show the prescription modal for ADMITTED PATIENTS (NEW - uses HTML modal)
function showPatientPrescriptionModal(patientId, patientName) {
    const modal = document.getElementById('prescription-modal');
    if (!modal) {
        console.error("Prescription modal element not found.");
        return showMessageModal("Error", "Prescription modal not found in HTML. Check hospital.html structure.", "error");
    }

    document.getElementById('prescribe-patient-id').value = patientId;
    document.getElementById('prescribe-patient-name').textContent = patientName;

    const form = document.getElementById('prescription-form');
    if (form) form.reset();

    modal.style.display = 'flex';
}

// Function to handle prescription submission for ADMITTED PATIENTS (NEW)
async function submitPatientPrescription(event) {
    event.preventDefault();

    const patientId = document.getElementById('prescribe-patient-id').value;
    const patientName = document.getElementById('prescribe-patient-name').textContent;
    const prescriptionText = document.getElementById('prescription-text').value;
    const doctorName = document.getElementById('prescription-doctor-name').value || 'Hospital Staff';

    if (!prescriptionText) {
        showMessageModal("Warning", 'Prescription details cannot be empty.', "warning");
        return;
    }

    try {
        // Assumes the new /api/prescribe route exists on the server.
        const response = await fetch(`${API_URL}/prescribe`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ patientId, patientName, prescriptionText, doctorName })
        });

        if (response.status === 401 || response.status === 403) {
            redirectToLogin("Access denied or session expired.");
            return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        document.getElementById('prescription-modal').style.display = 'none';
        showMessageModal("Success", `Prescription for ${patientName} was sent successfully.`, "success");

        // Refresh the profile view if the user is currently on it
        if (document.getElementById('single-patient-profile-view').style.display === 'block') {
            viewPatientProfile(patientId);
        } else {
            renderPatientList();
        }

    } catch (error) {
        console.error('Submit Patient Prescription Error:', error);
        showMessageModal("Error", 'Failed to save prescription. Check the server.', "error");
    }
}

// --- CONFIRMATION MODAL LOGIC (Generic) ---
let confirmationCallback = null;

function showConfirmationModal(title, message, callback) {
    const modal = document.getElementById('confirmation-modal');
    if (!modal) return;

    document.getElementById('confirmation-title').textContent = title;
    document.getElementById('confirmation-message').textContent = message;

    confirmationCallback = callback;
    modal.style.display = 'flex';
}

function closeConfirmationModal() {
    const modal = document.getElementById('confirmation-modal');
    if (modal) modal.style.display = 'none';
    confirmationCallback = null; // Reset callback
}

// Global listener for the confirm button needs to be added once or managed correctly.
// To avoid multiple listeners, we can assign the onclick directly in the show function or here if we use a global var.
// Better approach: Assign onclick in showConfirmationModal or use a static listener that calls the global callback.

// Function to delete a patient (Direct Delete - No Confirmation)
async function deletePatient(patientId, patientName) {
    try {
        // Assumes /api/patients/:id DELETE route exists on the server.
        const response = await fetch(`${API_URL}/patients/${patientId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.status === 401 || response.status === 403) {
            redirectToLogin("Access denied or session expired.");
            return;
        }

        if (response.status === 404) {
            showMessageModal("Error", 'Patient not found or already removed.', "error");
            renderPatientList();
            return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        // SUCCESS: Use the Generic Message Modal ("Box")
        showMessageModal("Success", `Patient ${patientName} record successfully discharged and deleted.`, "success");

        // Return to the patient list after deletion
        renderPatientList();
        // If viewing profile, switch back
        if (document.getElementById('single-patient-profile-view').style.display === 'block') {
            showView('patient-details-view');
        }

    } catch (error) {
        console.error('Delete Patient Error:', error);
        showMessageModal("Error", 'Failed to delete patient record. Check the server.', "error");
    }
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

        showMessageModal("Success", `Patient ${name} admitted successfully.`, "success");
        document.getElementById('patient-admission-form').reset();

        showDashboard();
    } catch (error) {
        console.error('Admission Error:', error);
        showMessageModal("Error", 'Failed to admit patient. Please check the server.', "error");
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

        showMessageModal("Success", `Staff member ${staffData.name} added successfully.`, "success");
        document.getElementById('staff-admission-form').reset();

        // Return to the updated staffing report view
        showStaffingReport();
    } catch (error) {
        console.error('Add Staff Error:', error);
        showMessageModal("Error", 'Failed to add staff member. Check the server.', "error");
    }
}

// Function to delete a staff member (Direct Delete - No Confirmation)
async function deleteStaff(staffMongoId, staffName) {
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
            showMessageModal("Error", 'Staff member not found or they do not belong to this hospital.', "error");
            showStaffingReport();
            return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        showMessageModal("Success", `Staff member ${staffName} successfully removed.`, "success");

        // Refresh the staffing report view to update the table
        showStaffingReport();
    } catch (error) {
        console.error('Delete Staff Error:', error);
        showMessageModal("Error", 'Failed to remove staff member. Check the server.', "error");
    }
}


// Helper to update UI counters for staff (Both Dashboard and Report)
function updateStaffCounters(staff) {
    const doctors = staff.filter(s => s.role.toLowerCase().includes('doctor') || s.role.toLowerCase().includes('physician') || s.role.toLowerCase().includes('surgeon')).length;
    const nurses = staff.filter(s => s.role.toLowerCase().includes('nurse')).length;
    const admin = staff.filter(s => s.role.toLowerCase().includes('admin') || s.role.toLowerCase().includes('admissions')).length;

    // Update Dashboard Counts
    if (document.getElementById('dashboard-staff-doctors-count')) document.getElementById('dashboard-staff-doctors-count').textContent = doctors;
    if (document.getElementById('dashboard-staff-nurses-count')) document.getElementById('dashboard-staff-nurses-count').textContent = nurses;
    if (document.getElementById('dashboard-staff-admins-count')) document.getElementById('dashboard-staff-admins-count').textContent = admin;

    // Update Report Counts
    if (document.getElementById('report-staff-doctors-count')) document.getElementById('report-staff-doctors-count').textContent = doctors;
    if (document.getElementById('report-staff-nurses-count')) document.getElementById('report-staff-nurses-count').textContent = nurses;
    if (document.getElementById('report-staff-admins-count')) document.getElementById('report-staff-admins-count').textContent = admin;
}

// Renders the staff list from the API 
async function showStaffingReport() {
    const staff = await fetchStaff();

    // CENTRALLY UPDATE ALL COUNTERS (Dashboard & Report)
    updateStaffCounters(staff);

    // Filter for local variables if needed for other logic, or just use staff for table
    // (We can remove the redundant filtering here if we move it to the helper, 
    // but the helper updates DOM. We still need the list for the table if we want to loop 'staff' directly)
    // The original code filtered for counts, but now we use the helper for counts.
    // The table rendering below uses the full 'staff' array anyway.


    // Render Detailed Staff List table
    const tableBody = document.getElementById('staffing-table-body');
    tableBody.innerHTML = '';

    if (staff.length === 0) {
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
        showCustomAlert("Please enter a valid quantity of oxygen cylinders (must be 1 or more).", "warning");
        return;
    }

    // Log the required information to the console
    console.log("--- Oxygen Cylinder Request Initiated ---");
    console.log(`Hospital ID: ${hospitalId}`);
    console.log(`Requested Quantity: ${quantity} cylinders`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log("-----------------------------------------");

    showCustomAlert(`Request for ${quantity} oxygen cylinders logged to console (Simulation successful).`, "success");
}


// --- 4. View Management Functions ---

// Function to manage view visibility (UPDATED to include new views)
function showView(viewId) {
    // All possible views must be hidden first
    document.getElementById('main-dashboard-view').style.display = 'none';
    document.getElementById('patient-details-view').style.display = 'none';
    document.getElementById('patient-admission-view').style.display = 'none';
    document.getElementById('staffing-report-view').style.display = 'none';
    document.getElementById('staff-admission-view').style.display = 'none';

    // NEW VIEWS
    const singlePatientProfileView = document.getElementById('single-patient-profile-view');
    if (singlePatientProfileView) {
        singlePatientProfileView.style.display = 'none';
    }

    // NOTE: The prescription modal uses 'display: flex' for visibility
    const prescriptionModal = document.getElementById('prescription-modal');
    if (prescriptionModal) {
        prescriptionModal.style.display = 'none';
    }


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

async function showDashboard() {
    showView('main-dashboard-view');
    loadAndRenderRequests();

    // Ensure staff counts are updated on dashboard load
    const staff = await fetchStaff();
    updateStaffCounters(staff);
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
    // Staffing Report View button
    const addStaffReportBtn = document.getElementById('add-staff-report-btn');

    if (addStaffBtn) {
        addStaffBtn.addEventListener('click', (event) => {
            event.preventDefault();
            showView('staff-admission-view');
        });
    }

    if (addStaffReportBtn) {
        addStaffReportBtn.addEventListener('click', (event) => {
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

    // NEW Back button from single patient profile to patient list
    const backToPatientListFromProfileBtn = document.getElementById('back-to-patient-list-from-profile-btn');
    if (backToPatientListFromProfileBtn) {
        backToPatientListFromProfileBtn.addEventListener('click', (event) => {
            event.preventDefault();
            renderPatientList();
        });
    }

    // NEW Prescription Form Submission
    const prescriptionForm = document.getElementById('prescription-form');
    // FIX: Attach the correct submit handler for the HTML modal
    if (prescriptionForm) {
        prescriptionForm.addEventListener('submit', submitPatientPrescription);
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
    document.getElementById('back-to-dashboard-from-patient-btn').addEventListener('click', (event) => {
        event.preventDefault();
        showDashboard();
    });
    document.getElementById('back-to-dashboard-from-admission-btn').addEventListener('click', (event) => {
        event.preventDefault();
        showDashboard();
    });

    // --- LOGOUT & PROFILE DROPDOWN (NEW) ---
    const profileTrigger = document.getElementById('profile-trigger');
    const profileDropdown = document.getElementById('hospital-profile-dropdown');

    if (profileTrigger && profileDropdown) {
        profileTrigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            profileDropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!profileTrigger.contains(e.target) && !profileDropdown.contains(e.target)) {
                profileDropdown.classList.remove('show');
            }
        });
    }

    const logoutBtn = document.getElementById('logout-hospital-btn-dropdown');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (event) => {
            event.preventDefault();
            redirectToLogin("You have been logged out.");
        });
    }

    // --- NEW EVENT LISTENERS FOR MODALS ---
    const resolveForm = document.getElementById('resolve-request-form');
    if (resolveForm) {
        resolveForm.addEventListener('submit', submitResolveRequest);
    }

    // FIX: Back Button for Staffing Report
    const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
    if (backToDashboardBtn) {
        backToDashboardBtn.addEventListener('click', (event) => {
            event.preventDefault();
            showDashboard();
        });
    }

    // --- CONFIRMATION MODAL BUTTON ---
    const confirmActionBtn = document.getElementById('confirm-action-btn');
    if (confirmActionBtn) {
        confirmActionBtn.addEventListener('click', () => {
            if (typeof confirmationCallback === 'function') {
                confirmationCallback();
            }
            closeConfirmationModal();
        });
    }

});

// --- NEW HELPER FUNCTIONS FOR MODALS ---

function showMessageModal(title, message, type = 'success') {
    const modal = document.getElementById('message-modal');
    if (!modal) return;

    // Update Content
    document.getElementById('msg-modal-title').textContent = title;
    document.getElementById('msg-modal-text').textContent = message;

    // Update Icon/Style
    const iconWrapper = document.getElementById('msg-modal-icon-wrapper');
    const icon = document.getElementById('msg-modal-icon');

    // Reset classes
    iconWrapper.className = 'message-icon-wrapper';
    icon.className = 'fas';

    if (type === 'success') {
        iconWrapper.classList.add('success');
        icon.classList.add('fa-check-circle');
    } else if (type === 'error') {
        iconWrapper.classList.add('error');
        icon.classList.add('fa-times-circle');
    } else if (type === 'warning') {
        iconWrapper.classList.add('warning');
        icon.classList.add('fa-exclamation-triangle');
    } else {
        iconWrapper.classList.add('info');
        icon.classList.add('fa-info-circle');
    }

    modal.style.display = 'flex';
}

function closeMessageModal() {
    const modal = document.getElementById('message-modal');
    if (modal) modal.style.display = 'none';
}