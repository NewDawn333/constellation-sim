import { ORBIT_GROUPS, type OrbitGroupConfig } from "../data/odcGroups";
import type { OdcCapacitySnapshot } from "./odcCapacity";
import type { GroupDeploymentState, OdcDeploymentSimulation } from "./odcDeployment";
import { snapshotAtYear } from "./odcDeployment";

/** SSO polar shells — near-continuous sun (~99%). */
export const ODC_SSO_SUN_DUTY = 0.99;

/** ~30° inclined shells — partial eclipse season (~60–70%). */
export const ODC_INCLINED_SUN_DUTY = 0.65;

export function isOdcPolarGroup(g: OrbitGroupConfig): boolean {
  const inc = typeof g.inclinationDeg === "number" ? g.inclinationDeg : g.inclinationDeg[1];
  return inc > 85;
}

export function sunDutyForGroup(g: OrbitGroupConfig): number {
  return isOdcPolarGroup(g) ? ODC_SSO_SUN_DUTY : ODC_INCLINED_SUN_DUTY;
}

/** Fleet-weighted mean sun duty from deployed group counts. */
export function weightedSunDuty(deployment: GroupDeploymentState): number {
  let total = 0;
  let weighted = 0;
  for (const g of ORBIT_GROUPS) {
    const n = deployment.byGroupId.get(g.id) ?? 0;
    if (n <= 0) continue;
    total += n;
    weighted += n * sunDutyForGroup(g);
  }
  return total > 0 ? weighted / total : 0;
}

export interface GroupEffectiveCapacity {
  groupId: number;
  name: string;
  deployedSats: number;
  sunDuty: number;
  /** Nominal compute share (TFLOPS). */
  computeTflops: number;
  /** After sun-duty (TFLOPS). */
  effectiveComputeTflops: number;
}

export function groupEffectiveCapacities(
  snap: OdcCapacitySnapshot,
  deployment: GroupDeploymentState
): GroupEffectiveCapacity[] {
  if (snap.deployedSats <= 0) return [];
  const tflopsPerSat = snap.computeTflops / snap.deployedSats;
  return ORBIT_GROUPS.map((g) => {
    const deployedSats = deployment.byGroupId.get(g.id) ?? 0;
    if (deployedSats <= 0) {
      return {
        groupId: g.id,
        name: g.name,
        deployedSats: 0,
        sunDuty: sunDutyForGroup(g),
        computeTflops: 0,
        effectiveComputeTflops: 0,
      };
    }
    const computeTflops = deployedSats * tflopsPerSat;
    const duty = sunDutyForGroup(g);
    return {
      groupId: g.id,
      name: g.name,
      deployedSats,
      sunDuty: duty,
      computeTflops,
      effectiveComputeTflops: computeTflops * duty,
    };
  }).filter((row) => row.deployedSats > 0);
}

export function applySunDuty(snapshot: OdcCapacitySnapshot, duty: number): OdcCapacitySnapshot {
  if (duty <= 0) {
    return {
      ...snapshot,
      powerKw: 0,
      powerGw: 0,
      computeKw: 0,
      computeTflops: 0,
      computePflops: 0,
      computeEflops: 0,
      rubinMultiple: 0,
    };
  }
  return {
    ...snapshot,
    powerKw: snapshot.powerKw * duty,
    powerGw: snapshot.powerGw * duty,
    computeKw: snapshot.computeKw * duty,
    computeTflops: snapshot.computeTflops * duty,
    computePflops: snapshot.computePflops * duty,
    computeEflops: snapshot.computeEflops * duty,
    rubinMultiple: snapshot.rubinMultiple * duty,
  };
}

export function effectiveSnapshot(
  snap: OdcCapacitySnapshot,
  deployment: GroupDeploymentState
): OdcCapacitySnapshot {
  return applySunDuty(snap, weightedSunDuty(deployment));
}

export interface YearCapacityDelta {
  year: number;
  sats: number;
  powerGw: number;
  computeTflops: number;
  computePflops: number;
  rubinMultiple: number;
}

export function capacityDeltaSincePriorYear(
  sim: OdcDeploymentSimulation,
  year: number
): YearCapacityDelta {
  const curr = snapshotAtYear(sim, year);
  const prev = snapshotAtYear(sim, year - 1);
  return {
    year,
    sats: curr.deployedSats - prev.deployedSats,
    powerGw: curr.powerGw - prev.powerGw,
    computeTflops: curr.computeTflops - prev.computeTflops,
    computePflops: curr.computePflops - prev.computePflops,
    rubinMultiple: curr.rubinMultiple - prev.rubinMultiple,
  };
}

export function cappedSatsThroughYear(sim: OdcDeploymentSimulation, throughYear: number): number {
  return sim.years
    .filter((y) => y.year <= throughYear)
    .reduce((sum, y) => sum + y.satsCapped, 0);
}
