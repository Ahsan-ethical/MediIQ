from google import genai
from dotenv import load_dotenv
import os
import time
import traceback

# =====================================================
# LOAD ENVIRONMENT VARIABLES
# =====================================================

env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
load_dotenv(env_path)

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError(
        f"GEMINI_API_KEY not found. Looked in: {os.path.abspath(env_path)}"
    )

# =====================================================
# CREATE CLIENT
# =====================================================

client = genai.Client(api_key=API_KEY)

# =====================================================
# GENERATE LARGE CONTEXT
# =====================================================

medical_chunk = """
Type 2 Diabetes Mellitus is a chronic metabolic disorder
characterized by insulin resistance and impaired glucose
regulation. Common symptoms include increased thirst,
frequent urination, fatigue, blurred vision, and slow wound
healing.

Management involves lifestyle modification, monitoring of
blood glucose levels, dietary changes, exercise, and
appropriate pharmacological therapy.

Potential complications include cardiovascular disease,
neuropathy, nephropathy, and retinopathy.

Patients should seek urgent medical attention if they
experience chest pain, severe shortness of breath,
loss of consciousness, or symptoms of diabetic ketoacidosis.
"""

# Simulate large RAG retrieval output
large_context = medical_chunk * 500

# =====================================================
# STATS
# =====================================================

char_count = len(large_context)
approx_tokens = int(char_count / 4)

print("\n" + "=" * 70)
print("GEMINI STRESS TEST")
print("=" * 70)

print(f"Characters: {char_count:,}")
print(f"Approx Tokens: {approx_tokens:,}")
print(f"Model: gemini-2.5-flash")

# =====================================================
# PROMPT
# =====================================================

prompt = f"""
You are a medical evidence summarization engine.

Analyze the following evidence and return STRICT JSON.

Required format:

{{
  "diseaseOverview": "...",
  "commonSymptoms": [],
  "riskFactors": [],
  "monitoring": [],
  "treatmentConsiderations": [],
  "redFlags": []
}}

Evidence:

{large_context}
"""

# =====================================================
# CALL GEMINI
# =====================================================

start_time = time.time()

try:

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt
    )

    elapsed = time.time() - start_time

    print("\n✅ SUCCESS")
    print(f"Response Time: {elapsed:.2f} sec")

    print("\nResponse Preview:")
    print("-" * 70)

    text = response.text

    if len(text) > 1500:
        print(text[:1500])
        print("\n...[TRUNCATED]...")
    else:
        print(text)

except Exception as e:

    elapsed = time.time() - start_time

    print("\n❌ FAILED")
    print(f"Elapsed Time: {elapsed:.2f} sec")

    print("\nError Type:")
    print(type(e).__name__)

    print("\nError Message:")
    print(str(e))

    print("\nFull Traceback:")
    traceback.print_exc()

print("\n" + "=" * 70)
print("TEST COMPLETE")
print("=" * 70)