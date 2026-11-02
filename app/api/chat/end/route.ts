import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import ChatConversation from "@/lib/models/ChatConversation";
import SystemDetected from "@/lib/models/SystemDetected";
import { generateTextGeminiFirst } from "@/lib/agents/llm";
import mongoose from "mongoose";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "patient") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await req.json();
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  await connectDB();

  const conversation = await ChatConversation.findOne({
    _id: conversationId,
    patientRef: user.userId,
    status: "active",
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found or already closed" }, { status: 404 });
  }

  const userMessages = conversation.messages
    .filter((m: { role: string }) => m.role === "user")
    .map((m: { content: string }) => m.content);

  if (userMessages.length === 0) {
    conversation.status = "closed";
    await conversation.save();
    return NextResponse.json({ closed: true, detectionsFound: 0 });
  }

  const drugs = conversation.contextSnapshot?.drugs ?? [];
  const allergies = conversation.contextSnapshot?.knownAllergies ?? [];

  const combinedMessages = userMessages.join("\n");

  let detections: { drug: string; reactionType: string; severity: string; drugClass: string; suggestedTests: string[] }[] = [];

  try {
    const r = await generateTextGeminiFirst(
      `You are a clinical finding detector. Analyze the following patient messages from a post-consultation chat. The patient was prescribed: ${drugs.join(", ") || "unknown drugs"}. Their known allergies are: ${allergies.join(", ") || "none"}.

PATIENT MESSAGES:
${combinedMessages}

DETECT:
1. Any drug reactions reported (rash, itching, swelling, nausea, breathing difficulty, etc.) linked to a specific drug
2. Any suspected new allergies
3. Any tests the chatbot recommended for allergy confirmation

Return ONLY valid JSON (no markdown):
{
  "detections": [
    {
      "drug": "drug name",
      "reactionType": "type of reaction (e.g. allergic_dermatitis, anaphylaxis, GI_upset)",
      "severity": "severe or mild",
      "drugClass": "drug class (e.g. Penicillin, NSAID)",
      "suggestedTests": ["test1", "test2"]
    }
  ]
}

If no reactions or allergies were reported, return {"detections": []}.
Do NOT hallucinate reactions that the patient did not describe.`
    );

    let raw = r.text;
    if (raw.includes("<think>")) raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (raw.includes("```")) raw = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");

    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      detections = parsed.detections ?? [];
    }
  } catch (err) {
    console.error("[ChatEnd] Detection LLM failed:", err);
  }

  const patientOid = new mongoose.Types.ObjectId(user.userId as string);

  for (const d of detections) {
    if (!d.drug) continue;

    const alreadyKnown = allergies.some(a => a.toLowerCase() === d.drug.toLowerCase());
    if (alreadyKnown) continue;

    try {
      const result = await SystemDetected.updateOne(
        { patientRef: patientOid, type: "allergy", value: d.drug },
        {
          $setOnInsert: {
            patientRef: patientOid,
            type: "allergy",
            value: d.drug,
            severity: d.severity === "severe" ? "severe" : "mild",
            allergyStatus: "suspected",
            reason: `Reported via chatbot: ${d.reactionType}. Suggested tests: ${d.suggestedTests.join(", ") || "none"}`,
            source: "chatbot",
            status: "pending",
          },
        },
        { upsert: true },
      );

      if (result.upsertedId) {
        conversation.detections.push({
          drug: d.drug,
          reactionType: d.reactionType,
          severity: d.severity as "severe" | "mild",
          drugClass: d.drugClass,
          suggestedTests: d.suggestedTests,
          writtenToSystemDetected: true,
          systemDetectedId: result.upsertedId,
        });
      }
    } catch (err) {
      console.error(`[ChatEnd] Failed to write detection for ${d.drug}:`, err);
    }
  }

  conversation.status = "closed";
  await conversation.save();

  return NextResponse.json({
    closed: true,
    detectionsFound: detections.length,
    detections: conversation.detections,
  });
}
