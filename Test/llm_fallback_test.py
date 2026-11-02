"""
LLM Fallback Chain Test
Gemini → DeepSeek (OpenRouter) → Qwen (OpenRouter) → Ollama (local)

Run: python Test/llm_fallback_test.py
"""

import os
import time
import json
import traceback
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
OPENROUTER_KEY = os.getenv("OPENROUTER_API_KEY", "")
OLLAMA_URL = "http://localhost:11434"

# ── Medical test prompt ──────────────────────────────────────────────────────

MEDICAL_CONTEXT = """
Patient: 54-year-old male with Type 2 Diabetes and Hypertension.
Known allergy: Penicillin.
Current medications: Metformin 500mg, Amlodipine 5mg, Telmisartan 40mg.
Booking symptoms: Itchy skin rash on arms after taking a sulfa antibiotic (Cotrimoxazole).

Relevant drug information:
- Cotrimoxazole (Co-trimoxazole) contains sulfamethoxazole, a sulfonamide antibiotic.
- Sulfonamide allergic reactions can cause skin rash, urticaria, and in severe cases Stevens-Johnson syndrome.
- Patients with penicillin allergy have a slightly elevated risk of sulfonamide sensitivity.
- Avoid NSAIDs in diabetic + hypertensive patients — use paracetamol for pain/fever.
- Levocetirizine 5mg or Cetirizine 10mg are safe antihistamines for allergic rash.
- Calamine lotion provides topical relief for itching.
- If rash spreads or breathing difficulty develops, this is a medical emergency.
"""

PROMPT = f"""You are a clinical evidence summarizer. Analyze the patient context below and return JSON with these keys:
- findings: key medical facts (array of strings)
- possibleDiagnoses: likely conditions (array of strings)
- redFlags: warnings and danger signs (array of strings)
- managementConsiderations: treatment approach (array of strings)
- clinicalInsights: intersection of symptoms × known conditions (array of strings)

Patient context:
{MEDICAL_CONTEXT}

Return ONLY valid JSON. No markdown, no backticks."""


# ── Provider functions ────────────────────────────────────────────────────────

def try_gemini():
    """Layer 1: Google Gemini 2.5 Flash"""
    from google import genai

    client = genai.Client(api_key=GEMINI_KEY)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=PROMPT,
    )
    return response.text


def try_openrouter(model_name: str, label: str):
    """Layer 2/3: OpenRouter (DeepSeek / Qwen)"""
    import urllib.request

    body = json.dumps({
        "model": model_name,
        "messages": [{"role": "user", "content": PROMPT}],
        "max_tokens": 2000,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENROUTER_KEY}",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "MediIQ Test",
        },
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    return data["choices"][0]["message"]["content"]


def try_deepseek():
    return try_openrouter("deepseek/deepseek-chat-v3-0324:free", "DeepSeek V3")


def try_qwen():
    return try_openrouter("qwen/qwen3-8b:free", "Qwen3 8B")


def try_ollama():
    """Layer 4: Local Ollama (qwen3:8b)"""
    import urllib.request

    body = json.dumps({
        "model": "qwen3:8b",
        "messages": [{"role": "user", "content": PROMPT}],
        "stream": False,
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
    )

    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    return data["message"]["content"]


# ── Fallback chain ────────────────────────────────────────────────────────────

CHAIN = [
    ("Gemini 2.5 Flash", try_gemini),
    ("DeepSeek V3 (OpenRouter)", try_deepseek),
    ("Qwen3 8B (OpenRouter)", try_qwen),
    ("Ollama qwen3:8b (local)", try_ollama),
]


def parse_json(text: str) -> dict | None:
    # strip markdown fences if present
    clean = text.strip()
    if clean.startswith("```"):
        clean = "\n".join(clean.split("\n")[1:])
        if "```" in clean:
            clean = clean[: clean.rfind("```")]

    import re
    match = re.search(r"\{[\s\S]*\}", clean)
    if match:
        return json.loads(match.group())
    return None


def main():
    print("\n" + "=" * 70)
    print("  LLM FALLBACK CHAIN TEST")
    print("  Gemini → DeepSeek → Qwen → Ollama")
    print("=" * 70)

    for i, (name, fn) in enumerate(CHAIN):
        layer = i + 1
        print(f"\n{'─' * 70}")
        print(f"  Layer {layer}: {name}")
        print(f"{'─' * 70}")

        start = time.time()
        try:
            raw = fn()
            elapsed = time.time() - start

            print(f"  ✅ SUCCESS in {elapsed:.2f}s")
            print(f"  Response length: {len(raw)} chars")

            parsed = parse_json(raw)
            if parsed:
                print(f"\n  Parsed JSON keys: {list(parsed.keys())}")
                for key, val in parsed.items():
                    if isinstance(val, list):
                        print(f"    {key}: {len(val)} items")
                        for item in val[:2]:
                            print(f"      - {str(item)[:120]}")
                    else:
                        print(f"    {key}: {str(val)[:120]}")
            else:
                print(f"\n  Raw response (first 500 chars):")
                print(f"  {raw[:500]}")

            print(f"\n  ✅ CHAIN STOPPED — Layer {layer} ({name}) succeeded")
            break

        except Exception as e:
            elapsed = time.time() - start
            print(f"  ❌ FAILED in {elapsed:.2f}s")
            print(f"  Error: {type(e).__name__}: {str(e)[:200]}")

            if i == len(CHAIN) - 1:
                print(f"\n  ❌ ALL LAYERS FAILED — no LLM available")
                traceback.print_exc()

    print("\n" + "=" * 70)
    print("  TEST COMPLETE")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
