import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import AiConsultation from "@/lib/models/AiConsultation";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Brain, Pill, ArrowLeft, FileText, AlertTriangle, ShieldAlert, Sparkles } from "lucide-react";
import AiDoctorAvatar from "@/components/AiDoctorAvatar";
import PatientProfile from "@/lib/models/PatientProfile";
import PrescriptionDownloadButton from "@/components/PrescriptionDownloadButton";
import { Reveal } from "@/components/motion";

function parseAdviceLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\d+\.\s*/, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").trim())
    .filter(Boolean);
}
function fmt(d: Date | string | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) +
    " · " + date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default async function AiReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "patient") redirect("/login");

  await connectDB();
  const [raw, patientDoc] = await Promise.all([
    AiConsultation.findOne({ _id: id, patientRef: user.userId }).lean(),
    PatientProfile.findOne({ userRef: user.userId }).select("age gender bloodGroup").lean() as Promise<{ age?: number; gender?: string; bloodGroup?: string } | null>,
  ]);
  if (!raw) notFound();

  const c = raw as unknown as {
    _id: string; patientName: string; status: string;
    consultationStartedAt?: Date; reportGeneratedAt?: Date;
    preConsultation?: { symptoms: string; duration: string; severity: string };
    report?: {
      summary: string; diagnosis: string;
      medicines: Array<{ medicine: string; dosage: string; timing: string; frequency: string; duration: string; condition?: string; purpose?: string }>;
      advice: string; dosAndDonts: string[]; drugSafetyNote?: string;
    };
  };

  if (c.status !== "report_ready" || !c.report) redirect(`/patient/ai-consultation/${id}/waiting`);
  const report = c.report;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-5 sm:p-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/patient/appointments" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-text">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex flex-1 items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl">
            <AiDoctorAvatar className="h-full w-full" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight text-text">Your medical report</h1>
            <p className="flex items-center gap-1 text-xs text-muted"><Brain className="h-3 w-3" /> Dr. MediIQ AI · {fmt(c.reportGeneratedAt)}</p>
          </div>
          <PrescriptionDownloadButton
            filename={`medi-iq-ai-report-${String(c._id).slice(-8)}.pdf`}
            props={{
              patientName: c.patientName, patientAge: patientDoc?.age, patientSex: patientDoc?.gender,
              patientBloodGroup: patientDoc?.bloodGroup, symptoms: c.preConsultation?.symptoms,
              symptomsDuration: c.preConsultation?.duration, symptomsSeverity: c.preConsultation?.severity,
              diagnosis: report.diagnosis, medicines: report.medicines,
              adviceLines: report.advice ? parseAdviceLines(report.advice) : [],
              doctorName: "MediIQ AI", isAiConsultation: true, drugSafetyNote: report.drugSafetyNote,
              prescriptionDate: c.reportGeneratedAt ? new Date(c.reportGeneratedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : undefined,
              prescriptionId: String(c._id),
            }}
          />
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex gap-2 rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-xs text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>This report is AI-generated and not a substitute for professional medical advice. If symptoms worsen or persist, consult a licensed doctor immediately.</span>
      </div>

      {report.summary && (
        <Reveal>
          <section className="relative overflow-hidden rounded-2xl border border-brand-500/20 p-5">
            <div className="absolute inset-0 -z-10 bg-brand-radial opacity-60" />
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-500" />
              <h2 className="text-sm font-semibold text-text">Clinical summary</h2>
            </div>
            <p className="text-sm leading-relaxed text-text">{report.summary}</p>
          </section>
        </Reveal>
      )}

      {report.diagnosis && (
        <Reveal delay={0.05}>
          <ReportCard icon={<FileText className="h-4 w-4 text-brand-500" />} title="Diagnosis">
            <div className="rounded-xl bg-brand-500/10 px-4 py-3">
              <p className="text-sm font-medium text-brand-700 dark:text-brand-200">{report.diagnosis}</p>
            </div>
          </ReportCard>
        </Reveal>
      )}

      {report.medicines?.length > 0 && (
        <Reveal delay={0.05}>
          <ReportCard icon={<Pill className="h-4 w-4 text-brand-500" />} title="Prescribed medicines">
            <div className="space-y-2.5">
              {report.medicines.map((m, i) => (
                <div key={i} className="flex gap-3 rounded-xl bg-surface-2 px-4 py-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/12 text-xs font-bold text-brand-700 dark:text-brand-300">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">{m.medicine}</p>
                    <p className="mt-0.5 text-xs text-muted">{[m.dosage, m.timing, m.frequency, m.duration].filter(Boolean).join(" · ")}</p>
                    {m.purpose && <p className="mt-0.5 text-xs italic text-subtle">↳ {m.purpose}</p>}
                    {m.condition && <p className="mt-1 flex items-center gap-1 text-xs text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning"><span className="shrink-0">⚠</span> {m.condition}</p>}
                  </div>
                </div>
              ))}
            </div>
          </ReportCard>
        </Reveal>
      )}

      {report.drugSafetyNote && (
        <div className="flex gap-2 rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="mb-0.5 text-xs font-semibold text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning">Drug safety note</p>
            <p className="text-xs leading-relaxed text-muted">{report.drugSafetyNote}</p>
          </div>
        </div>
      )}

      {report.advice && (
        <Reveal delay={0.05}>
          <section className="rounded-2xl border border-success/20 bg-success/8 px-5 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-success">Doctor&apos;s advice</p>
            <ul className="space-y-2">
              {parseAdviceLines(report.advice).map((line, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-text">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/20 text-xs font-bold text-success">{i + 1}</span>
                  {line}
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}

      <Link href="/patient/appointments" className="block py-2 text-center text-sm font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-300">
        ← Back to my appointments
      </Link>
    </div>
  );
}

function ReportCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-1">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-text">{title}</h2>
      </div>
      {children}
    </section>
  );
}
