export interface TranscriptLine {
  role:      "doctor" | "patient";
  text:      string;
  timestamp: number;
}

export interface PrescriptionMedicine {
  medicine:  string;
  dosage:    string;
  timing:    string;
  frequency: string;
  duration:  string;
  condition?: string;
  purpose?:   string;
}

export interface Prescription {
  diagnosis: string;
  medicines: PrescriptionMedicine[];
  advice:    string;
}

export interface AiReport {
  summary:     string;
  conditions:  string[];
  questions:   string[];
  generatedAt: string;
}

export interface CallAppointment {
  _id:            string;
  patientName:    string;
  doctorName:     string;
  specialization: string;
  status:         string;
  preConsultation?: {
    symptoms:           string;
    duration:           string;
    severity:           string;
    currentMedications: string;
    additionalNotes:    string;
    vitals?: {
      sbp: number; dbp: number; hr: number;
      bp_classification: string; hr_classification: string;
    };
    filledAt?: string;
  };
  patientProfile?: {
    age:                number;
    gender:             string;
    weight:             number;
    height:             number;
    bloodGroup:         string;
    knownConditions:    string[];
    allergies:          string[];
    currentMedications: string[];
  };
  aiReport?:       AiReport;
  aiPrescription?: Prescription;
  prescription?:   Prescription;
  prescriptionSentAt?: string;
}
