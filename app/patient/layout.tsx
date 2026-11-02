import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import User from "@/lib/models/User";
import PatientProfile from "@/lib/models/PatientProfile";
import AppShell from "@/components/app/AppShell";
import { LayoutDashboard, CalendarDays, HeartPulse, Stethoscope, Brain } from "lucide-react";

const navItems = [
  { href: "/patient/dashboard",            label: "Dashboard",       icon: <LayoutDashboard className="w-4 h-4" /> },
  { href: "/patient/book-appointment",     label: "Find Doctors",    icon: <Stethoscope className="w-4 h-4" /> },
  { href: "/patient/ai-consultation/new",  label: "AI Doctor",       icon: <Brain className="w-4 h-4" /> },
  { href: "/patient/appointments",         label: "My Appointments", icon: <CalendarDays className="w-4 h-4" /> },
  { href: "/patient/profile",              label: "Health Profile",  icon: <HeartPulse className="w-4 h-4" /> },
];

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const authUser = await getCurrentUser();
  if (!authUser || authUser.role !== "patient") redirect("/login");

  await connectDB();
  const dbUser = await User.findById(authUser.userId).select("name profileCompleted").lean();
  const profile = await PatientProfile.findOne({ userRef: authUser.userId }).select("userId").lean();

  return (
    <AppShell
      navItems={navItems}
      user={{ name: dbUser?.name ?? authUser.name, role: "Patient", userId: (profile as { userId?: string })?.userId }}
      accent="brand"
    >
      {children}
    </AppShell>
  );
}
