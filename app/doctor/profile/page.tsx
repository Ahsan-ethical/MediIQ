"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Save, Stethoscope, PenLine } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import SignaturePad from "@/components/SignaturePad";

const SPECIALIZATIONS = [
  "Cardiologist", "Dermatologist", "Neurologist", "Orthopedic", "Pediatrician",
  "Psychiatrist", "General Physician", "ENT Specialist", "Ophthalmologist",
  "Gynecologist", "Urologist", "Gastroenterologist", "Pulmonologist", "Endocrinologist",
];
const QUALIFICATIONS = ["MBBS", "MD", "MS", "DNB", "DM", "MCh", "MBBS + MD", "MBBS + MS"];
const selectCls = "rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12";

export default function DoctorProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [profile, setProfile] = useState<{ verificationStatus?: string } | null>(null);
  const [signature, setSignature] = useState<string>("");
  const [form, setForm] = useState({ specialization: "", qualification: "", experience: "", hospital: "", city: "", registrationNumber: "", consultationFee: "" });

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/doctor/profile");
    const data = await res.json();
    if (data.profile) {
      setProfile(data.profile);
      setSignature(data.profile.signature ?? "");
      setForm({
        specialization: data.profile.specialization ?? "", qualification: data.profile.qualification ?? "",
        experience: String(data.profile.experience ?? ""), hospital: data.profile.hospital ?? "",
        city: data.profile.city ?? "", registrationNumber: data.profile.registrationNumber ?? "",
        consultationFee: String(data.profile.consultationFee ?? ""),
      });
    }
    setFetching(false);
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!signature) { toast.error("Please draw and save your signature before submitting."); setLoading(false); return; }
      const res = await fetch("/api/doctor/profile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, experience: Number(form.experience), consultationFee: Number(form.consultationFee), signature }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(profile ? "Profile updated!" : "Profile submitted for review!");
      router.push("/doctor/dashboard");
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl p-5 sm:p-8">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-500/12 text-accent-600 dark:text-accent-300">
          <Stethoscope className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Professional profile</h1>
          <p className="text-sm text-muted">{profile ? "Update your professional details." : "Complete your profile to start receiving consultations."}</p>
        </div>
      </div>

      {profile?.verificationStatus && <VerificationBanner status={profile.verificationStatus} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section step="01" title="Specialization & qualification">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-text">Specialization</label>
              <select required value={form.specialization} onChange={(e) => setForm((p) => ({ ...p, specialization: e.target.value }))} className={selectCls}>
                <option value="">Select specialization</option>
                {SPECIALIZATIONS.map((s) => <option key={s} value={s.toLowerCase()}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-text">Highest qualification</label>
              <select required value={form.qualification} onChange={(e) => setForm((p) => ({ ...p, qualification: e.target.value }))} className={selectCls}>
                <option value="">Select qualification</option>
                {QUALIFICATIONS.map((q) => <option key={q} value={q.toLowerCase()}>{q}</option>)}
              </select>
            </div>
            <Input label="Years of experience" type="number" min={0} max={60} required value={form.experience} onChange={(e) => setForm((p) => ({ ...p, experience: e.target.value }))} placeholder="5" />
            <Input label="Consultation fee (₹)" type="number" min={0} required value={form.consultationFee} onChange={(e) => setForm((p) => ({ ...p, consultationFee: e.target.value }))} placeholder="500" />
          </div>
        </Section>

        <Section step="02" title="Practice details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Hospital / clinic name" required value={form.hospital} onChange={(e) => setForm((p) => ({ ...p, hospital: e.target.value }))} placeholder="AIIMS Delhi" />
            <Input label="City" required value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} placeholder="New Delhi" />
            <Input label="Medical registration number" required value={form.registrationNumber} onChange={(e) => setForm((p) => ({ ...p, registrationNumber: e.target.value }))} placeholder="MCI-12345" className="md:col-span-2" />
          </div>
        </Section>

        <Section step="03" title={<>Digital signature <span className="text-sm text-danger">*</span></>}>
          <p className="-mt-2 mb-4 text-xs text-muted">Required for all prescriptions. Draw your handwritten signature below.</p>
          <SignaturePad value={signature} onChange={setSignature} />
          {!signature ? (
            <p className="mt-2 flex items-center gap-1 text-xs text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning"><PenLine className="h-3.5 w-3.5" /> Draw and save your signature to enable consultations.</p>
          ) : (
            <p className="mt-2 text-xs text-success">✓ Signature saved — will appear on your prescriptions.</p>
          )}
        </Section>

        <div className="flex justify-end pt-2">
          <Button type="submit" loading={loading} size="lg">
            <Save className="h-4 w-4" /> {profile ? "Update profile" : "Submit for review"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({ step, title, children }: { step: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-1">
      <h2 className="mb-5 flex items-center gap-2 font-semibold text-text">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gradient text-xs font-bold text-white">{step}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function VerificationBanner({ status }: { status: string }) {
  const map: Record<string, { cls: string; msg: string }> = {
    pending: { cls: "border-warning/25 bg-warning/10 text-[color-mix(in_srgb,var(--warning)_78%,black)] dark:text-warning", msg: "Your profile is under review by admin. You'll be notified once approved." },
    approved: { cls: "border-success/20 bg-success/10 text-success", msg: "Your profile has been approved. You can now go live and accept consultations." },
    rejected: { cls: "border-danger/20 bg-danger/10 text-danger", msg: "Your profile was not approved. Please update your details and resubmit." },
  };
  const b = map[status] ?? map.pending;
  return <div className={`mb-6 rounded-2xl border p-4 text-sm font-medium ${b.cls}`}>{b.msg}</div>;
}
