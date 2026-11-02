import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import DoctorProfile from "@/lib/models/DoctorProfile";
import PatientProfile from "@/lib/models/PatientProfile";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Stethoscope, CalendarDays, Pill, MessageSquare, ShieldAlert } from "lucide-react";
import PrescriptionDownloadButton from "@/components/PrescriptionDownloadButton";
import PrescriptionFeedbackForm from "@/components/PrescriptionFeedbackForm";
import { buildFeedbackSummary } from "@/lib/feedbackUtils";
import StatusPill from "@/components/ui/StatusPill";
import { Reveal } from "@/components/motion";

function parseAdviceLines(text: string): string[] {
  return text.split(/\n+/).map((line) => line.replace(/^\d+\.\s*/, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").trim()).filter(Boolean);
}
function fmt(d: Date | string | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) +
    " · " + date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default async function PatientAppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authUser = await getCurrentUser();
  if (!authUser || authUser.role !== "patient") redirect("/login");

  await connectDB();
  const raw = await Appointment.findOne({ _id: id, patientRef: authUser.userId }).lean();
  if (!raw) notFound();

  const appt = raw as unknown as {
    _id: string; doctorRef: string; doctorName: string; specialization: string;
    consultationFee: number; consultationStartsAt: Date; prescriptionSentAt?: Date; status: string;
    preConsultation?: { symptoms?: string; duration?: string; severity?: string };
    transcript?: string;
    prescription?: { diagnosis?: string; medicines?: Array<{ medicine: string; dosage: string; timing: string; frequency: string; duration: string; condition?: string; purpose?: string }>; advice?: string; drugSafetyNote?: string };
    prescriptionFeedback?: Record<string, unknown>;
  };

  const rx = appt.prescription;

  type DoctorDoc = { qualification?: string; hospital?: string; city?: string; registrationNumber?: string; signature?: string };
  type PatientDoc = { age?: number; gender?: string; bloodGroup?: string };
  const [doctorDoc, patientDoc] = rx
    ? await Promise.all([
        DoctorProfile.findOne({ userRef: appt.doctorRef }).select("qualification hospital city registrationNumber signature").lean() as Promise<DoctorDoc | null>,
        PatientProfile.findOne({ userRef: authUser.userId }).select("age gender bloodGroup").lean() as Promise<PatientDoc | null>,
      ])
    : [null, null];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-5 sm:p-8">
      <div className="flex items-center gap-3">
        <Link href="/patient/appointments" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-text">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">Appointment details</h1>
          <p className="text-sm text-muted">Dr. {appt.doctorName} · {fmt(appt.consultationStartsAt)}</p>
        </div>
      </div>

      {/* Summary */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-1">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
            <Stethoscope className="h-6 w-6" />
          </span>
          <div>
            <p className="font-semibold text-text">Dr. {appt.doctorName}</p>
            <p className="text-sm capitalize text-muted">{appt.specialization}</p>
          </div>
          <StatusPill status={appt.status} className="ml-auto" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted"><CalendarDays className="h-4 w-4 text-subtle" /> {fmt(appt.consultationStartsAt)}</div>
        {appt.preConsultation?.symptoms && (
          <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5">
            <p className="mb-1 text-xs text-subtle">Reported symptoms</p>
            <p className="text-sm text-text">{appt.preConsultation.symptoms}
              {appt.preConsultation.duration && ` · ${appt.preConsultation.duration}`}
              {appt.preConsultation.severity && ` · ${appt.preConsultation.severity} severity`}
            </p>
          </div>
        )}
      </section>

      {/* Prescription */}
      {rx ? (
        <Reveal>
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-1">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Pill className="h-4 w-4 text-brand-500" />
              <h2 className="text-sm font-semibold text-text">Your prescription</h2>
              {appt.prescriptionSentAt && <span className="text-xs text-subtle">Issued {fmt(appt.prescriptionSentAt)}</span>}
              <div className="ml-auto">
                <PrescriptionDownloadButton
                  filename={`medi-iq-prescription-${String(appt._id).slice(-8)}.pdf`}
                  props={{
                    patientName: authUser.name, patientAge: patientDoc?.age, patientSex: patientDoc?.gender, patientBloodGroup: patientDoc?.bloodGroup,
                    symptoms: appt.preConsultation?.symptoms, symptomsDuration: appt.preConsultation?.duration, symptomsSeverity: appt.preConsultation?.severity,
                    diagnosis: rx.diagnosis, medicines: rx.medicines, adviceLines: rx.advice ? parseAdviceLines(rx.advice) : [],
                    doctorName: appt.doctorName, doctorQualification: doctorDoc?.qualification, doctorSpecialization: appt.specialization,
                    doctorHospital: doctorDoc?.hospital, doctorCity: doctorDoc?.city, doctorRegNo: doctorDoc?.registrationNumber, doctorSignature: doctorDoc?.signature,
                    drugSafetyNote: rx.drugSafetyNote,
                    prescriptionDate: appt.prescriptionSentAt ? new Date(appt.prescriptionSentAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : undefined,
                    prescriptionId: String(appt._id),
                  }}
                />
              </div>
            </div>

            {rx.diagnosis && (
              <div className="mb-4 rounded-xl bg-brand-500/10 px-4 py-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">Diagnosis</p>
                <p className="text-sm font-medium text-brand-700 dark:text-brand-200">{rx.diagnosis}</p>
              </div>
            )}

            {rx.medicines && rx.medicines.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Medicines</p>
                {rx.medicines.map((m, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl bg-surface-2 px-4 py-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/12 text-xs font-bold text-brand-700 dark:text-brand-300">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text">{m.medicine}</p>
                      <p className="mt-0.5 text-xs text-muted">{[m.dosage, m.timing, m.frequency, m.duration].filter(Boolean).join(" · ")}</p>
                      {m.purpose && <p className="mt-0.5 text-xs italic text-subtle">↳ {m.purpose}</p>}
                      {m.condition && <p className="mt-1 flex items-center gap-1 text-xs text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning"><span className="shrink-0">⚠</span> {m.condition}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {rx.advice && (
              <div className="rounded-xl bg-success/8 px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-success">Doctor&apos;s advice</p>
                <ul className="space-y-1.5">
                  {parseAdviceLines(rx.advice).map((line, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-text"><span className="mt-0.5 shrink-0 text-success">•</span> {line}</li>
                  ))}
                </ul>
              </div>
            )}

            {rx.drugSafetyNote && (
              <div className="mt-4 flex gap-2 rounded-xl border border-warning/25 bg-warning/10 px-4 py-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div>
                  <p className="mb-0.5 text-xs font-semibold text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning">Drug safety note</p>
                  <p className="text-xs leading-relaxed text-muted">{rx.drugSafetyNote}</p>
                </div>
              </div>
            )}
          </section>
        </Reveal>
      ) : (
        <section className="rounded-2xl border-2 border-dashed border-border bg-surface-2/50 p-8 text-center">
          <Pill className="mx-auto mb-2 h-8 w-8 text-subtle" />
          <p className="text-sm text-muted">No prescription issued for this appointment.</p>
        </section>
      )}

      {rx?.medicines && rx.medicines.length > 0 && (
        <PrescriptionFeedbackForm
          appointmentId={String(appt._id)}
          medicines={rx.medicines.map((m) => ({ medicine: m.medicine, dosage: m.dosage }))}
          alreadySubmitted={!!appt.prescriptionFeedback}
          existingSummary={appt.prescriptionFeedback ? buildFeedbackSummary(appt.prescriptionFeedback) : undefined}
        />
      )}

      {appt.transcript && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-1">
          <div className="mb-4 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-success" />
            <h2 className="text-sm font-semibold text-text">Consultation notes</h2>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-xl bg-surface-2 p-4">
            {appt.transcript.split("\n").map((line, i) => {
              const isDoctor = line.startsWith("Doctor:");
              const isPatient = line.startsWith("Patient:");
              return (
                <p key={i} className="mb-1.5 text-sm leading-relaxed">
                  {isDoctor || isPatient ? (
                    <>
                      <span className={`font-semibold ${isDoctor ? "text-brand-600 dark:text-brand-300" : "text-success"}`}>{isDoctor ? "Doctor" : "You"}:</span>
                      <span className="text-muted">{line.replace(/^(Doctor|Patient):/, "")}</span>
                    </>
                  ) : (
                    <span className="text-muted">{line}</span>
                  )}
                </p>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
