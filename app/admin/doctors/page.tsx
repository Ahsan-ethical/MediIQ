import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import DoctorProfile from "@/lib/models/DoctorProfile";
import { redirect } from "next/navigation";
import DoctorApprovalList from "@/components/DoctorApprovalList";

export default async function AdminDoctorsPage() {
  const authUser = await getCurrentUser();
  if (!authUser || authUser.role !== "admin") redirect("/login");

  await connectDB();
  const doctors = await DoctorProfile.find({})
    .populate("userRef", "name email createdAt")
    .sort({ createdAt: -1 })
    .lean() as unknown as {
      _id: string; userId: string; specialization: string; qualification: string;
      experience: number; hospital: string; city: string; consultationFee: number;
      registrationNumber: string; verificationStatus: string; rating: number;
      userRef: { name: string; email: string; createdAt: Date };
    }[];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">Doctor management</h1>
        <p className="mt-0.5 text-sm text-muted">Review and approve doctor applications.</p>
      </div>
      <DoctorApprovalList initialDoctors={JSON.parse(JSON.stringify(doctors))} />
    </div>
  );
}
