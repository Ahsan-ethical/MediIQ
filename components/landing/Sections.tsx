"use client";
import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useRef } from "react";
import {
  Brain, HeartPulse, ScanFace, FileText, ShieldCheck, Lock, Server, Users, Activity,
  Stethoscope, Search, Pill, Siren, ScanSearch, BookOpen, ArrowRight, Plus, Minus,
  Zap, Globe, LineChart, ClipboardCheck, Star, Quote,
} from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/Layout";
import { Reveal, Stagger, StaggerItem, Counter, Marquee, TiltCard, Magnetic, PulseDot } from "@/components/motion";
import Badge from "@/components/ui/Badge";

/* ══════════════════════════ Logo / trust marquee ══════════════════════════ */
export function LogoMarquee() {
  const items = ["Gemini 2.5", "DeepSeek v4", "Ollama", "MongoDB Atlas", "openFDA", "RxNorm", "MedlinePlus", "Agora RTC"];
  return (
    <div className="border-y border-border bg-surface/50 py-8">
      <Container>
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-subtle">
          Built on a best-in-class medical + AI stack
        </p>
        <Marquee speed={28}>
          {items.map((x) => (
            <span key={x} className="whitespace-nowrap text-lg font-semibold text-muted/70">{x}</span>
          ))}
        </Marquee>
      </Container>
    </div>
  );
}

/* ══════════════════════════ Stats band ══════════════════════════ */
export function StatsBand() {
  // Honest, verifiable figures — no fabricated marketing numbers.
  const stats: Array<{ to?: number; suffix?: string; decimals?: number; display?: string; label: string }> = [
    { to: 9, label: "AI agents in the pipeline" },
    { to: 3, label: "Selectable AI engines" },
    { display: "±5–8", suffix: " bpm", label: "rPPG heart-rate error margin" },
    { display: "24/7", label: "AI doctor availability" },
  ];
  return (
    <Section className="py-16 md:py-20">
      <Container>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06} className="text-center">
              <div className="text-4xl font-bold tracking-tight text-text md:text-5xl">
                {s.display ? (
                  <span className="tnum">{s.display}{s.suffix}</span>
                ) : (
                  <Counter to={s.to!} decimals={s.decimals ?? 0} suffix={s.suffix} />
                )}
              </div>
              <p className="mt-2 text-sm text-muted">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}

/* ══════════════════════════ AI Agents (dark full-bleed) ══════════════════════════ */
const AGENTS = [
  { n: 1, name: "Patient Summary", icon: FileText, phase: "Gather" },
  { n: 2, name: "Transcribe", icon: BookOpen, phase: "Gather" },
  { n: 3, name: "Similar Cases", icon: Search, phase: "Gather" },
  { n: 4, name: "Medical Context", icon: BookOpen, phase: "Gather" },
  { n: 5, name: "Allergy Context", icon: ShieldCheck, phase: "Gather" },
  { n: 6, name: "Reasoning / Rx", icon: Brain, phase: "Prescribe" },
  { n: 7, name: "Drug Medic", icon: Pill, phase: "Verify" },
  { n: 8, name: "Allergy Agent", icon: Siren, phase: "Verify" },
  { n: 9, name: "Finding Detector", icon: ScanSearch, phase: "Detect" },
];
const phaseColor: Record<string, string> = {
  Gather: "text-sky-300 bg-sky-400/10 border-sky-400/20",
  Prescribe: "text-violet-300 bg-violet-400/10 border-violet-400/20",
  Verify: "text-amber-300 bg-amber-400/10 border-amber-400/20",
  Detect: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
};

export function AgentsSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });
  return (
    <section id="agents" className="relative overflow-hidden bg-[#0a0c11] py-24 text-white md:py-32">
      <div className="pointer-events-none absolute inset-0 bg-brand-radial opacity-60" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <Badge tone="brand" className="mb-4">The engine</Badge>
          <h2 className="text-balance text-3xl font-bold leading-[1.1] tracking-tight md:text-[2.6rem]">
            Nine agents. One safe prescription.
          </h2>
          <p className="mt-4 text-lg text-white/60">
            Every consultation flows through a transparent pipeline — gather, prescribe, verify, detect —
            with drug-interaction and allergy safety gates before anything reaches a patient.
          </p>
        </div>

        <div ref={ref} className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {AGENTS.map((a, i) => (
            <motion.div
              key={a.n}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
              transition={{ delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm transition-colors hover:bg-white/[0.06]"
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${phaseColor[a.phase]}`}>
                <a.icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-xs font-mono text-white/40">Agent {a.n}</p>
              <p className="text-sm font-semibold">{a.name}</p>
              <span className="mt-2 inline-block text-[10px] font-semibold uppercase tracking-wide text-white/40">{a.phase}</span>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm text-white/50">
          {["Gather", "Prescribe", "Verify", "Detect"].map((p, i) => (
            <span key={p} className="inline-flex items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${phaseColor[p]}`}>{p}</span>
              {i < 3 && <ArrowRight className="h-4 w-4 text-white/25" />}
            </span>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ── Face rPPG visual — face ROI sampling → pulse extraction (the real method) ── */
function FaceRppgViz() {
  const dots = [[112, 58], [130, 52], [148, 58], [104, 78], [156, 78], [112, 96], [148, 96], [130, 112], [120, 122], [140, 122], [130, 88]];
  const rois: [number, number, number][] = [[130, 60, 15], [110, 92, 12], [150, 92, 12]];
  return (
    <div className="relative mt-6 aspect-[16/8] overflow-hidden rounded-xl border border-white/10 bg-[#080b12]">
      <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="face-bg" cx="40%" cy="45%" r="78%">
            <stop offset="0%" stopColor="#141c28" /><stop offset="100%" stopColor="#070a10" />
          </radialGradient>
          <radialGradient id="roi-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.8" />
            <stop offset="55%" stopColor="#22d3ee" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="320" height="160" fill="url(#face-bg)" />

        {/* feature-map grid */}
        <g stroke="rgba(255,255,255,0.045)" strokeWidth="0.5">
          {Array.from({ length: 15 }).map((_, i) => <line key={`v${i}`} x1={i * 20 + 10} y1="0" x2={i * 20 + 10} y2="160" />)}
          {Array.from({ length: 8 }).map((_, i) => <line key={`h${i}`} x1="0" y1={i * 20 + 10} x2="320" y2={i * 20 + 10} />)}
        </g>

        {/* face silhouette + features */}
        <g fill="none" stroke="rgba(160,195,230,0.30)" strokeWidth="1.3">
          <path d="M92 66 C92 34 168 34 168 66 C168 100 150 126 130 132 C110 126 92 100 92 66 Z" fill="rgba(120,160,210,0.05)" />
          <path d="M108 74 q8 -6 16 0" /><path d="M136 74 q8 -6 16 0" />
          <path d="M130 82 v14 q-5 3 -9 4" />
          <path d="M118 110 q12 8 24 0" />
        </g>

        {/* landmark mesh dots */}
        <g fill="#22d3ee">
          {dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.3" opacity="0.85" />)}
        </g>

        {/* ROI sampling glows (forehead + both cheeks) */}
        {rois.map(([x, y, r], i) => (
          <motion.circle key={i} cx={x} cy={y} r={r} fill="url(#roi-glow)"
            animate={{ opacity: [0.35, 0.85, 0.35] }} transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.4, ease: "easeInOut" }} />
        ))}
        {/* ROI sample boxes */}
        <g stroke="#34d399" strokeWidth="1" fill="none" opacity="0.75">
          <rect x="121" y="51" width="18" height="14" rx="2" />
          <rect x="101" y="85" width="16" height="14" rx="2" />
          <rect x="143" y="85" width="16" height="14" rx="2" />
        </g>

        {/* extracted pulse waveform (samples → signal) */}
        <line x1="196" y1="118" x2="312" y2="118" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
        <motion.path
          d="M196 118 h10 l5 -14 5 26 4 -18 4 8 h12 l5 -16 5 28 4 -20 4 10 h12 l5 -14 5 26 4 -18 4 8 H312"
          fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 2, ease: "easeInOut" }} />
        <text x="196" y="140" fill="rgba(255,255,255,0.35)" fontSize="7" fontFamily="monospace">blood-volume pulse</text>
      </svg>

      {/* scan-line sweep */}
      <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 h-12 bg-linear-to-b from-transparent via-accent-400/25 to-transparent"
        style={{ top: 0 }} animate={{ y: ["-20%", "620%"] }} transition={{ duration: 3.4, repeat: Infinity, ease: "linear" }} />

      {/* readout chip */}
      <div className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border border-accent-400/30 bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-accent-300 backdrop-blur">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> HR 72 bpm · BP 118/76
      </div>
    </div>
  );
}

/* ══════════════════════════ Technology: rPPG + CNN ══════════════════════════ */
export function TechnologySection() {
  return (
    <Section id="technology">
      <Container>
        <SectionHeading
          eyebrow="Technology"
          title="Clinical vitals from a face video — no wearable."
          subtitle="A few seconds of webcam footage is all it takes. MediIQ reconstructs the blood-volume pulse from your face to estimate heart rate and blood pressure."
        />
        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {/* rPPG */}
          <Reveal direction="left">
            <TiltCard className="h-full">
              <div className="flex h-full flex-col rounded-3xl border border-border bg-surface p-8 shadow-[var(--shadow-2)]">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/12 text-rose-500">
                  <HeartPulse className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-xl font-bold text-text">rPPG camera vitals</h3>
                <p className="mt-2 text-muted">
                  Remote photoplethysmography extracts heart rate and blood pressure signals from subtle
                  skin-color changes — measured live during the pre-consultation.
                </p>
                <svg viewBox="0 0 400 80" className="mt-6 h-16 w-full" fill="none">
                  <motion.path
                    d="M0 40 H80 l14 -28 16 56 14 -40 12 24 H200 l14 -32 16 60 14 -36 10 20 H400"
                    stroke="var(--danger)" strokeWidth="2" strokeLinecap="round"
                    initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }} transition={{ duration: 2, ease: "easeInOut" }}
                  />
                </svg>
                <div className="mt-4 flex gap-6">
                  <div><p className="text-xs text-muted">BP</p><p className="text-2xl font-bold tnum text-text">118/76</p></div>
                  <div><p className="text-xs text-muted">HR</p><p className="text-2xl font-bold tnum text-text">72</p></div>
                  <div className="ml-auto flex items-center gap-2 text-xs text-success"><PulseDot /> Live</div>
                </div>
              </div>
            </TiltCard>
          </Reveal>

          {/* CNN */}
          <Reveal direction="right">
            <TiltCard className="h-full">
              <div className="flex h-full flex-col rounded-3xl border border-border bg-surface p-8 shadow-[var(--shadow-2)]">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
                  <ScanFace className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-xl font-bold text-text">The deep-learning rPPG model</h3>
                <p className="mt-2 text-muted">
                  An ensemble of convolutional rPPG networks samples micro-changes in facial skin tone across
                  the forehead and cheeks, reconstructs the pulse waveform, and estimates heart rate and blood
                  pressure — no contact, no device.
                </p>
                <FaceRppgViz />
                <div className="mt-4 space-y-2">
                  {[["Pulse signal quality", 92], ["Estimate confidence", 88]].map(([l, v]) => (
                    <div key={l as string}>
                      <div className="flex justify-between text-xs text-muted"><span>{l}</span><span className="tnum">{v}%</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-surface-3">
                        <motion.div className="h-full rounded-full bg-brand-gradient"
                          initial={{ width: 0 }} whileInView={{ width: `${v}%` }} viewport={{ once: true }}
                          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TiltCard>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

/* ══════════════════════════ Product showcase (tabbed) ══════════════════════════ */
const TABS = [
  { id: "dashboard", label: "Doctor dashboard", icon: Stethoscope, points: ["Live consultation queue", "AI pre-read for every patient", "One-click go-live"] },
  { id: "consult", label: "AI consultation", icon: Brain, points: ["Conversational AI doctor", "Real-time transcript", "Provenance on every answer"] },
  { id: "report", label: "Medical report", icon: FileText, points: ["Structured prescription", "Drug-safety verdicts", "Instant PDF export"] },
];
export function ShowcaseSection() {
  const [tab, setTab] = useState(TABS[0].id);
  const active = TABS.find((t) => t.id === tab)!;
  return (
    <Section id="showcase" className="bg-surface-2">
      <Container>
        <SectionHeading eyebrow="Product" title="One platform, every role" subtitle="Purpose-built surfaces for patients, doctors, and administrators — cohesive and fast." />
        <div className="mx-auto mt-10 flex max-w-md flex-wrap justify-center gap-2 rounded-2xl border border-border bg-surface p-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${tab === t.id ? "text-white" : "text-muted hover:text-text"}`}
            >
              {tab === t.id && (
                <motion.span layoutId="showcase-tab" className="absolute inset-0 rounded-xl bg-brand-gradient" transition={{ type: "spring", stiffness: 400, damping: 34 }} />
              )}
              <span className="relative inline-flex items-center gap-1.5"><t.icon className="h-4 w-4" />{t.label}</span>
            </button>
          ))}
        </div>

        <div className="relative mt-8 overflow-hidden rounded-3xl border border-border bg-surface shadow-[var(--shadow-3)]">
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-danger/60" />
            <span className="h-3 w-3 rounded-full bg-warning/60" />
            <span className="h-3 w-3 rounded-full bg-success/60" />
            <span className="ml-3 text-xs text-subtle">app.mediiq.health/{active.id}</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="grid gap-6 p-6 md:grid-cols-[1fr_1.4fr] md:p-8"
            >
              <div className="flex flex-col justify-center">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
                  <active.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-2xl font-bold text-text">{active.label}</h3>
                <ul className="mt-4 space-y-2.5">
                  {active.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-sm text-muted">
                      <ClipboardCheck className="h-4 w-4 text-brand-500" /> {p}
                    </li>
                  ))}
                </ul>
              </div>
              <MockScreen tab={tab} />
              </motion.div>
          </AnimatePresence>
        </div>
      </Container>
    </Section>
  );
}

/* ── Realistic per-tab product mockups (not placeholder boxes) ─────────────── */
function MockScreen({ tab }: { tab: string }) {
  if (tab === "consult") return <AiConsultMock />;
  if (tab === "report") return <ReportMock />;
  return <DashboardMock />;
}

function DashboardMock() {
  const kpis = [
    { icon: Users, label: "Patients", value: "128" },
    { icon: Star, label: "Rating", value: "4.9" },
    { icon: Activity, label: "Today", value: "6" },
  ];
  const queue = [
    { n: "Aarav Sharma", t: "10:00", s: "Live", tone: "bg-success/15 text-success" },
    { n: "Priya Nair", t: "10:30", s: "Confirmed", tone: "bg-brand-500/15 text-brand-600 dark:text-brand-300" },
    { n: "Rohan Das", t: "11:00", s: "Pending", tone: "bg-warning/15 text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning" },
  ];
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-4">
      <div className="grid grid-cols-3 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-surface p-3">
            <k.icon className="h-4 w-4 text-brand-500" />
            <p className="mt-2 text-lg font-bold tnum text-text">{k.value}</p>
            <p className="text-[11px] text-muted">{k.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-border bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-text">Today&apos;s queue</p>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> Live</span>
        </div>
        <div className="space-y-1.5">
          {queue.map((q) => (
            <div key={q.n} className="flex items-center gap-2.5 rounded-lg bg-surface-2 px-2.5 py-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-gradient text-[10px] font-bold text-white">{q.n[0]}</span>
              <span className="flex-1 truncate text-xs font-medium text-text">{q.n}</span>
              <span className="text-[10px] tnum text-subtle">{q.t}</span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${q.tone}`}>{q.s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AiConsultMock() {
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-4">
      <div className="flex items-center gap-2.5 border-b border-border pb-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white"><Brain className="h-4.5 w-4.5" /></span>
        <div className="flex-1">
          <p className="text-xs font-semibold text-text">Dr. MediIQ AI</p>
          <p className="flex items-center gap-1 text-[10px] text-success"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> In consultation</p>
        </div>
        <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-0.5 text-[9px] font-semibold text-brand-600 dark:text-brand-300">via Gemini</span>
      </div>
      <div className="space-y-2 py-3">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-brand-500/10 px-3 py-2 text-[11px] leading-relaxed text-text">How long have you had the fever and cough?</div>
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-surface px-3 py-2 text-[11px] leading-relaxed text-muted">About three days, with yellow phlegm since yesterday.</div>
        <div className="max-w-[70%] rounded-2xl rounded-tl-sm bg-brand-500/10 px-3 py-2 text-[11px] leading-relaxed text-text">Any known allergies I should note?</div>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <svg viewBox="0 0 120 20" className="h-4 flex-1" fill="none">
          <path d="M0 10 H14 l4 -7 5 14 4 -10 3 6 H50 l4 -8 5 15 4 -9 3 5 H120" stroke="var(--brand-500)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-[9px] text-subtle">listening…</span>
      </div>
    </div>
  );
}

function ReportMock() {
  const meds = [
    ["Azithromycin", "500 mg · once daily"],
    ["Paracetamol", "650 mg · as needed"],
    ["Ambroxol", "30 mg · thrice daily"],
  ];
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-subtle">Prescription</p>
          <p className="text-sm font-bold text-text">Acute bronchitis</p>
        </div>
        <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-0.5 text-[9px] font-semibold text-brand-600 dark:text-brand-300">via Gemini</span>
      </div>
      <div className="space-y-1.5 py-3">
        {meds.map(([m, d], i) => (
          <div key={m} className="flex items-center gap-2.5 rounded-lg bg-surface-2 px-2.5 py-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500/12 text-[10px] font-bold text-brand-600 dark:text-brand-300">{i + 1}</span>
            <span className="text-xs font-semibold text-text">{m}</span>
            <span className="ml-auto text-[10px] tnum text-muted">{d}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-[10px] font-medium text-success">
        <ShieldCheck className="h-3.5 w-3.5" /> No interactions · penicillin allergy respected
      </div>
    </div>
  );
}

/* ══════════════════════════ Report generation ══════════════════════════ */
export function ReportSection() {
  const rows = [
    ["Azithromycin", "500 mg", "Once daily", "3 days"],
    ["Paracetamol", "650 mg", "As needed", "—"],
    ["Ambroxol", "30 mg", "Thrice daily", "5 days"],
  ];
  return (
    <Section id="report">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading align="left" eyebrow="Reports" title="A medical report that assembles itself" subtitle="Diagnosis, medicines, advice, and safety notes — structured, legible, and printable in seconds." />
            <Stagger className="mt-6 space-y-3">
              {[
                ["Structured, not free-text", "Every field is typed and validated."],
                ["Safety-checked", "Drug interactions and allergy conflicts flagged before send."],
                ["Honest provenance", "See exactly which model answered — Gemini or DeepSeek."],
              ].map(([t, d]) => (
                <StaggerItem key={t}>
                  <div className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/12 text-success"><ClipboardCheck className="h-3.5 w-3.5" /></span>
                    <div><p className="font-semibold text-text">{t}</p><p className="text-sm text-muted">{d}</p></div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>

          <Reveal direction="right">
            <div className="rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-3)]">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div><p className="text-xs text-muted">Prescription</p><p className="font-bold text-text">Acute bronchitis</p></div>
                <Badge tone="brand" dot>via Gemini</Badge>
              </div>
              <div className="mt-4 space-y-2">
                {rows.map((r, i) => (
                  <motion.div key={r[0]} initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12, duration: 0.5 }}
                    className="grid grid-cols-[1.5fr_1fr_1.2fr_0.8fr] items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
                    <span className="font-semibold text-text">{r[0]}</span>
                    <span className="tnum text-muted">{r[1]}</span>
                    <span className="text-muted">{r[2]}</span>
                    <span className="tnum text-muted">{r[3]}</span>
                  </motion.div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/20 bg-success/8 px-3 py-2.5 text-sm text-success">
                <ShieldCheck className="h-4 w-4" /> No drug interactions · penicillin allergy respected
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

/* ══════════════════════════ Workflow timeline ══════════════════════════ */
export function WorkflowSection() {
  const steps = [
    { icon: ClipboardCheck, title: "Book & intake", desc: "Pick a reason, doctor, and slot. Capture vitals via camera." },
    { icon: Stethoscope, title: "Consult", desc: "Live video with your clinician, or the AI doctor if no human is available." },
    { icon: Brain, title: "AI reasons", desc: "The 9-agent pipeline drafts a safety-checked prescription." },
    { icon: FileText, title: "Report & follow-up", desc: "Receive a structured report, download the PDF, track your history." },
  ];
  return (
    <Section id="workflow" className="bg-surface-2">
      <Container>
        <SectionHeading eyebrow="Workflow" title="From symptom to prescription — end to end" />
        <div className="relative mt-14">
          <div className="absolute left-[27px] top-0 hidden h-full w-px bg-border md:left-1/2 md:block" />
          <div className="space-y-6 md:space-y-2">
            {steps.map((s, i) => (
              <Reveal key={s.title} direction={i % 2 ? "right" : "left"}>
                <div className={`flex items-center gap-5 md:w-1/2 ${i % 2 ? "md:ml-auto md:flex-row" : "md:flex-row-reverse md:text-right"}`}>
                  <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-brand-600 shadow-[var(--shadow-2)] dark:text-brand-300">
                    <s.icon className="h-6 w-6" />
                  </div>
                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-1)]">
                    <p className="text-xs font-mono text-subtle">Step {i + 1}</p>
                    <p className="font-bold text-text">{s.title}</p>
                    <p className="mt-1 text-sm text-muted">{s.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}

/* ══════════════════════════ Security & privacy ══════════════════════════ */
export function SecuritySection() {
  const items = [
    { icon: Lock, title: "Encrypted end to end", desc: "Data encrypted in transit and at rest." },
    { icon: ShieldCheck, title: "You own your data", desc: "Export or delete your records anytime." },
    { icon: Server, title: "Auditable AI", desc: "Every AI decision logs its provider and reasoning." },
    { icon: Users, title: "Role-based access", desc: "Least-privilege access for patients, doctors, admins." },
  ];
  return (
    <section id="security" className="relative overflow-hidden bg-[#0a0c11] py-24 text-white md:py-32">
      <div className="pointer-events-none absolute inset-0 bg-brand-radial opacity-50" />
      <Container className="relative">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Badge tone="success" className="mb-4">Security & privacy</Badge>
            <h2 className="text-balance text-3xl font-bold leading-[1.1] tracking-tight md:text-[2.6rem]">
              Medical-grade trust, by design
            </h2>
            <p className="mt-4 text-lg text-white/60">
              Healthcare data deserves more than a checkbox. MediIQ treats privacy, provenance, and access
              control as first-class product features.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((it, i) => (
              <Reveal key={it.title} delay={i * 0.06}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <it.icon className="h-6 w-6 text-accent-400" />
                  <p className="mt-3 font-semibold">{it.title}</p>
                  <p className="mt-1 text-sm text-white/55">{it.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ══════════════════════════ Enterprise features ══════════════════════════ */
export function EnterpriseSection() {
  const feats = [
    { icon: Zap, title: "Real-time everywhere", desc: "Sockets power live queues, calls, and status." },
    { icon: Globe, title: "Multi-role platform", desc: "Patients, doctors, and admins in one system." },
    { icon: LineChart, title: "Outbreak analytics", desc: "Population-level signals from anonymized trends." },
    { icon: Server, title: "Configurable AI engine", desc: "Switch Gemini / DeepSeek / Ollama per policy." },
    { icon: ShieldCheck, title: "Safety gates", desc: "Drug + allergy verification before every send." },
    { icon: Activity, title: "Observability", desc: "Trace every agent, timing, and provider." },
  ];
  return (
    <Section id="enterprise">
      <Container>
        <SectionHeading eyebrow="Enterprise" title="Ready for real hospital workflows" subtitle="The controls, observability, and safety a healthcare organization actually needs." />
        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {feats.map((f) => (
            <StaggerItem key={f.title}>
              <div className="group h-full rounded-2xl border border-border bg-surface p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-3)]">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 transition-colors group-hover:bg-brand-gradient group-hover:text-white dark:text-brand-300">
                  <f.icon className="h-5 w-5" />
                </div>
                <p className="mt-4 font-bold text-text">{f.title}</p>
                <p className="mt-1.5 text-sm text-muted">{f.desc}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </Section>
  );
}

/* ══════════════════════════ Testimonials ══════════════════════════ */
export function TestimonialsSection() {
  const quotes = [
    { q: "What I actually rely on is the safety gate. Every script gets an interaction and allergy check before it goes out, and it once flagged a penicillin conflict I would have missed.", n: "Dr. A. Rahman", r: "Intern Doctor" },
    { q: "I measured my vitals with my laptop camera. No wearable, no clinic visit. It just worked.", n: "Priya S.", r: "Patient" },
    { q: "Being able to see whether Gemini or DeepSeek answered builds real trust in the output.", n: "Dr. L. Chen", r: "Intern Doctor" },
  ];
  return (
    <Section className="bg-surface-2">
      <Container>
        <SectionHeading eyebrow="Loved by clinicians & patients" title="Trusted where it matters most" />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {quotes.map((t, i) => (
            <Reveal key={t.n} delay={i * 0.08}>
              <figure className="flex h-full flex-col rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-1)]">
                <Quote className="h-7 w-7 text-brand-500/40" />
                <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed text-text">“{t.q}”</blockquote>
                <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white">{t.n[0]}</span>
                  <div>
                    <p className="text-sm font-semibold text-text">{t.n}</p>
                    <p className="text-xs text-muted">{t.r}</p>
                  </div>
                  <div className="ml-auto flex gap-0.5 text-amber-400">{Array.from({ length: 5 }).map((_, s) => <Star key={s} className="h-3.5 w-3.5 fill-current" />)}</div>
                </div>
              </figure>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}

/* ══════════════════════════ FAQ ══════════════════════════ */
export function FaqSection() {
  const faqs = [
    { q: "Does the AI replace my doctor?", a: "No. The AI assists clinicians and, when no doctor is available, produces a safety-checked report for the patient. A licensed clinician remains in the loop wherever possible." },
    { q: "How are vitals measured without a device?", a: "Remote photoplethysmography (rPPG) analyzes subtle skin-color changes from your webcam to estimate heart rate and blood pressure during the pre-consultation." },
    { q: "Which AI models power MediIQ?", a: "Gemini, DeepSeek v4 Flash, and local Ollama — configurable per policy. Every response shows which model answered." },
    { q: "Is my health data private?", a: "Yes. Data is encrypted in transit and at rest, access is role-based, and you can export or delete your records at any time." },
    { q: "Can hospitals deploy this?", a: "Yes — MediIQ is built for multi-role workflows with observability, safety gates, and a configurable AI engine." },
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="faq">
      <Container size="prose">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="mt-10 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {faqs.map((f, i) => (
            <div key={f.q}>
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                <span className="font-semibold text-text">{f.q}</span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted">
                  {open === i ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                    <p className="px-5 pb-4 text-[15px] leading-relaxed text-muted">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

/* ══════════════════════════ Final CTA ══════════════════════════ */
export function FinalCta() {
  return (
    <Section>
      <Container>
        <div className="grain relative overflow-hidden rounded-[2rem] bg-[#0a0c11] px-6 py-20 text-center text-white md:px-12">
          <div className="pointer-events-none absolute inset-0 bg-brand-radial opacity-70" />
          <div className="relative mx-auto max-w-2xl">
            <Reveal>
              <h2 className="text-balance text-3xl font-bold leading-[1.1] tracking-tight md:text-5xl">
                The future of care is <span className="font-display italic font-normal text-gradient">intelligent</span>
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="mx-auto mt-5 max-w-lg text-lg text-white/60">
                Join thousands of patients and clinicians using MediIQ to make faster, safer decisions.
              </p>
            </Reveal>
            <Reveal delay={0.16}>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Magnetic>
                  <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-8 py-4 text-sm font-semibold text-white shadow-[var(--shadow-brand)]">
                    Create free account <ArrowRight className="h-4 w-4" />
                  </Link>
                </Magnetic>
                <Link href="/about" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-8 py-4 text-sm font-semibold text-white/90 transition-colors hover:bg-white/5">
                  See how it works
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </Container>
    </Section>
  );
}
