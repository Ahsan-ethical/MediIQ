"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
} from "agora-rtc-sdk-ng";

export interface UseAgoraOptions {
  appointmentId: string;
  role:          "doctor" | "patient";
  localVideoRef: React.RefObject<HTMLElement | null>;
}

async function fetchAgoraToken(appointmentId: string) {
  console.log("[Agora] Fetching token for:", appointmentId);
  const res = await fetch(`/api/appointments/${appointmentId}/agora-token`);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[Agora] Token fetch failed:", res.status, errText);
    throw new Error("Failed to fetch Agora token");
  }
  const data = await res.json() as { token: string; appId: string; channel: string; uid: number };
  console.log("[Agora] Token received — channel:", data.channel, "uid:", data.uid, "appId:", data.appId.slice(0, 8) + "...");
  return data;
}

async function uploadForTranscription(appointmentId: string, blob: Blob): Promise<string> {
  try {
    console.log("[Agora] Uploading audio for transcription:", (blob.size / 1024).toFixed(0), "KB");
    const form = new FormData();
    form.append("audio", blob, "recording.webm");
    const res = await fetch(`/api/appointments/${appointmentId}/transcribe`, {
      method: "POST",
      body:   form,
    });
    const data = await res.json() as { transcript?: string };
    console.log("[Agora] Transcription result:", data.transcript?.length ?? 0, "chars");
    return data.transcript ?? "";
  } catch (err) {
    console.error("[Agora] Transcription upload failed:", err);
    return "";
  }
}

export function useAgora({ appointmentId, role, localVideoRef }: UseAgoraOptions) {
  const clientRef    = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef  = useRef<IMicrophoneAudioTrack | null>(null);
  const camTrackRef  = useRef<ICameraVideoTrack | null>(null);
  const joiningRef   = useRef(false);
  const mountIdRef   = useRef(Math.random().toString(36).slice(2, 6));

  const audioCtxRef    = useRef<AudioContext | null>(null);
  const recorderRef    = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const destRef        = useRef<MediaStreamAudioDestinationNode | null>(null);

  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [joined,      setJoined]      = useState(false);
  const [micOn,       setMicOnState]  = useState(true);
  const [camOn,       setCamOnState]  = useState(true);

  const mid = mountIdRef.current;

  // ── Recording helpers ─────────────────────────────────────────────────────

  const startRecording = useCallback((micTrack: IMicrophoneAudioTrack) => {
    if (role !== "doctor") return;
    try {
      console.log(`[Agora:${mid}] Starting audio recording`);
      const ctx  = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      audioCtxRef.current = ctx;
      destRef.current     = dest;
      const localStream = new MediaStream([micTrack.getMediaStreamTrack()]);
      ctx.createMediaStreamSource(localStream).connect(dest);
      const recorder = new MediaRecorder(dest.stream, { mimeType: "audio/webm" });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      console.log(`[Agora:${mid}] Audio recording started`);
    } catch (e) {
      console.error(`[Agora:${mid}] Failed to start recording:`, e);
    }
  }, [role, mid]);

  const connectRemoteAudio = useCallback((user: IAgoraRTCRemoteUser) => {
    if (role !== "doctor" || !user.audioTrack || !audioCtxRef.current || !destRef.current) return;
    try {
      console.log(`[Agora:${mid}] Connecting remote audio from uid ${user.uid} to recorder`);
      const remoteStream = new MediaStream([user.audioTrack.getMediaStreamTrack()]);
      audioCtxRef.current.createMediaStreamSource(remoteStream).connect(destRef.current);
    } catch (e) {
      console.error(`[Agora:${mid}] Failed to connect remote audio:`, e);
    }
  }, [role, mid]);

  // ── Join ──────────────────────────────────────────────────────────────────

  const join = useCallback(async () => {
    console.log(`[Agora:${mid}] join() called — joiningRef:${joiningRef.current} clientRef:${!!clientRef.current}`);

    if (joiningRef.current || clientRef.current) {
      console.log(`[Agora:${mid}] Join SKIPPED — already joining or joined`);
      return;
    }
    joiningRef.current = true;
    console.log(`[Agora:${mid}] Join START — role:${role}`);

    try {
      console.log(`[Agora:${mid}] Importing AgoraRTC SDK...`);
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      AgoraRTC.setLogLevel(3);
      console.log(`[Agora:${mid}] SDK imported, version:`, AgoraRTC.VERSION);

      const { token, appId, channel, uid } = await fetchAgoraToken(appointmentId);

      console.log(`[Agora:${mid}] Creating RTC client (mode:rtc, codec:vp8)`);
      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = client;

      // ── Connection state tracking ──────────────────────────────────────
      client.on("connection-state-change", (curState, prevState, reason) => {
        console.log(`[Agora:${mid}] Connection: ${prevState} → ${curState} (reason: ${reason})`);
      });

      client.on("exception", (event) => {
        console.error(`[Agora:${mid}] EXCEPTION:`, event.code, event.msg);
      });

      client.on("token-privilege-will-expire", () => {
        console.warn(`[Agora:${mid}] Token privilege will expire soon!`);
      });

      client.on("token-privilege-did-expire", () => {
        console.error(`[Agora:${mid}] Token privilege EXPIRED!`);
      });

      // ── Remote user events ─────────────────────────────────────────────
      client.on("user-published", async (user, mediaType) => {
        console.log(`[Agora:${mid}] >>> REMOTE user ${user.uid} PUBLISHED ${mediaType}`);
        try {
          await client.subscribe(user, mediaType);
          console.log(`[Agora:${mid}] Subscribed to ${user.uid} ${mediaType} OK`);
        } catch (subErr) {
          console.error(`[Agora:${mid}] Subscribe FAILED for ${user.uid} ${mediaType}:`, subErr);
          return;
        }
        if (mediaType === "video") {
          console.log(`[Agora:${mid}] Remote VIDEO ready for ${user.uid}: track=${!!user.videoTrack} isPlaying=${user.videoTrack?.isPlaying}`);
          setRemoteUsers(prev => {
            const next = prev.filter(u => u.uid !== user.uid);
            console.log(`[Agora:${mid}] setRemoteUsers: was ${prev.length}, now ${next.length + 1} (added video)`);
            return [...next, user];
          });
        }
        if (mediaType === "audio") {
          console.log(`[Agora:${mid}] Remote AUDIO ready for ${user.uid}: track=${!!user.audioTrack}`);
          user.audioTrack?.play();
          connectRemoteAudio(user);
          setRemoteUsers(prev => {
            const next = prev.filter(u => u.uid !== user.uid);
            console.log(`[Agora:${mid}] setRemoteUsers: was ${prev.length}, now ${next.length + 1} (added audio)`);
            return [...next, user];
          });
        }
      });

      client.on("user-unpublished", (user, mediaType) => {
        console.log(`[Agora:${mid}] <<< REMOTE user ${user.uid} UNPUBLISHED ${mediaType}`);
        if (mediaType === "video") {
          setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
        }
      });

      client.on("user-left", (user) => {
        console.log(`[Agora:${mid}] <<< REMOTE user ${user.uid} LEFT`);
        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
      });

      client.on("user-joined", (user) => {
        console.log(`[Agora:${mid}] >>> REMOTE user ${user.uid} JOINED channel`);
      });

      // ── Join channel ───────────────────────────────────────────────────
      console.log(`[Agora:${mid}] Joining channel: ${channel} uid: ${uid}`);
      await client.join(appId, channel, token, uid);
      console.log(`[Agora:${mid}] ✅ Joined channel successfully`);

      // ── Create local tracks ────────────────────────────────────────────
      console.log(`[Agora:${mid}] Creating local mic + cam tracks...`);
      const [micTrack, camTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
        {},
        { encoderConfig: "360p_7" },
      );
      micTrackRef.current = micTrack;
      camTrackRef.current = camTrack;
      console.log(`[Agora:${mid}] ✅ Local tracks created — mic:${!!micTrack} cam:${!!camTrack}`);
      console.log(`[Agora:${mid}] Cam track state: enabled=${camTrack.enabled} muted=${camTrack.muted} isPlaying=${camTrack.isPlaying}`);

      // ── Publish ────────────────────────────────────────────────────────
      console.log(`[Agora:${mid}] Publishing local tracks...`);
      await client.publish([micTrack, camTrack]);
      console.log(`[Agora:${mid}] ✅ Published local tracks`);

      // ── Play local video ───────────────────────────────────────────────
      if (localVideoRef.current) {
        localVideoRef.current.innerHTML = "";
        camTrack.play(localVideoRef.current);
        console.log(`[Agora:${mid}] ✅ Local video playing in container`);
      } else {
        console.warn(`[Agora:${mid}] localVideoRef null — retrying in 500ms`);
        setTimeout(() => {
          if (localVideoRef.current && camTrackRef.current) {
            localVideoRef.current.innerHTML = "";
            camTrackRef.current.play(localVideoRef.current);
            console.log(`[Agora:${mid}] ✅ Local video playing (retry)`);
          }
        }, 500);
      }

      startRecording(micTrack);

      setJoined(true);
      console.log(`[Agora:${mid}] ✅ FULLY JOINED — role:${role} channel:${channel} uid:${uid}`);
    } catch (e) {
      console.error(`[Agora:${mid}] ❌ JOIN FAILED:`, e);
      joiningRef.current = false;
    }
  }, [appointmentId, localVideoRef, startRecording, connectRemoteAudio, mid, role]);

  // ── Leave ─────────────────────────────────────────────────────────────────

  const leave = useCallback(async (): Promise<string> => {
    console.log(`[Agora:${mid}] leave() called — has client:${!!clientRef.current} has mic:${!!micTrackRef.current} has cam:${!!camTrackRef.current}`);
    let transcript = "";

    if (role === "doctor" && recorderRef.current && recorderRef.current.state !== "inactive") {
      console.log(`[Agora:${mid}] Stopping recorder...`);
      transcript = await new Promise<string>((resolve) => {
        const recorder = recorderRef.current!;
        recorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          audioChunksRef.current = [];
          if (blob.size > 0) {
            const t = await uploadForTranscription(appointmentId, blob);
            resolve(t);
          } else {
            console.log(`[Agora:${mid}] No audio recorded`);
            resolve("");
          }
        };
        recorder.stop();
      });
    }

    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    destRef.current     = null;

    if (micTrackRef.current) {
      console.log(`[Agora:${mid}] Stopping mic track`);
      micTrackRef.current.stop();
      micTrackRef.current.close();
      micTrackRef.current = null;
    }
    if (camTrackRef.current) {
      console.log(`[Agora:${mid}] Stopping cam track`);
      camTrackRef.current.stop();
      camTrackRef.current.close();
      camTrackRef.current = null;
    }

    if (clientRef.current) {
      console.log(`[Agora:${mid}] Leaving channel...`);
      try { await clientRef.current.leave(); } catch (e) { console.error(`[Agora:${mid}] Leave error:`, e); }
      clientRef.current = null;
      console.log(`[Agora:${mid}] Left channel`);
    }

    setJoined(false);
    setRemoteUsers([]);
    joiningRef.current = false;
    console.log(`[Agora:${mid}] ✅ Leave complete`);
    return transcript;
  }, [appointmentId, role, mid]);

  // ── Controls ──────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const track = micTrackRef.current;
    if (!track) { console.warn(`[Agora:${mid}] toggleMic — no track`); return; }
    const next = !micOn;
    track.setEnabled(next);
    setMicOnState(next);
    console.log(`[Agora:${mid}] Mic ${next ? "ON" : "OFF"}`);
  }, [micOn, mid]);

  const toggleCam = useCallback(() => {
    const track = camTrackRef.current;
    if (!track) { console.warn(`[Agora:${mid}] toggleCam — no track`); return; }
    const next = !camOn;
    track.setEnabled(next);
    setCamOnState(next);
    console.log(`[Agora:${mid}] Cam ${next ? "ON" : "OFF"}`);
  }, [camOn, mid]);

  // ── Auto-join on mount (delayed to survive StrictMode) ────────────────────

  useEffect(() => {
    console.log(`[Agora:${mid}] useEffect MOUNT — setting 200ms join timer`);
    const timer = setTimeout(() => {
      console.log(`[Agora:${mid}] Timer fired — calling join()`);
      join();
    }, 200);
    return () => {
      console.log(`[Agora:${mid}] useEffect CLEANUP — clearing timer + leaving`);
      clearTimeout(timer);
      leave();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { joined, remoteUsers, micOn, camOn, toggleMic, toggleCam, leave };
}
