/**
 * Single-port reverse proxy — combines FastAPI + Ollama behind one ngrok tunnel.
 *
 * Routing:
 *   /ollama/*  →  http://localhost:11434/*   (strips /ollama prefix)
 *   /*         →  http://localhost:8000/*    (everything else → FastAPI)
 *
 * Run:   node scripts/proxy.mjs
 * Then:  ngrok http 9000
 *
 * Set NEXT_PUBLIC_OLLAMA_URL=https://<your-ngrok>.ngrok-free.app/ollama
 * Set NEXT_PUBLIC_VITALS_API_URL=https://<your-ngrok>.ngrok-free.app
 */

import http from "node:http";

const FASTAPI_PORT = 8000;
const OLLAMA_PORT = 11434;
const PROXY_PORT = 9000;

function addCorsHeaders(res, req) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, ngrok-skip-browser-warning");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function proxy(req, res, targetPort, stripPrefix = "") {
  let path = req.url || "/";
  if (stripPrefix && path.startsWith(stripPrefix)) {
    path = path.slice(stripPrefix.length) || "/";
  }

  const options = {
    hostname: "127.0.0.1",
    port: targetPort,
    path,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
  };

  const upstream = http.request(options, (upRes) => {
    // Merge CORS headers with upstream response headers
    const headers = { ...upRes.headers };
    const origin = req.headers.origin || "*";
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-credentials"] = "true";
    res.writeHead(upRes.statusCode, headers);
    upRes.pipe(res);
  });

  upstream.on("error", (err) => {
    addCorsHeaders(res, req);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Upstream ${targetPort} unreachable: ${err.message}` }));
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  // Handle CORS preflight (OPTIONS) immediately
  if (req.method === "OPTIONS") {
    addCorsHeaders(res, req);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url?.startsWith("/ollama")) {
    proxy(req, res, OLLAMA_PORT, "/ollama");
  } else {
    proxy(req, res, FASTAPI_PORT);
  }
});

server.listen(PROXY_PORT, () => {
  console.log(`\nProxy listening on http://localhost:${PROXY_PORT} (CORS enabled)`);
  console.log(`  /ollama/*  →  localhost:${OLLAMA_PORT}`);
  console.log(`  /*         →  localhost:${FASTAPI_PORT}`);
  console.log(`\nNow run:  ngrok http ${PROXY_PORT}\n`);
});
