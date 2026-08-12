import * as THREE from "three";
import { ODC_NOMINAL_TOTAL, ORBIT_GROUPS, type OrbitGroupConfig } from "../data/odcGroups";
import type { LaunchScheduleEntry } from "./odcCapacity";
import {
  allocateSatsToGroups,
  emptyDeploymentState,
  type DeploymentFillOrder,
} from "./odcDeployment";
import { representativeDisplaySatsPerPlane } from "./representativeBuffer";
import type { BuildParams } from "../orbits";

export interface GroupNominalDeployMaps {
  /** Deploy year per nominal slot (0 = not deployed). Length = group.maxSats. */
  deployYear: Uint16Array;
  /** Fleet-wide deploy sequence (1..N), 0 = not deployed. */
  deployOrdinal: Uint32Array;
}

export interface GroupDisplayDeployAttributes {
  groupId: number;
  deployYear: Float32Array;
  deployOrdinal: Float32Array;
  minYear: number;
  maxYear: number;
}

/** Nominal slot index: shell → plane → along-track. */
export function nominalSlotIndex(
  g: OrbitGroupConfig,
  shellIndex: number,
  planeIndex: number,
  satIndex: number
): number {
  return shellIndex * g.planesPerShell * g.satsPerPlane + planeIndex * g.satsPerPlane + satIndex;
}

/** Replay launch schedule → per-group nominal deploy year + fleet ordinal. */
export function buildNominalDeployMaps(
  schedule: LaunchScheduleEntry[],
  fillOrder: DeploymentFillOrder
): Map<number, GroupNominalDeployMaps> {
  const maps = new Map<number, GroupNominalDeployMaps>();
  for (const g of ORBIT_GROUPS) {
    maps.set(g.id, {
      deployYear: new Uint16Array(g.maxSats),
      deployOrdinal: new Uint32Array(g.maxSats),
    });
  }

  const state = emptyDeploymentState();
  let totalDeployed = 0;
  let fleetOrdinal = 0;

  const sorted = [...schedule].sort((a, b) => a.year - b.year);
  for (const entry of sorted) {
    const tierSatMass = entry.satMassTon ?? 1;
    const satsEach = Math.floor(entry.payloadTon / tierSatMass);
    const attempted = entry.launches * satsEach;
    const room = Math.max(0, ODC_NOMINAL_TOTAL - totalDeployed);
    const added = Math.min(attempted, room);
    if (added <= 0) break;

    const groupAdds = allocateSatsToGroups(added, state, fillOrder);

    for (const [groupId, n] of groupAdds) {
      const map = maps.get(groupId)!;
      let cursor = state.byGroupId.get(groupId) ?? 0;
      for (let i = 0; i < n; i++) {
        if (cursor >= map.deployYear.length) break;
        fleetOrdinal++;
        map.deployYear[cursor] = entry.year;
        map.deployOrdinal[cursor] = fleetOrdinal;
        cursor++;
      }
      state.byGroupId.set(groupId, cursor);
    }
    totalDeployed += added;
  }

  return maps;
}

/** Map nominal deploy data → GPU display buffer order (matches buildRepresentativeSatBuffer). */
export function buildDisplayDeployAttributes(
  g: OrbitGroupConfig,
  params: BuildParams,
  nominal: GroupNominalDeployMaps
): GroupDisplayDeployAttributes | null {
  const divisor = params.sampleDivisor;
  const visPerPlane = representativeDisplaySatsPerPlane(g.satsPerPlane, divisor);
  const enabledShells = params.enabledShellIndices;
  const nominalStride = Math.max(1, Math.floor(g.satsPerPlane / visPerPlane));

  let displayCount = 0;
  for (let sh = 0; sh < g.shells; sh++) {
    if (enabledShells && !enabledShells.has(sh)) continue;
    displayCount += g.planesPerShell * visPerPlane;
  }
  if (displayCount <= 0) return null;

  const deployYear = new Float32Array(displayCount);
  const deployOrdinal = new Float32Array(displayCount);
  let minYear = Number.POSITIVE_INFINITY;
  let maxYear = 0;

  let idx = 0;
  for (let sh = 0; sh < g.shells; sh++) {
    if (enabledShells && !enabledShells.has(sh)) continue;
    for (let pl = 0; pl < g.planesPerShell; pl++) {
      for (let s = 0; s < visPerPlane; s++) {
        const satIdx = s * nominalStride;
        const ord = nominalSlotIndex(g, sh, pl, satIdx);
        const year = nominal.deployYear[ord] ?? 0;
        const seq = nominal.deployOrdinal[ord] ?? 0;
        deployYear[idx] = year;
        deployOrdinal[idx] = seq;
        if (year > 0) {
          minYear = Math.min(minYear, year);
          maxYear = Math.max(maxYear, year);
        }
        idx++;
      }
    }
  }

  if (!Number.isFinite(minYear)) minYear = 0;

  return {
    groupId: g.id,
    deployYear,
    deployOrdinal,
    minYear,
    maxYear,
  };
}

export function buildAllDisplayDeployAttributes(
  params: BuildParams,
  nominalMaps: Map<number, GroupNominalDeployMaps>
): Map<number, GroupDisplayDeployAttributes> {
  const out = new Map<number, GroupDisplayDeployAttributes>();
  for (const g of ORBIT_GROUPS) {
    const nominal = nominalMaps.get(g.id);
    if (!nominal) continue;
    const attrs = buildDisplayDeployAttributes(g, params, nominal);
    if (attrs) out.set(g.id, attrs);
  }
  return out;
}

/** Fleet-wide max deploy ordinal visible at or before simYear. */
export function maxDeployOrdinalThroughYear(
  attrs: Map<number, GroupDisplayDeployAttributes>,
  simYear: number
): number {
  let max = 0;
  for (const g of attrs.values()) {
    for (let i = 0; i < g.deployYear.length; i++) {
      const y = g.deployYear[i]!;
      const o = g.deployOrdinal[i]!;
      if (y > 0 && y <= simYear && o > max) max = o;
    }
  }
  return max;
}

export function globalDeployYearRange(
  attrs: Map<number, GroupDisplayDeployAttributes>
): { minYear: number; maxYear: number } {
  let minYear = Number.POSITIVE_INFINITY;
  let maxYear = 0;
  for (const g of attrs.values()) {
    if (g.minYear > 0) minYear = Math.min(minYear, g.minYear);
    if (g.maxYear > 0) maxYear = Math.max(maxYear, g.maxYear);
  }
  if (!Number.isFinite(minYear)) minYear = 2028;
  if (maxYear <= 0) maxYear = minYear;
  return { minYear, maxYear };
}

export function buildOdcDisplayDeployAttributes(
  schedule: LaunchScheduleEntry[],
  fillOrder: DeploymentFillOrder,
  params: BuildParams
): Map<number, GroupDisplayDeployAttributes> {
  const nominal = buildNominalDeployMaps(schedule, fillOrder);
  return buildAllDisplayDeployAttributes(params, nominal);
}

/** Year color: cool (old) → warm (new) in HSL. */
export function deployYearColor(
  year: number,
  minYear: number,
  maxYear: number,
  baseColor: number
): number {
  if (year <= 0 || maxYear <= minYear) return baseColor;
  const t = (year - minYear) / (maxYear - minYear);
  const base = new THREE.Color(baseColor);
  const hue = 0.55 - t * 0.45;
  const sat = 0.55 + t * 0.35;
  const lit = 0.45 + t * 0.25;
  return new THREE.Color().setHSL(hue, sat, lit).lerp(base, 0.15).getHex();
}
