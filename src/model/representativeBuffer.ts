import type { OrbitGroupConfig } from "../data/groupConfig";
import {
  buildOrbitalPlanes,
  type BuildParams,
  KM_TO_SCENE,
  shellInclinationDeg,
} from "../orbits";

const R_EARTH_KM = 6371;
const MU_EARTH = 3.986004418e14;

/** Five floats per displayed satellite: radius, inc, raan, M0, meanMotion. */
export const GPU_ELEMENTS_STRIDE = 5;

export interface RepresentativeSatBuffer {
  groupId: number;
  nominalSats: number;
  displaySats: number;
  sampleDivisor: number;
  elements: Float32Array;
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

function effectiveVisualAlt(
  lo: number,
  hi: number,
  shellIndex: number,
  shellCount: number,
  exaggeration: number
): number {
  const physical = shellAltitudeKm(lo, hi, shellIndex, shellCount);
  const center = (lo + hi) / 2;
  return center + (physical - center) * exaggeration;
}

/** Display stride for ODC 1M representative mode (no per-plane cap). */
export function representativeDisplaySatsPerPlane(nominal: number, sampleDivisor: number): number {
  if (sampleDivisor <= 1) return nominal;
  return Math.max(1, Math.ceil(nominal / sampleDivisor));
}

export function representativeNominalTotal(g: OrbitGroupConfig): number {
  return g.shells * g.planesPerShell * g.satsPerPlane;
}

/** Build typed orbital-element buffer without materializing 1M JS satellite objects. */
export function buildRepresentativeSatBuffer(
  g: OrbitGroupConfig,
  params: BuildParams
): RepresentativeSatBuffer {
  const [lo, hi] = g.altitudeKm;
  const divisor = params.sampleDivisor;
  const visPerPlane = representativeDisplaySatsPerPlane(g.satsPerPlane, divisor);
  const enabledShells = params.enabledShellIndices;
  let displaySats = 0;
  for (let sh = 0; sh < g.shells; sh++) {
    if (enabledShells && !enabledShells.has(sh)) continue;
    displaySats += g.planesPerShell * visPerPlane;
  }
  const nominalSats = enabledShells
    ? enabledShells.size * g.planesPerShell * g.satsPerPlane
    : representativeNominalTotal(g);
  const elements = new Float32Array(Math.max(displaySats, 1) * GPU_ELEMENTS_STRIDE);

  let idx = 0;
  for (let sh = 0; sh < g.shells; sh++) {
    if (enabledShells && !enabledShells.has(sh)) continue;
    const physical = shellAltitudeKm(lo, hi, sh, g.shells);
    const visual = effectiveVisualAlt(lo, hi, sh, g.shells, params.altitudeExaggeration);
    const incRad = (shellInclinationDeg(g.inclinationDeg, sh, g.shells) * Math.PI) / 180;
    const radius = 1 + visual * KM_TO_SCENE;
    const omega = meanMotionRadPerSec(physical);
    const shellPhase = (sh / g.shells) * (Math.PI * 2) / g.planesPerShell;
    const nominalStride = Math.max(1, Math.floor(g.satsPerPlane / visPerPlane));

    for (let pl = 0; pl < g.planesPerShell; pl++) {
      const raanRad = (pl / g.planesPerShell) * Math.PI * 2;
      for (let s = 0; s < visPerPlane; s++) {
        const nominalIndex = s * nominalStride;
        const m0 = (nominalIndex / g.satsPerPlane) * Math.PI * 2 + shellPhase;
        const o = idx * GPU_ELEMENTS_STRIDE;
        elements[o] = radius;
        elements[o + 1] = incRad;
        elements[o + 2] = raanRad;
        elements[o + 3] = m0;
        elements[o + 4] = omega;
        idx++;
      }
    }
  }

  return { groupId: g.id, nominalSats, displaySats, sampleDivisor: divisor, elements };
}

export interface ShellSlotAttributes {
  shellIndex: Float32Array;
  nominalSlot: Float32Array;
  count: number;
}

/** GPU attributes: shell index + nominal slot within shell (matches buildRepresentativeSatBuffer order). */
export function buildShellSlotAttributes(
  g: OrbitGroupConfig,
  params: BuildParams
): { shellIndex: Float32Array; nominalSlot: Float32Array; count: number } | null {
  const divisor = params.sampleDivisor;
  const visPerPlane = representativeDisplaySatsPerPlane(g.satsPerPlane, divisor);
  const enabledShells = params.enabledShellIndices;
  let displaySats = 0;
  for (let sh = 0; sh < g.shells; sh++) {
    if (enabledShells && !enabledShells.has(sh)) continue;
    displaySats += g.planesPerShell * visPerPlane;
  }
  if (displaySats <= 0) return null;

  const shellIndex = new Float32Array(displaySats);
  const nominalSlot = new Float32Array(displaySats);
  const nominalStride = Math.max(1, Math.floor(g.satsPerPlane / visPerPlane));

  let idx = 0;
  for (let sh = 0; sh < g.shells; sh++) {
    if (enabledShells && !enabledShells.has(sh)) continue;
    for (let pl = 0; pl < g.planesPerShell; pl++) {
      for (let s = 0; s < visPerPlane; s++) {
        const satIdx = s * nominalStride;
        shellIndex[idx] = sh;
        nominalSlot[idx] = pl * g.satsPerPlane + satIdx;
        idx++;
      }
    }
  }

  return { shellIndex, nominalSlot, count: displaySats };
}

/** Effective density multiplier from camera distance (far → sparser). */
export function lodDensityMultiplier(cameraDistance: number): number {
  if (cameraDistance > 7) return 10;
  if (cameraDistance > 4.5) return 3;
  if (cameraDistance < 2.2) return 0.5;
  return 1;
}

/** Subsample GPU buffer indices for LOD without rebuilding buffers. */
export function lodDisplayCount(total: number, cameraDistance: number, autoLod: boolean): number {
  if (!autoLod || total <= 512) return total;
  const mul = lodDensityMultiplier(cameraDistance);
  return Math.max(256, Math.floor(total / mul));
}

export function representativeTrackPlanes(g: OrbitGroupConfig, params: BuildParams) {
  return buildOrbitalPlanes(
    g.id,
    g.altitudeKm,
    g.inclinationDeg,
    g.shells,
    g.planesPerShell,
    g.satsPerPlane,
    { ...params, tracksOnly: true }
  );
}
