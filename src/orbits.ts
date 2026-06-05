import * as THREE from "three";

import type { SatLayoutMode } from "./data/groupConfig";

const R_EARTH_KM = 6371;
const MU_EARTH = 3.986004418e14;

export const KM_TO_SCENE = 1 / R_EARTH_KM;

/** User-facing density steps (1:N display stride). */
export const DENSITY_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000] as const;
export type DensityPreset = (typeof DENSITY_STEPS)[number];
/** @deprecated Use DENSITY_STEPS — kept for auto-budget stepping */
export const DENSITY_PRESETS = DENSITY_STEPS;

export interface BuildParams {
  sampleDivisor: number;
  altitudeExaggeration: number;
  /** 0 = uncapped per-plane count (ODC scale tests). */
  maxSatsPerPlaneCap: number;
  /** ODC 1M mode: GPU buffers + shader animation; planes are tracks-only. */
  odcRepresentativeMode?: boolean;
  /** ODC: sample every Nth sat without legacy per-plane caps. */
  odcUncappedDensity?: boolean;
  /** If set, only build these shell indices (ODC progressive reveal). */
  enabledShellIndices?: Set<number>;
  /** 0 = true scale; else fraction of visual baseline (0.01 = 1%). */
  satPointScale?: number;
  /** When true, build plane rings without along-track satellite slots. */
  tracksOnly?: boolean;
  /** Walker vs Falcon 9 launch-train clustering. */
  satLayout?: SatLayoutMode;
  /** Satellites per launch batch when satLayout is launch_train. */
  launchTrainSize?: number;
  /** Total satellites in this group (for partial last train). */
  totalSats?: number;
}

export const DEFAULT_BUILD_PARAMS: BuildParams = {
  sampleDivisor: 100,
  altitudeExaggeration: 1,
  maxSatsPerPlaneCap: 32,
  odcRepresentativeMode: false,
  odcUncappedDensity: false,
  satPointScale: 1,
  tracksOnly: false,
};

export function densityStepIndex(divisor: number): number {
  let best = 0;
  for (let i = 0; i < DENSITY_STEPS.length; i++) {
    if (DENSITY_STEPS[i]! <= divisor) best = i;
  }
  return best;
}

export function formatDensityLabel(divisor: number): string {
  return divisor <= 1 ? "1:1 (every sat)" : `1:${divisor.toLocaleString()}`;
}

/** Scene radius for the default visible dot (not physical). */
export const VISUAL_SAT_BASE_RADIUS = 0.008;

/** Characteristic bus radius for true-scale display (~3 m Starlink-class). */
export const PHYSICAL_SAT_RADIUS_M = 1.5;

export function physicalSatRadiusScene(radiusM = PHYSICAL_SAT_RADIUS_M): number {
  return radiusM / 1000 / R_EARTH_KM;
}

/** Shrink dots as visible count grows (× user scale). */
export function autoSatPointScale(visibleSats: number, userScale = 1): number {
  const ref = 500;
  const auto = visibleSats <= ref ? 1 : Math.sqrt(ref / visibleSats);
  return userScale * Math.max(0.06, Math.min(1, auto));
}

/**
 * Instanced sphere radius. satPointScale: 0 = true physical size; else % of visual baseline.
 */
export function resolveInstancedSatRadius(
  visibleSats: number,
  satPointScale: number,
  groupSatScale = 1
): number {
  if (satPointScale === 0) {
    return physicalSatRadiusScene() * groupSatScale;
  }
  return VISUAL_SAT_BASE_RADIUS * groupSatScale * autoSatPointScale(visibleSats, satPointScale);
}

/** GPU point-cloud scale. satPointScale: 0 = true physical size. */
export function resolveGpuPointScale(
  visibleSats: number,
  satPointScale: number,
  polarBoost = 1
): number {
  if (satPointScale === 0) {
    return polarBoost * (physicalSatRadiusScene() / VISUAL_SAT_BASE_RADIUS);
  }
  return polarBoost * autoSatPointScale(visibleSats, satPointScale);
}

export function formatSatSizeLabel(sliderValue: number): string {
  if (sliderValue === 0) return "True scale (~3 m)";
  return `${sliderValue}%`;
}

/** Slider 0 = true scale; 1–200 = percent of visual baseline. */
export function satSizeSliderToScale(sliderValue: number): number {
  if (sliderValue === 0) return 0;
  return sliderValue / 100;
}

export interface OrbitalPlane {
  groupId: number;
  shellIndex: number;
  planeIndex: number;
  altitudeKm: number;
  physicalAltitudeKm: number;
  inclinationDeg: number;
  radius: number;
  inclinationRad: number;
  raanRad: number;
  meanMotionRadPerSec: number;
  nominalSatsPerPlane: number;
  satellites: { meanAnomaly0: number }[];
}

export function planeKey(groupId: number, shellIndex: number, planeIndex: number): string {
  return `${groupId}:${shellIndex}:${planeIndex}`;
}

export function shellInclinationDeg(
  inc: number | [number, number],
  shellIndex: number,
  shellCount: number
): number {
  if (typeof inc === "number") return inc;
  if (shellCount <= 1) return (inc[0] + inc[1]) / 2;
  const t = shellIndex / (shellCount - 1);
  return inc[0] + t * (inc[1] - inc[0]);
}

function meanMotionRadPerSec(altKm: number): number {
  const aM = (R_EARTH_KM + altKm) * 1000;
  const periodSec = 2 * Math.PI * Math.sqrt((aM * aM * aM) / MU_EARTH);
  return (2 * Math.PI) / periodSec;
}

function shellAltitudeKm(lo: number, hi: number, shellIndex: number, shellCount: number): number {
  if (shellCount <= 1 || lo === hi) return (lo + hi) / 2;
  const t = shellIndex / (shellCount - 1);
  return lo + t * (hi - lo);
}

function effectiveAltitudeKm(
  lo: number,
  hi: number,
  shellIndex: number,
  shellCount: number,
  exaggeration: number
): { physical: number; visual: number } {
  const physical = shellAltitudeKm(lo, hi, shellIndex, shellCount);
  const center = (lo + hi) / 2;
  const visual = center + (physical - center) * exaggeration;
  return { physical, visual };
}

export function visualSatsPerPlane(nominal: number, params: BuildParams): number {
  const { sampleDivisor, maxSatsPerPlaneCap } = params;
  const uncapped = params.odcUncappedDensity || maxSatsPerPlaneCap === 0;

  if (sampleDivisor <= 1) {
    return uncapped ? nominal : Math.min(nominal, maxSatsPerPlaneCap);
  }

  if (params.satLayout === "launch_train") {
    // Show enough dots to read a filled ring (not 2 sats at 1:100 leaving half the track empty).
    const slotsPerVis = Math.max(1, sampleDivisor / 8);
    const denseSample = Math.ceil(nominal / slotsPerVis);
    const maxVis =
      sampleDivisor >= 1000 ? 12 : sampleDivisor >= 100 ? 20 : sampleDivisor >= 10 ? 32 : 48;
    const minVis = Math.min(6, nominal);
    return Math.max(minVis, Math.min(maxVis, denseSample, nominal));
  }

  const sampled = Math.ceil(nominal / sampleDivisor);
  if (uncapped) return Math.max(1, Math.min(nominal, sampled));

  const maxVis = sampleDivisor >= 1000 ? 4 : sampleDivisor >= 100 ? 8 : 16;
  return Math.max(2, Math.min(maxVis, sampled, nominal));
}

function satsInLaunchTrainPlane(
  planeIndex: number,
  totalSats: number,
  trainSize: number
): number {
  const remaining = totalSats - planeIndex * trainSize;
  return Math.max(0, Math.min(trainSize, remaining));
}

function equidistantSatellites(
  nominalInPlane: number,
  visSats: number,
  shellPhase: number
): { meanAnomaly0: number }[] {
  const satellites: { meanAnomaly0: number }[] = [];
  const count = Math.min(visSats, nominalInPlane);
  for (let s = 0; s < count; s++) {
    // Divide the full 2π orbit evenly — no trailing gap from stride sampling.
    const nominalPhase = (s / count) * Math.PI * 2;
    satellites.push({ meanAnomaly0: nominalPhase + shellPhase });
  }
  return satellites;
}

export function buildOrbitalPlanes(
  groupId: number,
  altitudeKm: [number, number],
  inclinationDeg: number | [number, number],
  shells: number,
  planesPerShell: number,
  satsPerPlane: number,
  params: BuildParams = DEFAULT_BUILD_PARAMS
): OrbitalPlane[] {
  const [lo, hi] = altitudeKm;
  const isLaunchTrain = params.satLayout === "launch_train";
  const trainSize = params.launchTrainSize ?? satsPerPlane;
  const totalSats = params.totalSats ?? planesPerShell * satsPerPlane;
  const planes: OrbitalPlane[] = [];

  for (let sh = 0; sh < shells; sh++) {
    if (params.enabledShellIndices && !params.enabledShellIndices.has(sh)) continue;

    const { physical, visual } = effectiveAltitudeKm(lo, hi, sh, shells, params.altitudeExaggeration);
    const incDeg = shellInclinationDeg(inclinationDeg, sh, shells);
    const incRad = (incDeg * Math.PI) / 180;
    const radius = 1 + visual * KM_TO_SCENE;
    const omega = meanMotionRadPerSec(physical);
    const shellPhase = (sh / shells) * (Math.PI * 2) / planesPerShell;

    for (let pl = 0; pl < planesPerShell; pl++) {
      const nominalInPlane = isLaunchTrain
        ? satsInLaunchTrainPlane(pl, totalSats, trainSize)
        : satsPerPlane;
      if (nominalInPlane <= 0) continue;

      const visSats = params.tracksOnly ? 0 : visualSatsPerPlane(nominalInPlane, params);
      const raanRad = (pl / planesPerShell) * Math.PI * 2;
      const satellites = equidistantSatellites(nominalInPlane, visSats, shellPhase);

      planes.push({
        groupId,
        shellIndex: sh,
        planeIndex: pl,
        altitudeKm: visual,
        physicalAltitudeKm: physical,
        inclinationDeg: incDeg,
        radius,
        inclinationRad: incRad,
        raanRad,
        meanMotionRadPerSec: omega,
        nominalSatsPerPlane: nominalInPlane,
        satellites,
      });
    }
  }

  return planes;
}

/**
 * Standard ECI (Z = north pole), then map to Three.js Y-up (Y = north pole):
 *   three.x = eci.x,  three.y = eci.z,  three.z = -eci.y
 */
export function eciToScene(eciX: number, eciY: number, eciZ: number, out: THREE.Vector3): THREE.Vector3 {
  out.x = eciX;
  out.y = eciZ;
  out.z = -eciY;
  return out;
}

export function positionOnPlane(
  plane: Pick<OrbitalPlane, "radius" | "inclinationRad" | "raanRad" | "meanMotionRadPerSec">,
  meanAnomaly0: number,
  tSec: number,
  out: THREE.Vector3
): THREE.Vector3 {
  const nu = meanAnomaly0 + plane.meanMotionRadPerSec * tSec;
  const r = plane.radius;
  const xo = r * Math.cos(nu);
  const yo = r * Math.sin(nu);

  const cO = Math.cos(plane.raanRad);
  const sO = Math.sin(plane.raanRad);
  const cI = Math.cos(plane.inclinationRad);
  const sI = Math.sin(plane.inclinationRad);

  const eciX = cO * xo - sO * cI * yo;
  const eciY = sO * xo + cO * cI * yo;
  const eciZ = sI * yo;

  return eciToScene(eciX, eciY, eciZ, out);
}

export function orbitRingPoints(
  plane: Pick<OrbitalPlane, "radius" | "inclinationRad" | "raanRad">,
  segments = 96
): Float32Array {
  const buf = new Float32Array((segments + 1) * 3);
  const v = new THREE.Vector3();
  const stub = { ...plane, meanMotionRadPerSec: 0 };
  for (let i = 0; i <= segments; i++) {
    positionOnPlane(stub, (i / segments) * Math.PI * 2, 0, v);
    const o = i * 3;
    buf[o] = v.x;
    buf[o + 1] = v.y;
    buf[o + 2] = v.z;
  }
  return buf;
}

export function groundTrackPoints(
  plane: Pick<OrbitalPlane, "radius" | "inclinationRad" | "raanRad" | "meanMotionRadPerSec">,
  segments = 128,
  surfaceRadius = 1.002
): Float32Array {
  const buf = new Float32Array((segments + 1) * 3);
  const v = new THREE.Vector3();
  const stub = { ...plane, meanMotionRadPerSec: 0 };
  for (let i = 0; i <= segments; i++) {
    positionOnPlane(stub, (i / segments) * Math.PI * 2, 0, v);
    v.normalize().multiplyScalar(surfaceRadius);
    const o = i * 3;
    buf[o] = v.x;
    buf[o + 1] = v.y;
    buf[o + 2] = v.z;
  }
  return buf;
}

export function orbitRadiusKm(altitudeKm: number): number {
  return 1 + altitudeKm * KM_TO_SCENE;
}

export { R_EARTH_KM };
