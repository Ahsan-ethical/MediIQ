export function buildFeedbackSummary(fb: Record<string, unknown>): string {
  const mr = fb.medicineRatings as Array<{ medicine: string; helpful: string }> | undefined;
  return [
    fb.recoveryTime         && `Recovery: ${fb.recoveryTime}`,
    fb.overallEffectiveness && `Overall: ${fb.overallEffectiveness}`,
    fb.sideEffects          && `Side effects: ${fb.sideEffects}`,
    fb.courseCompleted      && `Course: ${fb.courseCompleted}`,
    fb.symptomsResolved     && `Symptoms now: ${fb.symptomsResolved}`,
    mr?.length              && `Medicines: ${mr.map(m => `${m.medicine} (${m.helpful})`).join(", ")}`,
    fb.revisitNeeded        && `Revisit: ${fb.revisitNeeded}`,
    fb.dosageExperience     && `Dosage: ${fb.dosageExperience}`,
    fb.careRating           && `Rating: ${fb.careRating}`,
    fb.additionalFeedback   && `Note: "${fb.additionalFeedback}"`,
  ].filter(Boolean).join(". ");
}
