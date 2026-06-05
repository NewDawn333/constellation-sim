import type { OrbitGroupConfig } from "./groupConfig";

/** Apr 2020 modified Gen1 authorization (~4,408 satellites). */
export const STARLINK_GEN1_AUTHORIZED: OrbitGroupConfig[] = [
  {
    id: 101,
    layer: "starlink-gen1",
    name: "SL G1",
    altitudeKm: [550, 550],
    inclinationDeg: 53.0,
    shells: 1,
    planesPerShell: 72,
    satsPerPlane: 22,
    maxSats: 1584,
    color: 0xd4a574,
    satScale: 0.55,
    trackOpacity: 0.1,
  },
  {
    id: 102,
    layer: "starlink-gen1",
    name: "SL G2",
    altitudeKm: [570, 570],
    inclinationDeg: 70.0,
    shells: 1,
    planesPerShell: 36,
    satsPerPlane: 20,
    maxSats: 720,
    color: 0xc9956b,
    satScale: 0.55,
    trackOpacity: 0.1,
  },
  {
    id: 103,
    layer: "starlink-gen1",
    name: "SL G3",
    altitudeKm: [560, 560],
    inclinationDeg: 97.6,
    shells: 1,
    planesPerShell: 6,
    satsPerPlane: 58,
    maxSats: 348,
    color: 0xe8b87a,
    satScale: 0.55,
    trackOpacity: 0.14,
  },
  {
    id: 104,
    layer: "starlink-gen1",
    name: "SL G4",
    altitudeKm: [540, 540],
    inclinationDeg: 53.2,
    shells: 1,
    planesPerShell: 72,
    satsPerPlane: 22,
    maxSats: 1584,
    color: 0xb8885a,
    satScale: 0.55,
    trackOpacity: 0.1,
  },
  {
    id: 105,
    layer: "starlink-gen1",
    name: "SL G5",
    altitudeKm: [560, 560],
    inclinationDeg: 97.6,
    shells: 1,
    planesPerShell: 4,
    satsPerPlane: 43,
    maxSats: 172,
    color: 0xdeb887,
    satScale: 0.55,
    trackOpacity: 0.14,
  },
];

/** Operational migration shells (~475 km) observed in deployed constellation. */
export const STARLINK_GEN1_DEPLOYED_EXTRA: OrbitGroupConfig[] = [
  {
    id: 106,
    layer: "starlink-gen1",
    name: "SL mig A",
    altitudeKm: [475, 475],
    inclinationDeg: 53.2,
    shells: 1,
    planesPerShell: 72,
    satsPerPlane: 22,
    maxSats: 1584,
    color: 0xa07848,
    satScale: 0.5,
    trackOpacity: 0.08,
  },
  {
    id: 107,
    layer: "starlink-gen1",
    name: "SL mig B",
    altitudeKm: [470, 470],
    inclinationDeg: 53.2,
    shells: 1,
    planesPerShell: 72,
    satsPerPlane: 22,
    maxSats: 1584,
    color: 0x8a6840,
    satScale: 0.5,
    trackOpacity: 0.08,
  },
];

export type StarlinkDeploymentMode = "authorized" | "deployed";

export function starlinkGroupsForMode(mode: StarlinkDeploymentMode): OrbitGroupConfig[] {
  if (mode === "deployed") {
    return [...STARLINK_GEN1_AUTHORIZED, ...STARLINK_GEN1_DEPLOYED_EXTRA];
  }
  return [...STARLINK_GEN1_AUTHORIZED];
}

export const STARLINK_GEN1_NOMINAL_AUTHORIZED = STARLINK_GEN1_AUTHORIZED.reduce(
  (n, g) => n + g.maxSats,
  0
);

export const STARLINK_GEN1_NOMINAL_DEPLOYED =
  STARLINK_GEN1_NOMINAL_AUTHORIZED +
  STARLINK_GEN1_DEPLOYED_EXTRA.reduce((n, g) => n + g.maxSats, 0);

export function starlinkShellLabel(g: OrbitGroupConfig): string {
  return `${g.name} · ${g.altitudeKm[0]} km · i=${formatInclination(g.inclinationDeg)} · ${g.maxSats.toLocaleString()} sats`;
}

function formatInclination(inc: number | [number, number]): string {
  if (typeof inc === "number") return `${inc}°`;
  return `${inc[0]}–${inc[1]}°`;
}
