"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { Mail, Lock, User, ArrowRight, HeartPulse, Stethoscope } from "lucide-react";
import Button from "@/components/ui/Button";
import AuthShell from "@/components/auth/AuthShell";
import AuthField, { PasswordStrength } from "@/components/auth/AuthField";
import { spring } from "@/lib/motion";

const roles = [
  { id: "patient", label: "I'm a Patient", icon: HeartPulse },
  { id: "doctor", label: "I'm a Doctor", icon: Stethoscope },
];

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "patient" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const role = searchParams.get("role");
    if (role === "doctor") setForm((p) => ({ ...p, role: "doctor" }));
  }, [searchParams]);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (form.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }

      toast.success("Account created! Let's complete your profile.");
      router.push(`/${form.role}/profile`);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Join MediIQ in under a minute.">
      {/* Role segmented control */}
      <div className="mb-6 grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-surface-2 p-1.5">
        {roles.map((r) => {
          const active = form.role === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setForm((p) => ({ ...p, role: r.id }))}
              className={`relative flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors ${active ? "text-white" : "text-muted hover:text-text"}`}
            >
              {active && (
                <motion.span layoutId="role-pill" className="absolute inset-0 rounded-lg bg-brand-gradient shadow-[var(--shadow-2)]" transition={spring} />
              )}
              <span className="relative z-10 flex items-center gap-2"><r.icon className="h-4 w-4" />{r.label}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField label="Full name" icon={<User className="h-4 w-4" />} required autoComplete="name" placeholder="John Smith" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} />
        <AuthField label="Email address" icon={<Mail className="h-4 w-4" />} type="email" required autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(v) => setForm((p) => ({ ...p, email: v }))} />
        <div>
          <AuthField label="Password" icon={<Lock className="h-4 w-4" />} type="password" required autoComplete="new-password" placeholder="Min. 8 characters" value={form.password} onChange={(v) => setForm((p) => ({ ...p, password: v }))} />
          <PasswordStrength value={form.password} />
        </div>

        <Button type="submit" loading={loading} size="lg" className="mt-1 w-full">
          Create account <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-600 transition-colors hover:text-brand-500 dark:text-brand-300">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
