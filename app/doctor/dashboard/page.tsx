import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/lib/models/User";
import DoctorProfile from "@/lib/models/DoctorProfile";
import Appointment from "@/lib/models/Appointment";
import { redirect } from "next/navigation";
import Link from "next/link";
import StatCard from "@/components/StatCard";
import GoLiveButton from "@/components/GoLiveButton";
import DoctorPendingApprovals from "@/components/DoctorPendingApprovals";
import DoctorConsultationNotification from "@/components/DoctorConsultationNotification";
import { PageHeader, PageBody, Panel, EmptyState } from "@/components/ui/PageHeader";
import StatusPill from "@/components/ui/StatusPill";
import { Reveal } from "@/components/motion";
import {
  Users, Star, IndianRupee, CalendarDays, ChevronRight,
  Clock, AlertCircle, CheckCircle2, Stethoscope,
} from "lucide-react";

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

export default async function DoctorDashboard() {
  const authUser = await getCurrentUser();
  if (!authUser || authUser.role !== "doctor") redirect("/login");

  await connectDB();
  const dbUser = await User.findById(authUser.userId).select("name profileCompleted").lean() as { name: string; profileCompleted: boolean } | null;
  if (!dbUser?.profileCompleted) redirect("/doctor/profile");

  const profile = await DoctorProfile.findOne({ userRef: authUser.userId }).lean() as {
    _id: string; userId: string; specialization: string; qualification: string;
    experience: number; hospital: string; city: string; consultationFee: number;
    verificationStatus: string; rating: number; totalRatings: number; isLive: boolean;
  } | null;

  if (!profile) redirect("/doctor/profile");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayRaw, allRaw] = await Promise.all([
    Appointment.find({ doctorRef: authUser.userId, consultationStartsAt: { $gte: today, $lt: tomorrow } }).sort({ consultationStartsAt: 1 }).lean(),
    Appointment.find({ doctorRef: authUser.userId }).sort({ consultationStartsAt: -1 }).limit(8).lean(),
  ]);

  type Appt = { _id: string; patientName: string; consultationStartsAt: Date; status: string };
  const todayAppts = todayRaw as unknown as Appt[];
  const allAppts = allRaw as unknown as Appt[];
  const completedCount = allAppts.filter((a) => a.status === "completed").length;

  const isPending = profile.verificationStatus === "pending";
  const isRejected = profile.verificationStatus === "rejected";
  const isApproved = profile.verificationStatus === "approved";

  return (
    <PageBody>
      <PageHeader
        title={<>Good {getGreeting()}, Dr. {dbUser.name.split(" ").slice(-1)[0]} 👋</>}
        subtitle={`${profile.specialization.charAt(0).toUpperCase() + profile.specialization.slice(1)} · ${profile.hospital}`}
        action={isApproved && <GoLiveButton initialLive={profile.isLive} />}
      />

      {/* Verification status banner */}
      {isPending && (
        <Banner tone="amber" icon={<Clock className="h-5 w-5" />} title="Profile under review"
          body="Admin is reviewing your profile. You'll be notified once approved." />
      )}
      {isRejected && (
        <Banner tone="red" icon={<AlertCircle className="h-5 w-5" />} title="Profile not approved"
          body={<>Please <Link href="/doctor/profile" className="font-semibold underline">update your profile</Link> and resubmit.</>} />
      )}
      {isApproved && (
        <Banner tone="green" icon={<CheckCircle2 className="h-5 w-5" />} title="Profile approved"
          body={profile.isLive ? "You are live and accepting consultations." : "Toggle Go Live to start accepting consultations."} />
      )}

      {isApproved && <DoctorConsultationNotification />}

      {isApproved && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-text">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-success" />
            Incoming consultation requests
          </h2>
          <DoctorPendingApprovals />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Patients served" value={completedCount} icon={<Users className="h-6 w-6" />} color="text-brand-600 dark:text-brand-300" bgColor="bg-brand-500/12" delay={0} />
        <StatCard label="Avg. rating" value={profile.totalRatings > 0 ? profile.rating.toFixed(1) : "N/A"} icon={<Star className="h-6 w-6" />} color="text-amber-500" bgColor="bg-warning/12" delay={80} />
        <StatCard label="Consultation fee" value={`₹${profile.consultationFee}`} icon={<IndianRupee className="h-6 w-6" />} color="text-success" bgColor="bg-success/12" delay={160} />
        <StatCard label="Today's schedule" value={todayAppts.length} icon={<CalendarDays className="h-6 w-6" />} color="text-violet-600 dark:text-violet-300" bgColor="bg-violet-500/12" delay={240} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Reveal>
          <Panel title="Today's schedule" bodyClassName="p-3">
            {todayAppts.length === 0 ? (
              <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No appointments today" hint="Enjoy the quiet — or go live to accept new consultations." />
            ) : (
              <div className="space-y-1">
                {todayAppts.map((appt) => (
                  <div key={String(appt._id)} className="flex items-center gap-3 rounded-xl p-3 hover:bg-surface-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
                      <Users className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">{appt.patientName}</p>
                      <p className="text-xs text-muted">{formatDate(appt.consultationStartsAt)}</p>
                    </div>
                    <StatusPill status={appt.status} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </Reveal>

        <Reveal delay={0.08}>
          <Panel
            title="Recent consultations"
            action={<Link href="/doctor/appointments" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-300">View all <ChevronRight className="h-3 w-3" /></Link>}
            bodyClassName="p-3"
          >
            {allAppts.length === 0 ? (
              <EmptyState icon={<Stethoscope className="h-6 w-6" />} title="No consultations yet" />
            ) : (
              <div className="space-y-1">
                {allAppts.slice(0, 5).map((appt) => (
                  <div key={String(appt._id)} className="flex items-center gap-3 rounded-xl p-3 hover:bg-surface-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-accent-500 text-xs font-bold text-white">
                      {appt.patientName.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">{appt.patientName}</p>
                      <p className="text-xs text-muted">{formatDate(appt.consultationStartsAt)}</p>
                    </div>
                    <StatusPill status={appt.status} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </Reveal>
      </div>

      <Reveal>
        <Panel
          title="Professional summary"
          action={<Link href="/doctor/profile" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-300">Edit profile <ChevronRight className="h-3 w-3" /></Link>}
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: "Specialization", value: profile.specialization },
              { label: "Qualification", value: profile.qualification.toUpperCase() },
              { label: "Experience", value: `${profile.experience} years` },
              { label: "Location", value: profile.city },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-border bg-surface-2 p-4">
                <p className="mb-1 text-xs font-medium text-subtle">{label}</p>
                <p className="text-sm font-semibold capitalize text-text">{value}</p>
              </div>
            ))}
          </div>
        </Panel>
      </Reveal>
    </PageBody>
  );
}

function Banner({ tone, icon, title, body }: { tone: "amber" | "red" | "green"; icon: React.ReactNode; title: string; body: React.ReactNode }) {
  const map = {
    amber: "border-warning/25 bg-warning/10 text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning",
    red: "border-danger/25 bg-danger/10 text-danger",
    green: "border-success/25 bg-success/10 text-success",
  };
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-5 ${map[tone]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs opacity-90">{body}</p>
      </div>
    </div>
  );
}
