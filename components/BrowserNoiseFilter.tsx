"use client";

import { useEffect } from "react";

// Suppresses unhandledRejection noise from browser extensions (MetaMask, etc.)
// that try to inject into every page. These are not app errors.
export function BrowserNoiseFilter() {
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason?.message ?? e.reason ?? "");
      if (
        msg.includes("MetaMask") ||
        msg.includes("chrome-extension") ||
        msg.includes("moz-extension")
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  return null;
}
