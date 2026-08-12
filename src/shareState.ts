import type { StarlinkScenarioId } from "./data/starlinkScenarios";
import type { StarlinkViewMode } from "./data/starlinkDeployed";
import {
  defaultOdcShareState,
  encodeOdcShareHash,
  extractOdcHashFromLocation,
  type OdcShareState,
} from "./shareOdcState";

export type { OdcShareState };

export const SHARE_STATE_VERSION = 1;

export interface SimShareState {
  v: number;
  scenario: StarlinkScenarioId;
  view: StarlinkViewMode;
  snapshotId: string;
  density: number;
  showCoverage: boolean;
  showBandwidth: boolean;
  bandwidthLayer: "broadband" | "dtc";
  concurrencyPct: number;
  minElevationDeg: number;
  nightSideDimming: boolean;
  odc?: OdcShareState;
}

export function defaultShareState(): SimShareState {
  return {
    v: SHARE_STATE_VERSION,
    scenario: "today",
    view: "operational",
    snapshotId: "2026-06-03",
    density: 100,
    showCoverage: false,
    showBandwidth: false,
    bandwidthLayer: "broadband",
    concurrencyPct: 30,
    minElevationDeg: 25,
    nightSideDimming: false,
  };
}

export function encodeShareState(state: SimShareState): string {
  const json = JSON.stringify(state);
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShareState(encoded: string): SimShareState | null {
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const parsed = JSON.parse(atob(b64)) as SimShareState;
    if (parsed.v !== SHARE_STATE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function shareUrlFromState(state: SimShareState, baseUrl = window.location.href.split("#")[0]!): string {
  const odc = state.odc ?? defaultOdcShareState();
  const odcSeg = encodeOdcShareHash(odc);
  return `${baseUrl}#s=${encodeShareState(state)}&odc=${odcSeg}`;
}

export function readShareStateFromLocation(): SimShareState | null {
  const hash = window.location.hash;
  const m = hash.match(/#s=([A-Za-z0-9_-]+)/);
  const odc = extractOdcHashFromLocation(hash);
  if (!m && !odc) return null;

  const sim = m ? decodeShareState(m[1]!) : null;
  if (sim && odc) {
    sim.odc = odc;
    return sim;
  }
  if (sim) {
    if (!sim.odc) sim.odc = defaultOdcShareState();
    return sim;
  }
  if (odc) {
    return { ...defaultShareState(), odc };
  }
  return null;
}
