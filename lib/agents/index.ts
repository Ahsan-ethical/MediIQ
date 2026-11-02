import type { AgentFn } from "./types";
import { runPatientSummaryAgent } from "./agent1";
import { runTranscribeAgent } from "./agent2";
import { runSimilarCasesAgent } from "./agent3";
import { runMedicalContextAgent } from "./agent4";
import { runAllergyContextAgent } from "./agent5";
import { runReasoningAgent } from "./agent6";
import { runDrugMedicAgent } from "./agent7";
import { runAllergyAgent } from "./agent8";
import { runFindingDetectorAgent } from "./agent9";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agentMap: Record<number, AgentFn<any, any>> = {
  1: runPatientSummaryAgent,
  2: runTranscribeAgent,
  3: runSimilarCasesAgent,
  4: runMedicalContextAgent,
  5: runAllergyContextAgent,
  6: runReasoningAgent,
  7: runDrugMedicAgent,
  8: runAllergyAgent,
  9: runFindingDetectorAgent,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAgentFn(agentId: number): AgentFn<any, any> | undefined {
  return agentMap[agentId];
}

export const PIPELINE_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9];
