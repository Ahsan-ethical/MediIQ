import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { getAiMode, setAiMode, AI_MODES, type AiMode } from "@/lib/models/Settings";

export async function GET() {
  try {
    // Any logged-in user can READ the AI mode (for the sidebar indicator).
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ aiMode: "gemini_ollama_race" });
    }
    await connectDB();
    const aiMode = await getAiMode();
    return NextResponse.json({ aiMode });
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
    const { mode } = await req.json();
    if (!AI_MODES.includes(mode)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }
    await setAiMode(mode as AiMode);
    return NextResponse.json({ ok: true, aiMode: mode });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
