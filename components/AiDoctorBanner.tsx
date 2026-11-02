"use client";

import { useRouter } from "next/navigation";
import { Brain, Zap, Clock, Shield } from "lucide-react";
import AiDoctorAvatar from "@/components/AiDoctorAvatar";

export default function AiDoctorBanner() {
  const router = useRouter();

  return (
    <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-blue-600 via-blue-700 to-violet-700 p-6 mb-8 shadow-xl shadow-blue-200 animate-fade-in-up">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-surface/5 rounded-full -translate-y-32 translate-x-32" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-surface/5 rounded-full translate-y-16 -translate-x-16" />

      <div className="relative flex items-center gap-6">
        {/* Doctor image */}
        <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/30 shrink-0 shadow-lg">
          <AiDoctorAvatar className="w-full h-full" />
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-blue-200" />
            <span className="text-xs font-semibold text-blue-200 uppercase tracking-wide">New</span>
            <span className="bg-surface/20 text-white text-xs font-semibold px-2 py-0.5 rounded-full">AI Powered</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Consult Dr. MediQ AI</h2>
          <p className="text-blue-100 text-sm mb-4 leading-relaxed max-w-lg">
            Get an instant medical consultation powered by AI. Ask questions, describe your symptoms,
            and receive a personalised diagnosis and treatment plan — available 24/7 in seconds.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mb-5">
            {[
              { icon: Zap, text: "Instant consultation" },
              { icon: Clock, text: "Available 24/7" },
              { icon: Shield, text: "Private & secure" },
              { icon: Brain, text: "Gemini AI powered" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5 bg-surface/10 text-white/90 text-xs font-medium px-3 py-1.5 rounded-full">
                <Icon className="w-3 h-3" />
                {text}
              </div>
            ))}
          </div>

          <button
            onClick={() => router.push("/patient/ai-consultation/new")}
            className="inline-flex items-center gap-2 bg-surface text-brand-700 dark:text-brand-300 font-semibold px-6 py-2.5 rounded-xl hover:bg-brand-500/10 transition-colors shadow-lg text-sm"
          >
            <Brain className="w-4 h-4" />
            Start Free AI Consultation
          </button>
        </div>
      </div>
    </div>
  );
}
