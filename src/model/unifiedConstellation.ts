import { ORBIT_GROUPS, isPolarGroup } from "../data/odcGroups";
import type { OrbitGroupConfig } from "../data/groupConfig";
import {
  buildRepresentativeSatBuffer,
  type RepresentativeSatBuffer,
} from "./representativeBuffer";
import {
  deployedSatsForShell,
  effectiveSatsPerLaunch,
  shellKey,
  type OdcLaunchPhysics,
} from "./odcManualLaunch";
import {
  buildOrbitalPlanes,
  type BuildParams,
  DEFAULT_BUILD_PARAMS,
  type OrbitalPlane,
} from "../orbits";

export interface ConstellationShell {
  groupId: number;
  shellIndex: number;
  physicalAltitudeKm: number;
  visualAltitudeKm: number;
  inclinationDeg: number;
  planes: OrbitalPlane[];
}

export interface ConstellationLayerEntry {
  config: OrbitGroupConfig;
  shells: ConstellationShell[];
}

/** Single source of truth for shells, planes, and satellites. */
export interface UnifiedConstellation {
  groups: OrbitGroupConfig[];
  layers: ConstellationLayerEntry[];
  planes: OrbitalPlane[];
  planesByGroup: Map<number, OrbitalPlane[]>;
  shellsByGroup: Map<number, ConstellationShell[]>;
  buildParams: BuildParams;
  /** ODC 1M representative GPU orbital-element buffers (group id → buffer). */
  gpuBuffers: Map<number, RepresentativeSatBuffer>;
}

export interface OdcBuildOptions {
  /** groupId → enabled shell indices. Omitted shells are not built. */
  enabledShellsByGroup?: Map<number, Set<number>>;
  /** Manual launch planner: physics + per-shell launch counts. */
  manualLaunch?: {
    physics: OdcLaunchPhysics;
    shellLaunches: Map<string, number>;
  };
}

export function buildUnifiedConstellation(
  groups: OrbitGroupConfig[],
  params: BuildParams = DEFAULT_BUILD_PARAMS,
  odcOptions: OdcBuildOptions = {}
): UnifiedConstellation {
  const layers: ConstellationLayerEntry[] = [];
  const planes: OrbitalPlane[] = [];
  const planesByGroup = new Map<number, OrbitalPlane[]>();
  const shellsByGroup = new Map<number, ConstellationShell[]>();
  const gpuBuffers = new Map<number, RepresentativeSatBuffer>();

  for (const g of groups) {
    const shellFilterProvided = odcOptions.enabledShellsByGroup !== undefined;
    const odcShells =
      g.layer === "odc" && shellFilterProvided
        ? odcOptions.enabledShellsByGroup!.get(g.id)
        : undefined;
    if (g.layer === "odc" && shellFilterProvided && (!odcShells || odcShells.size === 0)) {
      planesByGroup.set(g.id, []);
      shellsByGroup.set(g.id, []);
      layers.push({ config: g, shells: [] });
      continue;
    }

    const deployedSatsByShell = new Map<number, number>();
    let groupHasManualDeploy = false;
    if (g.layer === "odc" && odcOptions.manualLaunch && odcShells) {
      const spsl = effectiveSatsPerLaunch(odcOptions.manualLaunch.physics);
      for (const sh of odcShells) {
        const launches = odcOptions.manualLaunch.shellLaunches.get(shellKey(g.id, sh)) ?? 0;
        const deployed = deployedSatsForShell(g, launches, spsl);
        deployedSatsByShell.set(sh, deployed);
        if (deployed > 0) groupHasManualDeploy = true;
      }
    }

    const useGpuRepresentative =
      g.layer === "odc" &&
      params.odcRepresentativeMode &&
      !groupHasManualDeploy &&
      (!shellFilterProvided || (odcShells && odcShells.size > 0));

    const planeParams: BuildParams =
      g.layer === "odc" && useGpuRepresentative
        ? {
            ...params,
            tracksOnly: true,
            odcUncappedDensity: true,
            maxSatsPerPlaneCap: 0,
            enabledShellIndices: odcShells,
          }
        : g.layer === "odc"
          ? {
              ...params,
              odcUncappedDensity: true,
              maxSatsPerPlaneCap: 0,
              enabledShellIndices: odcShells,
              deployedSatsByShell: deployedSatsByShell.size > 0 ? deployedSatsByShell : undefined,
              manualSatsPerLaunch:
                deployedSatsByShell.size > 0
                  ? effectiveSatsPerLaunch(odcOptions.manualLaunch!.physics)
                  : undefined,
              odcManualLaunchExact: groupHasManualDeploy,
            }
          : {
              ...params,
              satLayout: g.satLayout,
              launchTrainSize: g.launchTrainSize,
              totalSats: g.maxSats,
            };

    const groupPlanes = buildOrbitalPlanes(
      g.id,
      g.altitudeKm,
      g.inclinationDeg,
      g.shells,
      g.planesPerShell,
      g.satsPerPlane,
      planeParams
    );
    planesByGroup.set(g.id, groupPlanes);
    planes.push(...groupPlanes);

    if (useGpuRepresentative) {
      gpuBuffers.set(
        g.id,
        buildRepresentativeSatBuffer(g, {
          ...params,
          odcUncappedDensity: true,
          maxSatsPerPlaneCap: 0,
          enabledShellIndices: odcShells,
        })
      );
    }

    const shells: ConstellationShell[] = [];
    for (let sh = 0; sh < g.shells; sh++) {
      const shellPlanes = groupPlanes.filter((p) => p.shellIndex === sh);
      if (shellPlanes.length === 0) continue;
      const ref = shellPlanes[0]!;
      shells.push({
        groupId: g.id,
        shellIndex: sh,
        physicalAltitudeKm: ref.physicalAltitudeKm,
        visualAltitudeKm: ref.altitudeKm,
        inclinationDeg: ref.inclinationDeg,
        planes: shellPlanes,
      });
    }
    shellsByGroup.set(g.id, shells);
    layers.push({ config: g, shells });
  }

  return { groups, layers, planes, planesByGroup, shellsByGroup, buildParams: params, gpuBuffers };
}

export type ConstellationModel = UnifiedConstellation;

export function buildConstellationModel(
  odcGroups: OrbitGroupConfig[] = ORBIT_GROUPS,
  starlinkGen1Groups: OrbitGroupConfig[] = [],
  starlinkGen2Groups: OrbitGroupConfig[] = [],
  params: BuildParams = DEFAULT_BUILD_PARAMS,
  odcOptions: OdcBuildOptions = {}
): UnifiedConstellation {
  return buildUnifiedConstellation(
    [...odcGroups, ...starlinkGen1Groups, ...starlinkGen2Groups],
    params,
    odcOptions
  );
}

export interface LayerStats {
  enabledGroups: number;
  totalGroups: number;
  visibleSats: number;
  nominalSats: number;
}

export interface TopologyStats {
  enabledGroups: number;
  totalGroups: number;
  totalPlanes: number;
  visibleSats: number;
  nominalSats: number;
}

export interface ConstellationStats {
  enabledGroups: number;
  totalShells: number;
  totalPlanes: number;
  visibleSats: number;
  nominalSats: number;
  altitudeSpanKm: [number, number] | null;
  odc: LayerStats;
  starlinkGen1: LayerStats;
  starlinkGen2: LayerStats;
  odcPolar: TopologyStats;
  odcInclined: TopologyStats;
}

export function computeStats(
  model: UnifiedConstellation,
  enabledGroupIds: Set<number>,
  enabledShellsByGroup?: Map<number, Set<number>>
): ConstellationStats {
  let totalShells = 0;
  let totalPlanes = 0;
  let visibleSats = 0;
  let nominalSats = 0;
  let altMin = Infinity;
  let altMax = -Infinity;

  const odc: LayerStats = { enabledGroups: 0, totalGroups: 0, visibleSats: 0, nominalSats: 0 };
  const starlinkGen1: LayerStats = { enabledGroups: 0, totalGroups: 0, visibleSats: 0, nominalSats: 0 };
  const starlinkGen2: LayerStats = { enabledGroups: 0, totalGroups: 0, visibleSats: 0, nominalSats: 0 };
  const odcPolar: TopologyStats = {
    enabledGroups: 0,
    totalGroups: 0,
    totalPlanes: 0,
    visibleSats: 0,
    nominalSats: 0,
  };
  const odcInclined: TopologyStats = {
    enabledGroups: 0,
    totalGroups: 0,
    totalPlanes: 0,
    visibleSats: 0,
    nominalSats: 0,
  };

  for (const g of model.groups) {
    const layerStats =
      g.layer === "odc" ? odc : g.layer === "starlink-gen1" ? starlinkGen1 : starlinkGen2;
    layerStats.totalGroups++;

    const topology = g.layer === "odc" ? (isPolarGroup(g) ? odcPolar : odcInclined) : null;
    if (topology) topology.totalGroups++;

    if (!enabledGroupIds.has(g.id)) continue;

    layerStats.enabledGroups++;
    if (topology) topology.enabledGroups++;

    const odcShells =
      g.layer === "odc" && enabledShellsByGroup
        ? enabledShellsByGroup.get(g.id)
        : undefined;
    const odcShellCount = g.layer === "odc" && odcShells ? odcShells.size : g.shells;
    const odcNominalOn =
      g.layer === "odc" && odcShells
        ? odcShellCount * g.planesPerShell * g.satsPerPlane
        : g.maxSats;

    totalShells += odcShellCount;
    nominalSats += odcNominalOn;
    layerStats.nominalSats += odcNominalOn;
    if (topology) topology.nominalSats += odcNominalOn;

    const groupPlanes = model.planesByGroup.get(g.id)!;
    totalPlanes += groupPlanes.length;
    if (topology) topology.totalPlanes += groupPlanes.length;
    for (const p of groupPlanes) {
      visibleSats += p.satellites.length;
      layerStats.visibleSats += p.satellites.length;
      if (topology) topology.visibleSats += p.satellites.length;
    }
    for (const p of groupPlanes) {
      altMin = Math.min(altMin, p.physicalAltitudeKm);
      altMax = Math.max(altMax, p.physicalAltitudeKm);
    }
  }

  return {
    enabledGroups: enabledGroupIds.size,
    totalShells,
    totalPlanes,
    visibleSats,
    nominalSats,
    altitudeSpanKm: enabledGroupIds.size ? [altMin, altMax] : null,
    odc,
    starlinkGen1,
    starlinkGen2,
    odcPolar,
    odcInclined,
  };
}

export {
  ORBIT_GROUPS,
  ODC_NOMINAL_TOTAL,
  ODC_POLAR_NOMINAL_TOTAL,
  ODC_INCLINED_NOMINAL_TOTAL,
  groupNominalBreakdown,
  groupLabel,
  formatInclination,
  isPolarGroup,
  isOdcGroup,
  isStarlinkGroup,
  isStarlinkGen1Group,
  isStarlinkGen2Group,
} from "../data/odcGroups";

export {
  STARLINK_GEN1_AUTHORIZED,
  STARLINK_GEN1_DEPLOYED_EXTRA,
  STARLINK_GEN1_NOMINAL_AUTHORIZED,
  STARLINK_GEN1_NOMINAL_DEPLOYED,
  starlinkGroupsForMode,
  starlinkShellLabel,
  type StarlinkDeploymentMode,
} from "../data/starlinkGen1";

export {
  STARLINK_GEN2_GRANTED,
  STARLINK_GEN2_APPLICATION,
  STARLINK_GEN2_FCC_TRANCHE_CAP,
  STARLINK_GEN2_NOMINAL_APPLICATION,
  STARLINK_GEN2_NOMINAL_GRANTED_MAX,
  GEN1_GEN2_ALTITUDE_GAP_KM,
  starlinkGen2GroupsForMode,
  starlinkGen2ShellLabel,
  type StarlinkGen2Mode,
  type StarlinkGen2Inc365,
} from "../data/starlinkGen2";

export {
  STARLINK_DEPLOYED_TOTAL,
  STARLINK_DEPLOYED_GEN1_TOTAL,
  STARLINK_DEPLOYED_GEN2_TOTAL,
  DEPLOYMENT_SNAPSHOT_DATE,
  DEPLOYMENT_SNAPSHOTS,
  deploymentSnapshotById,
  snapshotSourceSummary,
  reconcileDeploymentTotal,
  deployedShellsForSnapshot,
  starlinkGroupsForView,
  starlinkDeployedGroups,
  deployedShellLabel,
  type StarlinkViewMode,
  type DeploymentSnapshotMeta,
} from "../data/starlinkDeployed";

export type { OrbitGroupConfig } from "../data/groupConfig";
