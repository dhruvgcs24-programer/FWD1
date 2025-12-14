// server.js (Complete Backend Code with Location-Based Routing, Prescriptions, and Resolution)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = "JeevrakshakDB";
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGO_URI || !JWT_SECRET) {
    console.error("FATAL ERROR: MONGO_URI or JWT_SECRET is not defined in .env file.");
    process.exit(1);
}

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// --- MongoDB Setup ---
let db;
const client = new MongoClient(MONGO_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function connectToMongo() {
    try {
        await client.connect();
        db = client.db(DB_NAME);
        console.log(`Successfully connected to MongoDB! Database: ${DB_NAME}`);
    } catch (e) {
        console.error("Could not connect to MongoDB:", e);
        process.exit(1);
    }
}


// --- Location & Distance Utility ---

/**
 * Calculates the distance between two geographical points using the Haversine formula.
 * @returns {number} Distance in kilometers.
 */
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in kilometers
    const toRad = (deg) => deg * (Math.PI / 180);

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Finds the nearest hospital to the given patient location.
 * @param {number} patientLat 
 * @param {number} patientLng 
 * @returns {{hospital: object, distance: number}|null}
 */
async function findNearestHospital(patientLat, patientLng) {
    const usersCollection = db.collection('users');
    const allHospitals = await usersCollection.find({ role: 'hospital', status: 'APPROVED' }).toArray();

    let nearestHospital = null;
    let minDistance = Infinity;

    for (const hospital of allHospitals) {
        const hLat = hospital.location ? parseFloat(hospital.location.lat) : null;
        const hLng = hospital.location ? parseFloat(hospital.location.lng) : null;

        if (hLat !== null && hLng !== null) {
            const distance = getDistance(patientLat, patientLng, hLat, hLng);

            if (distance < minDistance) {
                minDistance = distance;
                nearestHospital = hospital;
            }
        }
    }

    if (nearestHospital) {
        return { hospital: nearestHospital, distance: minDistance };
    }
    return null;
}

// --- Nodemailer setup for approval emails ---
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function sendHospitalApprovalEmail(email, hospitalId) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your Hospital Has Been Approved",
        html: `
            <h2>Congratulations!</h2>
            <p>Your hospital has been verified and approved.</p>
            <p><strong>Hospital ID:</strong> ${hospitalId}</p>
            <p>Use this Hospital ID to log in. If you were given a temporary password during registration, use that to sign in and then change it in the profile.</p>
            <p>— Jeevrakshak Team</p>
        `
    };

    transporter.sendMail(mailOptions, (err, info) => {
        if (err) console.error("Email error:", err);
        else console.log("Approval email sent:", info.response);
    });
}

// Helper to generate a unique hospital ID
function generateHospitalId() {
    return "HSP-" + Math.floor(100000 + Math.random() * 900000);
}

// --- JWT Authentication Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ message: 'Authentication token required.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error("JWT Error:", err.message);
            // Return 403 Forbidden on invalid token
            return res.status(403).json({ message: 'Invalid or expired token.' });
        }
        req.user = user;
        next();
    });
};

// ------------------------------------
// --- AUTHENTICATION ROUTES (Patient & Hospital Login/Registration)
// ------------------------------------

// POST /api/register/patient (New Patient Signup)
app.post('/api/register/patient', async (req, res) => {
    const { username, password, location } = req.body;
    const usersCollection = db.collection('users');
    const existingUser = await usersCollection.findOne({ username });

    if (existingUser) {
        return res.status(409).json({ message: 'Username already exists.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            username,
            password: hashedPassword,
            role: 'patient',
            location: location || null, // Save initial location
            createdAt: new Date()
        };
        await usersCollection.insertOne(newUser);

        const token = jwt.sign({ username: newUser.username, role: newUser.role, id: newUser._id.toString() }, JWT_SECRET, { expiresIn: '1h' });
        res.status(201).json({ message: 'Patient registered successfully.', username, token });
    } catch (e) {
        console.error("Registration Error:", e);
        res.status(500).json({ message: 'Internal server error during registration.' });
    }
});

// POST /api/register/hospital (Hospital Signup with documents)
app.post('/api/register/hospital', async (req, res) => {
    // Expected body: { name, email, password, location: {lat,lng}, proofUrl }
    const { name, email, password, location, proofUrl } = req.body;
    const usersCollection = db.collection('users');
    const existingUser = await usersCollection.findOne({ email });

    if (existingUser) {
        return res.status(409).json({ message: 'Hospital already registered with this email.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const newHospital = {
            name,
            email,
            password: hashedPassword,
            role: 'hospital',
            location,
            proofUrl,
            status: 'PENDING',  // IMPORTANT
            createdAt: new Date()
        };

        await usersCollection.insertOne(newHospital);

        res.status(201).json({
            message: 'Hospital registration submitted. Pending verification by admin.'
        });

    } catch (error) {
        console.error('Hospital registration error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// POST /api/login (Patient or Hospital Login)
app.post('/api/login', async (req, res) => {
    // For hospital login ensure status === 'APPROVED'
    const { username, password, role, location } = req.body;
    const usersCollection = db.collection('users');

    try {
        // when role === 'hospital', username can be email or hospitalId depending on your choice.
        let query = { username, role };

        // Fall back: allow hospital login by hospitalId as well
        if (role === 'hospital') {
            query = { $or: [{ username }, { email: username }, { hospitalId: username }], role };
        }

        const user = await usersCollection.findOne(query);

        if (!user) {
            return res.status(400).json({ message: 'Invalid username or password.' });
        }

        if (!(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ message: 'Invalid username or password.' });
        }

        if (role === 'hospital' && user.status !== 'APPROVED') {
            return res.status(403).json({ message: 'Hospital registration pending admin approval.' });
        }

        // If patient provides new location during login, update it
        if (role === 'patient' && location) {
            await usersCollection.updateOne(
                { _id: user._id },
                { $set: { location: location } }
            );
        }

        const token = jwt.sign({ username: user.username, role: user.role, id: user._id.toString() }, JWT_SECRET, { expiresIn: '12h' });

        // Add hospitalId to response if available
        const responsePayload = {
            message: 'Login successful.',
            username: user.username,
            role: user.role,
            token,
            id: user._id.toString()
        };
        if (user.hospitalId) {
            responsePayload.hospitalId = user.hospitalId;
        }

        res.json(responsePayload);

    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ message: 'Internal server error during login.' });
    }
});


// ------------------------------------
// --- ADMIN ROUTES (Hospital Approval)
// ------------------------------------

// GET /api/hospitals/pending
app.get('/api/hospitals/pending', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admin can view pending hospitals.' });
    }

    try {
        const hospitals = await db.collection('users')
            .find({ role: 'hospital', status: 'PENDING' })
            .toArray();

        res.json(hospitals);
    } catch (e) {
        console.error('Fetch Pending Hospitals Error:', e);
        res.status(500).json({ message: 'Error fetching pending hospitals.' });
    }
});

// PUT /api/hospital/approve/:id
app.put('/api/hospital/approve/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admin can approve hospitals.' });
    }

    const hospitalIdParam = req.params.id;
    const usersCollection = db.collection('users');

    try {
        const hospital = await usersCollection.findOne({ _id: new ObjectId(hospitalIdParam) });

        if (!hospital) return res.status(404).json({ message: 'Hospital not found.' });

        const newHospitalId = generateHospitalId();

        await usersCollection.updateOne(
            { _id: new ObjectId(hospitalIdParam) },
            { $set: { status: 'APPROVED', hospitalId: newHospitalId } }
        );

        // Send Email
        sendHospitalApprovalEmail(hospital.email, newHospitalId);

        res.json({ message: 'Hospital approved successfully.', hospitalId: newHospitalId });

    } catch (e) {
        console.error('Approval Error:', e);
        res.status(500).json({ message: 'Error approving hospital.' });
    }
});

// ------------------------------------
// --- PATIENT ROUTES (Needs Auth)
// ------------------------------------

// POST /api/goals (Save/Update Patient Goals)
app.post('/api/goals', authenticateToken, async (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ message: 'Access denied.' });

    try {
        const { goals } = req.body;
        const patientName = req.user.username; // Use username from JWT for security

        await db.collection('goals').updateOne(
            { patientName: patientName },
            { $set: { goals, updatedAt: new Date() } },
            { upsert: true }
        );

        res.json({ message: 'Goals updated successfully.' });
    } catch (e) {
        console.error('Goal Update Error:', e);
        res.status(500).json({ message: 'Error updating goals.' });
    }
});

// GET /api/goals/:patientName (Fetch Patient Goals)
app.get('/api/goals/:patientName', authenticateToken, async (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ message: 'Access denied.' });

    const patientNameParam = req.params.patientName;
    if (patientNameParam !== req.user.username) {
        return res.status(403).json({ message: 'Access denied to other patient\'s data.' });
    }

    try {
        const goalsRecord = await db.collection('goals').findOne({ patientName: patientNameParam });

        if (!goalsRecord) {
            return res.status(404).json({ message: 'No goals found for this patient.' });
        }

        res.json(goalsRecord.goals);
    } catch (e) {
        console.error('Fetch Goals Error:', e);
        res.status(500).json({ message: 'Error fetching goals.' });
    }
});

// POST /api/sos (Emergency SOS Request)
app.post('/api/sos', async (req, res) => {
    const { patientName, reason, location } = req.body; // location: {lat, lng}

    if (!location || !location.lat || !location.lng) {
        return res.status(400).json({ message: "Location is required for SOS dispatch." });
    }

    try {
        const nearest = await findNearestHospital(location.lat, location.lng);

        if (!nearest) {
            return res.status(503).json({ message: "No operational hospitals found." });
        }

        const newRequest = {
            patientName,
            reason: `🚨 SOS Alert: ${reason}`,
            criticality: 'HIGH', // Force HIGH for SOS
            location,
            hospitalId: nearest.hospital._id.toString(),
            hospitalName: nearest.hospital.username || nearest.hospital.name,
            timestamp: new Date(),
            type: 'SOS',
            status: 'PENDING'
        };

        await db.collection('doctorRequests').insertOne(newRequest);

        res.status(201).json({
            message: "SOS request dispatched.",
            hospitalName: nearest.hospital.username || nearest.hospital.name,
            distance: nearest.distance,
        });

    } catch (e) {
        console.error('Error handling SOS request:', e);
        res.status(500).json({ message: 'Internal server error during SOS dispatch.' });
    }
});

// POST /api/doctor-request (Standard Doctor Connection Request)
app.post('/api/doctor-request', async (req, res) => {
    // This endpoint is generally public for fast access
    const { patientName, reason, criticality, location } = req.body;

    if (!location || !location.lat || !location.lng) {
        return res.status(400).json({ message: "Location is required for doctor connection." });
    }

    try {
        const nearest = await findNearestHospital(location.lat, location.lng);

        if (!nearest) {
            return res.status(503).json({ message: "No operational hospitals found." });
        }

        const newRequest = {
            patientName,
            reason,
            criticality: criticality ? criticality.toUpperCase() : 'LOW',
            location,
            hospitalId: nearest.hospital._id.toString(),
            hospitalName: nearest.hospital.username || nearest.hospital.name,
            timestamp: new Date(),
            type: 'DOCTOR_CONNECT',
            status: 'PENDING'
        };

        await db.collection('doctorRequests').insertOne(newRequest);

        res.status(201).json({
            message: "Doctor request dispatched.",
            hospitalName: nearest.hospital.username || nearest.hospital.name,
            distance: nearest.distance,
        });
    } catch (e) {
        console.error('Error handling doctor request:', e);
        res.status(500).json({ message: 'Internal server error during doctor request.' });
    }
});

// GET /api/prescriptions/:patientName (Fetch Patient Prescriptions) (NEW)
app.get('/api/prescriptions/:patientName', authenticateToken, async (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ message: 'Access denied.' });

    const patientNameParam = req.params.patientName;

    // Security check: Ensure the name in the URL matches the logged-in user's name
    if (patientNameParam !== req.user.username) {
        return res.status(403).json({ message: 'Access denied to other patient\'s data.' });
    }

    try {
        const prescriptions = await db.collection('prescriptions')
            .find({ patientName: patientNameParam })
            .sort({ prescribedAt: -1 })
            .toArray();

        res.json(prescriptions);
    } catch (e) {
        console.error('Fetch Prescriptions Error:', e);
        res.status(500).json({ message: 'Error fetching prescriptions.' });
    }
});


// ------------------------------------
// --- HOSPITAL ROUTES (Needs Auth)
// ------------------------------------

// POST /api/admit-patient
app.post('/api/admit-patient', authenticateToken, async (req, res) => {
    if (req.user.role !== 'hospital') return res.status(403).json({ message: 'Access denied.' });
    
    // Expected body: { id, name, age, ward, initialCondition }
    const patientData = req.body;

    // Basic validation
    if (!patientData.id || !patientData.name || !patientData.age) {
        return res.status(400).json({ message: 'Missing required patient fields.' });
    }
    
    try {
        const admittedPatient = {
            ...patientData,
            hospitalId: req.user.id,
            admittedAt: new Date(),
        };

        await db.collection('admittedPatients').insertOne(admittedPatient);
        res.status(201).json({ message: 'Patient admitted successfully.' });
        
    } catch (e) {
        console.error('Admission Error:', e);
        res.status(500).json({ message: 'Error admitting patient.' });
    }
});


// GET /api/patients (View Patient Details Button)
app.get('/api/patients', authenticateToken, async (req, res) => {
    if (req.user.role !== 'hospital') return res.status(403).json({ message: 'Access denied.' });
    try {
        // Fetch only patients admitted to this hospital
        const patients = await db.collection('admittedPatients')
            .find({ hospitalId: req.user.id })
            .sort({ admittedAt: -1 })
            .toArray();

        res.json(patients);
    } catch (e) {
        console.error('Fetch Patients Error:', e);
        res.status(500).json({ message: 'Error fetching patient list.' });
    }
});

// GET /api/doctor-requests (Hospital Staff View Queue)
app.get('/api/doctor-requests', authenticateToken, async (req, res) => {
    if (req.user.role !== 'hospital') return res.status(403).json({ message: 'Access denied.' });
    try {
        const requests = await db.collection('doctorRequests')
            .find({
                status: 'PENDING',
                hospitalId: req.user.id
            })
            .sort({ criticality: -1, timestamp: 1 })
            .toArray();
        res.json(requests);
    } catch (e) {
        console.error('Fetch Requests Error:', e);
        res.status(500).json({ message: 'Error fetching doctor requests.' });
    }
});

// PUT /api/doctor-request/:id/resolve (Resolve Doctor Request) (NEW)
app.put('/api/doctor-request/:id/resolve', authenticateToken, async (req, res) => {
    if (req.user.role !== 'hospital') return res.status(403).json({ message: 'Access denied.' });

    const requestId = req.params.id;
    
    // --- FIX 2: Validate ObjectID before creating it to prevent server crash (the source of the 'Failed' alert) ---
    if (!ObjectId.isValid(requestId)) {
        console.warn('Attempted resolution with invalid Request ID:', requestId);
        return res.status(400).json({ message: 'Invalid format for request ID.' });
    }
    // --- END FIX 2 ---

    try {
        // Delete the request from the queue
        const result = await db.collection('doctorRequests').deleteOne({
            _id: new ObjectId(requestId), // Now safe because it was checked
            hospitalId: req.user.id // Security check
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Request not found or already resolved.' });
        }

        res.json({ message: 'Request resolved and deleted successfully.' });
    } catch (e) {
        console.error('Resolve Request Error:', e);
        res.status(500).json({ message: 'Error resolving request.' });
    }
});

// POST /api/prescriptions (Save new prescription) (NEW)
app.post('/api/prescriptions', authenticateToken, async (req, res) => {
    if (req.user.role !== 'hospital') return res.status(403).json({ message: 'Access denied.' });

    const { requestId, patientName, prescription } = req.body;

    if (!requestId || !patientName || !prescription) {
        return res.status(400).json({ message: 'Missing required prescription fields.' });
    }

    try {
        // --- FIX 1: Fetch the Hospital's registered Name ---
        // The hospital's actual name is stored in the 'name' field, not always 'username'.
        const hospitalUser = await db.collection('users').findOne(
            { _id: new ObjectId(req.user.id), role: 'hospital' },
            { projection: { name: 1 } } // Only fetch the 'name' field
        );
        
        // Use the fetched 'name' or a fallback
        const actualHospitalName = hospitalUser && hospitalUser.name ? hospitalUser.name : 'Unknown Hospital';
        // --- END FIX 1 ---

        const newPrescription = {
            requestId: requestId,
            patientName: patientName,
            hospitalId: req.user.id,
            hospitalName: actualHospitalName, // Use the correct fetched name (Fixes Hospital N/A)
            doctor: 'Hospital Staff', // Use a default name, as client only provides prescription text (Fixes Doctor N/A)
            prescription: prescription,
            prescribedAt: new Date()
        };

        await db.collection('prescriptions').insertOne(newPrescription);
        res.status(201).json({ message: 'Prescription saved successfully.' });
    } catch (e) {
        console.error('Save Prescription Error:', e);
        res.status(500).json({ message: 'Error saving prescription.' });
    }
});
// POST /api/staff (Add New Staff)
app.post('/api/staff', authenticateToken, async (req, res) => {
    if (req.user.role !== 'hospital') return res.status(403).json({ message: 'Access denied.' });
    
    const staffData = req.body;

    if (!staffData.id || !staffData.name || !staffData.role) {
        return res.status(400).json({ message: 'Missing required staff fields.' });
    }

    try {
        const newStaff = {
            ...staffData,
            hospitalId: req.user.id,
            addedAt: new Date(),
        };

        await db.collection('hospitalStaff').insertOne(newStaff);
        res.status(201).json({ message: 'Staff member added successfully.' });
    } catch (e) {
        console.error('Add Staff Error:', e);
        res.status(500).json({ message: 'Error adding staff member.' });
    }
});

// GET /api/staff (Fetch Staff List)
app.get('/api/staff', authenticateToken, async (req, res) => {
    if (req.user.role !== 'hospital') return res.status(403).json({ message: 'Access denied.' });

    try {
        // Fetch only staff assigned to this hospital
        const staff = await db.collection('hospitalStaff')
            .find({ hospitalId: req.user.id }) // CRUCIAL: Only retrieve staff for this hospital
            .sort({ role: 1, name: 1 })
            .toArray();

        res.json(staff);
    } catch (e) {
        console.error('Fetch Staff Error:', e);
        res.status(500).json({ message: 'Error fetching staff list.' });
    }
});

// DELETE /api/staff/:id (Delete Staff Member)
app.delete('/api/staff/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'hospital') return res.status(403).json({ message: 'Access denied.' });

    const staffId = req.params.id;
    
    try {
        const result = await db.collection('hospitalStaff').deleteOne({
            _id: new ObjectId(staffId),
            hospitalId: req.user.id // Security check: Ensure hospital can only delete its own staff
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Staff member not found or already removed.' });
        }

        res.json({ message: 'Staff member removed successfully.' });
    } catch (e) {
        console.error('Delete Staff Error:', e);
        res.status(500).json({ message: 'Error removing staff member.' });
    }
});

app.delete('/api/patients/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'hospital') return res.status(403).json({ message: 'Access denied.' });

    const patientId = req.params.id;

    try {
        const result = await db.collection('admittedPatients').deleteOne({
            _id: new ObjectId(patientId),
            hospitalId: req.user.id // Security check
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Patient not found or already removed.' });
        }

        // OPTIONAL: Delete related prescriptions if desired
        // await db.collection('prescriptions').deleteMany({ patientId: patientId });

        res.json({ message: 'Patient record removed successfully.' });
    } catch (e) {
        console.error('Delete Patient Error:', e);
        res.status(500).json({ message: 'Error removing patient record.' });
    }
});

// --- NEW ROUTE: GET Patient Full Details (Details + Prescriptions) ---
app.get('/api/patients/:id/details', authenticateToken, async (req, res) => {
    if (req.user.role !== 'hospital') return res.status(403).json({ message: 'Access denied.' });

    const patientId = req.params.id;

    try {
        const patient = await db.collection('admittedPatients').findOne({
            _id: new ObjectId(patientId),
            hospitalId: req.user.id
        });

        if (!patient) return res.status(404).json({ message: 'Patient not found.' });
        
        // Find all prescriptions for this patient by their name (assuming 'name' is the lookup key)
        const prescriptions = await db.collection('prescriptions')
            .find({ patientName: patient.name })
            .sort({ prescribedAt: -1 })
            .toArray();
            
        // Return patient details merged with their prescriptions
        res.json({ ...patient, prescriptions });
        
    } catch (e) {
        console.error('Fetch Patient Details Error:', e);
        res.status(500).json({ message: 'Error fetching patient details.' });
    }
});

// --- NEW ROUTE: POST Prescription (For direct prescription after admission) ---
app.post('/api/prescribe', authenticateToken, async (req, res) => {
    if (req.user.role !== 'hospital') return res.status(403).json({ message: 'Access denied.' });
    const { patientId, patientName, prescriptionText, doctorName } = req.body;
    
    if (!patientId || !patientName || !prescriptionText) {
        return res.status(400).json({ message: 'Missing required prescription fields.' });
    }
    
    // Retrieve hospital name from user data
    const hospitalUser = await db.collection('users').findOne(
        { _id: new ObjectId(req.user.id), role: 'hospital' }, 
        { projection: { name: 1 } }
    );
    const hospitalName = hospitalUser?.name || 'Unknown Hospital';

    const prescription = {
        patientName,
        patientId: patientId,
        doctor: doctorName || 'Hospital Staff',
        prescription: prescriptionText,
        hospitalName,
        prescribedAt: new Date(),
    };

    try {
        await db.collection('prescriptions').insertOne(prescription);
        res.status(201).json({ message: 'Prescription saved successfully.' });
    } catch (e) {
        console.error('Prescribe Error:', e);
        res.status(500).json({ message: 'Error saving prescription.' });
    }
});


// ------------------------------------
// --- SERVER STARTUP
// ------------------------------------

app.listen(PORT, async () => {
    await connectToMongo();
    console.log(`Server is running on port ${PORT}`);
});