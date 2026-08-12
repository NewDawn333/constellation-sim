/**
 * Published ODC / Starship / compute benchmarks for capacity modeling.
 * @see ODC_COMPUTE_PHASE_PLAN.md
 */

/** FCC filing system-level planning density (kW per tonne launched). */
export const KW_PER_TONNE_FILING = 100;

/** AI Sat Mini — Musk Austin 2026 presentation (kW for on-board AI processors). */
export const KW_PER_SAT_MINI = 100;

/** Future megawatt-class ODC satellite (roadmap). */
export const MW_PER_SAT_FUTURE = 1;

/** Starship LEO payload tiers (tonnes). Block 2 flown ~35 t; design reusable 100–150 t. */
export const STARSHIP_PAYLOAD_TON_BLOCK2 = 35;
export const STARSHIP_PAYLOAD_TON_REUSABLE = 100;
export const STARSHIP_PAYLOAD_TON_REUSABLE_MAX = 150;

/** Vera Rubin Observatory DR11 pipeline sustained processing (TFLOPS). */
export const RUBIN_TFLOPS_DR11 = 950;

/** Vera Rubin DR1 pipeline (TFLOPS). */
export const RUBIN_TFLOPS_DR1 = 150;

/** H100 SXM sparse FP16 peak ≈ 2.8 TFLOPS/W — reference only. */
export const H100_TFLOPS_PER_WATT_PEAK = 1979 / 700;

export type OdcComputeTierId = "pilot" | "mini" | "mini-optimistic" | "megawatt";

export interface OdcComputeTier {
  id: OdcComputeTierId;
  label: string;
  /** Total electrical budget per satellite (kW). */
  kwPerSat: number;
  /** Power allocated to processors (kW). */
  computeKwPerSat: number;
  /** Effective sustained FP16 tensor throughput (TFLOPS). */
  tflopsPerSat: number;
}

export const ODC_COMPUTE_TIERS: Record<OdcComputeTierId, OdcComputeTier> = {
  pilot: {
    id: "pilot",
    label: "Pilot (V3-class edge)",
    kwPerSat: 10,
    computeKwPerSat: 10,
    tflopsPerSat: 20,
  },
  mini: {
    id: "mini",
    label: "AI Sat Mini (default)",
    kwPerSat: KW_PER_SAT_MINI,
    computeKwPerSat: 50,
    tflopsPerSat: 100,
  },
  "mini-optimistic": {
    id: "mini-optimistic",
    label: "AI Sat Mini (optimistic)",
    kwPerSat: KW_PER_SAT_MINI,
    computeKwPerSat: 80,
    tflopsPerSat: 200,
  },
  megawatt: {
    id: "megawatt",
    label: "Future MW satellite",
    kwPerSat: MW_PER_SAT_FUTURE * 1000,
    computeKwPerSat: 700,
    tflopsPerSat: 1400,
  },
};

export const DEFAULT_COMPUTE_TIER_ID: OdcComputeTierId = "mini";

export function getComputeTier(id: OdcComputeTierId = DEFAULT_COMPUTE_TIER_ID): OdcComputeTier {
  return ODC_COMPUTE_TIERS[id];
}

/** TFLOPS/W implied by a tier's sustained assumptions. */
export function tierTflopsPerKw(tier: OdcComputeTier): number {
  if (tier.computeKwPerSat <= 0) return 0;
  return tier.tflopsPerSat / tier.computeKwPerSat;
}

/** Default satellite mass (tonnes) for launch packing — matches filing 100 kW/t @ 100 kW/sat. */
export const DEFAULT_SAT_MASS_TON = 1;

/** Launches per year for “one per week” reference scenario. */
export const LAUNCHES_PER_WEEK_REFERENCE = 52;
