import * as THREE from "three";
import type { OrbitGroupConfig } from "../data/groupConfig";
import { isFutureGroup, isStarlinkGroup } from "../data/groupConfig";
import {
  hardwareClassForGroup,
  isHardwareClassEnabled,
  matchesBandwidthLayer,
  type BandwidthLayer,
  type HardwareClassFilter,
  type HardwareClassId,
  HARDWARE_CLASSES,
} from "../data/starlinkHardware";
import {
  buildOrbitalPlanes,
  positionOnPlane,
  type BuildParams,
  type OrbitalPlane,
} from "../orbits";

export const R_EARTH_KM = 6371;

/** Lat-lon grid step (degrees). 1° ≈ 360×180 cells. */
export const GRID_STEP_DEG = 1;

export const GRID_WIDTH = Math.round(360 / GRID_STEP_DEG);
export const GRID_HEIGHT = Math.round(180 / GRID_STEP_DEG);

const CLASS_INDEX: Record<HardwareClassId, number> = {
  v1: 0,
  "v1.5": 1,
  v2m: 2,
  "dtc-v1": 3,
  "dtc-v2": 4,
  v3: 5,
};

const COVERAGE_BUILD_PARAMS: BuildParams = {
  sampleDivisor: 1,
  altitudeExaggeration: 1,
  maxSatsPerPlaneCap: 100_000,
  tracksOnly: false,
};

/** Reused per stamp to avoid allocations. */
const STAMP_CELL_BUFFER: number[] = [];

export interface CoverageBuildResult {
  hits: Uint16Array;
  classIdx: Uint8Array;
  rgba: Uint8Array;
  contributingSats: number;
  coveredCells: number;
  totalCells: number;
  coverageFraction: number;
}

export interface GridBuildOptions {
  /** Override hardware min elevation (15–35°). */
  minElevationDeg?: number;
  /** Skip satellites whose subsatellite point is on Earth's night side. */
  nightSideDimming?: boolean;
  /** Sun direction in Earth-fixed frame (unit vector). */
  sunDirectionEarthFixed?: THREE.Vector3;
}

export interface CapacityBuildOptions extends GridBuildOptions {
  concurrency: number;
  layer: BandwidthLayer;
  classFilter: HardwareClassFilter;
}

export interface CapacityBuildResult {
  gbpsGrid: Float32Array;
  satCountGrid: Uint16Array;
  rgba: Uint8Array;
  contributingSats: number;
  coveredCells: number;
  totalNominalGbps: number;
  peakCellGbps: number;
  layer: BandwidthLayer;
}

export interface GridStampContext {
  earthInv: THREE.Matrix4;
  satPos: THREE.Vector3;
  scratch: THREE.Vector3;
}

/** Geocentric angle (rad) from nadir to edge of service footprint. */
export function footprintGeocentricRad(altitudeKm: number, minElevDeg: number): number {
  const eps = (minElevDeg * Math.PI) / 180;
  const rho = R_EARTH_KM + altitudeKm;
  const term = (R_EARTH_KM / rho) * Math.cos(eps);
  return Math.acos(Math.min(1, Math.max(-1, term))) - eps;
}

export function footprintGroundRadiusKm(altitudeKm: number, minElevDeg: number): number {
  const psi = footprintGeocentricRad(altitudeKm, minElevDeg);
  return R_EARTH_KM * psi;
}

export function footprintRadiusDeg(altitudeKm: number, minElevDeg: number): number {
  return (footprintGeocentricRad(altitudeKm, minElevDeg) * 180) / Math.PI;
}

/** Approximate cells in a circular footprint (for tests). */
export function estimateFootprintCellCount(radiusDeg: number): number {
  const areaDeg2 = Math.PI * radiusDeg * radiusDeg;
  return Math.round(areaDeg2 / (GRID_STEP_DEG * GRID_STEP_DEG));
}

export function angularDistanceDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const r = Math.PI / 180;
  const φ1 = lat1 * r;
  const φ2 = lat2 * r;
  const dφ = (lat2 - lat1) * r;
  const dλ = (lon2 - lon1) * r;
  const a =
    Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return ((2 * Math.asin(Math.sqrt(a))) * 180) / Math.PI;
}

export function latLonForCell(ix: number, iy: number): { lat: number; lon: number } {
  const lon = -180 + (ix + 0.5) * GRID_STEP_DEG;
  const lat = 90 - (iy + 0.5) * GRID_STEP_DEG;
  return { lat, lon };
}

export function cellIndexFromLatLon(lat: number, lon: number): { ix: number; iy: number; idx: number } {
  const ix = Math.min(
    GRID_WIDTH - 1,
    Math.max(0, Math.floor((lon + 180) / GRID_STEP_DEG))
  );
  const iy = Math.min(
    GRID_HEIGHT - 1,
    Math.max(0, Math.floor((90 - lat) / GRID_STEP_DEG))
  );
  return { ix, iy, idx: iy * GRID_WIDTH + ix };
}

export function cellIndexFromUv(u: number, v: number): number {
  const ix = Math.min(GRID_WIDTH - 1, Math.max(0, Math.floor(u * GRID_WIDTH)));
  const iy = Math.min(GRID_HEIGHT - 1, Math.max(0, Math.floor((1 - v) * GRID_HEIGHT)));
  return iy * GRID_WIDTH + ix;
}

export function cellIndex(ix: number, iy: number): number {
  return iy * GRID_WIDTH + ix;
}

export function forEachCellInDisc(
  lat: number,
  lon: number,
  radiusDeg: number,
  fn: (idx: number) => void
): void {
  const latMin = lat - radiusDeg;
  const latMax = lat + radiusDeg;
  const lonMin = lon - radiusDeg;
  const lonMax = lon + radiusDeg;

  const ix0 = Math.max(0, Math.floor((lonMin + 180) / GRID_STEP_DEG));
  const ix1 = Math.min(GRID_WIDTH - 1, Math.floor((lonMax + 180) / GRID_STEP_DEG));
  const iy0 = Math.max(0, Math.floor((90 - latMax) / GRID_STEP_DEG));
  const iy1 = Math.min(GRID_HEIGHT - 1, Math.floor((90 - latMin) / GRID_STEP_DEG));

  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const c = latLonForCell(ix, iy);
      if (angularDistanceDeg(lat, lon, c.lat, c.lon) <= radiusDeg) {
        fn(cellIndex(ix, iy));
      }
    }
  }
}

function collectCellsInDisc(lat: number, lon: number, radiusDeg: number): number[] {
  STAMP_CELL_BUFFER.length = 0;
  forEachCellInDisc(lat, lon, radiusDeg, (idx) => STAMP_CELL_BUFFER.push(idx));
  return STAMP_CELL_BUFFER;
}

function stampDisc(
  hits: Uint16Array,
  classIdx: Uint8Array,
  lat: number,
  lon: number,
  radiusDeg: number,
  hwIndex: number
): void {
  forEachCellInDisc(lat, lon, radiusDeg, (idx) => {
    if (hits[idx] === 0) classIdx[idx] = hwIndex;
    hits[idx] = Math.min(65535, hits[idx] + 1);
  });
}

function stampCapacityDisc(
  gbpsGrid: Float32Array,
  satCountGrid: Uint16Array,
  lat: number,
  lon: number,
  radiusDeg: number,
  gbpsPerSat: number
): void {
  const cells = collectCellsInDisc(lat, lon, radiusDeg);
  const share = gbpsPerSat / Math.max(1, cells.length);
  for (const idx of cells) {
    gbpsGrid[idx] += share;
    satCountGrid[idx] = Math.min(65535, satCountGrid[idx] + 1);
  }
}

function subsatelliteLatLon(
  satWorld: THREE.Vector3,
  earthMatrixWorldInv: THREE.Matrix4,
  scratch: THREE.Vector3
): { lat: number; lon: number } {
  scratch.copy(satWorld).applyMatrix4(earthMatrixWorldInv).normalize();
  const lat = (Math.asin(THREE.MathUtils.clamp(scratch.y, -1, 1)) * 180) / Math.PI;
  const lon = (Math.atan2(scratch.z, scratch.x) * 180) / Math.PI;
  return { lat, lon };
}

function coveragePlanesForGroup(group: OrbitGroupConfig): OrbitalPlane[] {
  return buildOrbitalPlanes(
    group.id,
    group.altitudeKm,
    group.inclinationDeg,
    group.shells,
    group.planesPerShell,
    group.satsPerPlane,
    {
      ...COVERAGE_BUILD_PARAMS,
      satLayout: group.satLayout,
      launchTrainSize: group.launchTrainSize,
      totalSats: group.maxSats,
    }
  );
}

function createStampContext(earthGroup: THREE.Group): GridStampContext {
  earthGroup.updateMatrixWorld(true);
  return {
    earthInv: earthGroup.matrixWorld.clone().invert(),
    satPos: new THREE.Vector3(),
    scratch: new THREE.Vector3(),
  };
}

interface SatelliteStamp {
  lat: number;
  lon: number;
  radiusDeg: number;
  hwIndex: number;
  downlinkGbps: number;
}

function isNightSideSubsatellite(
  satWorld: THREE.Vector3,
  ctx: GridStampContext,
  sunDirEarth?: THREE.Vector3
): boolean {
  if (!sunDirEarth) return false;
  ctx.scratch.copy(satWorld).applyMatrix4(ctx.earthInv).normalize();
  return ctx.scratch.dot(sunDirEarth) <= 0;
}

function collectSatelliteStamps(
  groups: OrbitGroupConfig[],
  enabledGroupIds: Set<number>,
  simTimeSec: number,
  snapshotAsOf: string,
  ctx: GridStampContext,
  options?: {
    layer?: BandwidthLayer;
    classFilter?: HardwareClassFilter;
    minElevationDeg?: number;
    nightSideDimming?: boolean;
    sunDirectionEarthFixed?: THREE.Vector3;
  }
): SatelliteStamp[] {
  const stamps: SatelliteStamp[] = [];

  for (const group of groups) {
    if (!isStarlinkGroup(group)) continue;
    if (isFutureGroup(group)) continue;
    if (!enabledGroupIds.has(group.id)) continue;

    const hw = hardwareClassForGroup(group, snapshotAsOf);
    const spec = HARDWARE_CLASSES[hw];

    if (options?.classFilter && !isHardwareClassEnabled(hw, options.classFilter)) continue;
    if (options?.layer && !matchesBandwidthLayer(spec, options.layer)) continue;

    const hwIndex = CLASS_INDEX[hw];
    const minElev = options?.minElevationDeg ?? spec.minElevationDeg;
    const planes = coveragePlanesForGroup(group);

    for (const plane of planes) {
      const radiusDeg = footprintRadiusDeg(plane.physicalAltitudeKm, minElev);
      for (const sat of plane.satellites) {
        positionOnPlane(plane, sat.meanAnomaly0, simTimeSec, ctx.satPos);
        if (
          options?.nightSideDimming &&
          isNightSideSubsatellite(ctx.satPos, ctx, options.sunDirectionEarthFixed)
        ) {
          continue;
        }
        const { lat, lon } = subsatelliteLatLon(ctx.satPos, ctx.earthInv, ctx.scratch);
        stamps.push({
          lat,
          lon,
          radiusDeg,
          hwIndex,
          downlinkGbps: spec.downlinkGbps,
        });
      }
    }
  }

  return stamps;
}

export function buildCoverageGrid(
  groups: OrbitGroupConfig[],
  enabledGroupIds: Set<number>,
  simTimeSec: number,
  snapshotAsOf: string,
  earthGroup: THREE.Group,
  gridOptions: GridBuildOptions = {}
): CoverageBuildResult {
  const hits = new Uint16Array(GRID_WIDTH * GRID_HEIGHT);
  const classIdx = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
  const ctx = createStampContext(earthGroup);
  const stamps = collectSatelliteStamps(groups, enabledGroupIds, simTimeSec, snapshotAsOf, ctx, gridOptions);

  for (const s of stamps) {
    stampDisc(hits, classIdx, s.lat, s.lon, s.radiusDeg, s.hwIndex);
  }

  let coveredCells = 0;
  const rgba = new Uint8Array(GRID_WIDTH * GRID_HEIGHT * 4);
  const classColors = (Object.keys(HARDWARE_CLASSES) as HardwareClassId[]).map((id) => {
    const c = HARDWARE_CLASSES[id].color;
    return { r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255 };
  });

  for (let i = 0; i < hits.length; i++) {
    if (hits[i] === 0) continue;
    coveredCells++;
    const ci = classIdx[i] ?? 1;
    const col = classColors[ci] ?? classColors[1]!;
    const o = i * 4;
    rgba[o] = col.r;
    rgba[o + 1] = col.g;
    rgba[o + 2] = col.b;
    rgba[o + 3] = Math.min(220, 80 + Math.log2(hits[i] + 1) * 28);
  }

  const totalCells = hits.length;
  return {
    hits,
    classIdx,
    rgba,
    contributingSats: stamps.length,
    coveredCells,
    totalCells,
    coverageFraction: totalCells > 0 ? coveredCells / totalCells : 0,
  };
}

export function buildCapacityGrid(
  groups: OrbitGroupConfig[],
  enabledGroupIds: Set<number>,
  simTimeSec: number,
  snapshotAsOf: string,
  earthGroup: THREE.Group,
  options: CapacityBuildOptions
): CapacityBuildResult {
  const gbpsGrid = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
  const satCountGrid = new Uint16Array(GRID_WIDTH * GRID_HEIGHT);
  const ctx = createStampContext(earthGroup);
  const stamps = collectSatelliteStamps(groups, enabledGroupIds, simTimeSec, snapshotAsOf, ctx, {
    layer: options.layer,
    classFilter: options.classFilter,
    minElevationDeg: options.minElevationDeg,
    nightSideDimming: options.nightSideDimming,
    sunDirectionEarthFixed: options.sunDirectionEarthFixed,
  });

  let totalNominalGbps = 0;
  for (const s of stamps) {
    const effective = s.downlinkGbps * options.concurrency;
    totalNominalGbps += effective;
    stampCapacityDisc(gbpsGrid, satCountGrid, s.lat, s.lon, s.radiusDeg, effective);
  }

  let coveredCells = 0;
  let peakCellGbps = 0;
  for (let i = 0; i < gbpsGrid.length; i++) {
    if (gbpsGrid[i] > 0) {
      coveredCells++;
      peakCellGbps = Math.max(peakCellGbps, gbpsGrid[i]);
    }
  }

  const rgba = capacityGridToRgba(gbpsGrid, options.layer);

  return {
    gbpsGrid,
    satCountGrid,
    rgba,
    contributingSats: stamps.length,
    coveredCells,
    totalNominalGbps,
    peakCellGbps,
    layer: options.layer,
  };
}

/** Log-scaled heat colors: dark blue → cyan → yellow → red. */
export function gbpsToHeatRgb(gbps: number, layer: BandwidthLayer): { r: number; g: number; b: number; a: number } {
  const min = layer === "dtc" ? 1e-6 : 0.05;
  const max = layer === "dtc" ? 0.05 : 500;
  if (gbps <= min) return { r: 0, g: 0, b: 0, a: 0 };

  const t = Math.min(1, Math.max(0, (Math.log10(gbps) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))));

  let r: number;
  let g: number;
  let b: number;
  if (t < 0.33) {
    const u = t / 0.33;
    r = 0;
    g = Math.round(40 + u * 180);
    b = Math.round(80 + u * 175);
  } else if (t < 0.66) {
    const u = (t - 0.33) / 0.33;
    r = Math.round(u * 255);
    g = Math.round(220 - u * 40);
    b = Math.round(255 - u * 255);
  } else {
    const u = (t - 0.66) / 0.34;
    r = 255;
    g = Math.round(180 - u * 140);
    b = Math.round(u * 40);
  }

  return { r, g, b, a: Math.round(160 + t * 80) };
}

export function capacityGridToRgba(gbpsGrid: Float32Array, layer: BandwidthLayer): Uint8Array {
  const rgba = new Uint8Array(GRID_WIDTH * GRID_HEIGHT * 4);
  for (let i = 0; i < gbpsGrid.length; i++) {
    const { r, g, b, a } = gbpsToHeatRgb(gbpsGrid[i]!, layer);
    const o = i * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = a;
  }
  return rgba;
}

export function formatBandwidth(valueGbps: number, layer: BandwidthLayer): string {
  if (layer === "dtc") {
    if (valueGbps >= 0.001) return `${(valueGbps * 1000).toFixed(1)} Mbps`;
    return `${(valueGbps * 1_000_000).toFixed(0)} kbps`;
  }
  if (valueGbps >= 1000) return `${(valueGbps / 1000).toFixed(2)} Tbps`;
  if (valueGbps >= 1) return `${valueGbps.toFixed(1)} Gbps`;
  return `${(valueGbps * 1000).toFixed(0)} Mbps`;
}
