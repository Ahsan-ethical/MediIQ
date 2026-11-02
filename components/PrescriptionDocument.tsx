import {
  Document, Page, Text, View, StyleSheet, Image,
} from "@react-pdf/renderer";

export type PrescriptionDocProps = {
  patientName: string;
  patientAge?: number;
  patientSex?: string;
  patientBloodGroup?: string;
  symptoms?: string;
  symptomsDuration?: string;
  symptomsSeverity?: string;
  diagnosis?: string;
  medicines?: Array<{
    medicine: string; dosage?: string;
    timing?: string; frequency?: string; duration?: string;
    purpose?: string; condition?: string;
  }>;
  drugSafetyNote?: string;
  adviceLines?: string[];      // already parsed into individual points
  doctorName: string;
  doctorQualification?: string;
  doctorSpecialization?: string;
  doctorHospital?: string;
  doctorCity?: string;
  doctorRegNo?: string;
  doctorSignature?: string;   // base64 PNG dataURL
  isAiConsultation?: boolean;
  prescriptionDate?: string;  // formatted date string
  prescriptionId?: string;
};

const BLUE  = "#1e40af";
const DBLUE = "#1e3a5f";
const LGRAY = "#f8fafc";
const MGRAY = "#64748b";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", backgroundColor: "#fff", paddingBottom: 60 },

  // Watermark
  watermark: {
    position: "absolute", top: 280, left: 80,
    transform: "rotate(-40deg)",
  },
  watermarkText: { fontSize: 72, color: "rgba(30,64,175,0.04)", fontFamily: "Helvetica-Bold" },

  // Header
  header: {
    backgroundColor: BLUE, paddingHorizontal: 36, paddingVertical: 20,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoBox: {
    width: 38, height: 38, backgroundColor: "#fff",
    borderRadius: 8, alignItems: "center", justifyContent: "center",
  },
  logoText: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BLUE },
  brandName: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#fff" },
  brandSub:  { fontSize: 8, color: "rgba(255,255,255,0.7)", marginTop: 1 },
  rxBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },
  rxBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Helvetica-Bold" },

  // Doctor strip
  doctorStrip: {
    backgroundColor: "#eff6ff", paddingHorizontal: 36, paddingVertical: 14,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    borderBottomWidth: 1, borderBottomColor: "#bfdbfe",
  },
  doctorName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: DBLUE },
  doctorMeta: { fontSize: 9, color: MGRAY, marginTop: 2 },
  dateBox: { alignItems: "flex-end" },
  dateLabel: { fontSize: 8, color: MGRAY, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  dateVal:   { fontSize: 10, color: DBLUE, fontFamily: "Helvetica-Bold", marginTop: 2 },
  rxNoVal:   { fontSize: 9, color: MGRAY, marginTop: 1 },

  // Patient section
  patientSection: {
    marginHorizontal: 36, marginTop: 16,
    backgroundColor: LGRAY, borderRadius: 8,
    padding: 14, borderWidth: 1, borderColor: "#e2e8f0",
  },
  sectionLabel: {
    fontSize: 8, fontFamily: "Helvetica-Bold", color: BLUE,
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8,
  },
  patientRow: { flexDirection: "row", gap: 24 },
  patientField: { flexDirection: "row", alignItems: "center" },
  fieldLabel: { fontSize: 9, color: MGRAY, fontFamily: "Helvetica-Bold" },
  fieldVal:   { fontSize: 10, color: DBLUE, marginLeft: 4 },

  // Complaint + diagnosis
  clinicalSection: { marginHorizontal: 36, marginTop: 14 },
  complaintBox: {
    borderLeftWidth: 3, borderLeftColor: "#93c5fd",
    paddingLeft: 10, marginBottom: 10,
  },
  complaintText: { fontSize: 10, color: "#334155" },
  diagnosisBox: {
    backgroundColor: "#eff6ff", borderRadius: 8,
    padding: 12, borderWidth: 1, borderColor: "#bfdbfe",
  },
  diagnosisLabel: { fontSize: 8, color: BLUE, fontFamily: "Helvetica-Bold", textTransform: "uppercase", marginBottom: 4 },
  diagnosisText: { fontSize: 11, color: DBLUE, fontFamily: "Helvetica-Bold" },

  // Medicines
  rxSection: { marginHorizontal: 36, marginTop: 16 },
  rxHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  rxSymbol: { fontSize: 22, fontFamily: "Helvetica-Bold", color: BLUE, marginRight: 8 },
  rxTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: DBLUE },
  medTable: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, overflow: "hidden" },
  medHeaderRow: {
    flexDirection: "row", backgroundColor: BLUE,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  medHeaderCell: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#fff" },
  medRow: {
    flexDirection: "row", paddingHorizontal: 10, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: "#f1f5f9",
  },
  medRowAlt: { backgroundColor: LGRAY },
  medCell: { fontSize: 9, color: "#334155" },
  medName: { fontSize: 10, fontFamily: "Helvetica-Bold", color: DBLUE },

  // Column widths
  colMed:  { flex: 2.5 },
  colDose: { flex: 1 },
  colTime: { flex: 1.5 },
  colFreq: { flex: 1.5 },
  colDur:  { flex: 1 },
  medPurpose: { fontSize: 8, color: MGRAY, fontStyle: "italic", marginTop: 2 },

  // Drug safety note
  safetySection: { marginHorizontal: 36, marginTop: 14 },
  safetyBox: {
    backgroundColor: "#fffbeb", borderRadius: 8,
    padding: 10, borderWidth: 1, borderColor: "#fde68a",
    flexDirection: "row", gap: 6,
  },
  safetyText: { fontSize: 9, color: "#92400e", flex: 1, lineHeight: 1.5 },

  // Advice
  adviceSection: { marginHorizontal: 36, marginTop: 16 },
  adviceItem: { flexDirection: "row", marginTop: 5 },
  bullet: { fontSize: 9, color: BLUE, marginRight: 6, marginTop: 1 },
  adviceText: { fontSize: 9, color: "#334155", flex: 1, lineHeight: 1.5 },

  // Divider
  divider: { marginHorizontal: 36, marginTop: 16, borderTopWidth: 1, borderTopColor: "#e2e8f0" },

  // Signature
  sigSection: {
    marginHorizontal: 36, marginTop: 16,
    flexDirection: "row", justifyContent: "flex-end",
  },
  sigBox: { alignItems: "center", width: 180 },
  sigImage: { width: 160, height: 60, objectFit: "contain" },
  sigLine: { borderTopWidth: 1, borderTopColor: "#cbd5e1", width: 160, marginTop: 4 },
  sigName: { fontSize: 10, fontFamily: "Helvetica-Bold", color: DBLUE, marginTop: 4 },
  sigReg:  { fontSize: 8, color: MGRAY, marginTop: 2 },
  sigStamp: {
    width: 90, height: 90, borderRadius: 45,
    borderWidth: 2, borderColor: BLUE,
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  sigStampText: { fontSize: 8, color: BLUE, textAlign: "center", fontFamily: "Helvetica-Bold" },

  // Footer
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: BLUE, paddingHorizontal: 36, paddingVertical: 10,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  footerText: { fontSize: 8, color: "rgba(255,255,255,0.7)" },
  footerBrand: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#fff" },
});

export default function PrescriptionDocument(p: PrescriptionDocProps) {
  const date = p.prescriptionDate ?? new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <Document title={`MediIQ Prescription — ${p.patientName}`} author="MediIQ Healthcare">
      <Page size="A4" style={s.page}>

        {/* Watermark */}
        <View style={s.watermark} fixed>
          <Text style={s.watermarkText}>MEDI·IQ</Text>
        </View>

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.logoBox}>
              <Text style={s.logoText}>M·IQ</Text>
            </View>
            <View>
              <Text style={s.brandName}>MEDI·IQ</Text>
              <Text style={s.brandSub}>Healthcare · mediq.health</Text>
            </View>
          </View>
          <View style={s.rxBadge}>
            <Text style={s.rxBadgeText}>
              {p.isAiConsultation ? "AI CONSULTATION REPORT" : "MEDICAL PRESCRIPTION"}
            </Text>
          </View>
        </View>

        {/* Doctor strip */}
        <View style={s.doctorStrip}>
          <View>
            <Text style={s.doctorName}>
              {p.isAiConsultation ? "Dr. MediIQ AI" : `Dr. ${p.doctorName}`}
            </Text>
            {p.isAiConsultation ? (
              <Text style={s.doctorMeta}>Powered by Gemini 2.5 Flash · AI Clinical System</Text>
            ) : (
              <>
                <Text style={s.doctorMeta}>
                  {[p.doctorQualification?.toUpperCase(), p.doctorSpecialization]
                    .filter(Boolean).join("  ·  ")}
                </Text>
                <Text style={s.doctorMeta}>
                  {[p.doctorHospital, p.doctorCity].filter(Boolean).join(", ")}
                </Text>
                {p.doctorRegNo && (
                  <Text style={s.doctorMeta}>Reg. No: {p.doctorRegNo}</Text>
                )}
              </>
            )}
          </View>
          <View style={s.dateBox}>
            <Text style={s.dateLabel}>Date</Text>
            <Text style={s.dateVal}>{date}</Text>
            {p.prescriptionId && (
              <Text style={s.rxNoVal}>Ref: {String(p.prescriptionId).slice(-8).toUpperCase()}</Text>
            )}
          </View>
        </View>

        {/* Patient Details */}
        <View style={s.patientSection}>
          <Text style={s.sectionLabel}>Patient Details</Text>
          <View style={s.patientRow}>
            <View style={s.patientField}>
              <Text style={s.fieldLabel}>Name:</Text>
              <Text style={[s.fieldVal, { fontFamily: "Helvetica-Bold" }]}>{p.patientName}</Text>
            </View>
            {p.patientAge && (
              <View style={s.patientField}>
                <Text style={s.fieldLabel}>Age:</Text>
                <Text style={s.fieldVal}>{p.patientAge} yrs</Text>
              </View>
            )}
            {p.patientSex && (
              <View style={s.patientField}>
                <Text style={s.fieldLabel}>Sex:</Text>
                <Text style={s.fieldVal}>{p.patientSex}</Text>
              </View>
            )}
            {p.patientBloodGroup && (
              <View style={s.patientField}>
                <Text style={s.fieldLabel}>Blood Group:</Text>
                <Text style={s.fieldVal}>{p.patientBloodGroup}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Complaint + Diagnosis */}
        <View style={s.clinicalSection}>
          {p.symptoms && (
            <View style={s.complaintBox}>
              <Text style={[s.fieldLabel, { marginBottom: 3 }]}>Chief Complaint</Text>
              <Text style={s.complaintText}>
                {p.symptoms}
                {p.symptomsDuration ? `  ·  Duration: ${p.symptomsDuration}` : ""}
                {p.symptomsSeverity ? `  ·  Severity: ${p.symptomsSeverity}` : ""}
              </Text>
            </View>
          )}
          {p.diagnosis && (
            <View style={s.diagnosisBox}>
              <Text style={s.diagnosisLabel}>Diagnosis</Text>
              <Text style={s.diagnosisText}>{p.diagnosis}</Text>
            </View>
          )}
        </View>

        {/* Medicines */}
        {p.medicines && p.medicines.length > 0 && (
          <View style={s.rxSection}>
            <View style={s.rxHeader}>
              <Text style={s.rxSymbol}>℞</Text>
              <Text style={s.rxTitle}>Prescribed Medicines</Text>
            </View>
            <View style={s.medTable}>
              {/* Table header */}
              <View style={s.medHeaderRow}>
                <Text style={[s.medHeaderCell, s.colMed]}>Medicine</Text>
                <Text style={[s.medHeaderCell, s.colDose]}>Dose</Text>
                <Text style={[s.medHeaderCell, s.colTime]}>Timing</Text>
                <Text style={[s.medHeaderCell, s.colFreq]}>Frequency</Text>
                <Text style={[s.medHeaderCell, s.colDur]}>Duration</Text>
              </View>
              {/* Medicine rows */}
              {p.medicines.map((m, i) => (
                <View key={i} style={[s.medRow, i % 2 === 1 ? s.medRowAlt : {}]}>
                  <View style={s.colMed}>
                    <Text style={s.medName}>{m.medicine}</Text>
                    {m.purpose && <Text style={s.medPurpose}>{m.purpose}</Text>}
                  </View>
                  <Text style={[s.medCell, s.colDose]}>{m.dosage ?? "—"}</Text>
                  <Text style={[s.medCell, s.colTime]}>{m.timing ?? "—"}</Text>
                  <Text style={[s.medCell, s.colFreq]}>{m.frequency ?? "—"}</Text>
                  <Text style={[s.medCell, s.colDur]}>{m.duration ?? "—"}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Advice */}
        {p.adviceLines && p.adviceLines.length > 0 && (
          <View style={s.adviceSection}>
            <Text style={s.sectionLabel}>Advice &amp; Instructions</Text>
            {p.adviceLines.map((line, i) => (
              <View key={i} style={s.adviceItem}>
                <Text style={s.bullet}>•</Text>
                <Text style={s.adviceText}>{line}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Drug Safety Note */}
        {p.drugSafetyNote && (
          <View style={s.safetySection}>
            <Text style={s.sectionLabel}>Drug Safety Note</Text>
            <View style={s.safetyBox}>
              <Text style={s.safetyText}>⚠  {p.drugSafetyNote}</Text>
            </View>
          </View>
        )}

        <View style={s.divider} />

        {/* Signature */}
        <View style={s.sigSection}>
          <View style={s.sigBox}>
            {p.isAiConsultation ? (
              <View style={s.sigStamp}>
                <Text style={s.sigStampText}>{"MEDI·IQ\nAI\nVERIFIED"}</Text>
              </View>
            ) : p.doctorSignature ? (
              <Image src={p.doctorSignature} style={s.sigImage} />
            ) : (
              <View style={{ height: 60 }} />
            )}
            <View style={s.sigLine} />
            <Text style={s.sigName}>
              {p.isAiConsultation ? "Dr. MediIQ AI" : `Dr. ${p.doctorName}`}
            </Text>
            {!p.isAiConsultation && p.doctorRegNo && (
              <Text style={s.sigReg}>Reg. No: {p.doctorRegNo}</Text>
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            This prescription is generated by MediIQ Healthcare. Keep it safe for medical records.
          </Text>
          <Text style={s.footerBrand}>MEDI·IQ · mediq.health</Text>
        </View>

      </Page>
    </Document>
  );
}
