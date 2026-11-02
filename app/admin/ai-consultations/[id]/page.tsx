import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import AiConsultation from "@/lib/models/AiConsultation";
import PatientProfile from "@/lib/models/PatientProfile";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Brain, User, FileText, MessageSquare, Pill, Activity, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

function fmt(d: Date | string | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) +
    " · " + date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default async function AdminAiConsultationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");

  await connectDB();
  const raw = await AiConsultation.findById(id).lean();
  if (!raw) notFound();

  const c = raw as unknown as {
    _id: string; patientRef: string; patientName: string; status: string;
    createdAt: Date; consultationStartedAt?: Date; consultationEndedAt?: Date; reportGeneratedAt?: Date;
    preConsultation?: { symptoms: string; duration: string; severity: string; currentMedications: string; additionalNotes: string };
    aiQuestions: string[];
    transcript?: string;
    report?: {
      summary: string; diagnosis: string;
      medicines: Array<{ medicine: string; dosage: string; timing: string; frequency: string; duration: string }>;
      advice: string; dosAndDonts: string[];
    };
  };

  const profile = await PatientProfile.findOne({ userRef: c.patientRef }).lean() as {
    age?: number; gender?: string; weight?: number; height?: number; bloodGroup?: string;
    knownConditions?: string[]; allergies?: string[]; currentMedications?: string[];
  } | null;

  const report = c.report;
  const dos    = report?.dosAndDonts?.filter(d => d.toLowerCase().startsWith("do:")) ?? [];
  const donts  = report?.dosAndDonts?.filter(d => d.toLowerCase().startsWith("don't:") || d.toLowerCase().startsWith("dont:")) ?? [];
  const emerg  = report?.dosAndDonts?.filter(d => d.toLowerCase().startsWith("seek")) ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/ai-consultations" className="p-2 rounded-xl hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5 text-muted" />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <Brain className="w-5 h-5 text-violet-600" />
          <div>
            <h1 className="text-xl font-bold text-text">AI Consultation Record</h1>
            <p className="text-muted text-sm">{c.patientName} · {fmt(c.createdAt)}</p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${
          c.status === "report_ready" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
        }`}>{c.status.replace(/_/g, " ")}</span>
      </div>

      {/* Patient profile */}
      <section className="bg-surface rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-blue-600" />
          <h2 className="font-semibold text-text text-sm">Patient Profile</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          {[
            ["Name",         c.patientName],
            ["Age",          profile?.age ? `${profile.age} yrs` : null],
            ["Gender",       profile?.gender],
            ["Weight",       profile?.weight ? `${profile.weight} kg` : null],
            ["Height",       profile?.height ? `${profile.height} cm` : null],
            ["Blood Group",  profile?.bloodGroup],
          ].map(([label, val]) => val ? (
            <div key={label as string}>
              <p className="text-xs text-subtle mb-0.5">{label}</p>
              <p className="text-sm font-medium text-text capitalize">{val}</p>
            </div>
          ) : null)}
        </div>
        {(profile?.knownConditions?.length || profile?.allergies?.length || profile?.currentMedications?.length) && (
          <div className="pt-4 border-t border-border space-y-3">
            {profile?.knownConditions?.length ? (
              <TagRow label="Known Conditions" tags={profile.knownConditions} color="orange" />
            ) : null}
            {profile?.allergies?.length ? (
              <TagRow label="Allergies" tags={profile.allergies} color="red" />
            ) : null}
            {profile?.currentMedications?.length ? (
              <TagRow label="Ongoing Medications" tags={profile.currentMedications} color="blue" />
            ) : null}
          </div>
        )}
      </section>

      {/* Pre-consultation form */}
      {c.preConsultation && (
        <section className="bg-surface rounded-2xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-blue-600" />
            <h2 className="font-semibold text-text text-sm">Pre-Consultation Form</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              ["Symptoms",            c.preConsultation.symptoms],
              ["Duration",            c.preConsultation.duration],
              ["Severity",            c.preConsultation.severity],
              ["Medications Mentioned", c.preConsultation.currentMedications || null],
              ["Additional Notes",    c.preConsultation.additionalNotes || null],
            ].map(([label, val]) => val ? (
              <div key={label as string} className={label === "Additional Notes" ? "col-span-2" : ""}>
                <p className="text-xs text-subtle mb-0.5">{label}</p>
                <p className="text-sm text-text capitalize">{val}</p>
              </div>
            ) : null)}
          </div>
        </section>
      )}

      {/* AI Questions */}
      {c.aiQuestions?.length > 0 && (
        <section className="bg-surface rounded-2xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-violet-600" />
            <h2 className="font-semibold text-text text-sm">AI-Generated Diagnostic Questions</h2>
          </div>
          <ol className="space-y-2">
            {c.aiQuestions.map((q, i) => (
              <li key={i} className="flex gap-3 text-sm text-muted">
                <span className="font-semibold text-violet-400 shrink-0">{i + 1}.</span>{q}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Transcript */}
      {c.transcript && (
        <section className="bg-surface rounded-2xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <h2 className="font-semibold text-text text-sm">Consultation Transcript</h2>
            <span className="ml-auto text-xs text-subtle">{fmt(c.consultationStartedAt)} → {fmt(c.consultationEndedAt)}</span>
          </div>
          <div className="bg-surface-2 rounded-xl p-4 max-h-72 overflow-y-auto space-y-1.5">
            {c.transcript.split("\n").filter(Boolean).map((line, i) => {
              const isDoc = line.startsWith("Doctor:");
              const isPat = line.startsWith("Patient:");
              return (
                <p key={i} className="text-sm leading-relaxed">
                  {(isDoc || isPat) ? (
                    <>
                      <span className={`font-semibold ${isDoc ? "text-violet-600" : "text-emerald-600"}`}>
                        {isDoc ? "Dr. MediQ AI" : c.patientName}:
                      </span>
                      <span className="text-muted">{line.replace(/^(Doctor|Patient):/, "")}</span>
                    </>
                  ) : <span className="text-muted">{line}</span>}
                </p>
              );
            })}
          </div>
        </section>
      )}

      {/* Report */}
      {report && (
        <section className="bg-surface rounded-2xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Pill className="w-4 h-4 text-blue-600" />
            <h2 className="font-semibold text-text text-sm">Generated Report</h2>
            <span className="ml-auto text-xs text-subtle">{fmt(c.reportGeneratedAt)}</span>
          </div>
          {report.summary && (
            <p className="text-sm text-muted leading-relaxed mb-4">{report.summary}</p>
          )}
          {report.diagnosis && (
            <div className="bg-blue-50 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Diagnosis</p>
              <p className="text-sm text-blue-900">{report.diagnosis}</p>
            </div>
          )}
          {report.medicines?.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-2">Prescribed Medicines</p>
              {report.medicines.map((m, i) => (
                <div key={i} className="flex gap-3 bg-surface-2 rounded-xl px-4 py-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i+1}</div>
                  <div>
                    <p className="font-semibold text-text text-sm">{m.medicine}</p>
                    <p className="text-xs text-muted">{[m.dosage, m.timing, m.frequency, m.duration].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-3">
            {dos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1.5">Do</p>
                {dos.map((d, i) => (
                  <p key={i} className="flex gap-2 text-sm text-text mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    {d.replace(/^do:/i, "").trim()}
                  </p>
                ))}
              </div>
            )}
            {donts.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1.5">Don&apos;t</p>
                {donts.map((d, i) => (
                  <p key={i} className="flex gap-2 text-sm text-text mb-1">
                    <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    {d.replace(/^don'?t:/i, "").trim()}
                  </p>
                ))}
              </div>
            )}
            {emerg.length > 0 && (
              <div className="bg-red-50 rounded-xl px-4 py-3">
                {emerg.map((e, i) => (
                  <p key={i} className="flex gap-2 text-sm text-red-800 font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{e}
                  </p>
                ))}
              </div>
            )}
          </div>
          {report.advice && (
            <div className="mt-4 bg-emerald-50 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Advice</p>
              <p className="text-sm text-emerald-900 leading-relaxed">{report.advice}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function TagRow({ label, tags, color }: { label: string; tags: string[]; color: "orange" | "red" | "blue" }) {
  const cls = { orange: "bg-orange-50 text-orange-700 border-orange-100", red: "bg-red-50 text-red-700 border-red-100", blue: "bg-blue-50 text-blue-700 border-blue-100" }[color];
  return (
    <div>
      <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t, i) => <span key={i} className={`text-xs px-2.5 py-0.5 rounded-full border ${cls}`}>{t}</span>)}
      </div>
    </div>
  );
}
