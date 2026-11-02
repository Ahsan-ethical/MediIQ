"use client";

import Link from "next/link";
import { Activity, ArrowLeft, Brain, FileText, Search, Shield, Pill, Siren, ScanSearch, BookOpen, Database, Zap, ArrowRight, Lock, Phone, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const AGENTS = [
  { id: 1, name: "Patient Summary", icon: <FileText className="w-5 h-5" />, color: "from-slate-500 to-slate-600", trigger: "Profile save", desc: "Reads the patient's profile data — age, conditions, allergies, medications — and generates a clinical summary using Gemini. Also builds a running summary from all past consultations, giving the doctor instant context before each visit.", data: ["Patient Profile (MongoDB)", "Past Appointments", "Past AI Consultations"], output: "Profile Summary + Running Clinical Summary" },
  { id: 2, name: "Transcribe", icon: <BookOpen className="w-5 h-5" />, color: "from-blue-500 to-blue-600", trigger: "Call ends", desc: "Takes the raw Agora call transcript and structures it: extracts who said what, identifies symptoms, duration, severity, and every medication mentioned. Each drug name is normalized through RxNorm — so 'Paracetamol' becomes 'acetaminophen' (the universal medical name), and misspellings like 'amoxacillin' get corrected to 'amoxicillin'.", data: ["Agora Call Transcript", "RxNorm API (NIH)"], output: "Structured transcript + RxNorm-normalized drugs" },
  { id: 3, name: "Similar Cases", icon: <Search className="w-5 h-5" />, color: "from-violet-500 to-violet-600", trigger: "Lock button", desc: "Searches through 100+ past patient cases using hybrid search: semantic vector search (finds cases with similar meaning) combined with keyword matching (exact symptom terms). Boosts cases from patients with matching conditions (e.g., diabetic patients rank higher for a diabetic patient). Then Gemini reranks the top 20 down to the 10 most relevant.", data: ["Cases Collection (MongoDB Atlas Vector Search)", "Gemini embedding-001 (3072-dim)", "Gemini 2.5 Flash (reranking)"], output: "Top 10 similar cases + pattern summary" },
  { id: 4, name: "Medical Context", icon: <Brain className="w-5 h-5" />, color: "from-cyan-500 to-cyan-600", trigger: "Lock button", desc: "Resolves each of the patient's known conditions to an ICD-10 code (first checking a local lookup table of 2,132 conditions, then falling back to the NIH Clinical Tables API). Uses each code to fetch the official MedlinePlus page, then condenses it with Gemini. Also builds 5 targeted search queries and runs them against a knowledge library of 3,347 embedded medical chunks (MedlinePlus conditions + openFDA drug data) to produce an evidence summary.", data: ["ConditionLookUp (2,132 ICD-10 codes)", "NIH Clinical Tables API", "MedlinePlus Connect API", "medicalcontexts (3,347 embedded chunks)", "Gemini 2.5 Flash"], output: "Condition summaries + Evidence summary (findings, diagnoses, red flags)" },
  { id: 5, name: "Allergy Context", icon: <Shield className="w-5 h-5" />, color: "from-red-500 to-red-600", trigger: "Lock button", desc: "Expands each of the patient's allergies into a full drug-class avoid list. 'Penicillin allergy' expands to the entire penicillin family — Amoxicillin, Ampicillin, Piperacillin — plus cross-reactivity warnings (1st-gen cephalosporins). Uses a severity/status system: confirmed+severe = absolute block, suspected+mild = monitor. Also queries the knowledge library for safe alternatives.", data: ["RxClass API (NIH — drug class expansion)", "RxNorm API (drug normalization)", "openFDA contraindications (embedded)", "Patient Allergy List"], output: "Expanded allergy blocks + cross-reactivity flags + safe alternatives" },
  { id: 6, name: "Reasoning Agent", icon: <Pill className="w-5 h-5" />, color: "from-emerald-500 to-emerald-600", trigger: "After Agent 2", desc: "The prescriber. Takes ALL gathered data — patient summary, transcript, similar cases, medical evidence, allergy context — and generates a complete prescription: diagnosis, medicines (with dosage, timing, frequency, duration, SOS conditions, purpose), 5 advice points, a drug safety note explaining why specific drugs were chosen or avoided, and a history insight.", data: ["All outputs from Agents 1-5", "Gemini 2.5 Flash / Ollama qwen3:8b (parallel race)"], output: "Complete prescription draft" },
  { id: 7, name: "Drug Medic", icon: <Siren className="w-5 h-5" />, color: "from-amber-500 to-amber-600", trigger: "After Agent 6", desc: "First safety gate. Checks every prescribed drug: (1) Is the drug indicated for the diagnosis? — verified against openFDA labels. (2) Is the dosage within approved range? — verified against openFDA dosing data. (3) Drug interactions — every pair of {prescribed drugs + existing medications} is checked against 175,000+ interaction pairs in the DDInter database. Flagged drugs get red-marked; the LLM suggests replacements in one batch call.", data: ["DDInter Database (175,201 interaction pairs)", "openFDA Drug Label API (live)", "Gemini 2.5 Flash (batch verification)"], output: "Per-drug verdicts + interaction flags + replacement suggestions" },
  { id: 8, name: "Allergy Agent", icon: <AlertTriangle className="w-5 h-5" />, color: "from-pink-500 to-pink-600", trigger: "After Agent 7", desc: "Final safety gate — the most life-critical check. Deterministic, not LLM — pure set-membership lookup. Takes each prescribed drug, resolves its RxCUI via RxNorm, then checks if that RxCUI exists in any of the patient's expanded allergy class sets (from Agent 5). The LLM never decides allergy safety — it only writes the replacement prescription if a violation is found.", data: ["RxNorm API (RxCUI resolution)", "RxClass API (class membership)", "Agent 5's expanded allergy blocks"], output: "Allergy verdicts (PASS / HARD_BLOCK / STRONG_CAUTION) + revised prescription" },
  { id: 9, name: "Finding Detector", icon: <ScanSearch className="w-5 h-5" />, color: "from-indigo-500 to-indigo-600", trigger: "After prescription sent", desc: "The loop closer. Scans the completed consultation for two things: (1) New lifelong medications — drugs prescribed as 'ongoing' or 'daily' that aren't in the patient's record yet. (2) New allergies — drug reactions mentioned in the transcript or drug safety note. Findings are posted to a 'System Detected' box on the patient's profile page. The patient accepts or rejects; on accept, the field updates and Agent 1 refreshes the summary.", data: ["Final Prescription", "Call Transcript", "Patient Profile"], output: "Pending findings → patient confirmation → profile update" },
];

const DATASETS = [
  { name: "RxNorm", source: "NIH (National Library of Medicine)", desc: "Drug name normalization — maps brand names, misspellings, and regional names to canonical identifiers. Free API, no key needed.", usage: "Agent 2 (drug name correction), Agent 5 & 8 (RxCUI lookup)", count: "900,000+ drug concepts" },
  { name: "RxClass", source: "NIH (National Library of Medicine)", desc: "Drug class hierarchy — given a drug, returns its therapeutic class and all sibling drugs. 'Amoxicillin' → 'Penicillins' → [Ampicillin, Piperacillin, ...]", usage: "Agent 5 (allergy expansion), Agent 8 (class-membership check)", count: "ATC classification system" },
  { name: "openFDA", source: "U.S. Food and Drug Administration", desc: "Drug labels — indications, dosage, contraindications, warnings, interactions. 194 common drugs embedded with 3072-dim vectors for semantic search.", usage: "Agent 4 (knowledge library), Agent 7 (indication/dose verification)", count: "194 common drugs → 923 chunks" },
  { name: "MedlinePlus", source: "NIH (National Library of Medicine)", desc: "Health condition encyclopedia — 1,016 conditions with symptoms, causes, treatments. Embedded with 3072-dim vectors. Long entries split at question headers.", usage: "Agent 4 (knowledge library), Agent 4 (MedlinePlus Connect for ICD-10 → page)", count: "1,016 topics → 2,426 chunks" },
  { name: "DDInter 2.0", source: "Drug-Drug Interaction Database", desc: "175,201 known drug-drug interaction pairs with severity levels (Major, Moderate, Minor). Loaded into MongoDB with compound indexes for sub-millisecond pair lookups.", usage: "Agent 7 (Phase 1 — instant interaction check)", count: "175,201 interaction pairs" },
  { name: "ICD-10 Lookup", source: "NIH Clinical Tables + Custom Seed", desc: "2,132 condition-to-ICD-10-code mappings. Normalized for exact-match lookup with word-sorted keys. NIH API fallback for misses with safety gate.", usage: "Agent 4 (condition code resolution → MedlinePlus Connect)", count: "2,132 conditions" },
  { name: "Cases (RAG)", source: "Seeded + Real Consultations", desc: "100 seeded realistic patient cases + every real consultation creates a new case. Each embedded with 3072-dim symptom-only vectors for unbiased retrieval.", usage: "Agent 3 (hybrid vector + keyword search)", count: "100+ cases with embeddings" },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/40">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">MediIQ</span>
        </Link>
        <Link href="/" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-8 pt-12 pb-16 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-linear-to-r from-white to-blue-200 bg-clip-text text-transparent">
          How MediIQ Works
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          A 9-agent clinical decision-support pipeline that gathers evidence, prescribes intelligently, and catches safety issues before any medicine reaches a patient.
        </p>
      </section>

      {/* Pipeline Flow Overview */}
      <section className="max-w-6xl mx-auto px-8 pb-16">
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-sm">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" /> Pipeline Flow
          </h2>

          {/* Phase labels */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[
              { phase: "GATHER", agents: "1, 2, 3, 4, 5", color: "border-blue-500/30 bg-blue-500/5", text: "text-blue-400", desc: "Collect patient data, transcript, similar cases, medical evidence, allergy context" },
              { phase: "PRESCRIBE", agents: "6", color: "border-emerald-500/30 bg-emerald-500/5", text: "text-emerald-400", desc: "Generate a complete prescription from all gathered data" },
              { phase: "VERIFY", agents: "7, 8", color: "border-amber-500/30 bg-amber-500/5", text: "text-amber-400", desc: "Check drug interactions + allergy safety. Loop back if issues found" },
              { phase: "DETECT", agents: "9", color: "border-indigo-500/30 bg-indigo-500/5", text: "text-indigo-400", desc: "Find new lifelong meds + allergies, propose to patient" },
            ].map((p) => (
              <div key={p.phase} className={`rounded-2xl border p-4 ${p.color}`}>
                <p className={`text-xs font-bold uppercase tracking-wider ${p.text}`}>{p.phase}</p>
                <p className="text-sm text-slate-300 mt-1">Agents {p.agents}</p>
                <p className="text-xs text-slate-500 mt-2">{p.desc}</p>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div className="space-y-2">
            {[
              { label: "Patient saves profile", action: "Agent 1 generates profile summary", icon: <FileText className="w-3.5 h-3.5" /> },
              { label: "Patient clicks Lock", action: "Agents 3, 4, 5 fire in parallel", icon: <Lock className="w-3.5 h-3.5" /> },
              { label: "Video call ends", action: "Agent 2 structures transcript", icon: <Phone className="w-3.5 h-3.5" /> },
              { label: "Agent 2 completes", action: "Agent 6 prescribes (using 1+2+3+4+5)", icon: <Pill className="w-3.5 h-3.5" /> },
              { label: "Agent 6 completes", action: "Agent 7 checks drugs → Agent 8 checks allergies", icon: <Siren className="w-3.5 h-3.5" /> },
              { label: "Issues found?", action: "Loop back to Agent 6 → 7 → 8 (max 2 loops)", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
              { label: "Doctor sends prescription", action: "Agent 9 detects new findings", icon: <ScanSearch className="w-3.5 h-3.5" /> },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 text-blue-400">{step.icon}</div>
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-300 w-48 shrink-0">{step.label}</span>
                  <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
                  <span className="text-sm text-slate-400">{step.action}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Example Walkthrough */}
      <section className="max-w-6xl mx-auto px-8 pb-16">
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-sm">
          <h2 className="text-xl font-bold mb-6">Example: Diabetic Patient with Fever</h2>
          <div className="space-y-4 text-sm">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
              <p className="font-bold text-blue-400 mb-1">Patient Profile</p>
              <p className="text-slate-300">54yo Male, Type 2 Diabetes, Hypertension. Allergy: Penicillin (confirmed severe). Current meds: Metformin 500mg, Amlodipine 5mg.</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <p className="font-bold text-emerald-400 mb-1">Booking Symptoms</p>
              <p className="text-slate-300">&quot;Fever, body ache, sore throat&quot; — Duration: 3 days — Severity: Moderate</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                <p className="font-bold text-violet-400 text-xs mb-2">Agent 3 finds</p>
                <p className="text-xs text-slate-400">5 similar URTI cases — dominant treatment: Azithromycin + Paracetamol. NSAIDs consistently avoided in diabetic patients.</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                <p className="font-bold text-cyan-400 text-xs mb-2">Agent 4 retrieves</p>
                <p className="text-xs text-slate-400">MedlinePlus: &quot;During infection, diabetic patients may have elevated blood sugar.&quot; Red flag: Avoid NSAIDs, avoid penicillin class.</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                <p className="font-bold text-red-400 text-xs mb-2">Agent 5 expands</p>
                <p className="text-xs text-slate-400">Penicillin → HARD BLOCK: Amoxicillin, Ampicillin, Piperacillin... Cross-reactivity: 1st-gen Cephalosporins.</p>
              </div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <p className="font-bold text-emerald-400 mb-2">Agent 6 prescribes</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {["Azithromycin 500mg", "Paracetamol 650mg", "Cetirizine 10mg"].map((d) => (
                  <span key={d} className="bg-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300">{d}</span>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">Azithromycin chosen over Amoxicillin (penicillin allergy). Paracetamol chosen over Ibuprofen (diabetes + hypertension).</p>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                <p className="font-bold text-amber-400 text-xs mb-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Agent 7 — PASS</p>
                <p className="text-xs text-slate-400">0 interactions found. All dosages within approved range.</p>
              </div>
              <div className="flex-1 bg-pink-500/10 border border-pink-500/20 rounded-xl p-4">
                <p className="font-bold text-pink-400 text-xs mb-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Agent 8 — PASS</p>
                <p className="text-xs text-slate-400">No allergy violations. Azithromycin is NOT in the penicillin class.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What happens when drugs get flagged */}
      <section className="max-w-6xl mx-auto px-8 pb-16">
        <div className="bg-white/5 border border-red-500/20 rounded-3xl p-8 backdrop-blur-sm">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-400" /> What Happens When a Drug is Flagged
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <p className="text-slate-300">Agent 6 prescribes <span className="text-red-400 font-semibold line-through">Amoxicillin</span> (a penicillin) for a patient with penicillin allergy.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <p className="text-slate-300">Agent 7 catches it: <span className="text-amber-400 font-semibold">&quot;Amoxicillin is a Penicillin-class drug. HARD BLOCK.&quot;</span></p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <p className="text-slate-300">Pipeline loops back to Agent 6: &quot;Replace Amoxicillin with a non-penicillin alternative.&quot;</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
              <p className="text-slate-300">Agent 6 revises: <span className="text-emerald-400 font-semibold">Azithromycin 500mg</span> (macrolide, safe for penicillin allergy).</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">5</span>
              <p className="text-slate-300">Doctor sees: Amoxicillin <span className="text-red-400">red-marked</span> with the reason, Azithromycin in the clean prescription. Only clean drugs reach the patient.</p>
            </div>
          </div>
        </div>
      </section>

      {/* All 9 Agents */}
      <section className="max-w-6xl mx-auto px-8 pb-16">
        <h2 className="text-2xl font-bold mb-8 text-center">The 9 Agents</h2>
        <div className="space-y-4">
          {AGENTS.map((agent) => (
            <div key={agent.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-linear-to-br ${agent.color} flex items-center justify-center text-white shadow-lg`}>
                    {agent.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Agent {agent.id} — {agent.name}</h3>
                    <p className="text-xs text-slate-400">Triggered: {agent.trigger}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed mb-4">{agent.desc}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Database className="w-3 h-3" /> Data Sources</p>
                    <ul className="space-y-0.5">{agent.data.map((d, i) => <li key={i} className="text-xs text-slate-400">• {d}</li>)}</ul>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><ArrowRight className="w-3 h-3" /> Output</p>
                    <p className="text-xs text-slate-400">{agent.output}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Datasets */}
      <section className="max-w-6xl mx-auto px-8 pb-20">
        <h2 className="text-2xl font-bold mb-8 text-center">Datasets &amp; APIs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DATASETS.map((ds) => (
            <div key={ds.name} className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-white">{ds.name}</h3>
                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-mono">{ds.count}</span>
              </div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">{ds.source}</p>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{ds.desc}</p>
              <p className="text-[10px] text-slate-500"><span className="font-semibold text-slate-400">Used by:</span> {ds.usage}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center">
        <p className="text-sm text-slate-500">MediIQ — AI-Powered Telemedicine Platform</p>
        <p className="text-xs text-slate-600 mt-1">Built with Next.js 16 · MongoDB Atlas · Gemini 2.5 Flash · 9-Agent Pipeline</p>
      </footer>
    </div>
  );
}
