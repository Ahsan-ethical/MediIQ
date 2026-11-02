import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { BrowserNoiseFilter } from "@/components/BrowserNoiseFilter";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-display" });

export const metadata: Metadata = {
  title: "MediIQ — AI-Native Healthcare Platform",
  description:
    "MediIQ pairs clinicians with a 9-agent AI pipeline, camera-based vitals, and instant medical reports — enterprise-grade telemedicine, reimagined.",
};

// Set the theme class before hydration to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches&&false);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-bg text-text antialiased">
        <BrowserNoiseFilter />
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              borderRadius: "12px",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: "14px",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-3)",
            },
            success: { iconTheme: { primary: "var(--success)", secondary: "#fff" } },
            error: { iconTheme: { primary: "var(--danger)", secondary: "#fff" } },
          }}
        />
      </body>
    </html>
  );
}
