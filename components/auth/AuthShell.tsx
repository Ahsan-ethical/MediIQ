"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, ShieldCheck, Brain, HeartPulse } from "lucide-react";
import { GradientMesh } from "@/components/motion";
import { EASE_REVEAL } from "@/lib/motion";
import ThemeToggle from "@/components/ui/ThemeToggle";

const highlights = [
  { icon: Brain, text: "9-agent AI pipeline drafts safety-checked prescriptions" },
  { icon: HeartPulse, text: "Camera-based vitals — no wearable required" },
  { icon: ShieldCheck, text: "Medical-grade privacy and provenance on every answer" },
];

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Form column */}
      <div className="relative flex flex-col bg-bg">
        <div className="flex items-center justify-between px-6 py-5 sm:px-10">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-[var(--shadow-brand)]">
              <Activity className="h-5 w-5 text-white" />
            </span>
            <span className="text-lg font-bold tracking-tight text-text">MediIQ</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-12 sm:px-10">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_REVEAL }}
            className="w-full max-w-sm"
          >
            <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">{title}</h1>
            <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </motion.div>
        </div>
      </div>

      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-[#0a0c11] text-white lg:block">
        <GradientMesh />
        <div className="grain absolute inset-0" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div />
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7, ease: EASE_REVEAL }}
              className="text-balance text-4xl font-bold leading-[1.1] tracking-tight"
            >
              Healthcare that{" "}
              <span className="font-display italic font-normal text-gradient">reasons</span> with you.
            </motion.h2>
            <div className="mt-8 space-y-4">
              {highlights.map((h, i) => (
                <motion.div
                  key={h.text}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.1, duration: 0.6, ease: EASE_REVEAL }}
                  className="flex items-center gap-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-accent-400">
                    <h.icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="text-sm text-white/70">{h.text}</span>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="flex -space-x-2">
              {["A", "P", "L"].map((c) => (
                <span key={c} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0a0c11] bg-brand-gradient text-xs font-bold">
                  {c}
                </span>
              ))}
            </div>
            <p className="text-sm text-white/60">
              Every prescription passes <span className="font-semibold text-white">drug-interaction & allergy</span> safety gates
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
