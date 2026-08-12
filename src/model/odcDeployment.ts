import { ORBIT_GROUPS, ODC_NOMINAL_TOTAL, type OrbitGroupConfig } from "../data/odcGroups";
import { getComputeTier } from "../data/odcComputeSpec";
import type { LaunchScheduleEntry } from "./odcCapacity";
import { satsPerLaunch, type OdcCapacitySnapshot, type OdcCapacityTimeline } from "./odcCapacity";

export type DeploymentFillOrder = "altitude-asc" | "polar-first" | "proportional";

export interface GroupDeploymentState {
  byGroupId: Map<number, number>;
}

export interface YearDeploymentDelta {
  year: number;
  satsAdded: number;
  satsAttempted: number;
  satsCapped: number;
  snapshot: OdcCapacitySnapshot;
  groupAdds: Map<number, number>;
}

export interface OdcDeploymentSimulation {
  timeline: OdcCapacityTimeline;
  deployment: GroupDeploymentState;
  years: YearDeploymentDelta[];
  fillOrder: DeploymentFillOrder;
}

function minAltitudeKm(g: OrbitGroupConfig): number {
  return g.altitudeKm[0];
}

function isPolarGroup(g: OrbitGroupConfig): boolean {
  const inc = typeof g.inclinationDeg === "number" ? g.inclinationDeg : g.inclinationDeg[1];
  return inc > 85;
}

/** Groups in deployment priority order. */
export function orderedOdcGroups(fillOrder: DeploymentFillOrder): OrbitGroupConfig[] {
  const groups = [...ORBIT_GROUPS];
  if (fillOrder === "polar-first") {
    return groups.sort((a, b) => {
      const pa = isPolarGroup(a) ? 0 : 1;
      const pb = isPolarGroup(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return minAltitudeKm(a) - minAltitudeKm(b);
    });
  }
  if (fillOrder === "proportional") {
    return groups;
  }
  return groups.sort((a, b) => minAltitudeKm(a) - minAltitudeKm(b) || a.id - b.id);
}

export function emptyDeploymentState(): GroupDeploymentState {
  return { byGroupId: new Map(ORBIT_GROUPS.map((g) => [g.id, 0])) };
}

/** Allocate new satellites into groups up to each group's filing cap. */
export function allocateSatsToGroups(
  count: number,
  state: GroupDeploymentState,
  fillOrder: DeploymentFillOrder = "altitude-asc"
): Map<number, number> {
  const adds = new Map<number, number>();
  if (count <= 0) return adds;

  let remaining = count;
  const groups = orderedOdcGroups(fillOrder);

  if (fillOrder === "proportional") {
    let assigned = 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!;
      const deployed = state.byGroupId.get(g.id) ?? 0;
      const room = Math.max(0, g.maxSats - deployed);
      if (room <= 0) continue;

      const share =
        i === groups.length - 1
          ? count - assigned
          : Math.floor((count * g.maxSats) / ODC_NOMINAL_TOTAL);
      const add = Math.min(room, Math.max(0, share));
      if (add > 0) {
        adds.set(g.id, add);
        assigned += add;
      }
    }
    remaining = count - assigned;
  }

  for (const g of groups) {
    if (remaining <= 0) break;
    const deployed = state.byGroupId.get(g.id) ?? 0;
    const already = adds.get(g.id) ?? 0;
    const room = Math.max(0, g.maxSats - deployed - already);
    const take = Math.min(remaining, room);
    if (take > 0) {
      adds.set(g.id, already + take);
      remaining -= take;
    }
  }

  return adds;
}

function resolveSatsPerLaunch(entry: LaunchScheduleEntry): number {
  const satMassTon = entry.satMassTon ?? 1;
  return satsPerLaunch(entry.payloadTon, satMassTon);
}

function buildSnapshot(
  deployedSats: number,
  powerKw: number,
  computeTflops: number,
  computeKw: number
): OdcCapacitySnapshot {
  return {
    deployedSats,
    powerKw,
    powerGw: powerKw / 1e6,
    computeKw,
    computeTflops,
    computePflops: computeTflops / 1e3,
    computeEflops: computeTflops / 1e6,
    rubinMultiple: computeTflops / 950,
  };
}

/** Run launch schedule with cumulative capacity + per-group deployment tracking. */
export function simulateOdcDeployment(
  schedule: LaunchScheduleEntry[],
  options?: {
    throughYear?: number;
    fillOrder?: DeploymentFillOrder;
    maxSats?: number;
  }
): OdcDeploymentSimulation {
  const fillOrder = options?.fillOrder ?? "altitude-asc";
  const throughYear = options?.throughYear ?? Number.POSITIVE_INFINITY;
  const maxSats = options?.maxSats ?? ODC_NOMINAL_TOTAL;

  const deployment = emptyDeploymentState();
  const years: YearDeploymentDelta[] = [];

  const sorted = [...schedule].sort((a, b) => a.year - b.year);
  let deployedSats = 0;
  let powerKw = 0;
  let computeTflops = 0;
  let computeKw = 0;
  let totalCapped = 0;
  const byYear: OdcCapacityTimeline["byYear"] = [];

  for (const entry of sorted) {
    if (entry.year > throughYear) break;

    const satsEach = resolveSatsPerLaunch(entry);
    const attempted = entry.launches * satsEach;
    const room = Math.max(0, maxSats - deployedSats);
    const added = Math.min(attempted, room);
    const capped = attempted - added;
    totalCapped += capped;

    const groupAdds = allocateSatsToGroups(added, deployment, fillOrder);
    for (const [groupId, n] of groupAdds) {
      deployment.byGroupId.set(groupId, (deployment.byGroupId.get(groupId) ?? 0) + n);
    }

    const tier = getComputeTier(entry.tierId ?? "mini");
    const kwPerSat = entry.kwPerSat ?? tier.kwPerSat;
    const scale = tier.kwPerSat > 0 ? kwPerSat / tier.kwPerSat : 1;
    const computeKwEach = tier.computeKwPerSat * scale;
    const tflopsEach = tier.tflopsPerSat * scale;

    deployedSats += added;
    powerKw += added * kwPerSat;
    computeKw += added * computeKwEach;
    computeTflops += added * tflopsEach;

    const snapshot = buildSnapshot(deployedSats, powerKw, computeTflops, computeKw);
    byYear.push({ year: entry.year, snapshot });
    years.push({
      year: entry.year,
      satsAdded: added,
      satsAttempted: attempted,
      satsCapped: capped,
      snapshot,
      groupAdds,
    });
  }

  const totals =
    byYear.length > 0
      ? byYear[byYear.length - 1]!.snapshot
      : buildSnapshot(0, 0, 0, 0);

  return {
    timeline: { totals, byYear, satsCapped: totalCapped },
    deployment,
    years,
    fillOrder,
  };
}

export function formatGw(gw: number): string {
  if (gw >= 1) return `${gw.toFixed(2)} GW`;
  if (gw >= 1e-3) return `${(gw * 1000).toFixed(1)} MW`;
  return `${(gw * 1e6).toFixed(0)} kW`;
}

export function formatComputeTflops(tflops: number): string {
  if (tflops >= 1e9) return `${(tflops / 1e9).toFixed(2)} EFLOPS`;
  if (tflops >= 1e6) return `${(tflops / 1e6).toFixed(2)} PFLOPS`;
  if (tflops >= 1e3) return `${(tflops / 1e3).toFixed(1)} TFLOPS`;
  return `${tflops.toFixed(0)} TFLOPS`;
}

export function formatRubinMultiple(mult: number): string {
  if (mult >= 1000) return `${(mult / 1000).toFixed(1)}k× Rubin`;
  if (mult >= 10) return `${mult.toFixed(0)}× Rubin`;
  if (mult >= 1) return `${mult.toFixed(1)}× Rubin`;
  return `${mult.toFixed(2)}× Rubin`;
}

/** Snapshot at throughYear; if mid-year, uses end-of-year cumulative for that year. */
export function snapshotAtYear(
  sim: OdcDeploymentSimulation,
  throughYear: number
): OdcCapacitySnapshot {
  let snap = buildSnapshot(0, 0, 0, 0);
  for (const row of sim.timeline.byYear) {
    if (row.year > throughYear) break;
    snap = row.snapshot;
  }
  return snap;
}

export function yearDeltaAt(
  sim: OdcDeploymentSimulation,
  year: number
): YearDeploymentDelta | undefined {
  return sim.years.find((y) => y.year === year);
}
