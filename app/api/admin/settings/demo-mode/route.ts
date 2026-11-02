import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { isDemoMode, setDemoMode } from "@/lib/models/Settings";

export async function GET() {
  try {
    // Any logged-in user can READ demo mode status (for the MediIQ. indicator)
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ demoMode: false });
    }
    await connectDB();
    const enabled = await isDemoMode();
    return NextResponse.json({ demoMode: enabled });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    const { enabled } = await req.json();
    await setDemoMode(!!enabled);
    return NextResponse.json({ ok: true, demoMode: !!enabled });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
