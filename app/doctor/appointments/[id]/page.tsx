import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import PatientProfile from "@/lib/models/PatientProfile";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, FileText, Brain, Pill, MessageSquare, Activity } from "lucide-react";

function fmt(d: Date | string | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) +
    " · " + date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default async function DoctorAppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authUser = await getCurrentUser();
  if (!authUser || authUser.role !== "doctor") redirect("/login");

  await connectDB();
  const raw = await Appointment.findOne({ _id: id, doctorRef: authUser.userId }).lean();
  if (!raw) notFound();

  const appt = raw as unknown as {
    _id: string; patientRef: string; patientName: string; consultationStartsAt: Date; status: string;
    preConsultation?: { symptoms?: string; duration?: string; severity?: string; currentMedications?: string; additionalNotes?: string; vitals?: { sbp?: number; dbp?: number; hr?: number; bp_classification?: string; hr_classification?: string } };
    transcript?: string;
    aiReport?: { summary?: string; conditions?: string[]; questions?: string[] };
    prescription?: { diagnosis?: string; medicines?: Array<{ medicine: string; dosage: string; timing: string; frequency: string; duration: string }>; advice?: string };
    prescriptionSentAt?: Date;
  };

  const profileRaw = await PatientProfile.findOne({ userRef: appt.patientRef }).lean();
  const profile = profileRaw as unknown as {
    age?: number; gender?: string; weight?: number; height?: number; bloodGroup?: string;
    knownConditions?: string[]; allergies?: string[]; currentMedications?: string[];
  } | null;

  const pc = appt.preConsultation;
  const vitals = pc?.vitals;
  const rx = appt.prescription;
  const ai = appt.aiReport;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-5 sm:p-8">
      <div className="flex items-center gap-3">
        <Link href="/doctor/appointments" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-text">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">Consultation record</h1>
          <p className="text-sm text-muted">{appt.patientName} · {fmt(appt.consultationStartsAt)}</p>
        </div>
      </div>

      <Panel icon={<User className="h-4 w-4 text-brand-500" />} title="Patient profile">
        <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-5">
          <Info label="Name" value={appt.patientName} />
          <Info label="Age" value={profile?.age != null ? `${profile.age} yrs` : undefined} />
          <Info label="Gender" value={profile?.gender} className="capitalize" />
          <Info label="Weight" value={profile?.weight != null ? `${profile.weight} kg` : undefined} />
          <Info label="Height" value={profile?.height != null ? `${profile.height} cm` : undefined} />
        </div>
        <Info label="Blood group" value={profile?.bloodGroup} />
        {(profile?.knownConditions?.length || profile?.allergies?.length || profile?.currentMedications?.length) && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <TagRow label="Known conditions" items={profile?.knownConditions} tone="bg-warning/10 text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning border-warning/20" />
            <TagRow label="Allergies" items={profile?.allergies} tone="bg-danger/10 text-danger border-danger/20" />
            <TagRow label="Ongoing medications" items={profile?.currentMedications} tone="bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/20" />
          </div>
        )}
        {!profile && <p className="mt-2 text-xs text-subtle">Patient has not completed their health profile.</p>}
      </Panel>

      {pc && (
        <Panel icon={<FileText className="h-4 w-4 text-brand-500" />} title="Pre-consultation form">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Info label="Symptoms" value={pc.symptoms} />
            <Info label="Duration" value={pc.duration} />
            <Info label="Severity" value={pc.severity} className="capitalize" />
            {pc.currentMedications && <Info label="Medications mentioned" value={pc.currentMedications} />}
            {pc.additionalNotes && <Info label="Additional notes" value={pc.additionalNotes} className="col-span-2" />}
          </div>
          {vitals && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-subtle"><Activity className="h-4 w-4 text-rose-500" /> Vitals at consultation</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <VitalChip label="Blood pressure" value={`${vitals.sbp}/${vitals.dbp} mmHg`} sub={vitals.bp_classification} />
                <VitalChip label="Heart rate" value={`${vitals.hr} bpm`} sub={vitals.hr_classification} />
              </div>
            </div>
          )}
        </Panel>
      )}

      {ai && (
        <Panel icon={<Brain className="h-4 w-4 text-violet-500" />} title="AI pre-call analysis">
          {ai.summary && <p className="mb-4 text-sm leading-relaxed text-muted">{ai.summary}</p>}
          {ai.conditions && ai.conditions.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Probable conditions</p>
              <ul className="space-y-1">{ai.conditions.map((c, i) => <li key={i} className="flex gap-2 text-sm text-muted"><span className="shrink-0 text-violet-400">•</span>{c}</li>)}</ul>
            </div>
          )}
          {ai.questions && ai.questions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Suggested questions</p>
              <ul className="space-y-1">{ai.questions.map((q, i) => <li key={i} className="flex gap-2 text-sm text-muted"><span className="shrink-0 text-violet-400">{i + 1}.</span>{q}</li>)}</ul>
            </div>
          )}
        </Panel>
      )}

      {appt.transcript && (
        <Panel icon={<MessageSquare className="h-4 w-4 text-success" />} title="Call transcript">
          <div className="max-h-64 overflow-y-auto rounded-xl bg-surface-2 p-4">
            {appt.transcript.split("\n").map((line, i) => {
              const isDoc = line.startsWith("Doctor:");
              const isPat = line.startsWith("Patient:");
              return (
                <p key={i} className="mb-1.5 text-sm leading-relaxed">
                  {isDoc || isPat ? (
                    <>
                      <span className={`font-semibold ${isDoc ? "text-brand-600 dark:text-brand-300" : "text-success"}`}>{isDoc ? "Doctor" : appt.patientName}:</span>
                      <span className="text-muted">{line.replace(/^(Doctor|Patient):/, "")}</span>
                    </>
                  ) : <span className="text-muted">{line}</span>}
                </p>
              );
            })}
          </div>
        </Panel>
      )}

      {rx && (
        <Panel icon={<Pill className="h-4 w-4 text-brand-500" />} title="Prescription issued" action={appt.prescriptionSentAt ? <span className="text-xs text-subtle">{fmt(appt.prescriptionSentAt)}</span> : undefined}>
          {rx.diagnosis && (
            <div className="mb-4 rounded-xl bg-brand-500/10 px-4 py-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">Diagnosis</p>
              <p className="text-sm text-brand-700 dark:text-brand-200">{rx.diagnosis}</p>
            </div>
          )}
          {rx.medicines && rx.medicines.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Medicines</p>
              {rx.medicines.map((m, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl bg-surface-2 px-4 py-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/12 text-xs font-bold text-brand-700 dark:text-brand-300">{i + 1}</span>
                  <div><p className="text-sm font-semibold text-text">{m.medicine}</p><p className="mt-0.5 text-xs text-muted">{[m.dosage, m.timing, m.frequency, m.duration].filter(Boolean).join(" · ")}</p></div>
                </div>
              ))}
            </div>
          )}
          {rx.advice && (
            <div className="rounded-xl bg-success/8 px-4 py-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-success">Advice</p>
              <p className="text-sm leading-relaxed text-text">{rx.advice}</p>
            </div>
          )}
        </Panel>
      )}

      {!pc && !rx && !appt.transcript && !ai && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-surface-2/50 p-8 text-center text-sm text-muted">No consultation data recorded yet.</div>
      )}
    </div>
  );
}

function Panel({ icon, title, action, children }: { icon: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-1">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </section>
  );
}

function Info({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  if (!value) return null;
  return (
    <div className={className}>
      <p className="mb-0.5 text-xs text-subtle">{label}</p>
      <p className="text-sm font-medium text-text">{value}</p>
    </div>
  );
}

function TagRow({ label, items, tone }: { label: string; items?: string[]; tone: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
      <div className="flex flex-wrap gap-1.5">{items.map((c, i) => <span key={i} className={`rounded-full border px-2.5 py-0.5 text-xs ${tone}`}>{c}</span>)}</div>
    </div>
  );
}

function VitalChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <p className="text-xs text-subtle">{label}</p>
      <p className="text-sm font-semibold text-text">{value}</p>
      {sub && <p className="text-xs capitalize text-subtle">{sub}</p>}
    </div>
  );
}
