"use client";

import { useState, createElement } from "react";
import { Download, Loader2 } from "lucide-react";
import type { PrescriptionDocProps } from "./PrescriptionDocument";

export default function PrescriptionDownloadButton({
  props,
  filename,
}: {
  props: PrescriptionDocProps;
  filename?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const [{ pdf }, { default: PrescriptionDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./PrescriptionDocument"),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(createElement(PrescriptionDocument, props) as any).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = filename ?? `medi-iq-prescription-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF generation failed:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="inline-flex items-center gap-2 bg-brand-gradient hover:brightness-105 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
    >
      {loading
        ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF…</>
        : <><Download className="w-4 h-4" /> Download Prescription</>
      }
    </button>
  );
}
