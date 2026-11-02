"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
];

type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "failed";

interface Signaling {
  offer?:     { type: string; sdp: string } | null;
  answer?:    { type: string; sdp: string } | null;
  doctorIce:  object[];
  patientIce: object[];
}

export interface UseWebRTCOptions {
  appointmentId:  string;
  role:           "doctor" | "patient";
  localStreamRef: React.RefObject<MediaStream | null>;
  streamReady:    boolean;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function postSignal(id: string, type: string, payload: unknown): Promise<boolean> {
  try {
    const res = await fetch(`/api/appointments/${id}/webrtc-signal`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type, payload }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      console.error(`[WebRTC] postSignal ${type} failed:`, res.status, err.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[WebRTC] postSignal ${type} network error:`, e);
    return false;
  }
}

async function getSignaling(id: string): Promise<Signaling | null> {
  try {
    const res  = await fetch(`/api/appointments/${id}/webrtc-signal`);
    if (!res.ok) {
      console.error(`[WebRTC] getSignaling failed:`, res.status);
      return null;
    }
    const data = await res.json() as { signaling?: Signaling | null };
    return data.signaling ?? null;
  } catch (e) {
    console.error(`[WebRTC] getSignaling network error:`, e);
    return null;
  }
}

function getIceUfrag(sdp: string): string | null {
  return sdp.match(/a=ice-ufrag:(\S+)/)?.[1] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────

export function useWebRTC({
  appointmentId,
  role,
  localStreamRef,
  streamReady,
}: UseWebRTCOptions) {
  const pcRef           = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const streamReadyRef  = useRef(streamReady);

  // Doctor-side state
  const offerPosted      = useRef(false);   // offer successfully posted to DB
  const initiatingOffer  = useRef(false);   // prevent concurrent initiation
  const answerApplied    = useRef(false);   // answer applied to PC
  const appliedPatIce    = useRef(0);       // how many patient ICE candidates applied
  const iceFailedAt      = useRef<number | null>(null); // timestamp of ICE failure

  // Patient-side state
  const answerPosted    = useRef(false);   // answer successfully posted
  const processingOffer = useRef(false);   // prevent concurrent answer attempts
  const appliedDocIce   = useRef(0);       // how many doctor ICE candidates applied
  const lastOfferUfrag  = useRef<string | null>(null); // detect new offer sessions

  const pollTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const iceServersRef  = useRef<RTCIceServer[]>(STUN_SERVERS);

  useEffect(() => { streamReadyRef.current = streamReady; }, [streamReady]);

  // Fetch TURN credentials from server on mount (key never exposed to browser)
  useEffect(() => {
    fetch("/api/turn-credentials")
      .then(r => r.json())
      .then(({ servers }: { servers?: RTCIceServer[] }) => {
        if (servers?.length) {
          console.log(`[WebRTC] TURN servers loaded: ${servers.length} server(s)`);
          iceServersRef.current = [...STUN_SERVERS, ...servers];
        } else {
          console.warn("[WebRTC] No TURN servers configured — cross-network calls may fail");
        }
      })
      .catch(() => {});
  }, []);

  const [connState, setConnState]       = useState<ConnectionState>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // ── PC factory ────────────────────────────────────────────────────────────

  const createPC = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) {
        console.log(`[WebRTC] ${role}: ICE gathering complete`);
        return;
      }
      const c   = candidate.candidate;
      const typ = c.match(/typ (\w+)/)?.[1] ?? "?";
      const ip  = c.match(/(\d+\.\d+\.\d+\.\d+|[0-9a-f:]+) \d+ typ/)?.[1] ?? "?";
      console.log(`[WebRTC] ${role} ICE candidate: typ=${typ} ip=${ip}`);
      const t = role === "doctor" ? "ice-doctor" : "ice-patient";
      postSignal(appointmentId, t, candidate.toJSON()).catch(() => {});
    };

    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ${role}: ICE gathering state → ${pc.iceGatheringState}`);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ${role}: ICE connection state → ${pc.iceConnectionState}`);
    };

    pc.ontrack = ({ track }) => {
      console.log(`[WebRTC] ${role}: remote track received: ${track.kind}`);
      if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
      remoteStreamRef.current.addTrack(track);
      setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      console.log(`[WebRTC] ${role}: connection state → ${s}`);
      if (s === "connected") {
        setConnState("connected");
        iceFailedAt.current = null;  // clear any pending restart timer
      }
      if (s === "disconnected") setConnState("disconnected");
      if (s === "failed") {
        setConnState("failed");
        // Record failure time so the polling tick can schedule a restart
        if (iceFailedAt.current === null) {
          iceFailedAt.current = Date.now();
          console.log(`[WebRTC] ${role}: ICE failed — restart scheduled in 6s`);
        }
      }
    };

    return pc;
  }, [appointmentId, role]);

  const attachLocalTracks = useCallback((pc: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  }, [localStreamRef]);

  // ── Doctor: create offer ──────────────────────────────────────────────────

  const initiateAsDoctor = useCallback(async () => {
    if (offerPosted.current || initiatingOffer.current) return;
    initiatingOffer.current = true;
    setConnState("connecting");
    console.log("[WebRTC] Doctor: clearing signaling and creating new offer…");

    await postSignal(appointmentId, "clear", null);

    // Close any previous PC
    pcRef.current?.close();
    remoteStreamRef.current = null;

    const pc = createPC();
    pcRef.current = pc;

    const stream = localStreamRef.current;
    if (stream) {
      console.log(`[WebRTC] Doctor: attaching ${stream.getTracks().length} track(s):`, stream.getTracks().map(t => t.kind));
    } else {
      console.warn("[WebRTC] Doctor: localStream NULL when attaching tracks — no audio/video sent");
    }
    attachLocalTracks(pc);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log("[WebRTC] Doctor: setLocalDescription done, signalingState=", pc.signalingState);
      const ok = await postSignal(appointmentId, "offer", { type: offer.type, sdp: offer.sdp });
      if (ok) {
        offerPosted.current = true;
        console.log("[WebRTC] Doctor: offer posted to DB ✓");
      } else {
        console.error("[WebRTC] Doctor: offer post failed — will retry");
        pc.close();
        pcRef.current = null;
      }
    } catch (e) {
      console.error("[WebRTC] Doctor: createOffer failed:", e);
      pc.close();
      pcRef.current = null;
    } finally {
      initiatingOffer.current = false;
    }
  }, [appointmentId, createPC, attachLocalTracks, localStreamRef]);

  // ── Polling loop ──────────────────────────────────────────────────────────

  const tick = useCallback(async () => {
    // ── DOCTOR ───────────────────────────────────────────────────────────────
    if (role === "doctor") {
      // Auto-restart if ICE has been failed for > 6 seconds
      if (iceFailedAt.current && Date.now() - iceFailedAt.current > 6000) {
        console.log("[WebRTC] Doctor: 6s since ICE failure — restarting session");
        iceFailedAt.current = null;
        offerPosted.current = false;
        answerApplied.current = false;
        appliedPatIce.current = 0;
        setConnState("connecting");
        // initiateAsDoctor will run below on same tick
      }

      // Initiate if not yet done (also handles restart after reset above)
      if (!offerPosted.current && streamReadyRef.current) {
        await initiateAsDoctor();
        return; // let next tick apply answer + ICE
      }

      const sig = await getSignaling(appointmentId);
      if (!sig) return;

      const pc = pcRef.current;

      // Detect patientIce reset → patient posted a fresh answer (new ICE session)
      const patIce = sig.patientIce ?? [];
      if (patIce.length < appliedPatIce.current) {
        console.log("[WebRTC] Doctor: patientIce reset detected — resetting ICE counter");
        appliedPatIce.current = 0;
        // Only allow re-applying answer if PC hasn't applied one yet (not stable)
        if (!pc || pc.signalingState !== "stable") {
          console.log("[WebRTC] Doctor: PC not stable — also resetting answerApplied");
          answerApplied.current = false;
        }
      }

      // Apply answer
      if (sig.answer && !answerApplied.current && pc) {
        if (pc.signalingState === "stable") {
          // Already have an answer applied — skip silently (don't spam errors)
          answerApplied.current = true;
        } else {
          answerApplied.current = true;
          console.log("[WebRTC] Doctor: applying answer (signalingState=", pc.signalingState, ")");
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sig.answer as RTCSessionDescriptionInit));
            console.log("[WebRTC] Doctor: answer applied ✓ signalingState=", pc.signalingState);
          } catch (e) {
            console.error("[WebRTC] Doctor: setRemoteDescription(answer) failed:", e);
            answerApplied.current = false;
          }
        }
      }

      // Apply new patient ICE candidates
      const newPatIce = patIce.slice(appliedPatIce.current);
      if (newPatIce.length > 0) {
        console.log(`[WebRTC] Doctor: applying ${newPatIce.length} patient ICE candidate(s)`);
      }
      for (const c of newPatIce) {
        try {
          await pc?.addIceCandidate(new RTCIceCandidate(c as RTCIceCandidateInit));
          const cand = c as { candidate?: string };
          const typ  = cand.candidate?.match(/typ (\w+)/)?.[1] ?? "?";
          console.log(`[WebRTC] Doctor: added patient ICE typ=${typ}`);
        } catch (e) {
          console.warn("[WebRTC] Doctor: addIceCandidate(patient) failed:", e);
        }
      }
      appliedPatIce.current += newPatIce.length;
      return;
    }

    // ── PATIENT ──────────────────────────────────────────────────────────────
    if (role === "patient") {
      const sig = await getSignaling(appointmentId);
      if (!sig) return;

      // Auto-restart if ICE has been failed for > 6 seconds
      if (iceFailedAt.current && Date.now() - iceFailedAt.current > 6000) {
        console.log("[WebRTC] Patient: 6s since ICE failure — will re-answer if offer changes");
        iceFailedAt.current = null;
        // Patient can't restart unilaterally — doctor must post new offer first.
        // Reset answerPosted so we re-answer when the doctor's new offer arrives.
        answerPosted.current = false;
        appliedDocIce.current = 0;
        pcRef.current?.close();
        pcRef.current = null;
      }

      // Detect new offer (doctor restarted → new ICE session ufrag)
      if (sig.offer) {
        const ufrag = getIceUfrag((sig.offer as { sdp: string }).sdp);
        if (ufrag && ufrag !== lastOfferUfrag.current) {
          console.log(`[WebRTC] Patient: new offer detected (ufrag ${lastOfferUfrag.current} → ${ufrag}) — resetting session`);
          lastOfferUfrag.current = ufrag;
          answerPosted.current   = false;
          appliedDocIce.current  = 0;
          iceFailedAt.current    = null;
          pcRef.current?.close();
          pcRef.current = null;
        }
      }

      // Wait for local stream — ensures answer SDP is sendrecv (not recvonly)
      if (sig.offer && !answerPosted.current && !processingOffer.current && !streamReadyRef.current) {
        console.log("[WebRTC] Patient: offer ready but stream not yet — waiting…");
      }

      // Create & post answer
      if (sig.offer && !answerPosted.current && !processingOffer.current && streamReadyRef.current) {
        processingOffer.current = true;
        console.log("[WebRTC] Patient: creating answer…");

        pcRef.current?.close();
        // Clear old remote stream so stale ended tracks don't accumulate across restarts
        remoteStreamRef.current = null;
        setRemoteStream(null);
        const newPc = createPC();
        pcRef.current = newPc;

        const stream = localStreamRef.current;
        if (stream) {
          console.log(`[WebRTC] Patient: attaching ${stream.getTracks().length} track(s):`, stream.getTracks().map(t => t.kind));
        } else {
          console.warn("[WebRTC] Patient: localStream NULL — no audio/video sent");
        }
        attachLocalTracks(newPc);

        try {
          await newPc.setRemoteDescription(new RTCSessionDescription(sig.offer as RTCSessionDescriptionInit));
          console.log("[WebRTC] Patient: setRemoteDescription done, signalingState=", newPc.signalingState);
          const answer = await newPc.createAnswer();
          await newPc.setLocalDescription(answer);
          console.log("[WebRTC] Patient: setLocalDescription done, signalingState=", newPc.signalingState);
          const ok = await postSignal(appointmentId, "answer", { type: answer.type, sdp: answer.sdp });
          if (ok) {
            answerPosted.current = true;
            console.log("[WebRTC] Patient: answer posted ✓");
          } else {
            console.error("[WebRTC] Patient: answer post failed — will retry");
            newPc.close();
            pcRef.current = null;
          }
        } catch (e) {
          console.error("[WebRTC] Patient: answer creation failed:", e);
          newPc.close();
          pcRef.current = null;
        } finally {
          processingOffer.current = false;
        }
      }

      // Apply doctor ICE candidates
      const newDocIce = (sig.doctorIce ?? []).slice(appliedDocIce.current);
      if (newDocIce.length > 0) {
        console.log(`[WebRTC] Patient: applying ${newDocIce.length} doctor ICE candidate(s)`);
      }
      for (const c of newDocIce) {
        try {
          await pcRef.current?.addIceCandidate(new RTCIceCandidate(c as RTCIceCandidateInit));
          const cand = c as { candidate?: string };
          const typ  = cand.candidate?.match(/typ (\w+)/)?.[1] ?? "?";
          console.log(`[WebRTC] Patient: added doctor ICE typ=${typ}`);
        } catch (e) {
          console.warn("[WebRTC] Patient: addIceCandidate(doctor) failed:", e);
        }
      }
      appliedDocIce.current += newDocIce.length;
    }
  }, [appointmentId, role, createPC, attachLocalTracks, localStreamRef, initiateAsDoctor]);

  const startPolling = useCallback(() => {
    if (pollTimer.current) return;
    pollTimer.current = setInterval(() => { tick().catch(() => {}); }, 800);
  }, [tick]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  }, []);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Patient: poll immediately (offer might already be there)
  useEffect(() => {
    if (role !== "patient") return;
    startPolling();
    return stopPolling;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // Doctor: wait for camera/mic, then start polling (tick handles offer creation + restarts)
  useEffect(() => {
    if (role !== "doctor" || !streamReady) return;
    startPolling();
    return stopPolling;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, streamReady]);

  // ── Hangup ────────────────────────────────────────────────────────────────

  const hangup = useCallback(() => {
    stopPolling();
    pcRef.current?.close();
    pcRef.current = null;
    postSignal(appointmentId, "clear", null).catch(() => {});
    setConnState("disconnected");
  }, [appointmentId, stopPolling]);

  return { connState, remoteStream, hangup };
}
