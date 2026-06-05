import type { OrbitGroupConfig } from "./groupConfig";

/** Gen3 scenario shells — not yet in McDowell operational cut (H1 2026+ target). */
const GEN3_GREY = 0x88aa99;

function gen3Shell(
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
    color: GEN3_GREY,
    satScale: 0.42,
    trackOpacity: 0.08,
    future: true,
  };
}

/**
 * Partial Gen3 rollout scenario (~480 sats): early Starship cadence at key shells.
 * 1 Tbps/sat class — see starlinkHardware v3 entry.
 */
export const STARLINK_GEN3_PARTIAL: OrbitGroupConfig[] = [
  gen3Shell(501, "G3 480·53", 480, 53.0, 8, 15),
  gen3Shell(502, "G3 485·43", 485, 43.0, 8, 15),
  gen3Shell(503, "G3 530·53", 530, 53.0, 6, 12),
  gen3Shell(504, "G3 570·70", 570, 70.0, 4, 12),
];

export const STARLINK_GEN3_PARTIAL_NOMINAL = STARLINK_GEN3_PARTIAL.reduce(
  (n, g) => n + g.maxSats,
  0
);

export function starlinkGen3ShellLabel(g: OrbitGroupConfig): string {
  return `${g.name} · ${g.altitudeKm[0]} km · i=${g.inclinationDeg}° · ${g.maxSats.toLocaleString()} planned (Gen3)`;
}
