"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

let _socket: Socket | null = null;

function getSocket(): Socket {
  if (!_socket) {
    _socket = io(window.location.origin, {
      path: "/ws/",
      transports: ["websocket"],
      // Never reconnect — Vercel has no Socket.io server. Calling socket.connect()
      // after reconnectionAttempts=3 resets the counter and causes infinite retries.
      // With reconnection:false the socket gives up on first failure and stays quiet.
      // App works fine without it: WebRTC uses DB polling, call-end uses status polling.
      reconnection: false,
      timeout: 5000,
    });

    _socket.on("connect_error", () => {
      // Silently ignored — fallback polling handles everything
    });
  }
  return _socket;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    // Only connect once; don't retry if already permanently disconnected
    if (!socket.connected && !socket.disconnected) socket.connect();
    return () => {};
  }, []);

  return socketRef;
}
