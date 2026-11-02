"use client";
import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";
import { ArrowRight, Activity, HeartPulse, Brain, ShieldCheck, Sparkles } from "lucide-react";
import { GradientMesh, Magnetic, PulseDot } from "@/components/motion";
import { EASE_REVEAL } from "@/lib/motion";

function PulseLine() {
  return (
    <svg viewBox="0 0 600 120" className="h-16 w-full" fill="none" preserveAspectRatio="none">
      <motion.path
        d="M0 60 H120 l18 -40 22 78 20 -60 16 34 H300 l18 -48 22 84 18 -50 14 30 H600"
        stroke="url(#pulse)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 2.4, ease: "easeInOut" }}
      />
      <defs>
        <linearGradient id="pulse" x1="0" y1="0" x2="600" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--brand-500)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--brand-500)" />
          <stop offset="1" stopColor="var(--accent-500)" stopOpacity="0.2" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function FloatCard({
  children,
  className,
  depth,
  mx,
  my,
  delay,
}: {
  children: React.ReactNode;
  className: string;
  depth: number;
  mx: ReturnType<typeof useSpring>;
  my: ReturnType<typeof useSpring>;
  delay: number;
}) {
  const x = useTransform(mx, (v) => v * depth);
  const y = useTransform(my, (v) => v * depth);
  return (
    <motion.div
      style={{ x, y }}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.7, ease: EASE_REVEAL }}
      className={`absolute hidden lg:block ${className}`}
    >
      <div className="animate-floaty rounded-2xl glass p-4 shadow-[var(--shadow-3)]">{children}</div>
    </motion.div>
  );
}

export default function Hero() {
  const reduce = useReducedMotion();
  const mvX = useMotionValue(0);
  const mvY = useMotionValue(0);
  const mx = useSpring(mvX, { stiffness: 120, damping: 20 });
  const my = useSpring(mvY, { stiffness: 120, damping: 20 });

  function onMouse(e: React.MouseEvent) {
    if (reduce) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    mvX.set((e.clientX - (r.left + r.width / 2)) / 28);
    mvY.set((e.clientY - (r.top + r.height / 2)) / 28);
  }

  return (
    <section onMouseMove={onMouse} className="grain relative overflow-hidden pt-36 pb-24 md:pt-44 md:pb-32">
      <GradientMesh />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border-strong to-transparent" />

      {/* Floating cards */}
      <FloatCard className="left-[6%] top-[26%]" depth={1.4} mx={mx} my={my} delay={0.6}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/12 text-rose-500">
            <HeartPulse className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted">Heart rate · rPPG</p>
            <p className="text-lg font-bold tnum text-text">72 <span className="text-xs font-medium text-muted">bpm</span></p>
          </div>
          <PulseDot color="var(--danger)" />
        </div>
      </FloatCard>

      <FloatCard className="right-[7%] top-[22%]" depth={2} mx={mx} my={my} delay={0.75}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
            <Brain className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted">9-agent pipeline</p>
            <p className="text-sm font-semibold text-text">Prescription ready</p>
          </div>
        </div>
      </FloatCard>

      <FloatCard className="right-[12%] bottom-[8%]" depth={2.6} mx={mx} my={my} delay={0.9}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/12 text-success">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted">Allergy & drug check</p>
            <p className="text-sm font-semibold text-text">0 conflicts found</p>
          </div>
        </div>
      </FloatCard>

      <div className="relative mx-auto max-w-3xl px-5 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_REVEAL }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3.5 py-1.5 text-xs font-semibold text-muted backdrop-blur"
        >
          <Sparkles className="h-3.5 w-3.5 text-brand-500" />
          AI-native healthcare · now with DeepSeek + Gemini
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.7, ease: EASE_REVEAL }}
          className="text-balance text-[2.75rem] font-bold leading-[1.12] tracking-tight text-text sm:text-6xl md:text-7xl"
        >
          Healthcare that
          <br />
          <span className="text-gradient font-display italic font-normal inline-block pb-[0.14em] pr-[0.08em] leading-none">reasons</span> with you
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.7, ease: EASE_REVEAL }}
          className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted"
        >
          MediIQ pairs your clinician with a 9-agent AI pipeline, camera-based vitals, and
          instant, safety-checked medical reports — telemedicine, reimagined for the AI era.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.7, ease: EASE_REVEAL }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Magnetic>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-7 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-2)] transition-shadow hover:shadow-[var(--shadow-brand)]"
            >
              Book a consultation <ArrowRight className="h-4 w-4" />
            </Link>
          </Magnetic>
          <Link
            href="/register?role=doctor"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-7 py-3.5 text-sm font-semibold text-text transition-colors hover:bg-surface-2"
          >
            Join as a doctor
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-subtle"
        >
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-success" /> HIPAA-grade privacy</span>
          <span className="inline-flex items-center gap-1.5"><Brain className="h-4 w-4 text-brand-500" /> 9-agent safety pipeline</span>
          <span className="inline-flex items-center gap-1.5"><HeartPulse className="h-4 w-4 text-rose-500" /> Vitals ±5&ndash;8 bpm (rPPG)</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 1 }}
          className="mx-auto mt-14 max-w-lg"
        >
          <PulseLine />
        </motion.div>
      </div>
    </section>
  );
}
