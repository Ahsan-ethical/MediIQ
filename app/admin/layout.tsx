import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { LayoutDashboard, UserCheck, Brain, TrendingUp, FlaskConical, Workflow, Activity, Cpu } from "lucide-react";

const navItems = [
  { href: "/admin/dashboard",                label: "Overview",            icon: <LayoutDashboard className="w-4 h-4" /> },
  { href: "/admin/doctors",                  label: "Doctor Approvals",    icon: <UserCheck className="w-4 h-4" /> },
  { href: "/admin/ai-mode",                  label: "AI Engine",           icon: <Cpu className="w-4 h-4" /> },
  { href: "/admin/ai-consultations",         label: "AI Doctor",           icon: <Brain className="w-4 h-4" /> },
  { href: "/admin/analytics",                label: "Outbreak Monitor",    icon: <TrendingUp className="w-4 h-4" /> },
  { href: "/admin/development",              label: "Agent Dev",           icon: <FlaskConical className="w-4 h-4" /> },
  { href: "/admin/development/pipeline",     label: "Full Pipeline Flow",  icon: <Workflow className="w-4 h-4" /> },
  { href: "/admin/development/vitals-lab",   label: "Vital Signs",         icon: <Activity className="w-4 h-4" /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const authUser = await getCurrentUser();
  if (!authUser || authUser.role !== "admin") redirect("/login");

  return (
    <AppShell navItems={navItems} user={{ name: authUser.name, role: "Administrator" }} accent="violet">
      {children}
    </AppShell>
  );
}
