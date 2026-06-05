export type ConstellationLayerId = "odc" | "starlink-gen1" | "starlink-gen2";

/** Walker = evenly spaced planes; launch_train = Falcon 9 batches (~60 sats) per plane. */
export type SatLayoutMode = "walker" | "launch_train";

export interface OrbitGroupConfig {
  id: number;
  layer: ConstellationLayerId;
  name: string;
  altitudeKm: [number, number];
  inclinationDeg: number | [number, number];
  shells: number;
  planesPerShell: number;
  satsPerPlane: number;
  maxSats: number;
  color: number;
  /** Satellite point scale relative to ODC default (1.0). */
  satScale?: number;
  /** Orbital track base opacity. */
  trackOpacity?: number;
  /** How satellites are distributed across planes (historical launch trains vs mature Walker). */
  satLayout?: SatLayoutMode;
  /** Satellites per Falcon 9 launch when satLayout is launch_train. */
  launchTrainSize?: number;
  /** Planned / not-yet-operational shell — dashed tracks, excluded from coverage stamps. */
  future?: boolean;
}

export function isFutureGroup(g: OrbitGroupConfig): boolean {
  return g.future === true;
}

export function formatInclination(inc: number | [number, number]): string {
  if (typeof inc === "number") return `${inc}°`;
  return `${inc[0]}–${inc[1]}°`;
}

export function groupLabel(g: OrbitGroupConfig): string {
  const alt =
    g.altitudeKm[0] === g.altitudeKm[1]
      ? `${g.altitudeKm[0]} km`
      : `${g.altitudeKm[0]}–${g.altitudeKm[1]} km`;
  return `${g.name}: ${alt}, i=${formatInclination(g.inclinationDeg)}`;
}

export function isPolarGroup(g: OrbitGroupConfig): boolean {
  const inc = typeof g.inclinationDeg === "number" ? g.inclinationDeg : g.inclinationDeg[1];
  return inc > 85 && g.planesPerShell <= 8;
}

export function isOdcGroup(g: OrbitGroupConfig): boolean {
  return g.layer === "odc";
}

export function isStarlinkGroup(g: OrbitGroupConfig): boolean {
  return g.layer === "starlink-gen1" || g.layer === "starlink-gen2";
}

export function isStarlinkGen1Group(g: OrbitGroupConfig): boolean {
  return g.layer === "starlink-gen1";
}

export function isStarlinkGen2Group(g: OrbitGroupConfig): boolean {
  return g.layer === "starlink-gen2";
}
