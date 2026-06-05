import type { OrbitGroupConfig } from "./groupConfig";
import { formatInclination } from "./groupConfig";

/** FCC regulatory cap per Gen2 tranche (DA-26-36; two tranches → 15,000 total authorized). */
export const STARLINK_GEN2_FCC_TRANCHE_CAP = 7500;

function gen2Shell(
  id: number,
  name: string,
  altKm: number,
  incDeg: number,
  planes: number,
  satsPerPlane: number,
  color: number
): OrbitGroupConfig {
  return {
    id,
    layer: "starlink-gen2",
    name,
    altitudeKm: [altKm, altKm],
    inclinationDeg: incDeg,
    shells: 1,
    planesPerShell: planes,
    satsPerPlane,
    maxSats: planes * satsPerPlane,
    color,
    satScale: 0.48,
    trackOpacity: 0.11,
  };
}

/**
 * Gen2-A — FCC granted shells (DA-26-36 VLEO + migration targets).
 * Structural plane layout at authorized max; deployment may flex under 7,500/tranche cap.
 */
export const STARLINK_GEN2_GRANTED: OrbitGroupConfig[] = [
  gen2Shell(201, "G2 340", 340, 53.0, 72, 144, 0x5eb8ff),
  gen2Shell(202, "G2 345", 345, 48.0, 72, 144, 0x52adfa),
  gen2Shell(203, "G2 350", 350, 38.0, 72, 144, 0x46a2f5),
  gen2Shell(204, "G2 355", 355, 43.0, 72, 144, 0x3a97f0),
  gen2Shell(205, "G2 360", 360, 96.9, 72, 144, 0x2e8ceb),
  gen2Shell(206, "G2 365·28", 365, 28.0, 72, 144, 0x2281e6),
  gen2Shell(207, "G2 365·32", 365, 32.0, 72, 144, 0x1a76db),
  gen2Shell(208, "G2 475", 475, 28.0, 56, 120, 0x6ec4ff),
  gen2Shell(209, "G2 480", 480, 53.0, 56, 120, 0x62b8f5),
  gen2Shell(210, "G2 485", 485, 43.0, 56, 120, 0x56aceb),
];

/**
 * Gen2-B — Full 29,988-satellite application (FCC-22-91 Table, Dec 2022 amendment).
 * Retrograde 604/614 km shells included; 355/365 km shells deferred in original partial grant.
 */
export const STARLINK_GEN2_APPLICATION: OrbitGroupConfig[] = [
  gen2Shell(211, "G2 340", 340, 53.0, 48, 110, 0x5eb8ff),
  gen2Shell(212, "G2 345", 345, 46.0, 48, 110, 0x52adfa),
  gen2Shell(213, "G2 350", 350, 38.0, 48, 110, 0x46a2f5),
  gen2Shell(214, "G2 360", 360, 96.9, 30, 120, 0x3a97f0),
  gen2Shell(215, "G2 525", 525, 53.0, 28, 120, 0x2e8ceb),
  gen2Shell(216, "G2 530", 530, 43.0, 28, 120, 0x2281e6),
  gen2Shell(217, "G2 535", 535, 33.0, 28, 120, 0x1a76db),
  gen2Shell(218, "G2 604", 604, 148.0, 12, 12, 0x8a6ec4),
  gen2Shell(219, "G2 614", 614, 115.7, 18, 18, 0x7a5eb4),
];

export type StarlinkGen2Mode = "granted" | "application";
export type StarlinkGen2Inc365 = "28" | "32";

export function starlinkGen2GroupsForMode(
  mode: StarlinkGen2Mode,
  inc365: StarlinkGen2Inc365 = "28"
): OrbitGroupConfig[] {
  if (mode === "application") return [...STARLINK_GEN2_APPLICATION];
  return STARLINK_GEN2_GRANTED.filter((g) => {
    if (g.id === 206) return inc365 === "28";
    if (g.id === 207) return inc365 === "32";
    return true;
  });
}

export const STARLINK_GEN2_NOMINAL_APPLICATION = STARLINK_GEN2_APPLICATION.reduce(
  (n, g) => n + g.maxSats,
  0
);

export const STARLINK_GEN2_NOMINAL_GRANTED_MAX = STARLINK_GEN2_GRANTED.filter(
  (g) => g.id !== 207
).reduce((n, g) => n + g.maxSats, 0);

export function starlinkGen2ShellLabel(g: OrbitGroupConfig): string {
  return `${g.name} · ${g.altitudeKm[0]} km · i=${formatInclination(g.inclinationDeg)} · ${g.maxSats.toLocaleString()} sats`;
}

/** Altitude gap between Gen2 VLEO (~360 km) and Gen1 (~540 km). */
export const GEN1_GEN2_ALTITUDE_GAP_KM: [number, number] = [360, 540];
