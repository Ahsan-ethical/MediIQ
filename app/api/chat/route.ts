import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import ChatConversation from "@/lib/models/ChatConversation";
import PatientProfile from "@/lib/models/PatientProfile";
import SystemDetected from "@/lib/models/SystemDetected";
import { generateTextGeminiFirst, generateText } from "@/lib/agents/llm";
import mongoose from "mongoose";

const MEDICAL_TRIGGERS = [
  "allergy", "allergic", "reaction", "rash", "rashes", "hives", "itch",
  "itching", "swelling", "swollen", "breathing", "vomit", "nausea",
  "dizzy", "dizziness", "side effect", "overdose", "interact", "bleed",
  "pain", "fever", "emergency", "severe", "stop taking", "worse",
];

function shouldUseGemini(message: string, prescribedDrugs: string[]): boolean {
  const lower = message.toLowerCase();

  for (const drug of prescribedDrugs) {
    if (lower.includes(drug.toLowerCase())) {
      for (const trigger of MEDICAL_TRIGGERS) {
        if (lower.includes(trigger)) return true;
      }
    }
  }

  const highPriority = ["emergency", "overdose", "can't breathe", "severe pain", "chest pain", "unconscious"];
  for (const hp of highPriority) {
    if (lower.includes(hp)) return true;
  }

  return false;
}

function buildSystemPrompt(
  patientName: string,
  profile: { age: number; gender: string; knownConditions: string[]; allergies: string[]; currentMedications: string[] },
  lastConsultation: { diagnosis: string; prescribedDrugs: { name: string; dosage: string; frequency: string; duration: string }[]; keyAdvice: string; warnings: string[]; symptoms: string } | null,
): string {
  const drugList = lastConsultation?.prescribedDrugs.map(d => `${d.name} ${d.dosage} ${d.frequency} for ${d.duration}`).join("\n  ") ?? "No recent prescription";

  return `You are MediIQ Assistant, a medical support chatbot for post-consultation patient care. You are talking to ${patientName}.

PATIENT PROFILE:
- Age: ${profile.age}, Gender: ${profile.gender}
- Known conditions: ${profile.knownConditions.join(", ") || "None"}
- Known allergies: ${profile.allergies.join(", ") || "None"}
- Current medications: ${profile.currentMedications.join(", ") || "None"}

LAST CONSULTATION:
- Symptoms: ${lastConsultation?.symptoms ?? "N/A"}
- Diagnosis: ${lastConsultation?.diagnosis ?? "N/A"}
- Prescribed drugs:
  ${drugList}
- Doctor's advice: ${lastConsultation?.keyAdvice ?? "N/A"}
- Warnings: ${lastConsultation?.warnings?.join("; ") ?? "None"}

RULES:
1. Be helpful, empathetic, and concise. Keep responses under 150 words unless the user asks for detail.
2. If the user reports symptoms that could be a drug reaction (rash, itching, swelling, nausea, breathing difficulty after taking a prescribed drug), clearly tell them:
   - Stop the suspected drug immediately
   - Contact their doctor
   - Suggest relevant allergy tests (skin prick test, IgE blood test)
3. Never diagnose. Say "this could be" or "you should get tested for" — never "you have".
4. If the user describes an emergency (chest pain, can't breathe, severe swelling), tell them to call emergency services immediately.
5. You can answer general questions about their prescribed medicines (dosage, timing, food interactions) using the prescription data above.
6. If asked something outside your knowledge, say so honestly. Don't make up medical information.
7. The user may have spelling mistakes — interpret their intent, don't correct their spelling.
8. NEVER use markdown formatting — no **bold**, no *italic*, no bullet points with -, no headers with #. Write in plain conversational sentences only. Use commas and periods to structure your response.
9. Talk like a friendly human assistant, not like an AI. Be warm and natural. Don't use phrases like "Let me know if you need help" or "Feel free to ask" — just answer naturally.`;
}

function buildConversationMessages(
  systemPrompt: string,
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string,
  injectedContext?: string,
): string {
  let prompt = systemPrompt + "\n\n";

  if (injectedContext) {
    prompt += `RELEVANT MEDICAL CONTEXT (from knowledge base):\n${injectedContext}\n\n`;
  }

  const recentHistory = history.slice(-10);
  if (recentHistory.length > 0) {
    prompt += "CONVERSATION HISTORY:\n";
    for (const msg of recentHistory) {
      prompt += `${msg.role === "user" ? "Patient" : "Assistant"}: ${msg.content}\n`;
    }
    prompt += "\n";
  }

  prompt += `Patient: ${userMessage}\nAssistant:`;
  return prompt;
}

// ─── POST /api/chat — send a message ────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "patient") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message, conversationId } = await req.json();
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  await connectDB();

  const profile = await PatientProfile
    .findOne({ userRef: user.userId })
    .select("age gender knownConditions allergies currentMedications lastConsultationSummary summary runningSummary")
    .lean();

  if (!profile) {
    return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });
  }

  const lastConsult = profile.lastConsultationSummary as {
    diagnosis: string;
    prescribedDrugs: { name: string; dosage: string; frequency: string; duration: string }[];
    keyAdvice: string;
    warnings: string[];
    symptoms: string;
  } | null;

  const prescribedDrugs = lastConsult?.prescribedDrugs?.map(d => d.name) ?? [];

  const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

  let conversation;
  let isNewConversation = false;

  // Try to find an existing active conversation
  if (conversationId) {
    conversation = await ChatConversation.findOne({ _id: conversationId, patientRef: user.userId, status: "active" });
  }
  if (!conversation) {
    conversation = await ChatConversation.findOne({ patientRef: user.userId, status: "active" }).sort({ lastMessageAt: -1 });
  }

  // Auto-close if idle for more than 5 minutes
  if (conversation) {
    const lastMsg = conversation.lastMessageAt ?? conversation.startedAt;
    const idleMs = Date.now() - new Date(lastMsg).getTime();
    if (idleMs > IDLE_TIMEOUT_MS) {
      conversation.status = "closed";
      await conversation.save();
      // Fire end-of-chat detection in background (non-blocking)
      autoCloseDetection(conversation._id.toString(), user.userId).catch(() => {});
      conversation = null;
    }
  }

  if (!conversation) {
    isNewConversation = true;
    conversation = await ChatConversation.create({
      patientRef: user.userId,
      contextSnapshot: {
        symptoms: lastConsult?.symptoms ?? "",
        diagnosis: lastConsult?.diagnosis ?? "",
        drugs: prescribedDrugs,
        knownAllergies: (profile.allergies as string[]) ?? [],
      },
    });

    let greeting: string;
    if (lastConsult && lastConsult.diagnosis) {
      const drugNames = lastConsult.prescribedDrugs?.map(d => d.name).join(", ") || "your prescribed medicines";
      greeting = `Hi ${user.name.split(" ")[0]}! This chat is about your recent consultation where you came in for ${lastConsult.symptoms || "a check-up"} and were diagnosed with ${lastConsult.diagnosis}. You were prescribed ${drugNames}. Feel free to ask me anything about your medicines, side effects, or how you're feeling since the consultation.`;
    } else {
      const conditions = (profile.knownConditions as string[]) ?? [];
      const meds = (profile.currentMedications as string[]) ?? [];
      const parts: string[] = [];
      if (conditions.length) parts.push(`your conditions (${conditions.join(", ")})`);
      if (meds.length) parts.push(`your current medications (${meds.join(", ")})`);
      greeting = `Hi ${user.name.split(" ")[0]}! I couldn't find a recent consultation on your record. But I'm still here to help — you can ask me about ${parts.length ? parts.join(" or ") : "any health-related questions"}, or anything else on your mind.`;
    }

    conversation.messages.push({ role: "assistant", content: greeting, timestamp: new Date() });
  }

  conversation.messages.push({ role: "user", content: message.trim(), timestamp: new Date() });

  const systemPrompt = buildSystemPrompt(
    user.name,
    {
      age: profile.age as number,
      gender: profile.gender as string,
      knownConditions: (profile.knownConditions as string[]) ?? [],
      allergies: (profile.allergies as string[]) ?? [],
      currentMedications: (profile.currentMedications as string[]) ?? [],
    },
    lastConsult,
  );

  let injectedContext: string | undefined;
  const cachesUsed: string[] = [];

  const lower = message.toLowerCase();
  for (const drug of prescribedDrugs) {
    if (lower.includes(drug.toLowerCase())) {
      try {
        const Agent5Cache = mongoose.models.Agent5AllergyContextCache ??
          mongoose.model("Agent5AllergyContextCache", new mongoose.Schema({}, { strict: false, collection: "agent5_allergy_context_cache" }));
        const cached = await Agent5Cache.findOne({ cacheType: "allergen_expansion", cacheKey: drug.toLowerCase() }).lean();
        if (cached) {
          const data = cached as Record<string, unknown>;
          const result = data.result as Record<string, unknown> | undefined;
          if (result) {
            injectedContext = (injectedContext ?? "") + `\nAllergy data for ${drug}: ${JSON.stringify(result).slice(0, 1500)}`;
            cachesUsed.push("agent5");
          }
        }
      } catch { /* cache miss is fine */ }

      try {
        const Agent7Cache = mongoose.models.Agent7DrugMedicCache ??
          mongoose.model("Agent7DrugMedicCache", new mongoose.Schema({}, { strict: false, collection: "agent7_drug_medic_cache" }));
        const cached = await Agent7Cache.findOne({ cacheType: "fda_label", cacheKey: drug.toLowerCase() }).lean();
        if (cached) {
          const data = cached as Record<string, unknown>;
          const result = data.result as Record<string, unknown> | undefined;
          if (result) {
            injectedContext = (injectedContext ?? "") + `\nFDA data for ${drug}: ${JSON.stringify(result).slice(0, 1000)}`;
            cachesUsed.push("agent7");
          }
        }
      } catch { /* cache miss is fine */ }
    }
  }

  const history = conversation.messages
    .slice(-10)
    .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
    .map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const fullPrompt = buildConversationMessages(systemPrompt, history.slice(0, -1), message.trim(), injectedContext);

  const useGemini = shouldUseGemini(message, prescribedDrugs);
  let responseText: string;
  let provider: "gemini" | "ollama";

  try {
    if (useGemini) {
      const r = await generateTextGeminiFirst(fullPrompt);
      responseText = r.text;
      provider = r.provider as "gemini" | "ollama";
    } else {
      const r = await generateText(fullPrompt);
      responseText = r.text;
      provider = r.provider as "gemini" | "ollama";
    }
  } catch (err) {
    return NextResponse.json({ error: "LLM call failed: " + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }

  if (responseText.includes("<think>")) {
    responseText = responseText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  }
  responseText = responseText.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^#+\s/gm, "").replace(/^-\s/gm, "").trim();

  conversation.messages.push({
    role: "assistant",
    content: responseText,
    timestamp: new Date(),
    provider,
    cachesUsed,
  });
  conversation.lastMessageAt = new Date();
  await conversation.save();

  const greeting = isNewConversation
    ? conversation.messages[0]?.content ?? null
    : null;

  return NextResponse.json({
    reply: responseText,
    provider,
    conversationId: conversation._id.toString(),
    cachesUsed,
    greeting,
  });
}

// ─── Auto-close detection (runs in background when chat times out) ──────────

async function autoCloseDetection(conversationId: string, patientUserId: string): Promise<void> {
  try {
    await connectDB();
    const conversation = await ChatConversation.findById(conversationId);
    if (!conversation || conversation.messages.length < 2) return;

    const userMessages = conversation.messages
      .filter((m: { role: string }) => m.role === "user")
      .map((m: { content: string }) => m.content);

    if (userMessages.length === 0) return;

    const drugs = conversation.contextSnapshot?.drugs ?? [];
    const allergies = conversation.contextSnapshot?.knownAllergies ?? [];
    const hasMedicalContent = userMessages.some((msg: string) => {
      const lower = msg.toLowerCase();
      return MEDICAL_TRIGGERS.some(t => lower.includes(t));
    });

    if (!hasMedicalContent) return;

    const combinedMessages = userMessages.join("\n");
    const r = await generateTextGeminiFirst(
      `You are a clinical finding detector. Analyze these patient messages. Prescribed drugs: ${drugs.join(", ") || "unknown"}. Known allergies: ${allergies.join(", ") || "none"}.

PATIENT MESSAGES:
${combinedMessages}

Detect any drug reactions or suspected allergies reported. Return ONLY valid JSON:
{"detections": [{"drug": "name", "reactionType": "type", "severity": "severe or mild", "drugClass": "class", "suggestedTests": ["test1"]}]}
If none found, return {"detections": []}.`
    );

    let raw = r.text;
    if (raw.includes("<think>")) raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (raw.includes("```")) raw = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return;
    const parsed = JSON.parse(match[0]);
    const detections = parsed.detections ?? [];

    const patientOid = new mongoose.Types.ObjectId(patientUserId);
    for (const d of detections) {
      if (!d.drug || allergies.some((a: string) => a.toLowerCase() === d.drug.toLowerCase())) continue;
      await SystemDetected.updateOne(
        { patientRef: patientOid, type: "allergy", value: d.drug },
        { $setOnInsert: { patientRef: patientOid, type: "allergy", value: d.drug, severity: d.severity === "severe" ? "severe" : "mild", allergyStatus: "suspected", reason: `Auto-detected from chat: ${d.reactionType}`, source: "chatbot", status: "pending" } },
        { upsert: true },
      );
    }
  } catch (err) {
    console.error("[Chat auto-close] Detection failed:", err);
  }
}

// ─── GET /api/chat — get active chat or conversation history ────────────────

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "patient") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

  // ?active=true — return the current active conversation (for resuming)
  if (req.nextUrl.searchParams.get("active") === "true") {
    const active = await ChatConversation.findOne({ patientRef: user.userId, status: "active" }).sort({ lastMessageAt: -1 }).lean();

    if (active) {
      const lastMsg = active.lastMessageAt ?? active.startedAt;
      const idleMs = Date.now() - new Date(lastMsg).getTime();
      if (idleMs > IDLE_TIMEOUT_MS) {
        await ChatConversation.updateOne({ _id: active._id }, { $set: { status: "closed" } });
        autoCloseDetection(active._id.toString(), user.userId).catch(() => {});
        return NextResponse.json({ active: null });
      }
      return NextResponse.json({ active });
    }
    return NextResponse.json({ active: null });
  }

  const convId = req.nextUrl.searchParams.get("id");
  if (convId) {
    const conv = await ChatConversation.findOne({ _id: convId, patientRef: user.userId }).lean();
    if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(conv);
  }

  const conversations = await ChatConversation
    .find({ patientRef: user.userId })
    .sort({ lastMessageAt: -1 })
    .limit(20)
    .select("startedAt lastMessageAt status contextSnapshot messages")
    .lean();

  const summaries = conversations.map(c => ({
    _id: c._id,
    startedAt: c.startedAt,
    lastMessageAt: c.lastMessageAt,
    status: c.status,
    diagnosis: c.contextSnapshot?.diagnosis ?? "",
    messageCount: c.messages?.length ?? 0,
    preview: c.messages?.[c.messages.length - 1]?.content?.slice(0, 100) ?? "",
  }));

  return NextResponse.json(summaries);
}
