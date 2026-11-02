"""
Ollama Qwen3 8B — Medical Summary Benchmark
Tests how well the local model performs on clinical summarization.

Prerequisites:
  1. Install Ollama: https://ollama.com/download
  2. Pull the model:  ollama pull qwen3:8b
  3. Ollama runs automatically after install (port 11434)

Run: python Test/ollama_benchmark.py
"""

import json
import time
import urllib.request

OLLAMA_URL = "http://localhost:11434"
MODEL = "qwen3:8b"

# ── Test cases (easy → hard) ─────────────────────────────────────────────────

TESTS = [
    {
        "name": "Simple: Common cold summary",
        "prompt": """Summarize this patient case in JSON with keys: diagnosis, severity, treatment, advice.

Patient: 28-year-old female, no known conditions.
Symptoms: Runny nose, mild sore throat, sneezing for 2 days.
No fever, no breathing difficulty.

Return ONLY valid JSON.""",
    },
    {
        "name": "Medium: Diabetic patient with infection",
        "prompt": """You are a clinical evidence summarizer. Return JSON with keys:
findings, possibleDiagnoses, redFlags, managementConsiderations, clinicalInsights.
Each key is an array of short bullet strings.

Patient: 54-year-old male, Type 2 Diabetes, Hypertension.
Allergies: Penicillin.
Current meds: Metformin 500mg, Amlodipine 5mg, Telmisartan 40mg.
Symptoms: Fever 101°F for 2 days, productive cough with yellow phlegm, body ache.

Key constraints:
- Avoid NSAIDs (diabetes + hypertension)
- Avoid penicillin-class antibiotics (allergy)
- Monitor blood sugar during infection (hyperglycemia expected)

Return ONLY valid JSON.""",
    },
    {
        "name": "Hard: Drug interaction analysis",
        "prompt": """You are a drug safety checker. Analyze these prescribed medications for a patient and return JSON with keys:
interactions (array of {drug1, drug2, severity, detail}),
contraindications (array of strings),
dosageFlags (array of strings),
overallSafe (boolean).

Patient: 54yo male, Type 2 Diabetes, Hypertension, Penicillin allergy.
Current medications: Metformin 500mg, Amlodipine 5mg, Telmisartan 40mg.
New prescription to check:
  - Azithromycin 500mg (antibiotic)
  - Paracetamol 650mg (antipyretic)
  - Ambroxol 30mg (mucolytic)
  - Cetirizine 10mg (antihistamine)

Check each new drug against current medications and patient conditions.
Return ONLY valid JSON.""",
    },
]


def call_ollama(prompt: str, think: bool = False) -> tuple[str, float]:
    """Call Ollama and return (response_text, elapsed_seconds)."""

    body = json.dumps({
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        **({"options": {"num_predict": 2000}} if not think else {}),
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
    )

    start = time.time()
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    elapsed = time.time() - start

    return data["message"]["content"], elapsed


def check_ollama():
    """Verify Ollama is running and model is available."""
    try:
        req = urllib.request.Request(f"{OLLAMA_URL}/api/tags")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        models = [m["name"] for m in data.get("models", [])]
        print(f"  Ollama is running. Available models: {', '.join(models)}")
        if not any(MODEL in m for m in models):
            print(f"\n  ⚠ Model '{MODEL}' not found! Run: ollama pull {MODEL}")
            return False
        return True
    except Exception as e:
        print(f"  ❌ Ollama not reachable at {OLLAMA_URL}")
        print(f"     Error: {e}")
        print(f"\n  To fix:")
        print(f"    1. Install Ollama: https://ollama.com/download")
        print(f"    2. Pull model:     ollama pull {MODEL}")
        print(f"    3. It starts automatically after install")
        return False


def parse_json(text: str) -> dict | None:
    import re
    clean = text.strip()
    if clean.startswith("```"):
        clean = "\n".join(clean.split("\n")[1:])
        if "```" in clean:
            clean = clean[: clean.rfind("```")]
    match = re.search(r"\{[\s\S]*\}", clean)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            return None
    return None


def main():
    print("\n" + "=" * 70)
    print(f"  OLLAMA BENCHMARK — {MODEL}")
    print(f"  Medical Summary Quality Test")
    print("=" * 70)

    if not check_ollama():
        return

    results = []

    for i, test in enumerate(TESTS):
        print(f"\n{'─' * 70}")
        print(f"  Test {i + 1}/3: {test['name']}")
        print(f"{'─' * 70}")

        try:
            raw, elapsed = call_ollama(test["prompt"])
            parsed = parse_json(raw)

            json_valid = parsed is not None
            key_count = len(parsed) if parsed else 0
            has_arrays = all(isinstance(v, (list, bool)) for v in parsed.values()) if parsed else False

            score = 0
            if json_valid:
                score += 40
            if key_count >= 3:
                score += 20
            if has_arrays:
                score += 20
            if elapsed < 30:
                score += 10
            if elapsed < 15:
                score += 10

            results.append({
                "name": test["name"],
                "elapsed": elapsed,
                "json_valid": json_valid,
                "keys": key_count,
                "score": score,
            })

            print(f"  Time: {elapsed:.1f}s")
            print(f"  JSON valid: {'✅' if json_valid else '❌'}")
            print(f"  Keys found: {key_count}")
            print(f"  Score: {score}/100")

            if parsed:
                print(f"\n  Output preview:")
                for key, val in list(parsed.items())[:3]:
                    if isinstance(val, list):
                        print(f"    {key}: {len(val)} items")
                        for item in val[:2]:
                            print(f"      - {str(item)[:100]}")
                    else:
                        print(f"    {key}: {str(val)[:100]}")
            else:
                print(f"\n  Raw (first 300 chars):")
                print(f"  {raw[:300]}")

        except Exception as e:
            results.append({
                "name": test["name"],
                "elapsed": 0,
                "json_valid": False,
                "keys": 0,
                "score": 0,
            })
            print(f"  ❌ FAILED: {e}")

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'=' * 70}")
    print(f"  BENCHMARK RESULTS — {MODEL}")
    print(f"{'=' * 70}")
    print(f"  {'Test':<40} {'Time':>6} {'JSON':>6} {'Score':>6}")
    print(f"  {'─' * 58}")
    for r in results:
        jmark = "✅" if r["json_valid"] else "❌"
        print(f"  {r['name']:<40} {r['elapsed']:>5.1f}s {jmark:>6} {r['score']:>5}/100")

    avg_score = sum(r["score"] for r in results) / len(results)
    avg_time = sum(r["elapsed"] for r in results) / len(results)
    print(f"  {'─' * 58}")
    print(f"  {'AVERAGE':<40} {avg_time:>5.1f}s        {avg_score:>5.0f}/100")

    if avg_score >= 80:
        print(f"\n  ✅ Ollama {MODEL} is GOOD for medical summarization")
    elif avg_score >= 50:
        print(f"\n  ⚠ Ollama {MODEL} is USABLE but may need prompt tuning")
    else:
        print(f"\n  ❌ Ollama {MODEL} struggles with structured medical output")

    print(f"\n{'=' * 70}\n")


if __name__ == "__main__":
    main()
