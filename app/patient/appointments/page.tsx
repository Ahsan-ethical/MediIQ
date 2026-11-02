import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import AiConsultation from "@/lib/models/AiConsultation";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Clock, Stethoscope, IndianRupee, ChevronRight, Brain } from "lucide-react";
import BookAppointmentModal from "@/components/BookAppointmentModal";
import { PageBody, PageHeader, EmptyState } from "@/components/ui/PageHeader";
import StatusPill from "@/components/ui/StatusPill";
import { Reveal } from "@/components/motion";

function formatDate(d: Date | string) {
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}
function formatTime(d: Date | string) {
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

const ACTIVE_STATUSES = ["pending_approval", "confirmed", "active", "in_call"];
const TERMINAL_STATUSES = ["completed", "post_call", "rejected", "cancelled"];

export default async function PatientAppointmentsPage() {
  const authUser = await getCurrentUser();
  if (!authUser || authUser.role !== "patient") redirect("/login");

  await connectDB();
  const [raw, aiRaw] = await Promise.all([
    Appointment.find({ patientRef: authUser.userId }).sort({ consultationStartsAt: -1 }).lean(),
    AiConsultation.find({ patientRef: authUser.userId }).sort({ createdAt: -1 }).lean(),
  ]);

  const appts = raw as unknown as Array<{
    _id: string; doctorName: string; specialization: string;
    consultationStartsAt: Date; status: string; consultationFee: number;
  }>;
  const aiConsultations = aiRaw as unknown as Array<{
    _id: string; patientName: string; status: string; createdAt: Date;
    preConsultation?: { symptoms: string }; report?: { diagnosis: string };
  }>;

  const upcoming = appts.filter((a) => ACTIVE_STATUSES.includes(a.status));
  const past = appts.filter((a) => TERMINAL_STATUSES.includes(a.status));

  return (
    <PageBody>
      <PageHeader
        title="My appointments"
        subtitle={`${appts.length} total consultations`}
        action={<BookAppointmentModal />}
      />

      <SectionLabel>Upcoming ({upcoming.length})</SectionLabel>
      {upcoming.length === 0 ? (
        <DashedEmpty icon={<CalendarDays className="h-6 w-6" />} text="No upcoming appointments" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {upcoming.map((a, i) => <AppointmentCard key={String(a._id)} appt={a} delay={i * 0.06} highlight />)}
        </div>
      )}

      <SectionLabel>Past appointments ({past.length})</SectionLabel>
      {past.length === 0 ? (
        <DashedEmpty text="No past appointments" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {past.map((a, i) => <AppointmentCard key={String(a._id)} appt={a} delay={i * 0.05} linkable />)}
        </div>
      )}

      {aiConsultations.length > 0 && (
        <>
          <SectionLabel><Brain className="h-3.5 w-3.5" /> AI Doctor consultations ({aiConsultations.length})</SectionLabel>
          <div className="grid gap-4 md:grid-cols-2">
            {aiConsultations.map((c, i) => {
              const isReady = c.status === "report_ready";
              const href = isReady
                ? `/patient/ai-consultation/${c._id}/report`
                : c.status === "generating_report" || c.status === "in_consultation"
                  ? `/patient/ai-consultation/${c._id}/waiting`
                  : `/patient/ai-consultation/${c._id}`;
              return (
                <Reveal key={String(c._id)} delay={i * 0.05}>
                  <Link href={href} className="group block rounded-2xl border border-border bg-surface p-5 shadow-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-3">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600 dark:text-violet-300">
                          <Brain className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-text">Dr. MediIQ AI</p>
                          <p className="text-xs text-muted">AI consultation</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StatusPill status={c.status} />
                        {isReady && <ChevronRight className="h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5" />}
                      </div>
                    </div>
                    {c.preConsultation?.symptoms && (
                      <p className="mb-1 truncate text-xs text-muted"><span className="font-medium text-text">Symptoms:</span> {c.preConsultation.symptoms}</p>
                    )}
                    {c.report?.diagnosis && (
                      <p className="truncate text-xs text-muted"><span className="font-medium text-text">Diagnosis:</span> {c.report.diagnosis}</p>
                    )}
                    <div className="mt-3 flex items-center gap-2 text-xs text-subtle">
                      <CalendarDays className="h-3.5 w-3.5" /> {formatDate(c.createdAt)} · {formatTime(c.createdAt)}
                    </div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </>
      )}
    </PageBody>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wider text-subtle">{children}</h2>;
}

function DashedEmpty({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-surface-2/50">
      <EmptyState icon={icon} title={text} />
    </div>
  );
}

function AppointmentCard({ appt, delay, highlight, linkable }: {
  appt: { _id: string; doctorName: string; specialization: string; consultationStartsAt: Date; status: string; consultationFee: number };
  delay?: number; highlight?: boolean; linkable?: boolean;
}) {
  const inner = (
    <div className={`rounded-2xl border bg-surface p-5 shadow-1 transition-all duration-300 ${highlight ? "border-brand-500/30" : "border-border"} ${linkable ? "group hover:-translate-y-1 hover:shadow-3" : ""}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
            <Stethoscope className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text">Dr. {appt.doctorName}</p>
            <p className="text-xs capitalize text-muted">{appt.specialization}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusPill status={appt.status} />
          {linkable && <ChevronRight className="h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5" />}
        </div>
      </div>
      <div className="space-y-1.5 text-xs text-muted">
        <p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-subtle" /> {formatDate(appt.consultationStartsAt)}</p>
        <p className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-subtle" /> {formatTime(appt.consultationStartsAt)}</p>
        <p className="flex items-center gap-2"><IndianRupee className="h-3.5 w-3.5 text-subtle" /> ₹{appt.consultationFee} consultation fee</p>
      </div>
    </div>
  );
  return (
    <Reveal delay={delay}>
      {linkable ? <Link href={`/patient/appointments/${appt._id}`} className="block">{inner}</Link> : inner}
    </Reveal>
  );
}
