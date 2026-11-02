"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Mail, Lock, ArrowRight } from "lucide-react";
import Button from "@/components/ui/Button";
import AuthShell from "@/components/auth/AuthShell";
import AuthField from "@/components/auth/AuthField";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }

      toast.success(`Welcome back, ${data.name}!`);
      if (!data.profileCompleted) {
        router.push(`/${data.role}/profile`);
      } else {
        router.push(`/${data.role}/dashboard`);
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue to your MediIQ workspace.">
      <form onSubmit={handleSubmit} className="space-y-5">
        <AuthField
          label="Email address"
          icon={<Mail className="h-4 w-4" />}
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={form.email}
          onChange={(v) => setForm((p) => ({ ...p, email: v }))}
        />
        <div>
          <AuthField
            label="Password"
            icon={<Lock className="h-4 w-4" />}
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={form.password}
            onChange={(v) => setForm((p) => ({ ...p, password: v }))}
          />
          <div className="mt-2 text-right">
            <span className="cursor-default text-xs font-medium text-muted transition-colors hover:text-text">Forgot password?</span>
          </div>
        </div>

        <Button type="submit" loading={loading} size="lg" className="w-full">
          Sign in <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-brand-600 transition-colors hover:text-brand-500 dark:text-brand-300">
          Create one
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-subtle">Admin access is provisioned internally.</p>
    </AuthShell>
  );
}
