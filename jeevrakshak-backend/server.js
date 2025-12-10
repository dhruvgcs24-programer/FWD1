// server.js (Complete Backend Code with Location-Based Routing)

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
        await ensureAdminHospitalUser(); // Ensure a hospital exists for routing
    } catch (e) {
        console.error("Could not connect to MongoDB:", e);
        process.exit(1);
    }
}

async function ensureAdminHospitalUser() {
    const usersCollection = db.collection('users');
    const hospital = await usersCollection.findOne({ role: 'hospital', username: 'HospitalAdmin' });

    if (!hospital) {
        console.log("Creating default HospitalAdmin user.");
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await usersCollection.insertOne({
            username: 'HospitalAdmin',
            password: hashedPassword,
            role: 'hospital',
            location: { // Default Bengaluru location for testing
                lat: 12.9716,
                lng: 77.5946
            },
            status: 'APPROVED',
            hospitalId: "HSP-ADMIN-000"
        });
        console.log("HospitalAdmin created with password 'admin123'.");
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
            return res.status(403).json({ message: 'Hospital not approved yet.' });
        }

        // 1. Update user location upon successful login
        const updateDoc = {};
        if (location && (role === 'patient' || role === 'hospital')) {
            updateDoc.location = location;
            await usersCollection.updateOne({ _id: user._id }, { $set: updateDoc });
        }

        const token = jwt.sign({ username: user.username, role: user.role, id: user._id.toString() }, JWT_SECRET, { expiresIn: '1h' });
        res.status(200).json({ message: 'Login successful.', token, username: user.username, role: user.role });

    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ message: 'Internal server error during login.' });
    }
});

// ------------------------------------
// --- ADMIN: Pending Hospitals & Approve
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
        const patientName = req.user.username;

        await db.collection('patientGoals').updateOne(
            { patientName },
            { $set: { patientName, goals, lastUpdated: new Date() } },
            { upsert: true }
        );

        res.status(200).json({ message: 'Goals updated successfully.' });
    } catch (e) {
        console.error("Goal Update Error:", e);
        res.status(500).json({ message: 'Error saving goals.' });
    }
});

// GET /api/goals/:name (Fetch Patient Goals)
app.get('/api/goals/:name', authenticateToken, async (req, res) => {
    if (req.user.role !== 'patient' || req.user.username !== req.params.name) {
        return res.status(403).json({ message: 'Access denied.' });
    }
    try {
        const patientName = req.params.name;
        const result = await db.collection('patientGoals').findOne({ patientName });

        if (!result) {
            return res.status(404).json({ message: 'Goals not found for this patient.' });
        }
        // Return only the goals object
        res.json(result.goals);
    } catch (e) {
        console.error("Goal Fetch Error:", e);
        res.status(500).json({ message: 'Error fetching goals.' });
    }
});

// ------------------------------------
// --- EMERGENCY/REQUEST ROUTES (SOS and Doctor Request)
// ------------------------------------

// POST /api/sos-request (High-Priority Emergency Routing)
app.post('/api/sos-request', async (req, res) => {
    // This endpoint is generally public for fast access, but req.user can be checked if token is present
    const { patientName, reason, criticality, location } = req.body;

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
        res.status(500).json({ message: 'Internal server error during request dispatch.' });
    }
});

// ------------------------------------
// --- HOSPITAL ROUTES (Needs Auth)
// ------------------------------------

// POST /api/admit-patient (Hospital Admission Form Button)
app.post('/api/admit-patient', authenticateToken, async (req, res) => {
    if (req.user.role !== 'hospital') return res.status(403).json({ message: 'Access denied.' });

    try {
        const patientData = req.body;

        const newPatientRecord = {
            ...patientData,
            hospitalId: req.user.id,
            admittedAt: new Date(),
            lastUpdate: 'Just Now'
        };

        await db.collection('admittedPatients').insertOne(newPatientRecord);

        res.status(201).json({ message: 'Patient admitted successfully.', patient: newPatientRecord });
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
        // Fetch only requests routed to this hospital that are PENDING
        // NOTE: for debugging the project earlier we returned all PENDING requests without filtering
        const requests = await db.collection('doctorRequests')
            .find({ status: 'PENDING' }) // Consider adding hospitalId: req.user.id in production
            .sort({ criticality: -1, timestamp: 1 }) // Prioritize High Criticality
            .toArray();
        res.json(requests);
    } catch (e) {
        console.error('Fetch Requests Error:', e);
        res.status(500).json({ message: 'Error fetching requests.' });
    }
});

// --- Server Start ---
connectToMongo().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});
