import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// Returns TURN ICE server credentials to authenticated clients.
// Credentials are sourced from env vars so the API key is never exposed to the browser.
export async function GET() {
  // Only logged-in users can get TURN credentials
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const servers: RTCIceServer[] = [];

  // ── Option A: Metered.ca (recommended — free 50 GB/month) ──────────────────
  // Sign up at https://www.metered.ca/ → create app → copy API key + app name.
  // Add to Vercel env: METERED_API_KEY and METERED_APP_NAME
  const meteredKey = process.env.METERED_API_KEY;
  const meteredApp = process.env.METERED_APP_NAME;

  if (meteredKey && meteredApp) {
    try {
      const res = await fetch(
        `https://${meteredApp}.metered.live/api/v1/turn/credentials?apiKey=${meteredKey}`,
        { cache: "no-store" }   // credentials are time-limited; don't cache
      );
      if (res.ok) {
        const metered = await res.json() as RTCIceServer[];
        servers.push(...metered);
        return NextResponse.json({ servers });
      }
    } catch {
      // fall through to manual config
    }
  }

  // ── Option B: Manual TURN env vars (self-hosted coturn etc.) ───────────────
  // TURN_SERVER_URLS  = comma-separated URLs e.g. "turn:host:3478,turns:host:5349?transport=tcp"
  // TURN_USERNAME     = username
  // TURN_CREDENTIAL   = password / credential
  const turnUrls = process.env.TURN_SERVER_URLS;
  const turnUser = process.env.TURN_USERNAME;
  const turnCred = process.env.TURN_CREDENTIAL;

  if (turnUrls && turnUser && turnCred) {
    turnUrls.split(",").forEach(url => {
      servers.push({ urls: url.trim(), username: turnUser, credential: turnCred });
    });
  }

  return NextResponse.json({ servers });
}
