"use client";
import { useState, useEffect } from "react";
import { X, Plus, Search, Star } from "lucide-react";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

interface Doctor {
  _id: string;
  userId: string;
  specialization: string;
  qualification: string;
  experience: number;
  hospital: string;
  city: string;
  consultationFee: number;
  rating: number;
  userRef: { name: string; email: string };
}

export default function BookAppointmentModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selected, setSelected] = useState<Doctor | null>(null);
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFetching(true);
    fetch("/api/doctors/available")
      .then((r) => r.json())
      .then((d) => setDoctors(d.doctors ?? []))
      .finally(() => setFetching(false));
  }, [open]);

  const filtered = doctors.filter(
    (d) =>
      d.userRef.name.toLowerCase().includes(search.toLowerCase()) ||
      d.specialization.toLowerCase().includes(search.toLowerCase()) ||
      d.city.toLowerCase().includes(search.toLowerCase())
  );

  const handleBook = async () => {
    if (!selected || !date || !timeSlot) { toast.error("Fill all fields"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId: selected.userRef, date, timeSlot }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("Appointment booked!");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Booking failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="w-4 h-4" />
        Book Appointment
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in-up">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-bold text-text text-lg">Book a Consultation</h2>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-muted" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-5">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
                <input
                  type="text"
                  placeholder="Search by name, specialization, city..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-border text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12 transition-all"
                />
              </div>

              {/* Doctor List */}
              <div className="space-y-2 max-h-64 overflow-auto">
                {fetching ? (
                  <div className="text-center py-8 text-subtle text-sm">Loading doctors...</div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-8 text-subtle text-sm">No doctors available</div>
                ) : filtered.map((doc) => (
                  <button
                    key={doc._id}
                    type="button"
                    onClick={() => setSelected(doc)}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-150 ${
                      selected?._id === doc._id ? "border-blue-500 bg-brand-500/10" : "border-border hover:border-border hover:bg-surface-2"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-text text-sm">Dr. {doc.userRef.name}</p>
                        <p className="text-muted text-xs capitalize mt-0.5">{doc.specialization} · {doc.hospital}, {doc.city}</p>
                        <p className="text-subtle text-xs mt-0.5">{doc.qualification} · {doc.experience} yr{doc.experience !== 1 ? "s" : ""} exp.</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-text text-sm">₹{doc.consultationFee}</p>
                        {doc.rating > 0 && (
                          <div className="flex items-center gap-1 justify-end mt-0.5">
                            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                            <span className="text-xs text-muted">{doc.rating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Date & Time */}
              {selected && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-text">Date</label>
                    <input
                      type="date"
                      min={new Date().toISOString().split("T")[0]}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-text">Time Slot</label>
                    <select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12 transition-all">
                      <option value="">Select time</option>
                      {["09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-border flex gap-3">
              <Button variant="ghost" onClick={() => setOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleBook} loading={loading} disabled={!selected || !date || !timeSlot} className="flex-1">
                Confirm Booking
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
