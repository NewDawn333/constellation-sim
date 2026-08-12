import { ORBIT_GROUPS, type OrbitGroupConfig } from "../data/odcGroups";
import {
  DEFAULT_COMPUTE_TIER_ID,
  DEFAULT_SAT_MASS_TON,
  STARSHIP_PAYLOAD_TON_REUSABLE,
  getComputeTier,
  RUBIN_TFLOPS_DR11,
  type OdcComputeTierId,
} from "../data/odcComputeSpec";

export interface OdcLaunchPhysics {
  /** Starship LEO payload per launch (tonnes). */
  payloadTon: number;
  /** Satellite bus mass (tonnes). */
  satMassTon: number;
  /** Solar / electrical generating capacity per sat (MW). */
  powerMwPerSat: number;
  /** When set, overrides floor(payloadTon / satMassTon). */
  satsPerLaunchOverride?: number;
}

export interface ManualShellDeploy {
  groupId: number;
  shellIndex: number;
  launches: number;
  deployedSats: number;
  powerMw: number;
  computeTflops: number;
}

export interface ManualFleetCapacity {
  totalLaunches: number;
  deployedSats: number;
  powerMw: number;
  powerGw: number;
  computeTflops: number;
  computePflops: number;
  rubinMultiple: number;
  shells: ManualShellDeploy[];
}

export const DEFAULT_ODC_LAUNCH_PHYSICS: OdcLaunchPhysics = {
  payloadTon: STARSHIP_PAYLOAD_TON_REUSABLE,
  satMassTon: DEFAULT_SAT_MASS_TON,
  powerMwPerSat: 0.1,
};

export function derivedSatsPerLaunch(physics: OdcLaunchPhysics): number {
  if (physics.satMassTon <= 0) return 0;
  return Math.floor(physics.payloadTon / physics.satMassTon);
}

export function effectiveSatsPerLaunch(physics: OdcLaunchPhysics): number {
  const override = physics.satsPerLaunchOverride;
  if (override != null && override > 0) return Math.floor(override);
  return derivedSatsPerLaunch(physics);
}

export function shellNominalSats(g: OrbitGroupConfig): number {
  return g.planesPerShell * g.satsPerPlane;
}

export function maxLaunchesForShell(g: OrbitGroupConfig, satsPerLaunch: number): number {
  if (satsPerLaunch <= 0) return 0;
  return Math.ceil(shellNominalSats(g) / satsPerLaunch);
}

export function deployedSatsForShell(
  g: OrbitGroupConfig,
  launches: number,
  satsPerLaunch: number
): number {
  if (launches <= 0 || satsPerLaunch <= 0) return 0;
  return Math.min(shellNominalSats(g), launches * satsPerLaunch);
}

export function shellKey(groupId: number, shellIndex: number): string {
  return `${groupId}:${shellIndex}`;
}

export function parseShellKey(key: string): { groupId: number; shellIndex: number } | null {
  const [a, b] = key.split(":");
  const groupId = Number(a);
  const shellIndex = Number(b);
  if (!Number.isFinite(groupId) || !Number.isFinite(shellIndex)) return null;
  return { groupId, shellIndex };
}

function perSatCapacity(physics: OdcLaunchPhysics, tierId: OdcComputeTierId = DEFAULT_COMPUTE_TIER_ID) {
  const tier = getComputeTier(tierId);
  const kw = physics.powerMwPerSat * 1000;
  const scale = tier.kwPerSat > 0 ? kw / tier.kwPerSat : 1;
  return {
    powerKw: kw,
    computeKw: tier.computeKwPerSat * scale,
    computeTflops: tier.tflopsPerSat * scale,
  };
}

export function manualFleetCapacity(
  physics: OdcLaunchPhysics,
  shellLaunches: Map<string, number>,
  enabledShells: Map<number, Set<number>>,
  tierId: OdcComputeTierId = DEFAULT_COMPUTE_TIER_ID
): ManualFleetCapacity {
  const spsl = effectiveSatsPerLaunch(physics);
  const perSat = perSatCapacity(physics, tierId);
  const shells: ManualShellDeploy[] = [];
  let totalLaunches = 0;
  let deployedSats = 0;
  let powerKw = 0;
  let computeTflops = 0;

  for (const g of ORBIT_GROUPS) {
    const enabled = enabledShells.get(g.id);
    if (!enabled || enabled.size === 0) continue;
    for (const sh of enabled) {
      const launches = shellLaunches.get(shellKey(g.id, sh)) ?? 0;
      if (launches <= 0) continue;
      const deployed = deployedSatsForShell(g, launches, spsl);
      totalLaunches += launches;
      deployedSats += deployed;
      const shellPowerKw = deployed * perSat.powerKw;
      const shellTflops = deployed * perSat.computeTflops;
      powerKw += shellPowerKw;
      computeTflops += shellTflops;
      shells.push({
        groupId: g.id,
        shellIndex: sh,
        launches,
        deployedSats: deployed,
        powerMw: shellPowerKw / 1000,
        computeTflops: shellTflops,
      });
    }
  }

  const powerGw = powerKw / 1e6;
  return {
    totalLaunches,
    deployedSats,
    powerMw: powerKw / 1000,
    powerGw,
    computeTflops,
    computePflops: computeTflops / 1e3,
    rubinMultiple: computeTflops / RUBIN_TFLOPS_DR11,
    shells,
  };
}

/** Per-shell deployed nominal sat counts indexed by shell index within group. */
export function manualDeployedByShellIndex(
  g: OrbitGroupConfig,
  physics: OdcLaunchPhysics,
  shellLaunches: Map<string, number>
): Float32Array {
  const out = new Float32Array(Math.max(g.shells, 1));
  const spsl = effectiveSatsPerLaunch(physics);
  for (let sh = 0; sh < g.shells; sh++) {
    const launches = shellLaunches.get(shellKey(g.id, sh)) ?? 0;
    out[sh] = deployedSatsForShell(g, launches, spsl);
  }
  return out;
}

export function manualLaunchActive(shellLaunches: Map<string, number>): boolean {
  for (const n of shellLaunches.values()) {
    if (n > 0) return true;
  }
  return false;
}
