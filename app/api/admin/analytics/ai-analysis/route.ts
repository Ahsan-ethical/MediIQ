import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateText } from "@/lib/agents/llm";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const { total, totalCases, totalAiCons, topSymptoms, topDiagnoses, severity, ageGroups, weeklyTrend } = data;

  const sevTotal = severity.mild + severity.moderate + severity.severe || 1;
  const ageTotal = Object.values(ageGroups as Record<string, number>).reduce((a, b) => a + b, 0) || 1;

  const recentWeeks = (weeklyTrend as Array<{ label: string; cases: number; ai: number }>).slice(-4);
  const recentTotal = recentWeeks.reduce((s: number, w) => s + w.cases + w.ai, 0);
  const prevWeeks   = (weeklyTrend as Array<{ label: string; cases: number; ai: number }>).slice(-8, -4);
  const prevTotal   = prevWeeks.reduce((s: number, w) => s + w.cases + w.ai, 0);
  const trend       = prevTotal > 0 ? ((recentTotal - prevTotal) / prevTotal * 100).toFixed(1) : "N/A";

  const prompt = `You are a public health analyst reviewing anonymized clinic consultation data. Provide a structured medical intelligence report.

CLINIC DATA (anonymized, all time):
- Total consultations: ${total} (${totalCases} with real doctor, ${totalAiCons} AI-assisted)
- Recent 4-week trend vs previous 4 weeks: ${trend}% change (${recentTotal} vs ${prevTotal} consultations)

TOP SYMPTOMS (by frequency):
${(topSymptoms as Array<{ symptom: string; count: number }>).slice(0, 10).map((s, i) => `  ${i + 1}. ${s.symptom} — ${s.count} cases`).join("\n")}

TOP DIAGNOSES:
${(topDiagnoses as Array<{ diagnosis: string; count: number }>).slice(0, 8).map((d, i) => `  ${i + 1}. ${d.diagnosis} — ${d.count} cases`).join("\n")}

SEVERITY DISTRIBUTION:
  Mild: ${Math.round(severity.mild / sevTotal * 100)}% | Moderate: ${Math.round(severity.moderate / sevTotal * 100)}% | Severe: ${Math.round(severity.severe / sevTotal * 100)}%

AGE BREAKDOWN (from doctor consultations):
${Object.entries(ageGroups as Record<string, number>).map(([g, n]) => `  ${g}: ${Math.round(n / ageTotal * 100)}% (${n})`).join(" | ")}

Respond ONLY with valid JSON (no markdown):
{
  "overview": "2-3 sentence summary of the clinic's overall health picture",
  "dominantConditions": "What the top conditions suggest about the patient population and season",
  "outbreakRisk": "Any concerning patterns, unusual spikes, or potential outbreak signals. Be specific about which symptoms/diagnoses show unusual frequency.",
  "demographicInsights": "Age and severity pattern observations",
  "recommendations": ["Specific action 1", "Specific action 2", "Specific action 3"],
  "riskLevel": "low | moderate | high"
}`;

  try {
    const r      = await generateText(prompt);
    const text   = r.text.trim();
    const match  = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);
    return NextResponse.json({ analysis: parsed });
  } catch (e) {
    console.error("[Analytics AI] Failed:", e);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
