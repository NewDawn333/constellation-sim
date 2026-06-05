import type { OrbitGroupConfig, SatLayoutMode } from "./groupConfig";
import { starlinkGroupsForMode, type StarlinkDeploymentMode } from "./starlinkGen1";
import {
  starlinkGen2GroupsForMode,
  type StarlinkGen2Inc365,
  type StarlinkGen2Mode,
} from "./starlinkGen2";
import {
  DEPLOYMENT_MILESTONES,
  type DeploymentMilestoneInput,
  type DeploymentSourceReading,
} from "./starlinkDeploymentMilestones";
import {
  historicalSnapshotSpec,
  STARLINK_HISTORICAL_SNAPSHOTS,
  type HistoricalSnapshotSpec,
} from "./starlinkHistoricalSnapshots";

/** Latest exact McDowell shell cut (operational orbit status O). */
export const DEPLOYMENT_SNAPSHOT_DATE = "2026-06-03";

export const DEPLOYMENT_SNAPSHOT_MC_DOWELL_UPDATED = "2026-05-25";

export const DEPLOYMENT_SNAPSHOT_SOURCE_URL = "https://planet4589.org/space/con/star/stats.html";

export interface DeployedShellRecord {
  id: number;
  layer: "starlink-gen1" | "starlink-gen2";
  name: string;
  altitudeKm: number;
  inclinationDeg: number;
  /** Satellites in operational orbit (McDowell status O). */
  operationalSats: number;
  /** FCC / observed plane count for Walker layout. */
  planesHint: number;
  note: string;
}

/**
 * Reference shell topology — Jonathan McDowell GCAT stats, updated 2026-06-04.
 * Used to allocate historical milestone totals across shells by era.
 */
export const STARLINK_DEPLOYED_REFERENCE_SHELLS: DeployedShellRecord[] = [
  {
    id: 301,
    layer: "starlink-gen1",
    name: "Gen1·550",
    altitudeKm: 550,
    inclinationDeg: 53.0,
    operationalSats: 318,
    planesHint: 72,
    note: "Group 1 V1.0/V1.5 · ~547–552 km",
  },
  {
    id: 302,
    layer: "starlink-gen1",
    name: "Gen1·540",
    altitudeKm: 540,
    inclinationDeg: 53.2,
    operationalSats: 1320,
    planesHint: 72,
    note: "Group 4 V1.5 · 539.8 km shell",
  },
  {
    id: 303,
    layer: "starlink-gen1",
    name: "Gen1·475",
    altitudeKm: 475,
    inclinationDeg: 53.2,
    operationalSats: 394,
    planesHint: 72,
    note: "Group 1 migration · 475/471 km shells",
  },
  {
    id: 304,
    layer: "starlink-gen1",
    name: "Gen1·570",
    altitudeKm: 570,
    inclinationDeg: 70.0,
    operationalSats: 337,
    planesHint: 36,
    note: "Group 2 V1.5 · 572 km shell",
  },
  {
    id: 305,
    layer: "starlink-gen1",
    name: "Gen1·560",
    altitudeKm: 560,
    inclinationDeg: 97.6,
    operationalSats: 171,
    planesHint: 6,
    note: "Group 3 polar · 549–563 km",
  },
  {
    id: 306,
    layer: "starlink-gen1",
    name: "Gen1·43",
    altitudeKm: 485,
    inclinationDeg: 43.0,
    operationalSats: 304,
    planesHint: 56,
    note: "Group 5 legacy 43° · 483–559 km (partial)",
  },
  {
    id: 401,
    layer: "starlink-gen2",
    name: "V2M·480·53",
    altitudeKm: 480,
    inclinationDeg: 53.0,
    operationalSats: 893,
    planesHint: 56,
    note: "V2 Mini shell 1 · filed 480 km",
  },
  {
    id: 402,
    layer: "starlink-gen2",
    name: "V2M·485·43",
    altitudeKm: 485,
    inclinationDeg: 43.0,
    operationalSats: 1545,
    planesHint: 56,
    note: "V2 Mini shell 2 · filed 485 km",
  },
  {
    id: 403,
    layer: "starlink-gen2",
    name: "DTC·340·53",
    altitudeKm: 340,
    inclinationDeg: 53.0,
    operationalSats: 309,
    planesHint: 56,
    note: "Direct-to-cell shell 1 · ~359 km observed",
  },
  {
    id: 404,
    layer: "starlink-gen2",
    name: "DTC·355·43",
    altitudeKm: 355,
    inclinationDeg: 43.0,
    operationalSats: 329,
    planesHint: 56,
    note: "Direct-to-cell shell 2 · ~356 km observed",
  },
  {
    id: 405,
    layer: "starlink-gen2",
    name: "V2M·570·70",
    altitudeKm: 570,
    inclinationDeg: 70.0,
    operationalSats: 42,
    planesHint: 36,
    note: "V2 Mini shell 3 · NRO/Group 15",
  },
  {
    id: 406,
    layer: "starlink-gen2",
    name: "Opt·480·53",
    altitudeKm: 480,
    inclinationDeg: 53.0,
    operationalSats: 1261,
    planesHint: 56,
    note: "V2 Mini/Optical shell 1",
  },
  {
    id: 407,
    layer: "starlink-gen2",
    name: "Opt·485·43",
    altitudeKm: 485,
    inclinationDeg: 43.0,
    operationalSats: 1049,
    planesHint: 56,
    note: "V2 Mini/Optical shell 2",
  },
  {
    id: 408,
    layer: "starlink-gen2",
    name: "Opt·570·70",
    altitudeKm: 570,
    inclinationDeg: 70.0,
    operationalSats: 310,
    planesHint: 36,
    note: "V2 Mini/Optical shell 3 · Group 15",
  },
  {
    id: 409,
    layer: "starlink-gen2",
    name: "Opt·550·97",
    altitudeKm: 550,
    inclinationDeg: 97.6,
    operationalSats: 631,
    planesHint: 6,
    note: "V2 Mini/Optical shell 4 · polar",
  },
];

/** Exact McDowell operational-orbit cut — Jun 3 2026 (9,215 op in statsdata.ppf, 9,213 in prior cut). */
export const STARLINK_DEPLOYED_2026_06_03: DeployedShellRecord[] =
  STARLINK_DEPLOYED_REFERENCE_SHELLS.map((s) => ({ ...s }));

/** @deprecated use deployedShellsForSnapshot */
export const STARLINK_DEPLOYED_GEN1_TOTAL = sumLayer(STARLINK_DEPLOYED_2026_06_03, "starlink-gen1");
export const STARLINK_DEPLOYED_GEN2_TOTAL = sumLayer(STARLINK_DEPLOYED_2026_06_03, "starlink-gen2");
export const STARLINK_DEPLOYED_TOTAL = STARLINK_DEPLOYED_GEN1_TOTAL + STARLINK_DEPLOYED_GEN2_TOTAL;

function sumLayer(shells: DeployedShellRecord[], layer: DeployedShellRecord["layer"]): number {
  return shells.filter((s) => s.layer === layer).reduce((n, s) => n + s.operationalSats, 0);
}

export function reconcileDeploymentTotal(
  primary: DeploymentSourceReading,
  secondary: DeploymentSourceReading,
  mcdowellWorking: number
): { total: number; method: string } {
  const opO = primary.count;
  const sec = secondary.count;
  if (sec <= 0) return { total: opO, method: "McDowell operational orbit only" };

  const relOp = Math.abs(opO - sec) / Math.max(opO, sec);
  if (relOp <= 0.05) {
    return { total: Math.round((opO + sec) / 2), method: "Mean of both sources (within 5%)" };
  }
  if (Math.abs(mcdowellWorking - sec) / sec <= 0.05) {
    return {
      total: mcdowellWorking,
      method: `McDowell working (${mcdowellWorking.toLocaleString()}) matches ${secondary.name}`,
    };
  }
  return {
    total: Math.round(0.5 * opO + 0.25 * mcdowellWorking + 0.25 * sec),
    method: "Weighted blend (50% op orbit · 25% working · 25% secondary)",
  };
}

export type StarlinkViewMode = "nominal" | "operational";

export interface DeploymentSnapshotMeta {
  id: string;
  label: string;
  asOf: string;
  /** Reconciled total used for visualization. */
  totalOperational: number;
  gen1Total: number;
  gen2Total: number;
  primary: DeploymentSourceReading;
  secondary: DeploymentSourceReading;
  mcdowellWorking: number;
  reconciliationMethod: string;
  sourceUpdated?: string;
  sourceUrl?: string;
  notes?: string;
  /** True when shell counts are exact McDowell cut, not allocated from reference. */
  exactShellCut: boolean;
  /** Launch-train vs mature Walker layout for orbital visualization. */
  layout?: HistoricalSnapshotSpec["layout"];
  trainSize?: number;
}

const HISTORICAL_SHELLS = new Map<string, DeployedShellRecord[]>(
  STARLINK_HISTORICAL_SNAPSHOTS.map((s) => [s.id, s.shells])
);

function metaFromMilestone(m: DeploymentMilestoneInput): DeploymentSnapshotMeta {
  const shells = HISTORICAL_SHELLS.get(m.id)!;
  const hist = historicalSnapshotSpec(m.id);
  const { total, method } = reconcileDeploymentTotal(m.primary, m.secondary, m.mcdowellWorking);
  return {
    id: m.id,
    label: `${m.label} · ${total.toLocaleString()} op`,
    asOf: m.asOf,
    totalOperational: total,
    gen1Total: sumLayer(shells, "starlink-gen1"),
    gen2Total: sumLayer(shells, "starlink-gen2"),
    primary: m.primary,
    secondary: m.secondary,
    mcdowellWorking: m.mcdowellWorking,
    reconciliationMethod: method,
    notes: m.notes,
    exactShellCut: false,
    layout: hist?.layout,
    trainSize: hist?.trainSize,
  };
}

const JUN_2026_META: DeploymentSnapshotMeta = {
  id: "2026-06-03",
  label: `Jun 3 2026 · ${STARLINK_DEPLOYED_TOTAL.toLocaleString()} op`,
  asOf: DEPLOYMENT_SNAPSHOT_DATE,
  totalOperational: STARLINK_DEPLOYED_TOTAL,
  gen1Total: STARLINK_DEPLOYED_GEN1_TOTAL,
  gen2Total: STARLINK_DEPLOYED_GEN2_TOTAL,
  primary: {
    name: "Jonathan McDowell GCAT",
    url: DEPLOYMENT_SNAPSHOT_SOURCE_URL,
    asOf: DEPLOYMENT_SNAPSHOT_DATE,
    metric: "operational_orbit",
    count: STARLINK_DEPLOYED_TOTAL,
  },
  secondary: {
    name: "Jonathan McDowell GCAT (statsdata.ppf)",
    url: "https://planet4589.org/space/con/star/statsdata.ppf",
    asOf: "2026-06-04",
    metric: "operational_orbit",
    count: 9215,
  },
  mcdowellWorking: 10540,
  reconciliationMethod: "Exact per-shell operational orbit (status O)",
  sourceUpdated: DEPLOYMENT_SNAPSHOT_MC_DOWELL_UPDATED,
  sourceUrl: DEPLOYMENT_SNAPSHOT_SOURCE_URL,
  notes: "Current cut · 15 observed shells",
  exactShellCut: true,
};

export const DEPLOYMENT_SNAPSHOTS: DeploymentSnapshotMeta[] = [
  JUN_2026_META,
  ...DEPLOYMENT_MILESTONES.map(metaFromMilestone),
].sort((a, b) => b.asOf.localeCompare(a.asOf) || b.id.localeCompare(a.id));

export function deploymentSnapshotById(id: string): DeploymentSnapshotMeta | undefined {
  return DEPLOYMENT_SNAPSHOTS.find((s) => s.id === id);
}

export function deployedShellsForSnapshot(snapshotId: string): DeployedShellRecord[] {
  if (snapshotId === "2026-06-03") return STARLINK_DEPLOYED_2026_06_03;
  return HISTORICAL_SHELLS.get(snapshotId) ?? [];
}

export function snapshotLayoutForId(snapshotId: string): {
  layout: SatLayoutMode;
  trainSize: number;
} {
  if (snapshotId === "2026-06-03") return { layout: "walker", trainSize: 53 };
  const hist = historicalSnapshotSpec(snapshotId);
  return { layout: hist?.layout ?? "walker", trainSize: hist?.trainSize ?? 60 };
}

function fitWalkerLayout(
  count: number,
  planesHint: number
): { planesPerShell: number; satsPerPlane: number } {
  let planes = Math.min(planesHint, count);
  if (planes < 1) planes = 1;
  while (planes > 1 && count % planes !== 0 && planes > 4) planes--;
  const satsPerPlane = Math.max(1, Math.ceil(count / planes));
  return { planesPerShell: planes, satsPerPlane };
}

function fitLaunchTrainLayout(
  count: number,
  trainSize: number
): { planesPerShell: number; satsPerPlane: number } {
  const planes = Math.max(1, Math.ceil(count / trainSize));
  return { planesPerShell: planes, satsPerPlane: trainSize };
}

function fitPlaneLayout(
  count: number,
  planesHint: number,
  layout: SatLayoutMode,
  trainSize: number
): { planesPerShell: number; satsPerPlane: number } {
  if (layout === "launch_train") return fitLaunchTrainLayout(count, trainSize);
  return fitWalkerLayout(count, planesHint);
}

const GEN1_COLOR = 0xd4a574;
const GEN2_COLOR = 0x5eb8ff;

export function deployedShellToGroupConfig(
  shell: DeployedShellRecord,
  snapshotId = "2026-06-03"
): OrbitGroupConfig {
  const { layout, trainSize } = snapshotLayoutForId(snapshotId);
  const { planesPerShell, satsPerPlane } = fitPlaneLayout(
    shell.operationalSats,
    shell.planesHint,
    layout,
    trainSize
  );
  const isGen1 = shell.layer === "starlink-gen1";
  return {
    id: shell.id,
    layer: shell.layer,
    name: shell.name,
    altitudeKm: [shell.altitudeKm, shell.altitudeKm],
    inclinationDeg: shell.inclinationDeg,
    shells: 1,
    planesPerShell,
    satsPerPlane,
    maxSats: shell.operationalSats,
    color: isGen1 ? GEN1_COLOR : GEN2_COLOR,
    satScale: isGen1 ? 0.55 : 0.48,
    trackOpacity: isGen1 ? 0.12 : 0.11,
    satLayout: layout,
    launchTrainSize: trainSize,
  };
}

export function starlinkDeployedGroups(snapshotId = "2026-06-03"): OrbitGroupConfig[] {
  return deployedShellsForSnapshot(snapshotId).map((s) => deployedShellToGroupConfig(s, snapshotId));
}

export function deployedShellLabel(
  g: OrbitGroupConfig,
  snapshotId = "2026-06-03"
): string {
  const records = deployedShellsForSnapshot(snapshotId);
  const rec = records.find((s) => s.id === g.id);
  return `${g.name} · ${g.altitudeKm[0]} km · i=${g.inclinationDeg}° · ${g.maxSats.toLocaleString()} op${rec ? ` · ${rec.note}` : ""}`;
}

export function snapshotSourceSummary(snapshotId: string): string {
  const meta = deploymentSnapshotById(snapshotId);
  if (!meta) return "";
  const a = `${meta.primary.name}: ${meta.primary.count.toLocaleString()} (${meta.primary.metric.replace("_", " ")})`;
  const b = `${meta.secondary.name}: ${meta.secondary.count.toLocaleString()} (${meta.secondary.metric.replace("_", " ")})`;
  const est = meta.exactShellCut
    ? "Exact shell cut"
    : `Best guess ${meta.totalOperational.toLocaleString()} — ${meta.reconciliationMethod}`;
  return `${a} · ${b} · ${est}`;
}

export function starlinkGroupsForView(
  view: StarlinkViewMode,
  snapshotId: string,
  nominal: {
    gen1Mode: StarlinkDeploymentMode;
    gen2Mode: StarlinkGen2Mode;
    gen2Inc365: StarlinkGen2Inc365;
  }
): OrbitGroupConfig[] {
  if (view === "operational" && deploymentSnapshotById(snapshotId)) {
    return starlinkDeployedGroups(snapshotId);
  }
  return [
    ...starlinkGroupsForMode(nominal.gen1Mode),
    ...starlinkGen2GroupsForMode(nominal.gen2Mode, nominal.gen2Inc365),
  ];
}
