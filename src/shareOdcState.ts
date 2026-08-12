import {
  DEFAULT_ODC_LAUNCH_SCENARIO_ID,
  ODC_LAUNCH_SCENARIOS,
  type OdcLaunchScenarioId,
} from "./data/odcLaunchScenarios";
import {
  ODC_COMPUTE_TIERS,
  type OdcComputeTierId,
} from "./data/odcComputeSpec";
import type { DeploymentFillOrder } from "./model/odcDeployment";

export interface OdcShareState {
  scenario: OdcLaunchScenarioId;
  year: number;
  /** When set, overrides tier on all schedule entries for compute math. */
  tier?: OdcComputeTierId;
  fill?: DeploymentFillOrder;
  deploy3d?: boolean;
  train?: boolean;
  payloadTon?: number;
  satMassTon?: number;
  powerMwPerSat?: number;
  satsPerLaunch?: number;
  /** groupId:shellIndex → launch count */
  shellLaunches?: Record<string, number>;
}

const SCENARIO_IDS = new Set<OdcLaunchScenarioId>(ODC_LAUNCH_SCENARIOS.map((s) => s.id));
const TIER_IDS = new Set<OdcComputeTierId>(Object.keys(ODC_COMPUTE_TIERS) as OdcComputeTierId[]);
const FILL_ORDERS = new Set<DeploymentFillOrder>(["altitude-asc", "polar-first", "proportional"]);

export function defaultOdcShareState(): OdcShareState {
  return {
    scenario: DEFAULT_ODC_LAUNCH_SCENARIO_ID,
    year: 2035,
    fill: "altitude-asc",
    deploy3d: false,
    train: false,
  };
}

/** Human-readable segment: scenario:ramp-2030;year:2035;tier:mini */
export function encodeOdcShareHash(state: OdcShareState): string {
  const parts = [`scenario:${state.scenario}`, `year:${state.year}`];
  if (state.tier) parts.push(`tier:${state.tier}`);
  if (state.fill && state.fill !== "altitude-asc") parts.push(`fill:${state.fill}`);
  if (state.deploy3d) parts.push("deploy3d:1");
  if (state.train) parts.push("train:1");
  if (state.payloadTon != null && state.payloadTon !== 100) parts.push(`payload:${state.payloadTon}`);
  if (state.satMassTon != null && state.satMassTon !== 1) parts.push(`mass:${state.satMassTon}`);
  if (state.powerMwPerSat != null && state.powerMwPerSat !== 0.1) parts.push(`power:${state.powerMwPerSat}`);
  if (state.satsPerLaunch != null) parts.push(`spsl:${state.satsPerLaunch}`);
  if (state.shellLaunches) {
    for (const [k, v] of Object.entries(state.shellLaunches)) {
      if (v > 0) parts.push(`sh:${k}:${v}`);
    }
  }
  return parts.join(";");
}

export function decodeOdcShareHash(encoded: string): OdcShareState | null {
  const state = defaultOdcShareState();
  let found = false;

  for (const raw of encoded.split(";")) {
    const piece = raw.trim();
    if (!piece) continue;
    const colon = piece.indexOf(":");
    if (colon <= 0) continue;
    const key = piece.slice(0, colon);
    const val = piece.slice(colon + 1);
    found = true;

    switch (key) {
      case "scenario":
        if (SCENARIO_IDS.has(val as OdcLaunchScenarioId)) state.scenario = val as OdcLaunchScenarioId;
        break;
      case "year": {
        const y = Number(val);
        if (Number.isFinite(y)) state.year = Math.round(y);
        break;
      }
      case "tier":
        if (TIER_IDS.has(val as OdcComputeTierId)) state.tier = val as OdcComputeTierId;
        break;
      case "fill":
        if (FILL_ORDERS.has(val as DeploymentFillOrder)) state.fill = val as DeploymentFillOrder;
        break;
      case "deploy3d":
        state.deploy3d = val === "1" || val === "true";
        break;
      case "train":
        state.train = val === "1" || val === "true";
        break;
      case "payload": {
        const n = Number(val);
        if (Number.isFinite(n)) state.payloadTon = n;
        break;
      }
      case "mass": {
        const n = Number(val);
        if (Number.isFinite(n)) state.satMassTon = n;
        break;
      }
      case "power": {
        const n = Number(val);
        if (Number.isFinite(n)) state.powerMwPerSat = n;
        break;
      }
      case "spsl": {
        const n = Number(val);
        if (Number.isFinite(n)) state.satsPerLaunch = Math.floor(n);
        break;
      }
      case "sh": {
        const colon = val.lastIndexOf(":");
        if (colon > 0) {
          const shellKey = val.slice(0, colon);
          const launches = Number(val.slice(colon + 1));
          if (Number.isFinite(launches) && launches > 0) {
            state.shellLaunches ??= {};
            state.shellLaunches[shellKey] = Math.floor(launches);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  return found ? state : null;
}

export function extractOdcHashFromLocation(hash: string): OdcShareState | null {
  const m = hash.match(/(?:^|[&#])odc=([^&]+)/);
  if (!m) return null;
  return decodeOdcShareHash(decodeURIComponent(m[1]!));
}
