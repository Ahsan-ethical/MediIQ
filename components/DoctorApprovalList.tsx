"use client";
import { useState } from "react";
import { CheckCircle2, XCircle, Clock, Search, Star } from "lucide-react";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";

interface Doctor {
  _id: string;
  userId: string;
  specialization: string;
  qualification: string;
  experience: number;
  hospital: string;
  city: string;
  consultationFee: number;
  registrationNumber: string;
  verificationStatus: string;
  rating: number;
  userRef: { name: string; email: string; createdAt: string };
}

const TABS = ["all", "pending", "approved", "rejected"] as const;
type Tab = (typeof TABS)[number];

const statusConfig: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
  pending: { cls: "bg-amber-50 text-amber-700 border-amber-100", icon: <Clock className="w-3 h-3" />, label: "Pending" },
  approved: { cls: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: <CheckCircle2 className="w-3 h-3" />, label: "Approved" },
  rejected: { cls: "bg-red-50 text-red-700 border-red-100", icon: <XCircle className="w-3 h-3" />, label: "Rejected" },
};

export default function DoctorApprovalList({ initialDoctors }: { initialDoctors: Doctor[] }) {
  const [doctors, setDoctors] = useState(initialDoctors);
  const [activeTab, setActiveTab] = useState<Tab>("pending");
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const filtered = doctors.filter((d) => {
    const matchTab = activeTab === "all" || d.verificationStatus === activeTab;
    const matchSearch =
      d.userRef.name.toLowerCase().includes(search.toLowerCase()) ||
      d.specialization.toLowerCase().includes(search.toLowerCase()) ||
      d.city.toLowerCase().includes(search.toLowerCase()) ||
      d.registrationNumber.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const counts = TABS.reduce((acc, t) => {
    acc[t] = t === "all" ? doctors.length : doctors.filter((d) => d.verificationStatus === t).length;
    return acc;
  }, {} as Record<Tab, number>);

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/admin/doctors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationStatus: status }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setDoctors((prev) => prev.map((d) => d._id === id ? { ...d, verificationStatus: status } : d));
      toast.success(`Doctor ${status === "approved" ? "approved" : "rejected"} successfully`);
    } catch {
      toast.error("Action failed");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex bg-surface rounded-2xl border border-border shadow-sm p-1 gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize transition-all duration-150 ${
                activeTab === tab ? "bg-slate-900 text-white shadow" : "text-muted hover:text-text"
              }`}
            >
              {tab} <span className="ml-1 opacity-70">({counts[tab]})</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
          <input
            type="text"
            placeholder="Search by name, specialization, city, registration..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-border bg-surface text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12 transition-all shadow-sm"
          />
        </div>
      </div>

      {/* Doctor Cards */}
      {filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-12 text-center">
          <p className="text-subtle text-sm">No doctors found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((doc, i) => {
            const s = statusConfig[doc.verificationStatus] ?? statusConfig.pending;
            return (
              <div
                key={doc._id}
                className="bg-surface rounded-2xl border border-border shadow-sm p-5 animate-fade-in-up opacity-0"
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: "forwards" }}
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-violet-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {doc.userRef.name.charAt(0)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <p className="font-bold text-text">Dr. {doc.userRef.name}</p>
                        <p className="text-muted text-xs mt-0.5">{doc.userRef.email}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${s.cls}`}>
                        {s.icon}
                        {s.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                      {[
                        { label: "Specialization", value: doc.specialization },
                        { label: "Qualification", value: doc.qualification.toUpperCase() },
                        { label: "Experience", value: `${doc.experience} yr${doc.experience !== 1 ? "s" : ""}` },
                        { label: "Hospital", value: `${doc.hospital}, ${doc.city}` },
                        { label: "Reg. Number", value: doc.registrationNumber },
                        { label: "Fee", value: `₹${doc.consultationFee}` },
                        { label: "Doctor ID", value: doc.userId ?? "—" },
                        {
                          label: "Rating",
                          value: doc.rating > 0 ? (
                            <span className="flex items-center gap-1">
                              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                              {doc.rating.toFixed(1)}
                            </span>
                          ) : "No ratings",
                        },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-surface-2 rounded-xl p-2.5">
                          <p className="text-xs text-subtle mb-0.5">{label}</p>
                          <p className="text-xs font-semibold text-text capitalize">{value as React.ReactNode}</p>
                        </div>
                      ))}
                    </div>

                    {doc.verificationStatus === "pending" && (
                      <div className="flex gap-3 mt-4">
                        <Button
                          variant="success"
                          size="sm"
                          loading={loadingId === doc._id}
                          onClick={() => updateStatus(doc._id, "approved")}
                          className="gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={loadingId === doc._id}
                          onClick={() => updateStatus(doc._id, "rejected")}
                          className="gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </Button>
                      </div>
                    )}

                    {doc.verificationStatus === "approved" && (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={loadingId === doc._id}
                        onClick={() => updateStatus(doc._id, "rejected")}
                        className="mt-4 gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Revoke Approval
                      </Button>
                    )}

                    {doc.verificationStatus === "rejected" && (
                      <Button
                        variant="success"
                        size="sm"
                        loading={loadingId === doc._id}
                        onClick={() => updateStatus(doc._id, "approved")}
                        className="mt-4 gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve Anyway
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
