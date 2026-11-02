"use client";

import { useEffect, useState } from "react";
import { Brain, TrendingUp, Activity, Users, Stethoscope, Loader2, AlertTriangle, ShieldCheck, AlertCircle } from "lucide-react";

interface AnalyticsData {
  total: number;
  totalCases: number;
  totalAiCons: number;
  uniqueSymptoms: number;
  topSymptoms:  Array<{ symptom: string;   count: number }>;
  topDiagnoses: Array<{ diagnosis: string; count: number }>;
  severity:     { mild: number; moderate: number; severe: number };
  ageGroups:    Record<string, number>;
  weeklyTrend:  Array<{ label: string; cases: number; ai: number }>;
}

interface AiAnalysis {
  overview: string;
  dominantConditions: string;
  outbreakRisk: string;
  demographicInsights: string;
  recommendations: string[];
  riskLevel: "low" | "moderate" | "high";
}

// ── Pure-SVG area/line chart ────────────────────────────────────────────────
function TrendChart({ data }: { data: AnalyticsData["weeklyTrend"] }) {
  const W = 600; const H = 110; const PAD = 20;
  const vals = data.map(d => d.cases + d.ai);
  const max  = Math.max(...vals, 1);
  const pts  = vals.map((v, i) => ({
    x: PAD + (i / (vals.length - 1)) * (W - PAD * 2),
    y: H - PAD - (v / max) * (H - PAD * 2),
  }));
  const linePath  = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath  = `${linePath} L ${pts[pts.length-1].x} ${H - PAD} L ${pts[0].x} ${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#areaGrad)" />
      <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#6366f1" />
      ))}
    </svg>
  );
}

// ── SVG donut chart ─────────────────────────────────────────────────────────
function DonutChart({ mild, moderate, severe }: { mild: number; moderate: number; severe: number }) {
  const total = mild + moderate + severe || 1;
  const R = 36; const C = 2 * Math.PI * R; // circumference
  const mildArc = (mild / total) * C;
  const modArc  = (moderate / total) * C;
  const sevArc  = (severe / total) * C;
  // rotation offsets
  const mildRot = -90;
  const modRot  = mildRot + (mild / total) * 360;
  const sevRot  = modRot  + (moderate / total) * 360;

  return (
    <svg viewBox="0 0 100 100" className="w-36 h-36 mx-auto">
      <circle cx="50" cy="50" r={R} fill="none" stroke="#f1f5f9" strokeWidth="14" />
      {mild > 0 && (
        <circle cx="50" cy="50" r={R} fill="none" stroke="#10b981" strokeWidth="14"
          strokeDasharray={`${mildArc} ${C - mildArc}`}
          transform={`rotate(${mildRot} 50 50)`} strokeLinecap="butt" />
      )}
      {moderate > 0 && (
        <circle cx="50" cy="50" r={R} fill="none" stroke="#f59e0b" strokeWidth="14"
          strokeDasharray={`${modArc} ${C - modArc}`}
          transform={`rotate(${modRot} 50 50)`} strokeLinecap="butt" />
      )}
      {severe > 0 && (
        <circle cx="50" cy="50" r={R} fill="none" stroke="#ef4444" strokeWidth="14"
          strokeDasharray={`${sevArc} ${C - sevArc}`}
          transform={`rotate(${sevRot} 50 50)`} strokeLinecap="butt" />
      )}
      <text x="50" y="47" textAnchor="middle" className="text-xs" fontSize="11" fontWeight="700" fill="#1e293b">{total}</text>
      <text x="50" y="58" textAnchor="middle" fontSize="7" fill="#64748b">total</text>
    </svg>
  );
}

// ── Horizontal bar row ───────────────────────────────────────────────────────
function BarRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 group">
      <span className="w-36 text-xs text-muted text-right capitalize truncate shrink-0 group-hover:text-slate-900 transition-colors">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-text w-8 text-right shrink-0">{count}</span>
    </div>
  );
}

const RISK_CONFIG = {
  low:      { cls: "bg-emerald-50 border-emerald-200 text-emerald-800", icon: ShieldCheck,    label: "Low Risk"      },
  moderate: { cls: "bg-amber-50 border-amber-200 text-amber-800",       icon: AlertCircle,   label: "Moderate Risk" },
  high:     { cls: "bg-red-50 border-red-200 text-red-800",             icon: AlertTriangle, label: "High Risk"     },
};

export default function AnalyticsPage() {
  const [data,       setData]       = useState<AnalyticsData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [analysis,   setAnalysis]   = useState<AiAnalysis | null>(null);
  const [analyzing,  setAnalyzing]  = useState(false);
  const [aiError,    setAiError]    = useState("");

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const runAiAnalysis = async () => {
    if (!data) return;
    setAnalyzing(true);
    setAiError("");
    setAnalysis(null);
    try {
      const res  = await fetch("/api/admin/analytics/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) { setAiError(json.error ?? "Analysis failed"); return; }
      setAnalysis(json.analysis);
    } catch {
      setAiError("Network error");
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
      <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
    </div>
  );
  if (!data) return (
    <div className="p-8 text-muted">Failed to load analytics data.</div>
  );

  const sevTotal = data.severity.mild + data.severity.moderate + data.severity.severe || 1;
  const maxSym   = data.topSymptoms[0]?.count  || 1;
  const maxDiag  = data.topDiagnoses[0]?.count || 1;
  const ageTotal = Object.values(data.ageGroups).reduce((a, b) => a + b, 0) || 1;

  const risk = analysis?.riskLevel ?? null;
  const riskCfg = risk ? RISK_CONFIG[risk] : null;
  const RiskIcon = riskCfg?.icon;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-violet-600" />
            </div>
            <h1 className="text-2xl font-bold text-text">Outbreak Monitor</h1>
          </div>
          <p className="text-muted text-sm ml-13">Anonymized disease intelligence across all consultations</p>
        </div>
        <button
          onClick={runAiAnalysis}
          disabled={analyzing}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-lg shadow-violet-200"
        >
          {analyzing
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
            : <><Brain className="w-4 h-4" /> Analyze with AI</>
          }
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Consultations", value: data.total,          icon: Activity,    color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Real Doctor Cases",   value: data.totalCases,     icon: Stethoscope, color: "text-blue-600",   bg: "bg-blue-50"   },
          { label: "AI Consultations",    value: data.totalAiCons,    icon: Brain,       color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "Unique Symptoms",     value: data.uniqueSymptoms, icon: Users,       color: "text-rose-600",   bg: "bg-rose-50"   },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-surface rounded-2xl border border-border shadow-sm p-5">
            <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-text">{value.toLocaleString()}</p>
            <p className="text-xs text-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* 12-week trend */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
        <h2 className="font-semibold text-text mb-1">Consultation Volume — Last 12 Weeks</h2>
        <p className="text-xs text-subtle mb-4">Total across real doctor + AI consultations</p>
        <div className="flex items-end gap-2 mb-1">
          <TrendChart data={data.weeklyTrend} />
        </div>
        <div className="flex justify-between mt-1">
          {data.weeklyTrend.filter((_, i) => i % 3 === 0 || i === data.weeklyTrend.length - 1).map(w => (
            <span key={w.label} className="text-xs text-subtle">{w.label}</span>
          ))}
        </div>
      </div>

      {/* Symptoms + Severity */}
      <div className="grid md:grid-cols-3 gap-6">

        {/* Top Symptoms */}
        <div className="md:col-span-2 bg-surface rounded-2xl border border-border shadow-sm p-6">
          <h2 className="font-semibold text-text mb-1">Top Symptoms</h2>
          <p className="text-xs text-subtle mb-5">Most reported across all consultations</p>
          <div className="space-y-3">
            {data.topSymptoms.map(s => (
              <BarRow key={s.symptom} label={s.symptom} count={s.count} max={maxSym} color="bg-blue-500" />
            ))}
          </div>
        </div>

        {/* Severity donut */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
          <h2 className="font-semibold text-text mb-1">Severity Split</h2>
          <p className="text-xs text-subtle mb-4">Across all cases with severity data</p>
          <DonutChart
            mild={data.severity.mild}
            moderate={data.severity.moderate}
            severe={data.severity.severe}
          />
          <div className="mt-5 space-y-2">
            {[
              { label: "Mild",     value: data.severity.mild,     color: "bg-emerald-500", pct: Math.round(data.severity.mild     / sevTotal * 100) },
              { label: "Moderate", value: data.severity.moderate, color: "bg-amber-500",   pct: Math.round(data.severity.moderate / sevTotal * 100) },
              { label: "Severe",   value: data.severity.severe,   color: "bg-red-500",     pct: Math.round(data.severity.severe   / sevTotal * 100) },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2 text-xs">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.color}`} />
                <span className="text-muted flex-1">{s.label}</span>
                <span className="font-semibold text-text">{s.pct}%</span>
                <span className="text-subtle">({s.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Diagnoses + Age */}
      <div className="grid md:grid-cols-3 gap-6">

        {/* Top Diagnoses */}
        <div className="md:col-span-2 bg-surface rounded-2xl border border-border shadow-sm p-6">
          <h2 className="font-semibold text-text mb-1">Top Diagnoses</h2>
          <p className="text-xs text-subtle mb-5">Most frequent outcomes from all consultations</p>
          <div className="space-y-3">
            {data.topDiagnoses.map(d => (
              <BarRow key={d.diagnosis} label={d.diagnosis} count={d.count} max={maxDiag} color="bg-violet-500" />
            ))}
          </div>
        </div>

        {/* Age groups */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
          <h2 className="font-semibold text-text mb-1">Age Distribution</h2>
          <p className="text-xs text-subtle mb-5">From real doctor consultations</p>
          <div className="space-y-4">
            {Object.entries(data.ageGroups).map(([group, count]) => {
              const pct = Math.round(count / ageTotal * 100);
              return (
                <div key={group}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted font-medium">{group} yrs</span>
                    <span className="text-text font-semibold">{pct}% <span className="text-subtle font-normal">({count})</span></span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3">
                    <div className="h-3 rounded-full bg-indigo-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Analysis result */}
      {aiError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {aiError}
        </div>
      )}

      {analyzing && (
        <div className="bg-surface rounded-2xl border border-violet-100 shadow-sm p-8 flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full bg-violet-600/10 animate-ping" />
            <div className="relative w-full h-full rounded-full bg-violet-100 flex items-center justify-center">
              <Brain className="w-8 h-8 text-violet-600" />
            </div>
          </div>
          <p className="text-sm text-muted">Gemini is analyzing consultation patterns…</p>
        </div>
      )}

      {analysis && (
        <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
          {/* Analysis header */}
          <div className="bg-linear-to-r from-violet-600 to-indigo-600 px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="w-5 h-5 text-white" />
              <h2 className="font-bold text-white">AI Intelligence Report</h2>
            </div>
            {riskCfg && RiskIcon && (
              <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${riskCfg.cls}`}>
                <RiskIcon className="w-3.5 h-3.5" />
                {riskCfg.label}
              </span>
            )}
          </div>

          <div className="p-6 space-y-6">
            {[
              { key: "overview",             title: "Overview",                color: "border-blue-400" },
              { key: "dominantConditions",   title: "Dominant Conditions",     color: "border-violet-400" },
              { key: "outbreakRisk",         title: "Outbreak Risk Assessment", color: risk === "high" ? "border-red-400" : "border-amber-400" },
              { key: "demographicInsights",  title: "Demographic Insights",    color: "border-indigo-400" },
            ].map(({ key, title, color }) => {
              const text = analysis[key as keyof AiAnalysis] as string;
              if (!text) return null;
              return (
                <div key={key} className={`border-l-4 ${color} pl-4`}>
                  <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1.5">{title}</p>
                  <p className="text-sm text-text leading-relaxed">{text}</p>
                </div>
              );
            })}

            {analysis.recommendations && analysis.recommendations.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted uppercase tracking-wide mb-3">Recommendations</p>
                <div className="space-y-2">
                  {analysis.recommendations.map((r, i) => (
                    <div key={i} className="flex gap-3 bg-violet-50 rounded-xl px-4 py-3">
                      <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <p className="text-sm text-text">{r}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
