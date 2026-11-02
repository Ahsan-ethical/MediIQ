import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import AiConsultation from "@/lib/models/AiConsultation";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Brain, ChevronRight, FileText } from "lucide-react";
import { PageBody } from "@/components/ui/PageHeader";
import StatusPill from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/PageHeader";

function fmt(d: Date | string | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    " " + date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default async function AdminAiConsultationsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");

  await connectDB();
  const raw = await AiConsultation.find({}).sort({ createdAt: -1 }).lean();
  const consultations = raw as unknown as Array<{
    _id: string; patientName: string; status: string; createdAt: Date;
    consultationStartedAt?: Date; reportGeneratedAt?: Date;
    preConsultation?: { symptoms: string; severity: string }; report?: { diagnosis: string };
  }>;

  return (
    <PageBody>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600 dark:text-violet-300"><Brain className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">AI Doctor consultations</h1>
          <p className="text-sm text-muted">{consultations.length} total consultations</p>
        </div>
      </div>

      {consultations.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-surface-2/50"><EmptyState icon={<Brain className="h-6 w-6" />} title="No AI consultations yet" /></div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-1">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2">
                <tr>
                  {["Patient", "Symptoms", "Diagnosis", "Status", "Date", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-subtle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {consultations.map((c) => (
                  <tr key={String(c._id)} className="transition-colors hover:bg-surface-2">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/12 text-xs font-bold text-violet-700 dark:text-violet-300">{c.patientName.charAt(0)}</span>
                        <span className="font-medium text-text">{c.patientName}</span>
                      </div>
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3.5 text-muted">{c.preConsultation?.symptoms ?? "—"}</td>
                    <td className="max-w-[200px] truncate px-4 py-3.5 text-muted">{c.report?.diagnosis ?? "—"}</td>
                    <td className="px-4 py-3.5"><StatusPill status={c.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-subtle">{fmt(c.createdAt)}</td>
                    <td className="px-4 py-3.5">
                      <Link href={`/admin/ai-consultations/${c._id}`} className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-300">
                        <FileText className="h-3.5 w-3.5" /> View <ChevronRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageBody>
  );
}
