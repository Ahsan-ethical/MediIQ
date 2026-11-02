import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/lib/models/User";
import DoctorProfile from "@/lib/models/DoctorProfile";
import Appointment from "@/lib/models/Appointment";
import { redirect } from "next/navigation";
import Link from "next/link";
import StatCard from "@/components/StatCard";
import { PageHeader, PageBody, Panel, EmptyState } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/motion";
import { Users, UserCheck, UserX, Clock, CalendarDays, ChevronRight, Stethoscope } from "lucide-react";

export default async function AdminDashboard() {
  const authUser = await getCurrentUser();
  if (!authUser || authUser.role !== "admin") redirect("/login");

  await connectDB();
  const [totalPatients, totalDoctors, approved, rejected, pending, totalAppts] = await Promise.all([
    User.countDocuments({ role: "patient" }),
    User.countDocuments({ role: "doctor" }),
    DoctorProfile.countDocuments({ verificationStatus: "approved" }),
    DoctorProfile.countDocuments({ verificationStatus: "rejected" }),
    DoctorProfile.countDocuments({ verificationStatus: "pending" }),
    Appointment.countDocuments(),
  ]);

  const recentDoctors = await DoctorProfile.find({ verificationStatus: "pending" })
    .populate("userRef", "name email createdAt")
    .sort({ createdAt: -1 })
    .limit(5)
    .lean() as unknown as {
      _id: string; userId: string; specialization: string; hospital: string; city: string;
      userRef: { name: string; email: string; createdAt: Date };
    }[];

  return (
    <PageBody>
      <PageHeader title="Admin overview" subtitle="Platform health at a glance." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Total patients" value={totalPatients} icon={<Users className="h-6 w-6" />} color="text-brand-600 dark:text-brand-300" bgColor="bg-brand-500/12" delay={0} />
        <StatCard label="Total doctors" value={totalDoctors} icon={<Stethoscope className="h-6 w-6" />} color="text-violet-600 dark:text-violet-300" bgColor="bg-violet-500/12" delay={80} />
        <StatCard label="Total appointments" value={totalAppts} icon={<CalendarDays className="h-6 w-6" />} color="text-accent-600 dark:text-accent-300" bgColor="bg-accent-500/12" delay={160} />
        <StatCard label="Approved doctors" value={approved} icon={<UserCheck className="h-6 w-6" />} color="text-success" bgColor="bg-success/12" delay={240} />
        <StatCard label="Pending review" value={pending} icon={<Clock className="h-6 w-6" />} color="text-amber-500" bgColor="bg-warning/12" delay={320} />
        <StatCard label="Rejected" value={rejected} icon={<UserX className="h-6 w-6" />} color="text-danger" bgColor="bg-danger/12" delay={400} />
      </div>

      <Reveal>
        <Panel
          title={
            <span className="flex flex-col">
              Pending doctor approvals
              {pending > 0 && <span className="text-xs font-medium text-amber-500">{pending} doctor{pending !== 1 ? "s" : ""} awaiting review</span>}
            </span>
          }
          action={<Link href="/admin/doctors" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-300">Manage all <ChevronRight className="h-3 w-3" /></Link>}
          bodyClassName="p-3"
        >
          {recentDoctors.length === 0 ? (
            <EmptyState icon={<UserCheck className="h-6 w-6" />} title="No pending approvals" hint="New doctor sign-ups will appear here for review." />
          ) : (
            <div className="space-y-1">
              {recentDoctors.map((doc) => (
                <div key={String(doc._id)} className="flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-surface-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-brand-500 text-sm font-bold text-white">
                    {doc.userRef.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text">Dr. {doc.userRef.name}</p>
                    <p className="truncate text-xs capitalize text-muted">{doc.specialization} · {doc.hospital}, {doc.city}</p>
                    <p className="truncate text-xs text-subtle">{doc.userRef.email}</p>
                  </div>
                  <span className="rounded-full border border-warning/20 bg-warning/12 px-2.5 py-1 text-xs font-semibold text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning">Pending</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </Reveal>
    </PageBody>
  );
}
