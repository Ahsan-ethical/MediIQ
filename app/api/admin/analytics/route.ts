import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Case from "@/lib/models/Case";
import AiConsultation from "@/lib/models/AiConsultation";

type Row = Record<string, unknown>;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const [cases, aiCons] = await Promise.all([
    Case.find({}).select("symptoms diagnosis severity patient.age createdAt").lean(),
    AiConsultation.find({ status: "report_ready" })
      .select("preConsultation report createdAt").lean(),
  ]);

  const cRows   = cases   as unknown as Row[];
  const aiRows  = aiCons  as unknown as Row[];

  // ── Symptom frequency ──────────────────────────────────────────────────────
  const symCount: Record<string, number> = {};
  const addSymptoms = (raw: string | undefined) => {
    if (!raw) return;
    raw.split(/[,;]/).forEach(s => {
      const clean = s.trim().toLowerCase().replace(/[^a-z\s]/g, "").trim();
      if (clean.length > 2) symCount[clean] = (symCount[clean] || 0) + 1;
    });
  };
  cRows.forEach(c  => addSymptoms(c.symptoms as string));
  aiRows.forEach(c => addSymptoms((c.preConsultation as Row)?.symptoms as string));

  const topSymptoms = Object.entries(symCount)
    .sort(([, a], [, b]) => b - a).slice(0, 15)
    .map(([symptom, count]) => ({ symptom, count }));

  // ── Diagnosis frequency ────────────────────────────────────────────────────
  const diagCount: Record<string, number> = {};
  cRows.forEach(c  => { const d = c.diagnosis as string;                            if (d) diagCount[d] = (diagCount[d] || 0) + 1; });
  aiRows.forEach(c => { const d = (c.report as Row)?.diagnosis as string;           if (d) diagCount[d] = (diagCount[d] || 0) + 1; });

  const topDiagnoses = Object.entries(diagCount)
    .sort(([, a], [, b]) => b - a).slice(0, 10)
    .map(([diagnosis, count]) => ({ diagnosis, count }));

  // ── Severity breakdown ─────────────────────────────────────────────────────
  const severity = { mild: 0, moderate: 0, severe: 0 };
  const addSeverity = (s: string | undefined) => {
    if (!s) return;
    const lower = s.toLowerCase();
    if      (lower === "mild")     severity.mild++;
    else if (lower === "moderate") severity.moderate++;
    else if (lower === "severe")   severity.severe++;
  };
  cRows.forEach(c  => addSeverity(c.severity as string));
  aiRows.forEach(c => addSeverity((c.preConsultation as Row)?.severity as string));

  // ── Age groups (from Cases) ────────────────────────────────────────────────
  const ageGroups = { "0-18": 0, "19-35": 0, "36-50": 0, "51+": 0 };
  cRows.forEach(c => {
    const age = (c.patient as Row)?.age as number;
    if (!age) return;
    if      (age <= 18) ageGroups["0-18"]++;
    else if (age <= 35) ageGroups["19-35"]++;
    else if (age <= 50) ageGroups["36-50"]++;
    else                ageGroups["51+"]++;
  });

  // ── 12-week trend ──────────────────────────────────────────────────────────
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const now  = Date.now();
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = new Date(now - (11 - i) * WEEK);
    const end   = new Date(now - (10 - i) * WEEK);
    return { label: start.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), start, end, cases: 0, ai: 0 };
  });

  cRows.forEach(c  => { const t = new Date(c.createdAt  as Date).getTime(); const b = weeks.find(w => t >= w.start.getTime() && t < w.end.getTime()); if (b) b.cases++; });
  aiRows.forEach(c => { const t = new Date(c.createdAt  as Date).getTime(); const b = weeks.find(w => t >= w.start.getTime() && t < w.end.getTime()); if (b) b.ai++;    });

  return NextResponse.json({
    totalCases:     cases.length,
    totalAiCons:    aiCons.length,
    total:          cases.length + aiCons.length,
    uniqueSymptoms: Object.keys(symCount).length,
    topSymptoms,
    topDiagnoses,
    severity,
    ageGroups,
    weeklyTrend: weeks.map(({ label, cases, ai }) => ({ label, cases, ai })),
  });
}
