import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/lib/models/User";
import PatientProfile from "@/lib/models/PatientProfile";
import Appointment from "@/lib/models/Appointment";
import AiConsultation from "@/lib/models/AiConsultation";
import { redirect } from "next/navigation";
import Link from "next/link";
import StatCard from "@/components/StatCard";
import ActiveAppointmentBanner from "@/components/ActiveAppointmentBanner";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { PageHeader, PageBody, Panel, EmptyState } from "@/components/ui/PageHeader";
import StatusPill from "@/components/ui/StatusPill";
import { Reveal } from "@/components/motion";
import {
  CalendarDays, Activity, UserCheck, ChevronRight, CalendarClock,
  HeartPulse, Stethoscope, Plus, Brain, Droplet,
} from "lucide-react";

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

export default async function PatientDashboard() {
  const authUser = await getCurrentUser();
  if (!authUser || authUser.role !== "patient") redirect("/login");

  await connectDB();
  const dbUser = await User.findById(authUser.userId)
    .select("name profileCompleted")
    .lean() as { name: string; profileCompleted: boolean } | null;

  if (!dbUser?.profileCompleted) redirect("/patient/profile");

  const [profileRaw, apptRaw, aiRaw] = await Promise.all([
    PatientProfile.findOne({ userRef: authUser.userId }).lean(),
    Appointment.find({ patientRef: authUser.userId }).sort({ createdAt: -1 }).limit(10).lean(),
    AiConsultation.find({ patientRef: authUser.userId }).sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  type ApptRow = { _id: string; doctorName: string; specialization: string; bookedAt: Date; status: string; consultationFee: number };
  type AiRow = { _id: string; createdAt: Date; status: string };

  const appointments = apptRaw as unknown as ApptRow[];
  const aiConsultations = aiRaw as unknown as AiRow[];
  const profile = profileRaw as unknown as {
    knownConditions?: string[]; allergies?: string[];
    currentMedications?: string[]; bloodGroup?: string; age?: number; gender?: string;
  } | null;

  const completed = appointments.filter((a) => a.status === "completed").length;
  const upcoming = appointments.filter((a) => ["pending_approval", "confirmed", "active"].includes(a.status));

  type RecentItem = { kind: "appt"; data: ApptRow; date: Date } | { kind: "ai"; data: AiRow; date: Date };
  const recentItems: RecentItem[] = [
    ...appointments.map((a) => ({ kind: "appt" as const, data: a, date: new Date(a.bookedAt) })),
    ...aiConsultations.map((a) => ({ kind: "ai" as const, data: a, date: new Date(a.createdAt) })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 6);

  return (
    <PageBody>
      <PageHeader
        title={<>Good {getGreeting()}, {dbUser.name.split(" ")[0]} 👋</>}
        subtitle="Here's your health overview at a glance."
        action={
          <Link href="/patient/book-appointment" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-2 transition-shadow hover:shadow-brand">
            <Plus className="h-4 w-4" /> Book appointment
          </Link>
        }
      />

      <ActiveAppointmentBanner />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total consultations" value={appointments.length} icon={<Activity className="h-6 w-6" />} color="text-brand-600 dark:text-brand-300" bgColor="bg-brand-500/12" delay={0} />
        <StatCard label="Completed" value={completed} icon={<UserCheck className="h-6 w-6" />} color="text-success" bgColor="bg-success/12" delay={80} />
        <StatCard label="Active / upcoming" value={upcoming.length} icon={<CalendarDays className="h-6 w-6" />} color="text-violet-600 dark:text-violet-300" bgColor="bg-violet-500/12" delay={160} />
        <StatCard label="Age" value={profile?.age ?? "—"} icon={<HeartPulse className="h-6 w-6" />} color="text-rose-500" bgColor="bg-rose-500/12" delay={240} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Health summary */}
        <Reveal>
          <Panel
            title="Health summary"
            action={
              <Link href="/patient/profile" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-300">
                Update <ChevronRight className="h-3 w-3" />
              </Link>
            }
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <InfoRow icon={<Droplet className="h-4 w-4" />} label="Blood group" value={profile?.bloodGroup} />
                <InfoRow icon={<HeartPulse className="h-4 w-4" />} label="Gender" value={profile?.gender} />
              </div>
              <TagSection label="Known conditions" items={profile?.knownConditions} tone="bg-warning/10 text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning border-warning/20" />
              <TagSection label="Allergies" items={profile?.allergies} tone="bg-danger/10 text-danger border-danger/20" />
              <TagSection label="Current medications" items={profile?.currentMedications} tone="bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/20" />
            </div>
          </Panel>
        </Reveal>

        {/* Recent consultations */}
        <Reveal delay={0.08}>
          <Panel
            title="Recent consultations"
            action={
              <Link href="/patient/appointments" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-300">
                View all <ChevronRight className="h-3 w-3" />
              </Link>
            }
            bodyClassName="p-3"
          >
            {recentItems.length === 0 ? (
              <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="No consultations yet" hint="Book your first appointment to get started." />
            ) : (
              <div className="space-y-1">
                {recentItems.map((item) => {
                  if (item.kind === "appt") {
                    const appt = item.data;
                    return (
                      <Link key={`appt-${appt._id}`} href="/patient/appointments" className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-surface-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
                          <Stethoscope className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-text">Dr. {appt.doctorName}</p>
                          <p className="truncate text-xs capitalize text-muted">{appt.specialization} · {formatDate(appt.bookedAt)}</p>
                        </div>
                        <StatusPill status={appt.status} />
                      </Link>
                    );
                  }
                  const ai = item.data;
                  const href = ai.status === "report_ready" ? `/patient/ai-consultation/${ai._id}/report` : `/patient/ai-consultation/${ai._id}`;
                  return (
                    <Link key={`ai-${ai._id}`} href={href} className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-surface-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600 dark:text-violet-300">
                        <Brain className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text">Dr. MediIQ AI</p>
                        <p className="truncate text-xs text-muted">AI consultation · {formatDate(item.date)}</p>
                      </div>
                      <StatusPill status={ai.status} />
                    </Link>
                  );
                })}
              </div>
            )}
          </Panel>
        </Reveal>
      </div>

      <ChatPanel />
    </PageBody>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  return (
    <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
      <span className="text-subtle">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
        <p className="truncate text-sm font-semibold capitalize text-text">{value ?? "—"}</p>
      </div>
    </div>
  );
}

function TagSection({ label, items, tone }: { label: string; items?: string[]; tone: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
      {items?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span key={i} className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>{item}</span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-subtle">None recorded</p>
      )}
    </div>
  );
}
