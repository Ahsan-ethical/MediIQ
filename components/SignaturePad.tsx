"use client";

import { useRef, useState, useEffect } from "react";
import { Trash2, Check } from "lucide-react";

interface Props {
  value?: string;
  onChange: (dataUrl: string) => void;
}

export default function SignaturePad({ value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPos    = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(!value);
  const [saved, setSaved] = useState(!!value);

  // Draw existing saved signature into canvas on load
  useEffect(() => {
    if (!value || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current!;
      const ctx    = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = value;
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const xy = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    lastPos.current = xy(e);
    setEmpty(false);
    setSaved(false);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!lastPos.current || e.buttons === 0) return;
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext("2d")!;
    const pos    = xy(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1e3a5f";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.stroke();
    lastPos.current = pos;
  };

  const onUp = () => { lastPos.current = null; };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    setSaved(false);
    onChange("");
  };

  const save = () => {
    if (empty) return;
    onChange(canvasRef.current!.toDataURL("image/png"));
    setSaved(true);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={600}
          height={160}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          className="w-full rounded-xl border-2 border-dashed border-border-strong bg-surface-2 cursor-crosshair touch-none hover:border-blue-300 transition-colors"
          style={{ height: 160 }}
        />
        {empty && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-subtle pointer-events-none">
            Draw your signature here
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button" onClick={clear}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-red-600 border border-border hover:border-red-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </button>
        <button
          type="button" onClick={save}
          disabled={empty}
          className="flex items-center gap-1.5 text-xs font-semibold bg-brand-gradient hover:brightness-105 disabled:opacity-40 text-white rounded-lg px-4 py-1.5 transition-colors"
        >
          <Check className="w-3.5 h-3.5" /> Save Signature
        </button>
        {saved && (
          <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
