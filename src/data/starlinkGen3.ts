import type { OrbitGroupConfig } from "./groupConfig";
import { formatInclination } from "./groupConfig";

/** Gen3 planned / filing shells — teal tones (distinct from Gen2 blue). */
const GEN3_PARTIAL_GREY = 0x88aa99;

/**
 * Illustrative Walker layout when Schedule S only lists altitude, inclination, and
 * system cap (Table A.1.1). Filing does not publish planes × sats-per-plane.
 * 50 × 100 = 5,000 / shell × 20 shells = 100,000 system maximum.
 */
const FILING_PLANES = 50;
const FILING_SATS_PER_PLANE = 100;

function gen3PartialShell(
  id: number,
  name: string,
  altKm: number,
  incDeg: number,
  planes: number,
  satsPerPlane: number
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
    color: GEN3_PARTIAL_GREY,
    satScale: 0.42,
    trackOpacity: 0.08,
    future: true,
  };
}

function filingColor(index: number, total: number): number {
  const t = total <= 1 ? 0 : index / (total - 1);
  const r = Math.round(0x40 + t * 0x20);
  const g = Math.round(0xe8 - t * 0x40);
  const b = Math.round(0xc0 + t * 0x20);
  return (r << 16) | (g << 8) | b;
}

function gen3FilingShell(
  id: number,
  name: string,
  altKm: number,
  incDeg: number,
  color: number
): OrbitGroupConfig {
  return {
    id,
    layer: "starlink-gen2",
    name,
    altitudeKm: [altKm, altKm],
    inclinationDeg: incDeg,
    shells: 1,
    planesPerShell: FILING_PLANES,
    satsPerPlane: FILING_SATS_PER_PLANE,
    maxSats: FILING_PLANES * FILING_SATS_PER_PLANE,
    color,
    satScale: 0.4,
    trackOpacity: 0.09,
  };
}

/**
 * Partial Gen3 rollout scenario (~480 sats): early Starship cadence at key shells.
 * 1 Tbps/sat class — see starlinkHardware v3 entry.
 */
export const STARLINK_GEN3_PARTIAL: OrbitGroupConfig[] = [
  gen3PartialShell(501, "G3 480·53", 480, 53.0, 8, 15),
  gen3PartialShell(502, "G3 485·43", 485, 43.0, 8, 15),
  gen3PartialShell(503, "G3 530·53", 530, 53.0, 6, 12),
  gen3PartialShell(504, "G3 570·70", 570, 70.0, 4, 12),
];

export const STARLINK_GEN3_PARTIAL_NOMINAL = STARLINK_GEN3_PARTIAL.reduce(
  (n, g) => n + g.maxSats,
  0
);

/**
 * SpaceX Gen3 NGSO as-filed orbital parameters (Technical Attachment Table A.1.1).
 * Two thin VLEO bands: 323–327.5 km and 473–477.5 km; system maximum 100,000 sats.
 *
 * Note: Table A.1.1 text lists 323.5 km for the 53° low-band shell; the altitude ladder
 * and Table A.2 coverage values use 325.5 km — we use 325.5.
 */
const GEN3_FILING_SHELLS: ReadonlyArray<{
  altKm: number;
  incDeg: number;
  name: string;
}> = [
  { altKm: 323.0, incDeg: 26.0, name: "G3 323·26" },
  { altKm: 323.5, incDeg: 32.0, name: "G3 323.5·32" },
  { altKm: 324.0, incDeg: 38.0, name: "G3 324·38" },
  { altKm: 324.5, incDeg: 43.0, name: "G3 324.5·43" },
  { altKm: 325.0, incDeg: 48.0, name: "G3 325·48" },
  { altKm: 325.5, incDeg: 53.0, name: "G3 325.5·53" },
  { altKm: 326.0, incDeg: 60.0, name: "G3 326·60" },
  { altKm: 326.5, incDeg: 69.0, name: "G3 326.5·69" },
  { altKm: 327.0, incDeg: 76.0, name: "G3 327·76" },
  { altKm: 327.5, incDeg: 96.9, name: "G3 327.5·96.9" },
  { altKm: 473.0, incDeg: 26.0, name: "G3 473·26" },
  { altKm: 473.5, incDeg: 32.0, name: "G3 473.5·32" },
  { altKm: 474.0, incDeg: 38.0, name: "G3 474·38" },
  { altKm: 474.5, incDeg: 43.0, name: "G3 474.5·43" },
  { altKm: 475.0, incDeg: 48.0, name: "G3 475·48" },
  { altKm: 475.5, incDeg: 53.0, name: "G3 475.5·53" },
  { altKm: 476.0, incDeg: 60.0, name: "G3 476·60" },
  { altKm: 476.5, incDeg: 69.0, name: "G3 476.5·69" },
  { altKm: 477.0, incDeg: 76.0, name: "G3 477·76" },
  { altKm: 477.5, incDeg: 96.9, name: "G3 477.5·96.9" },
];

/** Full Gen3 as-filed constellation (100,000-sat system envelope). */
export const STARLINK_GEN3_FILING: OrbitGroupConfig[] = GEN3_FILING_SHELLS.map((s, i) =>
  gen3FilingShell(601 + i, s.name, s.altKm, s.incDeg, filingColor(i, GEN3_FILING_SHELLS.length))
);

export const STARLINK_GEN3_FILING_NOMINAL = STARLINK_GEN3_FILING.reduce(
  (n, g) => n + g.maxSats,
  0
);

/** FCC Gen3 system maximum (Table A.1.1). */
export const STARLINK_GEN3_SYSTEM_MAX = 100_000;

export function isGen3FilingGroup(g: OrbitGroupConfig): boolean {
  return g.id >= 601 && g.id <= 620;
}

export function isGen3PartialGroup(g: OrbitGroupConfig): boolean {
  return g.id >= 501 && g.id <= 504;
}

export function isGen3Group(g: OrbitGroupConfig): boolean {
  return isGen3FilingGroup(g) || isGen3PartialGroup(g);
}

export function starlinkGen3ShellLabel(g: OrbitGroupConfig): string {
  const tag = isGen3FilingGroup(g) ? "Gen3 filing" : "planned (Gen3)";
  return `${g.name} · ${g.altitudeKm[0]} km · i=${formatInclination(g.inclinationDeg)} · ${g.maxSats.toLocaleString()} ${tag}`;
}

/** Active Gen3 shell list for the current scenario UI. */
export function starlinkGen3GroupsForScenario(
  scenarioId: "gen3-partial" | "gen3-filing" | string
): OrbitGroupConfig[] {
  if (scenarioId === "gen3-filing") return STARLINK_GEN3_FILING;
  if (scenarioId === "gen3-partial") return STARLINK_GEN3_PARTIAL;
  return [];
}
