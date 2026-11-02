// Professional AI Doctor avatar — no image file dependency
export default function AiDoctorAvatar({ className = "" }: { className?: string }) {
  return (
    <div className={`relative bg-linear-to-br from-blue-600 via-blue-700 to-violet-700 flex flex-col items-center justify-center overflow-hidden ${className}`}>
      {/* Subtle grid pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M 16 0 L 0 0 0 16" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Doctor silhouette */}
      <svg viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4/5 h-4/5 relative z-10">
        {/* Head */}
        <ellipse cx="40" cy="22" rx="14" ry="16" fill="rgba(255,255,255,0.92)" />
        {/* Body / white coat */}
        <path d="M18 88 C18 60 22 52 40 50 C58 52 62 60 62 88Z" fill="rgba(255,255,255,0.92)" />
        {/* Coat lapels */}
        <path d="M40 50 L32 60 L36 88" fill="rgba(59,130,246,0.3)" />
        <path d="M40 50 L48 60 L44 88" fill="rgba(59,130,246,0.3)" />
        {/* Stethoscope */}
        <path d="M30 56 Q24 64 26 72 Q28 78 34 78 Q40 78 40 72"
          stroke="rgba(99,102,241,0.9)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx="40" cy="72" r="3.5" fill="rgba(99,102,241,0.9)" />
        {/* Ear tips */}
        <circle cx="28" cy="56" r="2" fill="rgba(99,102,241,0.9)" />
        {/* Shirt/tie detail */}
        <rect x="38" y="55" width="4" height="14" rx="1" fill="rgba(99,102,241,0.4)" />
        {/* Face features */}
        <ellipse cx="35" cy="20" rx="2" ry="2.5" fill="rgba(148,163,184,0.6)" />
        <ellipse cx="45" cy="20" rx="2" ry="2.5" fill="rgba(148,163,184,0.6)" />
        <path d="M34 28 Q40 32 46 28" stroke="rgba(148,163,184,0.6)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        {/* Medical cross badge */}
        <rect x="52" y="58" width="10" height="10" rx="2" fill="rgba(255,255,255,0.9)" />
        <rect x="55.5" y="60" width="3" height="6" rx="0.5" fill="#ef4444" />
        <rect x="53.5" y="62" width="7" height="2" rx="0.5" fill="#ef4444" />
      </svg>

      {/* AI badge */}
      <div className="absolute bottom-2 right-2 bg-surface/20 backdrop-blur-sm rounded-full px-2 py-0.5 text-white text-[9px] font-bold tracking-wide">
        AI
      </div>
    </div>
  );
}
