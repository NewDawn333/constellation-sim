import { ODC_NOMINAL_TOTAL } from "../data/odcGroups";
import {
  DEFAULT_COMPUTE_TIER_ID,
  DEFAULT_SAT_MASS_TON,
  KW_PER_TONNE_FILING,
  RUBIN_TFLOPS_DR11,
  getComputeTier,
  tierTflopsPerKw,
  type OdcComputeTier,
  type OdcComputeTierId,
} from "../data/odcComputeSpec";

export interface LaunchScheduleEntry {
  year: number;
  /** Number of Starship launches in this calendar year. */
  launches: number;
  /** Payload mass per launch (tonnes). */
  payloadTon: number;
  /** Mass per satellite (tonnes). */
  satMassTon?: number;
  /** Electrical power per satellite (kW). Overrides tier default when set. */
  kwPerSat?: number;
  /** Compute tier for TFLOPS/sat assumptions. */
  tierId?: OdcComputeTierId;
}

export interface OdcCapacitySnapshot {
  deployedSats: number;
  powerKw: number;
  powerGw: number;
  computeKw: number;
  computeTflops: number;
  computePflops: number;
  computeEflops: number;
  rubinMultiple: number;
}

export interface OdcCapacityTimeline {
  totals: OdcCapacitySnapshot;
  /** Cumulative snapshot at end of each schedule year (sorted). */
  byYear: Array<{ year: number; snapshot: OdcCapacitySnapshot }>;
  /** Satellites not launched due to ODC filing cap. */
  satsCapped: number;
}

/** Satellites that fit in one launch given payload and per-sat mass. */
export function satsPerLaunch(payloadTon: number, satMassTon: number): number {
  if (payloadTon <= 0 || satMassTon <= 0) return 0;
  return Math.floor(payloadTon / satMassTon);
}

/** Total electrical power (MW) deployed on one launch. */
export function powerMwPerLaunch(
  payloadTon: number,
  satMassTon: number,
  kwPerSat: number
): number {
  const sats = satsPerLaunch(payloadTon, satMassTon);
  return (sats * kwPerSat) / 1000;
}

/** Filing-style power from launched tonne-mass (100 kW/t). */
export function powerMwFromPayloadTonnes(
  payloadTon: number,
  kwPerTonne: number = KW_PER_TONNE_FILING
): number {
  return (payloadTon * kwPerTonne) / 1000;
}

/** Sustained compute throughput from processor power budget. */
export function computeTflopsFromKw(powerKw: number, tflopsPerKw: number): number {
  if (powerKw <= 0 || tflopsPerKw <= 0) return 0;
  return powerKw * tflopsPerKw;
}

export function computeTflopsPerSat(
  tier: OdcComputeTier,
  kwPerSat?: number
): number {
  const electrical = kwPerSat ?? tier.kwPerSat;
  if (electrical <= 0) return 0;
  const computeKw =
    tier.kwPerSat > 0
      ? tier.computeKwPerSat * (electrical / tier.kwPerSat)
      : tier.computeKwPerSat;
  return computeTflopsFromKw(computeKw, tierTflopsPerKw(tier));
}

export function rubinMultiple(computeTflops: number, rubinTflops = RUBIN_TFLOPS_DR11): number {
  if (rubinTflops <= 0) return 0;
  return computeTflops / rubinTflops;
}

function buildSnapshot(
  deployedSats: number,
  powerKw: number,
  computeTflops: number,
  computeKw: number
): OdcCapacitySnapshot {
  const powerGw = powerKw / 1e6;
  const computePflops = computeTflops / 1e3;
  const computeEflops = computeTflops / 1e6;
  return {
    deployedSats,
    powerKw,
    powerGw,
    computeKw,
    computeTflops,
    computePflops,
    computeEflops,
    rubinMultiple: rubinMultiple(computeTflops),
  };
}

function resolveEntryParams(entry: LaunchScheduleEntry): {
  satMassTon: number;
  kwPerSat: number;
  tier: OdcComputeTier;
  satsEach: number;
  tflopsEach: number;
  computeKwEach: number;
} {
  const tier = getComputeTier(entry.tierId ?? DEFAULT_COMPUTE_TIER_ID);
  const satMassTon = entry.satMassTon ?? DEFAULT_SAT_MASS_TON;
  const kwPerSat = entry.kwPerSat ?? tier.kwPerSat;
  const satsEach = satsPerLaunch(entry.payloadTon, satMassTon);
  const scale = tier.kwPerSat > 0 ? kwPerSat / tier.kwPerSat : 1;
  const computeKwEach = tier.computeKwPerSat * scale;
  const tflopsEach = computeTflopsPerSat(tier, kwPerSat);
  return { satMassTon, kwPerSat, tier, satsEach, tflopsEach, computeKwEach };
}

/**
 * Cumulative ODC capacity after applying a multi-year launch schedule.
 * Respects filing cap (default 1,198,120 nominal slots).
 */
export function cumulativeCapacity(
  schedule: LaunchScheduleEntry[],
  options?: {
    maxSats?: number;
    throughYear?: number;
    initialDeployedSats?: number;
    initialPowerKw?: number;
    initialComputeTflops?: number;
    initialComputeKw?: number;
  }
): OdcCapacityTimeline {
  const maxSats = options?.maxSats ?? ODC_NOMINAL_TOTAL;
  const throughYear = options?.throughYear ?? Number.POSITIVE_INFINITY;

  let deployedSats = options?.initialDeployedSats ?? 0;
  let powerKw = options?.initialPowerKw ?? 0;
  let computeTflops = options?.initialComputeTflops ?? 0;
  let computeKw = options?.initialComputeKw ?? 0;
  let satsCapped = 0;

  const sorted = [...schedule].sort((a, b) => a.year - b.year);
  const byYear: OdcCapacityTimeline["byYear"] = [];

  for (const entry of sorted) {
    if (entry.year > throughYear) break;

    const { satsEach, tflopsEach, kwPerSat, computeKwEach } = resolveEntryParams(entry);
    const attempted = entry.launches * satsEach;
    const room = Math.max(0, maxSats - deployedSats);
    const added = Math.min(attempted, room);
    satsCapped += attempted - added;

    deployedSats += added;
    powerKw += added * kwPerSat;
    computeKw += added * computeKwEach;
    computeTflops += added * tflopsEach;

    byYear.push({
      year: entry.year,
      snapshot: buildSnapshot(deployedSats, powerKw, computeTflops, computeKw),
    });
  }

  return {
    totals: buildSnapshot(deployedSats, powerKw, computeTflops, computeKw),
    byYear,
    satsCapped,
  };
}

/** Full nominal constellation at a given compute tier (all filing slots filled). */
export function fullFleetCapacity(tierId: OdcComputeTierId = DEFAULT_COMPUTE_TIER_ID): OdcCapacitySnapshot {
  const tier = getComputeTier(tierId);
  const powerKw = ODC_NOMINAL_TOTAL * tier.kwPerSat;
  const computeKw = ODC_NOMINAL_TOTAL * tier.computeKwPerSat;
  const computeTflops = ODC_NOMINAL_TOTAL * tier.tflopsPerSat;
  return buildSnapshot(ODC_NOMINAL_TOTAL, powerKw, computeTflops, computeKw);
}

/** One calendar year of launches (e.g. 52 × weekly cadence). */
export function annualLaunchCapacity(
  launchesPerYear: number,
  payloadTon: number,
  satMassTon: number = DEFAULT_SAT_MASS_TON,
  kwPerSat: number = getComputeTier().kwPerSat,
  tierId?: OdcComputeTierId
): OdcCapacitySnapshot {
  const tier = getComputeTier(tierId ?? DEFAULT_COMPUTE_TIER_ID);
  const sats = launchesPerYear * satsPerLaunch(payloadTon, satMassTon);
  const powerKw = sats * kwPerSat;
  const computeKw = sats * tier.computeKwPerSat * (kwPerSat / tier.kwPerSat);
  const computeTflops = sats * computeTflopsPerSat(tier, kwPerSat);
  return buildSnapshot(sats, powerKw, computeTflops, computeKw);
}

/** Single launch capacity snapshot. */
export function singleLaunchCapacity(
  payloadTon: number,
  satMassTon: number = DEFAULT_SAT_MASS_TON,
  kwPerSat: number = getComputeTier().kwPerSat,
  tierId?: OdcComputeTierId
): OdcCapacitySnapshot {
  return annualLaunchCapacity(1, payloadTon, satMassTon, kwPerSat, tierId);
}
