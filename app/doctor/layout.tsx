import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import User from "@/lib/models/User";
import DoctorProfile from "@/lib/models/DoctorProfile";
import AppShell from "@/components/app/AppShell";
import { LayoutDashboard, UserCircle, CalendarDays } from "lucide-react";

const navItems = [
  { href: "/doctor/dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
  { href: "/doctor/profile", label: "My Profile", icon: <UserCircle className="w-4 h-4" /> },
  { href: "/doctor/appointments", label: "Schedule", icon: <CalendarDays className="w-4 h-4" /> },
];

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const authUser = await getCurrentUser();
  if (!authUser || authUser.role !== "doctor") redirect("/login");

  await connectDB();
  const dbUser = await User.findById(authUser.userId).select("name").lean() as { name: string } | null;
  const profile = await DoctorProfile.findOne({ userRef: authUser.userId })
    .select("userId signature")
    .lean() as { userId?: string; signature?: string } | null;

  const hasSignature = !!profile?.signature;

  const banner = !hasSignature ? (
    <div className="flex items-center gap-3 border-b border-warning/25 bg-warning/10 px-6 py-2.5 text-sm text-[color-mix(in_srgb,var(--warning)_75%,black)] dark:text-warning">
      <span>⚠</span>
      <span>
        <strong>Signature required</strong> — Add your digital signature in{" "}
        <a href="/doctor/profile" className="font-semibold underline hover:opacity-80">My Profile</a>{" "}
        before you can issue prescriptions.
      </span>
    </div>
  ) : null;

  return (
    <AppShell
      navItems={navItems}
      user={{ name: dbUser?.name ?? authUser.name, role: "Doctor", userId: profile?.userId }}
      accent="accent"
      banner={banner}
    >
      {children}
    </AppShell>
  );
}
