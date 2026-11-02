/**
 * Pre-computes RxClass allergy expansions on profile save.
 * Cached in PatientProfile.allergyExpansionCache so Agent 5 can skip API calls.
 */

import PatientProfile from "@/lib/models/PatientProfile";
import { connectDB } from "@/lib/mongodb";

const RXCLASS_BASE = "https://rxnav.nlm.nih.gov/REST/rxclass";

const ALLERGEN_TO_DRUG: Record<string, string> = {
  penicillin: "amoxicillin",
  sulfonamide: "sulfamethoxazole",
  sulfonamides: "sulfamethoxazole",
  sulfa: "sulfamethoxazole",
  cephalosporin: "cephalexin",
  cephalosporins: "cephalexin",
  nsaid: "ibuprofen",
  nsaids: "ibuprofen",
  aspirin: "aspirin",
  tetracycline: "doxycycline",
  fluoroquinolone: "ciprofloxacin",
  macrolide: "azithromycin",
};

async function rxFetch(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

interface CachedExpansion {
  allergen: string;
  drugClass: string | null;
  classId: string | null;
  avoidDrugs: string[];
  cachedAt: string;
}

async function expandOneAllergen(allergen: string): Promise<CachedExpansion> {
  const lower = allergen.toLowerCase();
  const lookupName = ALLERGEN_TO_DRUG[lower] ?? allergen;

  // Find class
  const data = await rxFetch(
    `${RXCLASS_BASE}/class/byDrugName.json?drugName=${encodeURIComponent(lookupName)}&relaSource=ATC`,
  ) as { rxclassDrugInfoList?: { rxclassDrugInfo?: Array<{ rxclassMinConceptItem?: { className?: string; classId?: string } }> } } | null;

  const entries = data?.rxclassDrugInfoList?.rxclassDrugInfo;
  if (!entries?.length) {
    return { allergen, drugClass: null, classId: null, avoidDrugs: [allergen], cachedAt: new Date().toISOString() };
  }

  const candidates = entries.map(e => e.rxclassMinConceptItem).filter((c): c is { className: string; classId: string } => !!c?.className && !!c?.classId);
  const preferred = candidates.find(c => /^[A-Z]\d{2}[A-Z]{1,2}$/i.test(c.classId) && !c.className.toLowerCase().includes("combination"));
  const classInfo = preferred ?? candidates[0];

  if (!classInfo) {
    return { allergen, drugClass: null, classId: null, avoidDrugs: [allergen], cachedAt: new Date().toISOString() };
  }

  // Get members
  const membersData = await rxFetch(
    `${RXCLASS_BASE}/classMembers.json?classId=${encodeURIComponent(classInfo.classId)}&relaSource=ATC`,
  ) as { drugMemberGroup?: { drugMember?: Array<{ minConcept?: { name?: string } }> } } | null;

  const members = membersData?.drugMemberGroup?.drugMember ?? [];
  const avoidDrugs = [...new Set(members.map(m => m.minConcept?.name).filter(Boolean) as string[])].slice(0, 30);

  return {
    allergen,
    drugClass: classInfo.className,
    classId: classInfo.classId,
    avoidDrugs: avoidDrugs.length ? avoidDrugs : [allergen],
    cachedAt: new Date().toISOString(),
  };
}

export async function preComputeAllergyExpansions(profileId: string): Promise<void> {
  await connectDB();
  const profile = await PatientProfile.findById(profileId).lean();
  if (!profile) return;

  const allergies = (profile.allergies ?? []) as string[];
  if (allergies.length === 0) return;

  console.log(`[AllergyCache] Pre-computing expansions for ${allergies.length} allergy(s)...`);

  const expansions = await Promise.all(allergies.map(a => expandOneAllergen(a)));

  await PatientProfile.findByIdAndUpdate(profileId, {
    allergyExpansionCache: {
      expansions,
      computedAt: new Date().toISOString(),
      allergyCount: allergies.length,
    },
  });

  console.log(`[AllergyCache] Cached ${expansions.length} expansion(s) for profile ${profileId}`);
}
