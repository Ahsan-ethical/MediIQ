import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Appointment from "@/lib/models/Appointment";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Clock, IndianRupee, ChevronRight } from "lucide-react";
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

export default async function DoctorAppointmentsPage() {
  const authUser = await getCurrentUser();
  if (!authUser || authUser.role !== "doctor") redirect("/login");

  await connectDB();
  const raw = await Appointment.find({ doctorRef: authUser.userId }).sort({ consultationStartsAt: -1 }).lean();
  const appts = raw as unknown as Array<{ _id: string; patientName: string; consultationStartsAt: Date; status: string; consultationFee: number }>;

  const upcoming = appts.filter((a) => ACTIVE_STATUSES.includes(a.status));
  const past = appts.filter((a) => TERMINAL_STATUSES.includes(a.status));

  return (
    <PageBody>
      <PageHeader title="My schedule" subtitle={`${appts.length} total appointments`} />

      <h2 className="pt-2 text-xs font-semibold uppercase tracking-wider text-subtle">Upcoming ({upcoming.length})</h2>
      {upcoming.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-surface-2/50"><EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No upcoming appointments" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{upcoming.map((a, i) => <AppointmentCard key={String(a._id)} appt={a} delay={i * 0.06} />)}</div>
      )}

      <h2 className="pt-2 text-xs font-semibold uppercase tracking-wider text-subtle">Past appointments ({past.length})</h2>
      {past.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-surface-2/50"><EmptyState title="No past appointments" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{past.map((a, i) => <AppointmentCard key={String(a._id)} appt={a} delay={i * 0.05} linkable />)}</div>
      )}
    </PageBody>
  );
}

function AppointmentCard({ appt, delay, linkable }: {
  appt: { _id: string; patientName: string; consultationStartsAt: Date; status: string; consultationFee: number };
  delay?: number; linkable?: boolean;
}) {
  const inner = (
    <div className={`rounded-2xl border border-border bg-surface p-5 shadow-1 transition-all duration-300 ${linkable ? "group hover:-translate-y-1 hover:shadow-3" : ""}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-accent-500 text-sm font-bold text-white">{appt.patientName.charAt(0).toUpperCase()}</span>
          <div>
            <p className="text-sm font-semibold text-text">{appt.patientName}</p>
            <p className="text-xs text-subtle">Patient</p>
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
        <p className="flex items-center gap-2"><IndianRupee className="h-3.5 w-3.5 text-subtle" /> ₹{appt.consultationFee}</p>
      </div>
    </div>
  );
  return <Reveal delay={delay}>{linkable ? <Link href={`/doctor/appointments/${appt._id}`} className="block">{inner}</Link> : inner}</Reveal>;
}
