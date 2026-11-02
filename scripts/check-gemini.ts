import { GoogleGenerativeAI } from "@google/generative-ai";

const key = process.env.GEMINI_API_KEY;
if (!key) { console.error("GEMINI_API_KEY not set"); process.exit(1); }

const genAI = new GoogleGenerativeAI(key);

// Models visible in the raw /models list — try all naming variants
const CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-flash-latest",
  "gemini-pro-latest",
  "gemini-2.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-3.1-flash-lite-preview",
  "models/gemini-2.5-flash",    // with models/ prefix
  "models/gemini-flash-latest",
];

const EMBEDDING_CANDIDATES = [
  "gemini-embedding-001",
  "gemini-embedding-2",
  "gemini-embedding-2-preview",
  "text-embedding-004",
];

async function testModel(name: string): Promise<boolean> {
  try {
    const model  = genAI.getGenerativeModel({ model: name });
    const result = await model.generateContent("Reply with just: OK");
    const text   = result.response.text().trim();
    console.log(`  ✅  ${name}  →  "${text.slice(0, 40)}"`);
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ❌  ${name}  →  ${msg}`);
    return false;
  }
}

async function testEmbedding(name: string): Promise<boolean> {
  try {
    const model  = genAI.getGenerativeModel({ model: name });
    const result = await model.embedContent("test");
    const dims   = result.embedding.values.length;
    console.log(`  ✅  ${name}  →  ${dims} dimensions`);
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message.split("\n")[0].slice(0, 80) : String(e);
    console.log(`  ❌  ${name}  →  ${msg}`);
    return false;
  }
}

async function main() {
  // Sanity-check the API key with a raw HTTP call first
  console.log("\n── API key probe (raw fetch) ───────────────────────");
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    const res  = await fetch(url);
    const body = await res.json() as { models?: { name: string }[]; error?: { message: string } };
    if (body.error) {
      console.log(`  ❌  Key check failed: ${body.error.message}`);
    } else {
      const names = (body.models ?? []).map((m) => m.name);
      console.log(`  ✅  Key valid — ${names.length} models visible`);
      console.log("  Available models:");
      names.forEach(n => console.log(`     ${n}`));
    }
  } catch (e) {
    console.log(`  ❌  Raw fetch error: ${e}`);
  }

  // Also try raw generateContent via v1 and v1alpha to find working API version
  console.log("\n── Raw HTTP version probe (gemini-2.5-flash) ───────");
  for (const apiVer of ["v1beta", "v1", "v1alpha"]) {
    try {
      const url = `https://generativelanguage.googleapis.com/${apiVer}/models/gemini-2.5-flash:generateContent?key=${key}`;
      const res  = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ contents: [{ parts: [{ text: "Say OK" }] }] }),
      });
      const body = await res.json() as { candidates?: unknown[]; error?: { message: string } };
      if (body.error) {
        console.log(`  ❌  ${apiVer}  →  ${body.error.message.slice(0, 90)}`);
      } else {
        console.log(`  ✅  ${apiVer}  →  works!  USE THIS VERSION`);
      }
    } catch (e) {
      console.log(`  ❌  ${apiVer}  →  fetch error: ${e}`);
    }
  }

  console.log("\n── Generation models (via SDK) ────────────────────");
  let firstWorking = "";
  for (const name of CANDIDATES) {
    const ok = await testModel(name);
    if (ok && !firstWorking) firstWorking = name;
  }

  console.log("\n── Embedding models ───────────────────────────────");
  let firstEmbedding = "";
  for (const name of EMBEDDING_CANDIDATES) {
    const ok = await testEmbedding(name);
    if (ok && !firstEmbedding) firstEmbedding = name;
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log(`Best generation model : ${firstWorking  || "NONE FOUND"}`);
  console.log(`Best embedding model  : ${firstEmbedding || "NONE FOUND"}`);
  console.log("══════════════════════════════════════════════════\n");
}

main();
