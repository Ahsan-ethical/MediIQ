"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Save, User, Bell, CheckCircle2, XCircle, Pill, Shield } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const selectCls =
  "rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12";

export default function PatientProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [form, setForm] = useState({
    age: "", gender: "Male", weight: "", height: "", bloodGroup: "O+",
    city: "", state: "", country: "India",
    knownConditions: [] as string[],
    allergies: [] as string[],
    currentMedications: [] as string[],
    emergencyContact: { name: "", relation: "", phone: "" },
  });
  const [newItems, setNewItems] = useState({ condition: "", allergy: "", medication: "" });

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/patient/profile");
    const data = await res.json();
    if (data.profile) {
      setForm({
        age: String(data.profile.age),
        gender: data.profile.gender,
        weight: String(data.profile.weight),
        height: String(data.profile.height),
        bloodGroup: data.profile.bloodGroup,
        city: data.profile.city,
        state: data.profile.state,
        country: data.profile.country,
        knownConditions: data.profile.knownConditions ?? [],
        allergies: data.profile.allergies ?? [],
        currentMedications: data.profile.currentMedications ?? [],
        emergencyContact: data.profile.emergencyContact ?? { name: "", relation: "", phone: "" },
      });
    }
    setFetching(false);
  }, []);

  interface Finding {
    _id: string; type: "lifelong_med" | "allergy"; value: string;
    severity?: string; allergyStatus?: string; reason: string; source: string;
  }
  const [findings, setFindings] = useState<Finding[]>([]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const fetchFindings = useCallback(async () => {
    try {
      const res = await fetch("/api/patient/system-detected");
      const data = await res.json();
      if (data.findings) setFindings(data.findings);
    } catch { /* ignore */ }
  }, []);

  const respondToFinding = async (findingId: string, action: "accept" | "reject") => {
    setRespondingTo(findingId);
    try {
      const res = await fetch("/api/patient/system-detected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId, action }),
      });
      const data = await res.json();
      if (data.ok) {
        if (action === "accept") {
          toast.success(`${data.value} added to your ${data.field === "allergy" ? "allergies" : "medications"}`);
          fetchProfile();
        } else {
          toast.success("Finding dismissed");
        }
        setFindings((prev) => prev.filter((f) => f._id !== findingId));
      }
    } catch { toast.error("Failed to respond"); }
    finally { setRespondingTo(null); }
  };

  useEffect(() => { fetchProfile(); fetchFindings(); }, [fetchProfile, fetchFindings]);

  const addItem = (field: "knownConditions" | "allergies" | "currentMedications", key: keyof typeof newItems) => {
    const val = newItems[key].trim();
    if (!val) return;
    setForm((p) => ({ ...p, [field]: [...p[field], val] }));
    setNewItems((p) => ({ ...p, [key]: "" }));
  };
  const removeItem = (field: "knownConditions" | "allergies" | "currentMedications", idx: number) => {
    setForm((p) => ({ ...p, [field]: p[field].filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/patient/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, age: Number(form.age), weight: Number(form.weight), height: Number(form.height) }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("Health profile saved!");
      router.push("/patient/dashboard");
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl p-5 sm:p-8">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
          <User className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Health profile</h1>
          <p className="text-sm text-muted">Complete your profile to unlock consultations.</p>
        </div>
      </div>

      {/* System-detected findings */}
      <AnimatePresence>
        {findings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
            className="mb-6 space-y-3 rounded-2xl border border-warning/25 bg-warning/10 p-5"
          >
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-warning" />
              <h2 className="font-bold text-text">System detected</h2>
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning">
                {findings.length} new finding{findings.length > 1 ? "s" : ""}
              </span>
            </div>
            <p className="text-xs text-muted">Our AI agents detected new information during your recent consultation. Review and accept to update your profile.</p>
            {findings.map((f) => (
              <div key={f._id} className="space-y-2 rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {f.type === "allergy" ? <Shield className="h-4 w-4 text-danger" /> : <Pill className="h-4 w-4 text-brand-500" />}
                  <span className="text-sm font-bold text-text">{f.value}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${f.type === "allergy" ? "bg-danger/12 text-danger" : "bg-brand-500/12 text-brand-700 dark:text-brand-300"}`}>
                    {f.type === "allergy" ? "New allergy" : "Lifelong medication"}
                  </span>
                  {f.severity && <span className="text-[10px] text-subtle">{f.severity} · {f.allergyStatus}</span>}
                </div>
                <p className="text-xs text-muted"><span className="font-semibold text-text">Why:</span> {f.reason}</p>
                <p className="text-[10px] text-subtle">Source: {f.source}</p>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => respondToFinding(f._id, "accept")} disabled={respondingTo === f._id} className="inline-flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-xs font-semibold text-white transition-colors hover:brightness-105 disabled:opacity-50">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Accept
                  </button>
                  <button onClick={() => respondToFinding(f._id, "reject")} disabled={respondingTo === f._id} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-surface-3 disabled:opacity-50">
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section title="Basic information" step="01">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Input label="Age" type="number" min={1} max={120} required value={form.age} onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))} placeholder="28" />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-text">Gender</label>
              <select value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))} className={selectCls}>
                {["Male", "Female", "Other"].map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-text">Blood group</label>
              <select value={form.bloodGroup} onChange={(e) => setForm((p) => ({ ...p, bloodGroup: e.target.value }))} className={selectCls}>
                {BLOOD_GROUPS.map((bg) => <option key={bg}>{bg}</option>)}
              </select>
            </div>
            <Input label="Weight (kg)" type="number" min={1} required value={form.weight} onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))} placeholder="70" />
            <Input label="Height (cm)" type="number" min={1} required value={form.height} onChange={(e) => setForm((p) => ({ ...p, height: e.target.value }))} placeholder="175" />
          </div>
        </Section>

        <Section title="Location" step="02">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="City" required value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} placeholder="Patna" />
            <Input label="State" required value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} placeholder="Bihar" />
            <Input label="Country" required value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} placeholder="India" />
          </div>
        </Section>

        <Section title="Medical history" step="03">
          <TagField label="Known conditions" items={form.knownConditions} inputVal={newItems.condition} onChange={(v) => setNewItems((p) => ({ ...p, condition: v }))} onAdd={() => addItem("knownConditions", "condition")} onRemove={(i) => removeItem("knownConditions", i)} placeholder="e.g. Diabetes" />
          <TagField label="Allergies" items={form.allergies} inputVal={newItems.allergy} onChange={(v) => setNewItems((p) => ({ ...p, allergy: v }))} onAdd={() => addItem("allergies", "allergy")} onRemove={(i) => removeItem("allergies", i)} placeholder="e.g. Penicillin" />
          <TagField label="Current medications" items={form.currentMedications} inputVal={newItems.medication} onChange={(v) => setNewItems((p) => ({ ...p, medication: v }))} onAdd={() => addItem("currentMedications", "medication")} onRemove={(i) => removeItem("currentMedications", i)} placeholder="e.g. Metformin 500mg" />
        </Section>

        <Section title="Emergency contact" step="04">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="Contact name" required value={form.emergencyContact.name} onChange={(e) => setForm((p) => ({ ...p, emergencyContact: { ...p.emergencyContact, name: e.target.value } }))} placeholder="John Doe" />
            <Input label="Relation" required value={form.emergencyContact.relation} onChange={(e) => setForm((p) => ({ ...p, emergencyContact: { ...p.emergencyContact, relation: e.target.value } }))} placeholder="Parent" />
            <Input label="Phone" required value={form.emergencyContact.phone} onChange={(e) => setForm((p) => ({ ...p, emergencyContact: { ...p.emergencyContact, phone: e.target.value } }))} placeholder="+91 9876543210" />
          </div>
        </Section>

        <div className="flex justify-end pt-2">
          <Button type="submit" loading={loading} size="lg">
            <Save className="h-4 w-4" /> Save health profile
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, step, children }: { title: string; step: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-1">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gradient text-xs font-bold text-white">{step}</span>
        <h2 className="font-semibold text-text">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function TagField({ label, items, inputVal, onChange, onAdd, onRemove, placeholder }: {
  label: string; items: string[]; inputVal: string;
  onChange: (v: string) => void; onAdd: () => void; onRemove: (i: number) => void; placeholder: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-text">{label}</label>
      <div className="mb-2 flex gap-2">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAdd())}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-subtle transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
        />
        <button type="button" onClick={onAdd} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white transition-shadow hover:shadow-brand">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {items.map((item, i) => (
              <motion.span
                key={item + i}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/12 px-3 py-1 text-xs font-medium text-brand-700 dark:text-brand-300"
              >
                {item}
                <button type="button" onClick={() => onRemove(i)} className="transition-colors hover:text-danger">
                  <X className="h-3 w-3" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
