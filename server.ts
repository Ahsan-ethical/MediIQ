import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketServer } from "socket.io";

const dev  = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

const app    = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketServer(httpServer, {
    path: "/ws/",
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {

    // ── Waiting Room ─────────────────────────────────────────────────────────

    // Patient signals they are in the waiting room
    socket.on("waiting-room:enter", ({ appointmentId }: { appointmentId: string }) => {
      socket.join(`patient-waiting:${appointmentId}`);
      // Notify any doctor watching this appointment
      io.to(`doctor-watch:${appointmentId}`).emit("patient:waiting", { appointmentId });
    });

    socket.on("waiting-room:exit", ({ appointmentId }: { appointmentId: string }) => {
      socket.leave(`patient-waiting:${appointmentId}`);
      io.to(`doctor-watch:${appointmentId}`).emit("patient:left", { appointmentId });
    });

    // Doctor subscribes to waiting-room events for this appointment
    socket.on("doctor:watch", ({ appointmentId }: { appointmentId: string }) => {
      socket.join(`doctor-watch:${appointmentId}`);
    });

    // Doctor has joined the consultation page — notify waiting patient
    socket.on("call:doctor-ready", ({ appointmentId }: { appointmentId: string }) => {
      io.to(`patient-waiting:${appointmentId}`).emit("call:doctor-ready");
    });

    // ── Video Call Room ───────────────────────────────────────────────────────

    socket.on("call:join", ({ appointmentId, role }: { appointmentId: string; role: string }) => {
      socket.join(`call:${appointmentId}`);
      socket.data.role          = role;
      socket.data.appointmentId = appointmentId;
      socket.to(`call:${appointmentId}`).emit("call:peer-joined", { role });
    });

    // ── WebRTC Signalling ─────────────────────────────────────────────────────

    // Patient emits this after registering all WebRTC listeners — doctor only
    // creates the offer once this arrives, eliminating the race condition where
    // the offer reaches the patient before its onOffer handler is mounted.
    socket.on("call:ready", ({ appointmentId }: { appointmentId: string }) => {
      socket.to(`call:${appointmentId}`).emit("call:ready");
    });

    socket.on("call:offer", ({ appointmentId, offer }: { appointmentId: string; offer: object }) => {
      socket.to(`call:${appointmentId}`).emit("call:offer", { offer });
    });

    socket.on("call:answer", ({ appointmentId, answer }: { appointmentId: string; answer: object }) => {
      socket.to(`call:${appointmentId}`).emit("call:answer", { answer });
    });

    socket.on("call:ice", ({ appointmentId, candidate }: { appointmentId: string; candidate: object }) => {
      socket.to(`call:${appointmentId}`).emit("call:ice", { candidate });
    });

    // ── Transcript ────────────────────────────────────────────────────────────

    socket.on("transcript:line", ({
      appointmentId, role, text,
    }: { appointmentId: string; role: string; text: string }) => {
      // Broadcast to the other party so both sides see the live transcript
      socket.to(`call:${appointmentId}`).emit("transcript:line", { role, text });
    });

    // ── Call End ──────────────────────────────────────────────────────────────

    socket.on("call:end", ({ appointmentId }: { appointmentId: string }) => {
      socket.to(`call:${appointmentId}`).emit("call:ended");
    });

    // ── Appointment Cancelled by Doctor ───────────────────────────────────────

    socket.on("appointment:cancel", ({ appointmentId }: { appointmentId: string }) => {
      io.to(`patient-waiting:${appointmentId}`).emit("appointment:cancelled");
    });

    socket.on("disconnect", () => {
      const { appointmentId, role } = socket.data;
      if (appointmentId) {
        socket.to(`call:${appointmentId}`).emit("call:peer-disconnected", { role });
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`> MediIQ ready on http://localhost:${port}`);
  });
});
