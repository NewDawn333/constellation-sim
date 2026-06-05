import type { OrbitGroupConfig } from "./groupConfig";

export type { OrbitGroupConfig, ConstellationLayerId } from "./groupConfig";
export { groupLabel, formatInclination, isPolarGroup, isOdcGroup, isStarlinkGroup, isStarlinkGen1Group, isStarlinkGen2Group } from "./groupConfig";

/** Table 1: Orbital Data Center groups (May 2026 filing) */
export const ORBIT_GROUPS: OrbitGroupConfig[] = [
  {
    id: 1,
    layer: "odc",
    name: "ODC G1",
    altitudeKm: [550, 568],
    inclinationDeg: [26, 32],
    shells: 10,
    planesPerShell: 30,
    satsPerPlane: 333,
    maxSats: 99_900,
    color: 0x4ecdc4,
  },
  {
    id: 2,
    layer: "odc",
    name: "ODC G2",
    altitudeKm: [565, 585],
    inclinationDeg: 97.7,
    shells: 10,
    planesPerShell: 2,
    satsPerPlane: 4999,
    maxSats: 99_980,
    color: 0xff9f43,
  },
  {
    id: 3,
    layer: "odc",
    name: "ODC G3",
    altitudeKm: [686, 718],
    inclinationDeg: 30,
    shells: 25,
    planesPerShell: 30,
    satsPerPlane: 333,
    maxSats: 249_750,
    color: 0x54a0ff,
  },
  {
    id: 4,
    layer: "odc",
    name: "ODC G4",
    altitudeKm: [707, 744],
    inclinationDeg: 97.2,
    shells: 22,
    planesPerShell: 2,
    satsPerPlane: 5565,
    maxSats: 244_860,
    color: 0xff6b6b,
  },
  {
    id: 5,
    layer: "odc",
    name: "ODC G5",
    altitudeKm: [946, 978],
    inclinationDeg: 30,
    shells: 25,
    planesPerShell: 30,
    satsPerPlane: 333,
    maxSats: 249_750,
    color: 0x5cd85a,
  },
  {
    id: 6,
    layer: "odc",
    name: "ODC G6",
    altitudeKm: [967, 1002],
    inclinationDeg: 99.4,
    shells: 22,
    planesPerShell: 2,
    satsPerPlane: 5770,
    maxSats: 253_880,
    color: 0xc77dff,
  },
];

export const ODC_NOMINAL_TOTAL = ORBIT_GROUPS.reduce((n, g) => n + g.maxSats, 0);

export const ODC_POLAR_GROUPS = ORBIT_GROUPS.filter((g) => {
  const inc = typeof g.inclinationDeg === "number" ? g.inclinationDeg : g.inclinationDeg[1];
  return inc > 85 && g.planesPerShell <= 8;
});

export const ODC_INCLINED_GROUPS = ORBIT_GROUPS.filter((g) => !ODC_POLAR_GROUPS.includes(g));

export const ODC_POLAR_NOMINAL_TOTAL = ODC_POLAR_GROUPS.reduce((n, g) => n + g.maxSats, 0);
export const ODC_INCLINED_NOMINAL_TOTAL = ODC_INCLINED_GROUPS.reduce((n, g) => n + g.maxSats, 0);

/** shells × planesPerShell × satsPerPlane (matches maxSats in filing). */
export function groupNominalBreakdown(g: OrbitGroupConfig): {
  planes: number;
  nominalSats: number;
} {
  const planes = g.shells * g.planesPerShell;
  return { planes, nominalSats: planes * g.satsPerPlane };
}
