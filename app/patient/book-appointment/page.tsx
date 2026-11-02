"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Search, Star, MapPin, Briefcase, GraduationCap,
  IndianRupee, Radio, WifiOff, ArrowLeft, Stethoscope,
} from "lucide-react";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import AiDoctorBanner from "@/components/AiDoctorBanner";
import { EmptyState } from "@/components/ui/PageHeader";

interface Doctor {
  _id: string; userId: string; specialization: string; qualification: string;
  experience: number; hospital: string; city: string; consultationFee: number;
  verificationStatus: string; rating: number; totalRatings: number; isLive: boolean;
  userRef: { _id: string; name: string; email: string };
}

const SPECIALIZATIONS = [
  "All", "Cardiologist", "Dermatologist", "Neurologist", "Orthopedic",
  "Pediatrician", "Psychiatrist", "General Physician", "ENT Specialist",
  "Ophthalmologist", "Gynecologist", "Gastroenterologist",
];

export default function BookAppointmentPage() {
  const router = useRouter();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [bookingId, setBookingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Retry transient failures (serverless cold start / brief DB reconnect) so the list
    // isn't left empty just because the very first request lost the race.
    const load = async (attempt = 0) => {
      try {
        const res = await fetch("/api/doctors/available", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if (cancelled) return;
        setDoctors(Array.isArray(d.doctors) ? d.doctors : []);
        setLoading(false);
      } catch {
        if (cancelled) return;
        if (attempt < 3) {
          setTimeout(() => load(attempt + 1), 800 * (attempt + 1));
        } else {
          setLoading(false);
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = doctors.filter((d) => {
    const name = d.userRef?.name ?? "";           // guard: linked user could be missing
    const q = search.toLowerCase();
    const matchSearch =
      name.toLowerCase().includes(q) ||
      d.specialization.toLowerCase().includes(q) ||
      d.city.toLowerCase().includes(q);
    const matchFilter = filter === "All" || d.specialization.toLowerCase() === filter.toLowerCase();
    return matchSearch && matchFilter;
  });

  const liveDoctors = filtered.filter((d) => d.isLive);
  const offlineDoctors = filtered.filter((d) => !d.isLive);

  const handleBook = async (doctor: Doctor) => {
    if (!doctor.isLive) { toast.error("This doctor is not live right now"); return; }
    setBookingId(doctor.userRef._id);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorUserId: doctor.userRef._id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("Appointment booked! Fill your pre-consultation details.");
      router.push(`/patient/pre-consultation/${data.appointment._id}`);
    } catch {
      toast.error("Booking failed");
    } finally {
      setBookingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-5 sm:p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-muted shadow-1 transition-colors hover:bg-surface-2 hover:text-text">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Find a doctor</h1>
          <p className="mt-0.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1 font-semibold text-success"><Radio className="h-3 w-3 animate-pulse" /> {liveDoctors.length} live now</span>
            <span className="mx-2 text-subtle">·</span>{offlineDoctors.length} offline
          </p>
        </div>
      </div>

      <AiDoctorBanner />

      {/* Search + filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            placeholder="Search by name, specialization, city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-4 text-sm text-text shadow-1 transition-all placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
          />
        </div>
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="flex min-w-max gap-2">
            {SPECIALIZATIONS.slice(0, 7).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${
                  filter === s ? "bg-brand-gradient text-white shadow-2" : "border border-border bg-surface text-muted hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-8">
          {liveDoctors.length > 0 && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-text"><Radio className="h-4 w-4 animate-pulse text-success" /> Available now ({liveDoctors.length})</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {liveDoctors.map((doc, i) => <DoctorCard key={doc._id} doctor={doc} onBook={handleBook} loading={bookingId === doc.userRef._id} delay={i * 0.05} />)}
              </div>
            </section>
          )}
          {offlineDoctors.length > 0 && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-muted"><WifiOff className="h-4 w-4 text-subtle" /> Offline ({offlineDoctors.length})</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {offlineDoctors.map((doc, i) => <DoctorCard key={doc._id} doctor={doc} onBook={handleBook} loading={false} delay={i * 0.04} />)}
              </div>
            </section>
          )}
          {filtered.length === 0 && (
            <EmptyState icon={<Stethoscope className="h-6 w-6" />} title="No doctors found" hint="Try a different search or filter." />
          )}
        </div>
      )}
    </div>
  );
}

function DoctorCard({ doctor, onBook, loading, delay }: {
  doctor: Doctor; onBook: (d: Doctor) => void; loading: boolean; delay: number;
}) {
  const stars = Math.round(doctor.rating);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col gap-4 rounded-2xl border bg-surface p-5 shadow-1 transition-all duration-300 ${
        doctor.isLive ? "border-success/25 hover:-translate-y-1 hover:shadow-3" : "border-border opacity-75"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-400 text-lg font-bold text-white">{doctor.userRef.name.charAt(0)}</span>
            <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-surface ${doctor.isLive ? "bg-success" : "bg-surface-3"}`} />
          </div>
          <div>
            <p className="text-sm font-bold text-text">Dr. {doctor.userRef.name}</p>
            <p className="text-xs capitalize text-muted">{doctor.specialization}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${doctor.isLive ? "border-success/20 bg-success/12 text-success" : "border-border bg-surface-2 text-muted"}`}>
          {doctor.isLive ? <><Radio className="h-2.5 w-2.5 animate-pulse" /> Live</> : <><WifiOff className="h-2.5 w-2.5" /> Offline</>}
        </span>
      </div>

      <div className="space-y-1.5 text-xs text-muted">
        <p className="flex items-center gap-2"><GraduationCap className="h-3.5 w-3.5 text-subtle" /> {doctor.qualification.toUpperCase()} · {doctor.experience} yr{doctor.experience !== 1 ? "s" : ""} experience</p>
        <p className="flex items-center gap-2"><Briefcase className="h-3.5 w-3.5 text-subtle" /> {doctor.hospital}</p>
        <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-subtle" /> {doctor.city}</p>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-1.5">
          <div className="flex">
            {[1, 2, 3, 4, 5].map((s) => <Star key={s} className={`h-3 w-3 ${s <= stars ? "fill-amber-400 text-amber-400" : "fill-surface-3 text-surface-3"}`} />)}
          </div>
          <span className="text-xs text-muted">{doctor.totalRatings > 0 ? `${doctor.rating.toFixed(1)} (${doctor.totalRatings})` : "No ratings yet"}</span>
        </div>
        <div className="flex items-center gap-0.5 text-sm font-bold text-text"><IndianRupee className="h-3.5 w-3.5" />{doctor.consultationFee}</div>
      </div>

      <Button onClick={() => onBook(doctor)} loading={loading} disabled={!doctor.isLive} variant={doctor.isLive ? "primary" : "ghost"} className="w-full" size="sm">
        {doctor.isLive ? "Book consultation" : "Not available"}
      </Button>
    </motion.div>
  );
}
