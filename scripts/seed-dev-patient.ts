import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

// ---- load .env.local manually (same as seed-admin.ts) ----
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error("MONGODB_URI not found in .env.local"); process.exit(1); }

// ---- inline schemas (loose: strict:false so we match the real models safely) ----
const opts = { timestamps: true, strict: false } as const;
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({}, opts));
const PatientProfile = mongoose.models.PatientProfile || mongoose.model("PatientProfile", new mongoose.Schema({}, opts));
const DoctorProfile = mongoose.models.DoctorProfile || mongoose.model("DoctorProfile", new mongoose.Schema({}, opts));
const Appointment = mongoose.models.Appointment || mongoose.model("Appointment", new mongoose.Schema({}, opts));

const pid = () => `PT-${Math.floor(100000 + Math.random() * 900000)}`;
const did = () => `DR-${Math.floor(100000 + Math.random() * 900000)}`;
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function run() {
  await mongoose.connect(MONGODB_URI as string);
  console.log("Connected to MongoDB");

  // ---- WIPE prior dev data (safe re-run) ----
  const oldPat = await User.findOne({ email: "devpatient@mediiq.dev" });
  const oldDoc = await User.findOne({ email: "devdoctor@mediiq.dev" });
  const oldIds = [oldPat?._id, oldDoc?._id].filter(Boolean);
  if (oldIds.length) {
    await Appointment.deleteMany({ $or: [{ patientRef: { $in: oldIds } }, { doctorRef: { $in: oldIds } }] });
    await PatientProfile.deleteMany({ userRef: { $in: oldIds } });
    await DoctorProfile.deleteMany({ userRef: { $in: oldIds } });
    await User.deleteMany({ _id: { $in: oldIds } });
    console.log("Wiped previous DevPatient/DevDoctor data");
  }

  const hash = await bcrypt.hash("DevPass123!", 12);

  // ---- DOCTOR ----
  const docUser = await User.create({
    name: "DevDoctor", email: "devdoctor@mediiq.dev",
    password: hash, role: "doctor", profileCompleted: true,
  });
  await DoctorProfile.create({
    userRef: docUser._id, userId: did(),
    specialization: "General Medicine", qualification: "MBBS, MD",
    experience: 8, hospital: "MediIQ Dev Hospital", city: "Bengaluru",
    registrationNumber: "DEV-REG-0001", consultationFee: 300,
    verificationStatus: "approved", isLive: true, rating: 4.5, totalRatings: 20,
  });

  // ---- PATIENT (diabetic + hypertensive, penicillin allergy) ----
  const patUser = await User.create({
    name: "DevPatient", email: "devpatient@mediiq.dev",
    password: hash, role: "patient", profileCompleted: true,
  });
  await PatientProfile.create({
    userRef: patUser._id, userId: pid(),
    age: 54, gender: "Male", weight: 78, height: 170, bloodGroup: "B+",
    city: "Bengaluru", state: "Karnataka", country: "India",
    knownConditions: ["Type 2 Diabetes", "Hypertension"],
    allergies: ["Penicillin"],
    currentMedications: ["Metformin 500mg", "Amlodipine 5mg"],
    emergencyContact: { name: "Asha Kumar", relation: "Spouse", phone: "9000000000" },
  });

  const base = {
    patientRef: patUser._id, doctorRef: docUser._id,
    patientName: "DevPatient", doctorName: "DevDoctor",
    specialization: "General Medicine", consultationFee: 300,
    status: "completed",
  };
  const med = (m: string, dosage: string, timing: string, freq: string, dur: string, purpose: string, condition = "") =>
    ({ medicine: m, dosage, timing, frequency: freq, duration: dur, condition, purpose });

  // ===== CONSULT 1 (45 days ago): fever + cough -> antibiotic + symptomatic =====
  await Appointment.create({
    ...base,
    bookedAt: daysAgo(46), approvedAt: daysAgo(46), consultationStartsAt: daysAgo(45),
    callStartedAt: daysAgo(45), callEndedAt: daysAgo(45), prescriptionSentAt: daysAgo(45),
    preConsultation: {
      symptoms: "Fever, cough, sore throat", duration: "3 days", severity: "moderate",
      currentMedications: "Metformin 500mg, Amlodipine 5mg", additionalNotes: "Feeling weak",
      vitals: { sbp: 138, dbp: 88, hr: 92, bp_classification: "Stage 1 HT", hr_classification: "Normal", confidence: 0.82 },
      filledAt: daysAgo(45),
    },
    prescription: {
      diagnosis: "Acute upper respiratory tract infection (bacterial suspected)",
      medicines: [
        med("Azithromycin", "500mg", "after food", "once daily", "3 days", "Antibiotic for the throat/chest infection"),
        med("Paracetamol", "650mg", "after food", "thrice daily", "5 days", "Reduce fever and body ache"),
        med("Cetirizine", "10mg", "night", "once daily", "5 days", "Relieve cough and runny nose"),
      ],
      advice: "Rest, drink warm fluids, complete the antibiotic course. Avoid NSAIDs due to hypertension.",
      drugSafetyNote: "Penicillin avoided due to allergy; azithromycin chosen instead. NSAIDs avoided due to hypertension.",
    },
    prescriptionFeedback: {
      submittedAt: daysAgo(38), recoveryTime: "1 week", overallEffectiveness: "Very effective",
      sideEffects: "None", courseCompleted: "Yes", symptomsResolved: "Yes",
      medicineRatings: [
        { medicine: "Azithromycin", helpful: "Very helpful" },
        { medicine: "Paracetamol", helpful: "Helpful" },
        { medicine: "Cetirizine", helpful: "Somewhat helpful" },
      ],
      revisitNeeded: "No", dosageExperience: "Just right", careRating: "5", wouldUseAgain: "Yes",
      additionalFeedback: "Recovered well.",
    },
    transcript: "Doctor: What brings you in? Patient: Fever and cough for three days... (dev seed transcript)",
  });

  // ===== CONSULT 2 (20 days ago): high BP review -> introduces a LIFELONG med =====
  await Appointment.create({
    ...base,
    bookedAt: daysAgo(21), approvedAt: daysAgo(21), consultationStartsAt: daysAgo(20),
    callStartedAt: daysAgo(20), callEndedAt: daysAgo(20), prescriptionSentAt: daysAgo(20),
    preConsultation: {
      symptoms: "Headache, high blood pressure readings at home", duration: "1 week", severity: "moderate",
      currentMedications: "Metformin 500mg, Amlodipine 5mg", additionalNotes: "BP around 150/95 at home",
      vitals: { sbp: 150, dbp: 96, hr: 84, bp_classification: "Stage 2 HT", hr_classification: "Normal", confidence: 0.88 },
      filledAt: daysAgo(20),
    },
    prescription: {
      diagnosis: "Uncontrolled hypertension - needs add-on therapy",
      medicines: [
        med("Telmisartan", "40mg", "morning", "once daily", "ongoing", "Long-term blood pressure control (daily, ongoing)"),
        med("Amlodipine", "5mg", "morning", "once daily", "ongoing", "Continue existing BP medicine"),
      ],
      advice: "Low-salt diet, monitor BP daily, take Telmisartan every morning long-term. This is a regular daily medicine.",
      drugSafetyNote: "Telmisartan added as a long-term antihypertensive. Safe with diabetes.",
    },
    prescriptionFeedback: {
      submittedAt: daysAgo(10), recoveryTime: "still ongoing", overallEffectiveness: "Effective",
      sideEffects: "Mild dizziness initially", courseCompleted: "Ongoing", symptomsResolved: "Partially",
      medicineRatings: [
        { medicine: "Telmisartan", helpful: "Very helpful" },
        { medicine: "Amlodipine", helpful: "Helpful" },
      ],
      revisitNeeded: "Yes", dosageExperience: "Just right", careRating: "5", wouldUseAgain: "Yes",
      additionalFeedback: "BP improving with the new daily medicine.",
    },
    transcript: "Doctor: Your BP is high... starting a daily long-term medicine. (dev seed transcript)",
  });

  // ===== CONSULT 3 (5 days ago): skin rash AFTER a drug -> SUSPECTED ALLERGY signal =====
  await Appointment.create({
    ...base,
    bookedAt: daysAgo(6), approvedAt: daysAgo(6), consultationStartsAt: daysAgo(5),
    callStartedAt: daysAgo(5), callEndedAt: daysAgo(5), prescriptionSentAt: daysAgo(5),
    preConsultation: {
      symptoms: "Itchy skin rash on arms, started after taking a sulfa antibiotic elsewhere", duration: "2 days", severity: "mild",
      currentMedications: "Metformin 500mg, Amlodipine 5mg, Telmisartan 40mg", additionalNotes: "Took Cotrimoxazole from a local pharmacy, rash appeared next day",
      vitals: { sbp: 134, dbp: 86, hr: 78, bp_classification: "Stage 1 HT", hr_classification: "Normal", confidence: 0.8 },
      filledAt: daysAgo(5),
    },
    prescription: {
      diagnosis: "Suspected drug reaction (sulfonamide) - allergic rash",
      medicines: [
        med("Levocetirizine", "5mg", "night", "once daily", "5 days", "Control the allergic rash and itching"),
        med("Calamine lotion", "topical", "as needed", "twice daily", "5 days", "Soothe itching", "Apply to affected skin only (SOS)"),
      ],
      advice: "STOP the sulfa antibiotic immediately. Note possible sulfonamide allergy for the future. Return if breathing difficulty.",
      drugSafetyNote: "Likely sulfonamide (Cotrimoxazole) reaction. Flag SUSPECTED sulfa allergy. Penicillin allergy already on record.",
    },
    prescriptionFeedback: {
      submittedAt: daysAgo(1), recoveryTime: "2-3 days", overallEffectiveness: "Effective",
      sideEffects: "None", courseCompleted: "Yes", symptomsResolved: "Yes",
      medicineRatings: [
        { medicine: "Levocetirizine", helpful: "Very helpful" },
        { medicine: "Calamine lotion", helpful: "Helpful" },
      ],
      revisitNeeded: "No", dosageExperience: "Just right", careRating: "5", wouldUseAgain: "Yes",
      additionalFeedback: "Rash cleared after stopping the antibiotic.",
    },
    transcript: "Doctor: This looks like a reaction to the sulfa antibiotic... stop it. (dev seed transcript)",
  });

  const count = await Appointment.countDocuments({ patientRef: patUser._id });
  console.log("\n========================================");
  console.log("DEV SEED COMPLETE");
  console.log("DevDoctor  User._id :", docUser._id.toString());
  console.log("DevPatient User._id :", patUser._id.toString());
  console.log("Consultations created:", count);
  console.log("Login (both): password = DevPass123!");
  console.log("  devpatient@mediiq.dev / devdoctor@mediiq.dev");
  console.log("=> Use the DevPatient User._id above in your /admin/development page");
  console.log("========================================\n");

  await mongoose.disconnect();
}

run().catch((e) => { console.error("SEED FAILED:", e); process.exit(1); });
