import type { OrbitGroupConfig } from "./groupConfig";
import { isStarlinkGroup } from "./groupConfig";

/** Starlink satellite hardware generation for coverage / capacity modeling. */
export type HardwareClassId = "v1" | "v1.5" | "v2m" | "dtc-v1" | "dtc-v2" | "v3";

export type BandwidthLayer = "broadband" | "dtc";

export interface HardwareClassSpec {
  id: HardwareClassId;
  name: string;
  minElevationDeg: number;
  /** Overlay tint (hex) — coverage mode. */
  color: number;
  /** Nominal downlink Gbps/sat (public estimates). */
  downlinkGbps: number;
  uplinkGbps: number;
  isDtc: boolean;
}

/** Per-class downlink from Starlink network update / TheXLab FCC analysis (Jun 2025). DTC illustrative. */
export const HARDWARE_CLASSES: Record<HardwareClassId, HardwareClassSpec> = {
  v1: {
    id: "v1",
    name: "Starlink V1.0",
    minElevationDeg: 25,
    color: 0xc9a066,
    downlinkGbps: 24,
    uplinkGbps: 1.7,
    isDtc: false,
  },
  "v1.5": {
    id: "v1.5",
    name: "Starlink V1.5",
    minElevationDeg: 25,
    color: 0xd4a574,
    downlinkGbps: 24,
    uplinkGbps: 1.7,
    isDtc: false,
  },
  v2m: {
    id: "v2m",
    name: "V2 Mini",
    minElevationDeg: 25,
    color: 0x5eb8ff,
    downlinkGbps: 96,
    uplinkGbps: 6.7,
    isDtc: false,
  },
  "dtc-v1": {
    id: "dtc-v1",
    name: "Direct-to-Cell v1",
    minElevationDeg: 10,
    color: 0xb88cff,
    downlinkGbps: 0.003,
    uplinkGbps: 0.0005,
    isDtc: true,
  },
  "dtc-v2": {
    id: "dtc-v2",
    name: "Direct-to-Cell v2",
    minElevationDeg: 10,
    color: 0xda9cff,
    downlinkGbps: 0.012,
    uplinkGbps: 0.002,
    isDtc: true,
  },
  v3: {
    id: "v3",
    name: "Gen3 (future)",
    minElevationDeg: 25,
    color: 0x66ffcc,
    downlinkGbps: 1000,
    uplinkGbps: 160,
    isDtc: false,
  },
};

export interface HardwareClassFilter {
  v1: boolean;
  v1_5: boolean;
  v2m: boolean;
  dtcV1: boolean;
  dtcV2: boolean;
  v3: boolean;
}

export const DEFAULT_HARDWARE_FILTER: HardwareClassFilter = {
  v1: true,
  v1_5: true,
  v2m: true,
  dtcV1: true,
  dtcV2: true,
  v3: true,
};

const GEN1_SHELL_IDS = new Set([301, 302, 303, 304, 305, 306]);
const V2M_SHELL_IDS = new Set([401, 402, 405, 406, 407, 408, 409]);
const DTC_SHELL_IDS = new Set([403, 404]);
const GEN3_PARTIAL_SHELL_IDS = new Set([501, 502, 503, 504]);

export function hardwareClassForShellId(
  shellId: number,
  snapshotAsOf = "2026-06-03"
): HardwareClassId {
  if (GEN3_PARTIAL_SHELL_IDS.has(shellId) || (shellId >= 601 && shellId <= 620)) return "v3";
  if (GEN1_SHELL_IDS.has(shellId)) return "v1.5";
  if (V2M_SHELL_IDS.has(shellId)) return "v2m";
  if (DTC_SHELL_IDS.has(shellId)) {
    return snapshotAsOf >= "2025-01-01" ? "dtc-v2" : "dtc-v1";
  }
  return "v1.5";
}

export function hardwareClassForGroup(
  group: OrbitGroupConfig,
  snapshotAsOf = "2026-06-03"
): HardwareClassId {
  if (!isStarlinkGroup(group)) return "v1.5";
  return hardwareClassForShellId(group.id, snapshotAsOf);
}

export function hardwareSpecForGroup(
  group: OrbitGroupConfig,
  snapshotAsOf = "2026-06-03"
): HardwareClassSpec {
  return HARDWARE_CLASSES[hardwareClassForGroup(group, snapshotAsOf)];
}

export function isHardwareClassEnabled(
  id: HardwareClassId,
  filter: HardwareClassFilter
): boolean {
  switch (id) {
    case "v1":
      return filter.v1;
    case "v1.5":
      return filter.v1_5;
    case "v2m":
      return filter.v2m;
    case "dtc-v1":
      return filter.dtcV1;
    case "dtc-v2":
      return filter.dtcV2;
    case "v3":
      return filter.v3;
  }
}

export function matchesBandwidthLayer(spec: HardwareClassSpec, layer: BandwidthLayer): boolean {
  return layer === "dtc" ? spec.isDtc : !spec.isDtc;
}
