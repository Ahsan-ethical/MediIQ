"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { TranscriptLine } from "@/types/consultation";

// SpeechRecognition is not in TypeScript's bundled DOM lib — declare minimally
interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: { isFinal: boolean; 0: { transcript: string } }[];
}
interface ISpeechRecognitionErrorEvent {
  error: string;
}
interface ISpeechRecognition {
  continuous:     boolean;
  interimResults: boolean;
  lang:           string;
  start():  void;
  stop():   void;
  onresult: ((e: ISpeechRecognitionEvent) => void) | null;
  onend:    (() => void) | null;
  onerror:  ((e: ISpeechRecognitionErrorEvent) => void) | null;
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as SpeechRecognitionCtor | null;
}

interface UseTranscriptionOptions {
  appointmentId: string;
  role:          "doctor" | "patient";
  socketRef:     React.RefObject<Socket | null>;
  enabled:       boolean;
}

export function useTranscription({
  appointmentId,
  role,
  socketRef,
  enabled,
}: UseTranscriptionOptions) {
  const [lines, setLines]           = useState<TranscriptLine[]>([]);
  const [isListening, setListening] = useState(false);
  const recognitionRef              = useRef<ISpeechRecognition | null>(null);

  const addLine = useCallback((newLine: TranscriptLine) => {
    setLines(prev => [...prev, newLine]);
  }, []);

  // Receive transcript lines from the other party via socket
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const handler = ({ role: r, text }: { role: string; text: string }) => {
      addLine({ role: r as "doctor" | "patient", text, timestamp: Date.now() });
    };
    socket.on("transcript:line", handler);
    return () => { socket.off("transcript:line", handler); };
  }, [socketRef, addLine]);

  const start = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;

    const recognition = new SR();
    recognitionRef.current = recognition;

    recognition.continuous     = true;
    recognition.interimResults = false;
    recognition.lang           = "en-US";

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (!text) continue;
          const line: TranscriptLine = { role, text, timestamp: Date.now() };
          addLine(line);
          socketRef.current?.emit("transcript:line", { appointmentId, role, text });
        }
      }
    };

    recognition.onerror = (_e: ISpeechRecognitionErrorEvent) => {
      // Any error (mic in use by WebRTC, network, permission, etc.) → give up silently.
      // Transcription is best-effort; video call must not be disrupted.
      recognitionRef.current = null;
      setListening(false);
    };

    recognition.onend = () => {
      // Only auto-restart if we're still the active instance and no error occurred
      if (recognitionRef.current === recognition && enabled) {
        try { recognition.start(); } catch { /* mic unavailable — stop */ }
      }
    };

    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
    }
  }, [appointmentId, role, socketRef, enabled, addLine]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => {
    if (enabled) start();
    else         stop();
    return () => { stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const getFullText = useCallback(
    () => lines.map(l => `${l.role === "doctor" ? "Doctor" : "Patient"}: ${l.text}`).join("\n"),
    [lines],
  );

  return { lines, isListening, getFullText };
}
