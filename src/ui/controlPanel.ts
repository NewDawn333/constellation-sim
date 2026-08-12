import {
  computeStats,
  ORBIT_GROUPS,
  ODC_NOMINAL_TOTAL,
  ODC_POLAR_NOMINAL_TOTAL,
  ODC_INCLINED_NOMINAL_TOTAL,
  STARLINK_GEN1_NOMINAL_AUTHORIZED,
  STARLINK_GEN1_NOMINAL_DEPLOYED,
  STARLINK_GEN2_FCC_TRANCHE_CAP,
  STARLINK_GEN2_NOMINAL_APPLICATION,
  GEN1_GEN2_ALTITUDE_GAP_KM,
  deployedShellLabel,
  starlinkDeployedGroups,
  starlinkGroupsForMode,
  starlinkShellLabel,
  starlinkGen2GroupsForMode,
  starlinkGen2ShellLabel,
  DEPLOYMENT_SNAPSHOTS,
  deploymentSnapshotById,
  snapshotSourceSummary,
  isPolarGroup,
  type UnifiedConstellation,
  type OrbitGroupConfig,
  type StarlinkDeploymentMode,
  type StarlinkGen2Mode,
  type StarlinkGen2Inc365,
  type StarlinkViewMode,
} from "../constellation";
import {
  STARLINK_GEN3_SYSTEM_MAX,
  starlinkGen3GroupsForScenario,
  starlinkGen3ShellLabel,
} from "../data/starlinkGen3";
import {
  STARLINK_SCENARIOS,
  scenarioApplyHints,
  type StarlinkScenarioId,
} from "../data/starlinkScenarios";
import type { ConstellationRenderer, TrackMode } from "../constellationRenderer";
import { shellSelectionKey } from "../constellationRenderer";
import { DENSITY_STEPS, formatDensityLabel, formatSatSizeLabel, satSizeSliderToScale } from "../orbits";
import {
  DEFAULT_ODC_LAUNCH_SCENARIO_ID,
  ODC_LAUNCH_SCENARIOS,
  expandScenarioSchedule,
  odcLaunchScenarioById,
  type OdcLaunchScenarioId,
} from "../data/odcLaunchScenarios";
import {
  formatComputeTflops,
  formatGw,
  formatRubinMultiple,
  simulateOdcDeployment,
  snapshotAtYear,
  type DeploymentFillOrder,
} from "../model/odcDeployment";
import { buildOdcCapacitySummaryText, buildOdcCapacityOverlayLines } from "../model/odcCapacitySummary";
import {
  capacityDeltaSincePriorYear,
  cappedSatsThroughYear,
  effectiveSnapshot,
  groupEffectiveCapacities,
  weightedSunDuty,
} from "../model/odcSunDuty";
import { drawOdcCapacityChart } from "./odcCapacityChart";
import {
  buildOdcDisplayDeployAttributes,
  globalDeployYearRange,
  type GroupDisplayDeployAttributes,
} from "../model/odcDeployIndex";
import type { OdcDeployVisualState } from "../render/odcGpuSats";
import {
  ODC_COMPUTE_TIERS,
  DEFAULT_COMPUTE_TIER_ID,
  type OdcComputeTierId,
} from "../data/odcComputeSpec";
import type { OdcShareState } from "../shareOdcState";
import {
  DEFAULT_ODC_LAUNCH_PHYSICS,
  derivedSatsPerLaunch,
  deployedSatsForShell,
  effectiveSatsPerLaunch,
  manualFleetCapacity,
  manualLaunchActive,
  maxLaunchesForShell,
  shellKey,
  type OdcLaunchPhysics,
} from "../model/odcManualLaunch";

import type { SimUIHandlers } from "./types";

export class ControlPanel {
  private enabledOdcShells = new Map<number, Set<number>>();
  private enabledStarlinkGen1 = new Set<number>();
  private enabledStarlinkGen2 = new Set<number>();
  private enabledStarlinkDeployed = new Set<number>();
  private enabledStarlinkGen3 = new Set<number>();
  private starlinkScenario: StarlinkScenarioId = "today";
  private starlinkView: StarlinkViewMode = "nominal";
  private deploymentSnapshotId = "2026-06-03";
  private starlinkDeployment: StarlinkDeploymentMode = "authorized";
  private starlinkGen2Mode: StarlinkGen2Mode = "granted";
  private starlinkGen2Inc365: StarlinkGen2Inc365 = "28";
  private isolatePlane = false;
  private focusedShells = new Set<string>();
  private densityStepIndex = 6;
  private odcLaunchScenario: OdcLaunchScenarioId = DEFAULT_ODC_LAUNCH_SCENARIO_ID;
  private odcSimYear = 2035;
  private odcFillOrder: DeploymentFillOrder = "altitude-asc";
  private odcDeploy3d = false;
  private odcLaunchTrain = false;
  private odcTierOverride?: OdcComputeTierId;
  private odcLaunchPhysics: OdcLaunchPhysics = { ...DEFAULT_ODC_LAUNCH_PHYSICS };
  private odcShellLaunches = new Map<string, number>();
  private odcSatsPerLaunchManual = false;
  private readonly odcShellLaunchSliders = new Map<string, HTMLInputElement>();
  private readonly odcShellLaunchMetas = new Map<string, HTMLElement>();

  private readonly statsEl: HTMLElement;
  private readonly inspectorEl: HTMLElement;
  private readonly odcGroupCheckboxes = new Map<number, HTMLInputElement>();
  private readonly odcShellCheckboxes = new Map<string, HTMLInputElement>();
  private readonly starlinkGen1Checkboxes = new Map<number, HTMLInputElement>();
  private readonly starlinkGen2Checkboxes = new Map<number, HTMLInputElement>();
  private readonly starlinkDeployedCheckboxes = new Map<number, HTMLInputElement>();
  private readonly starlinkGen3Checkboxes = new Map<number, HTMLInputElement>();

  constructor(
    private handlers: SimUIHandlers,
    private getModel: () => UnifiedConstellation,
    private getRenderer: () => ConstellationRenderer
  ) {
    this.statsEl = document.getElementById("stats")!;
    this.inspectorEl = document.getElementById("inspector")!;

    this.wireControls();
    this.buildOdcLaunchPlannerPanel();
    this.buildOdcGroupPanel();
    this.buildOdcComputePanel();
    this.buildInspector();
    this.refreshStats();
  }

  getEnabledOdcShellsByGroup(): Map<number, Set<number>> {
    return this.enabledOdcShells;
  }

  getOdcLaunchPhysics(): OdcLaunchPhysics {
    return { ...this.odcLaunchPhysics };
  }

  getOdcShellLaunches(): Map<string, number> {
    return new Map(this.odcShellLaunches);
  }

  getManualLaunchBuildOptions():
    | { physics: OdcLaunchPhysics; shellLaunches: Map<string, number> }
    | undefined {
    return {
      physics: { ...this.odcLaunchPhysics },
      shellLaunches: new Map(this.odcShellLaunches),
    };
  }

  isManualLaunchActive(): boolean {
    return manualLaunchActive(this.odcShellLaunches);
  }

  private odcEnabledGroupIds(): Set<number> {
    const ids = new Set<number>();
    for (const [gid, shells] of this.enabledOdcShells) {
      if (shells.size > 0) ids.add(gid);
    }
    return ids;
  }

  getEnabledGroups(): Set<number> {
    const odc = this.odcEnabledGroupIds();
    if (this.starlinkScenario === "gen3-filing") {
      return new Set([...odc, ...this.enabledStarlinkGen3]);
    }
    if (this.starlinkScenario === "gen3-partial" && this.starlinkView === "operational") {
      return new Set([...odc, ...this.enabledStarlinkDeployed, ...this.enabledStarlinkGen3]);
    }
    if (this.starlinkView === "operational") {
      return new Set([...odc, ...this.enabledStarlinkDeployed]);
    }
    return new Set([...odc, ...this.enabledStarlinkGen1, ...this.enabledStarlinkGen2]);
  }

  private gen3Shells(): OrbitGroupConfig[] {
    return starlinkGen3GroupsForScenario(this.starlinkScenario);
  }

  getOdcSimYear(): number {
    return this.odcSimYear;
  }

  isOdcLaunchTrainEnabled(): boolean {
    return this.odcLaunchTrain;
  }

  isOdcDeploy3dEnabled(): boolean {
    return this.odcDeploy3d;
  }

  getOdcShareState(): OdcShareState {
    const shellLaunches: Record<string, number> = {};
    for (const [k, v] of this.odcShellLaunches) {
      if (v > 0) shellLaunches[k] = v;
    }
    return {
      scenario: this.odcLaunchScenario,
      year: this.odcSimYear,
      tier: this.odcTierOverride,
      fill: this.odcFillOrder,
      deploy3d: this.odcDeploy3d,
      train: this.odcLaunchTrain,
      payloadTon: this.odcLaunchPhysics.payloadTon,
      satMassTon: this.odcLaunchPhysics.satMassTon,
      powerMwPerSat: this.odcLaunchPhysics.powerMwPerSat,
      satsPerLaunch: this.odcSatsPerLaunchManual
        ? this.odcLaunchPhysics.satsPerLaunchOverride
        : undefined,
      shellLaunches: Object.keys(shellLaunches).length > 0 ? shellLaunches : undefined,
    };
  }

  applyOdcShareState(odc: OdcShareState): void {
    this.odcLaunchScenario = odc.scenario;
    this.odcSimYear = odc.year;
    this.odcFillOrder = odc.fill ?? "altitude-asc";
    this.odcTierOverride = odc.tier;
    this.odcDeploy3d = odc.deploy3d ?? false;
    this.odcLaunchTrain = odc.train ?? false;

    (document.getElementById("odc-launch-scenario") as HTMLSelectElement).value = odc.scenario;
    (document.getElementById("odc-fill-order") as HTMLSelectElement).value = this.odcFillOrder;
    (document.getElementById("odc-compute-tier") as HTMLSelectElement).value =
      this.odcTierOverride ?? "";
    (document.getElementById("odc-deploy-3d") as HTMLInputElement).checked = this.odcDeploy3d;
    (document.getElementById("odc-launch-train") as HTMLInputElement).checked = this.odcLaunchTrain;

    this.syncOdcSimYearSlider();
    this.updateOdcLaunchScenarioHint();
    this.refreshOdcComputeReadout();
    this.syncOdcDeployView();

    if (odc.payloadTon != null) this.odcLaunchPhysics.payloadTon = odc.payloadTon;
    if (odc.satMassTon != null) this.odcLaunchPhysics.satMassTon = odc.satMassTon;
    if (odc.powerMwPerSat != null) this.odcLaunchPhysics.powerMwPerSat = odc.powerMwPerSat;
    if (odc.satsPerLaunch != null) {
      this.odcLaunchPhysics.satsPerLaunchOverride = odc.satsPerLaunch;
      this.odcSatsPerLaunchManual = true;
    } else {
      this.odcLaunchPhysics.satsPerLaunchOverride = undefined;
      this.odcSatsPerLaunchManual = false;
    }
    this.odcShellLaunches.clear();
    if (odc.shellLaunches) {
      for (const [k, v] of Object.entries(odc.shellLaunches)) {
        this.odcShellLaunches.set(k, v);
      }
    }
    this.syncOdcLaunchPlannerInputs();
    this.syncAllShellLaunchSliders();
    this.refreshManualLaunchReadout();
    this.handlers.onOdcManualLaunchChange();
  }

  buildOdcCapacityOverlayLines(): string[] {
    if (this.isManualLaunchActive()) {
      return this.buildManualLaunchOverlayLines();
    }
    const scenario = odcLaunchScenarioById(this.odcLaunchScenario);
    const schedule = this.expandedOdcSchedule();
    const sim = simulateOdcDeployment(schedule, { fillOrder: this.odcFillOrder });
    const tierLabel = this.odcTierOverride
      ? ODC_COMPUTE_TIERS[this.odcTierOverride].label
      : undefined;
    return buildOdcCapacityOverlayLines(scenario, sim, this.odcSimYear, tierLabel);
  }

  buildManualLaunchOverlayLines(): string[] {
    const fleet = this.computeManualFleetCapacity();
    return [
      `ODC manual launch plan · ${fleet.totalLaunches.toLocaleString()} launches`,
      `${fleet.deployedSats.toLocaleString()} sats · ${formatGw(fleet.powerGw)} · ${formatComputeTflops(fleet.computeTflops)} (${formatRubinMultiple(fleet.rubinMultiple)})`,
      `${effectiveSatsPerLaunch(this.odcLaunchPhysics)} sats/launch · ${this.odcLaunchPhysics.payloadTon} t payload · ${this.odcLaunchPhysics.powerMwPerSat} MW/sat`,
    ];
  }

  computeManualFleetCapacity() {
    return manualFleetCapacity(
      this.odcLaunchPhysics,
      this.odcShellLaunches,
      this.enabledOdcShells,
      this.odcTierOverride
    );
  }

  private expandedOdcSchedule() {
    const scenario = odcLaunchScenarioById(this.odcLaunchScenario);
    return expandScenarioSchedule(scenario, { tierOverride: this.odcTierOverride });
  }

  private notifyOdcShareChange(): void {
    this.handlers.onOdcShareChange();
  }

  buildOdcDisplayDeployAttributes(): Map<number, GroupDisplayDeployAttributes> {
    const schedule = this.expandedOdcSchedule();
    return buildOdcDisplayDeployAttributes(schedule, this.odcFillOrder, this.getModel().buildParams);
  }

  getOdcDeployVisualBase(): Partial<OdcDeployVisualState> {
    const attrs = this.buildOdcDisplayDeployAttributes();
    const { minYear, maxYear } = globalDeployYearRange(attrs);
    return {
      enabled: this.odcDeploy3d,
      simYear: this.odcSimYear,
      colorByYear: true,
      minYear,
      maxYear,
    };
  }

  private syncOdcDeployView(): void {
    this.handlers.onOdcDeployViewChange();
  }

  getStarlinkView(): StarlinkViewMode {
    return this.starlinkView;
  }

  setStarlinkView(view: StarlinkViewMode, snapshotId?: string): void {
    this.starlinkView = view;
    if (snapshotId !== undefined) this.deploymentSnapshotId = snapshotId;
  }

  getEnabledStarlinkDeployed(): Set<number> {
    return new Set(this.enabledStarlinkDeployed);
  }

  restoreStarlinkDeployedEnabled(ids: number[]): void {
    this.enabledStarlinkDeployed = new Set(ids);
    this.syncStarlinkDeployedCheckboxes();
  }

  applyStarlinkViewMode(): void {
    const nominalPanel = document.getElementById("starlink-nominal-panel")!;
    const operationalPanel = document.getElementById("starlink-operational-panel")!;
    const snapshotRow = document.getElementById("starlink-snapshot-row")!;
    const gen3PartialPanel = document.getElementById("starlink-gen3-panel")!;
    const gen3FilingPanel = document.getElementById("starlink-gen3-filing-panel")!;
    const gen1Gen2Nominal = document.getElementById("starlink-gen1-gen2-nominal")!;
    const isFiling = this.starlinkScenario === "gen3-filing";
    const isOp = this.starlinkView === "operational" && !isFiling;
    nominalPanel.hidden = isOp;
    operationalPanel.hidden = !isOp;
    snapshotRow.hidden = !isOp;
    gen3PartialPanel.hidden = !(isOp && this.starlinkScenario === "gen3-partial");
    gen3FilingPanel.hidden = !isFiling;
    gen1Gen2Nominal.hidden = isFiling;
    this.updateDeploymentSnapshotHint();
    if (isFiling) {
      this.rebuildStarlinkGen3ShellList();
    } else if (isOp) {
      this.rebuildStarlinkDeployedShellList();
      if (this.starlinkScenario === "gen3-partial") {
        this.rebuildStarlinkGen3ShellList();
      }
    }
  }

  applyScenario(scenarioId: StarlinkScenarioId): void {
    this.starlinkScenario = scenarioId;
    const hints = scenarioApplyHints(scenarioId);
    this.starlinkView = hints.view;
    this.deploymentSnapshotId = hints.snapshotId;
    this.starlinkDeployment = hints.gen1Mode;
    this.starlinkGen2Mode = hints.gen2Mode;
    this.starlinkGen2Inc365 = hints.gen2Inc365;

    const scenarioSel = document.getElementById("starlink-scenario") as HTMLSelectElement;
    scenarioSel.value = scenarioId;
    this.updateScenarioHint();

    (document.getElementById("starlink-view") as HTMLSelectElement).value = hints.view;
    (document.getElementById("deployment-snapshot") as HTMLSelectElement).value = hints.snapshotId;
    (document.getElementById("starlink-deployment") as HTMLSelectElement).value = hints.gen1Mode;
    (document.getElementById("starlink-gen2-mode") as HTMLSelectElement).value = hints.gen2Mode;
    (document.getElementById("starlink-gen2-inc365") as HTMLSelectElement).value = hints.gen2Inc365;

    if (scenarioId === "gen3-filing" || scenarioId === "gen3-partial") {
      this.setStarlinkGen3Master(true);
    }

    if (hints.enableAllStarlink) {
      if (hints.view === "operational") {
        this.setStarlinkDeployedMaster(true);
      } else {
        this.setStarlinkMaster(true);
        this.setStarlinkGen2Master(true);
      }
    }

    this.rebuildStarlinkGen1ShellList();
    this.rebuildStarlinkGen2ShellList();
    this.updateGen2Inc365Visibility();
    this.applyStarlinkViewMode();
  }

  private updateScenarioHint(): void {
    const hint = document.getElementById("starlink-scenario-hint")!;
    const def = STARLINK_SCENARIOS.find((s) => s.id === this.starlinkScenario);
    hint.textContent = def?.description ?? "";
  }

  setShareStatus(msg: string): void {
    const el = document.getElementById("share-status");
    if (el) el.textContent = msg;
  }

  /** Enable/disable coverage + bandwidth controls (operational snapshots only). */
  syncServiceOverlayControls(operational: boolean): void {
    const ids = [
      "show-coverage",
      "show-bandwidth",
      "show-coverage-gaps",
      "bandwidth-layer",
      "bandwidth-concurrency",
      "bw-filter-v1",
      "bw-filter-v2m",
      "bw-filter-dtc-v1",
      "bw-filter-dtc-v2",
      "bw-filter-v3",
      "min-elevation",
      "night-side-dimming",
      "btn-coverage-timeline",
    ];
    for (const id of ids) {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLButtonElement | null;
      if (el) el.disabled = !operational;
    }
    const hint = document.getElementById("service-overlay-hint");
    if (hint) {
      hint.hidden = operational;
    }
  }

  private buildDeploymentSnapshotSelect(): void {
    const sel = document.getElementById("deployment-snapshot") as HTMLSelectElement;
    sel.innerHTML = "";
    for (const snap of DEPLOYMENT_SNAPSHOTS) {
      const opt = document.createElement("option");
      opt.value = snap.id;
      opt.textContent = snap.label;
      if (snap.id === this.deploymentSnapshotId) opt.selected = true;
      sel.appendChild(opt);
    }
    this.updateDeploymentSnapshotHint();
  }

  private updateDeploymentSnapshotHint(): void {
    const hint = document.getElementById("starlink-snapshot-hint")!;
    if (this.starlinkView !== "operational") return;
    hint.textContent = snapshotSourceSummary(this.deploymentSnapshotId);
  }

  getStarlinkDeployment(): StarlinkDeploymentMode {
    return this.starlinkDeployment;
  }

  getStarlinkGen2Mode(): StarlinkGen2Mode {
    return this.starlinkGen2Mode;
  }

  getEnabledStarlinkGen1(): Set<number> {
    return new Set(this.enabledStarlinkGen1);
  }

  getEnabledStarlinkGen2(): Set<number> {
    return new Set(this.enabledStarlinkGen2);
  }

  restoreStarlinkGen1Enabled(ids: number[]): void {
    this.enabledStarlinkGen1 = new Set(ids);
    this.syncStarlinkGen1Checkboxes();
  }

  restoreStarlinkGen2Enabled(ids: number[]): void {
    this.enabledStarlinkGen2 = new Set(ids);
    this.syncStarlinkGen2Checkboxes();
  }

  getOdcEnabledGroups(): Set<number> {
    return this.odcEnabledGroupIds();
  }

  getDensityDivisor(): number {
    return DENSITY_STEPS[this.densityStepIndex] ?? 100;
  }

  setDensityStepIndex(step: number): void {
    this.densityStepIndex = Math.max(0, Math.min(DENSITY_STEPS.length - 1, step));
    const slider = document.getElementById("density-slider") as HTMLInputElement;
    const val = document.getElementById("density-val")!;
    slider.value = String(this.densityStepIndex);
    val.textContent = formatDensityLabel(this.getDensityDivisor());
    this.handlers.onDensityChange(this.getDensityDivisor());
  }

  updateStats(model: UnifiedConstellation, fps: number, drawnSats: number, budgetNote: string): void {
    const stats = computeStats(model, this.getEnabledGroups(), this.enabledOdcShells);
    const gpuMode = model.buildParams.odcRepresentativeMode && model.gpuBuffers.size > 0;
    const odcDrawnDetail = gpuMode
      ? `${drawnSats.toLocaleString()} / ${stats.odc.visibleSats.toLocaleString()} buf · ${formatDensityLabel(model.buildParams.sampleDivisor)}`
      : `${drawnSats.toLocaleString()} / ${stats.odc.visibleSats.toLocaleString()} · ${formatDensityLabel(model.buildParams.sampleDivisor)}`;
    const alt =
      stats.altitudeSpanKm === null
        ? "—"
        : `${stats.altitudeSpanKm[0].toFixed(0)}–${stats.altitudeSpanKm[1].toFixed(0)} km`;

    const snap = deploymentSnapshotById(this.deploymentSnapshotId);
    const gen1Cap =
      this.starlinkView === "operational" && snap
        ? snap.gen1Total
        : this.starlinkDeployment === "deployed"
          ? STARLINK_GEN1_NOMINAL_DEPLOYED
          : STARLINK_GEN1_NOMINAL_AUTHORIZED;
    const gen2Cap =
      this.starlinkScenario === "gen3-filing"
        ? STARLINK_GEN3_SYSTEM_MAX
        : this.starlinkView === "operational" && snap
          ? snap.gen2Total
          : this.starlinkGen2Mode === "application"
            ? STARLINK_GEN2_NOMINAL_APPLICATION
            : STARLINK_GEN2_FCC_TRANCHE_CAP;
    const starlinkTotalCap =
      this.starlinkScenario === "gen3-filing"
        ? STARLINK_GEN3_SYSTEM_MAX
        : this.starlinkView === "operational" && snap
          ? snap.totalOperational
          : gen1Cap + gen2Cap;
    const gapNote =
      this.starlinkView === "nominal" &&
      this.starlinkScenario !== "gen3-filing" &&
      this.enabledStarlinkGen1.size > 0 &&
      this.enabledStarlinkGen2.size > 0
        ? `<div class="stat-budget">Gen1–Gen2 gap: ${GEN1_GEN2_ALTITUDE_GAP_KM[0]}–${GEN1_GEN2_ALTITUDE_GAP_KM[1]} km</div>`
        : "";
    const starlinkModeNote =
      this.starlinkScenario === "gen3-filing"
        ? `<div class="stat-budget">Gen3 as-filed · Table A.1.1 · 100k system max</div>`
        : this.starlinkView === "operational" && snap
          ? `<div class="stat-budget">${snap.label} · ${snap.reconciliationMethod}</div>`
          : "";

    const gen3On =
      this.starlinkScenario === "gen3-filing" || this.starlinkScenario === "gen3-partial"
        ? this.gen3Shells()
            .filter((g) => this.enabledStarlinkGen3.has(g.id))
            .reduce((n, g) => n + g.maxSats, 0)
        : 0;
    const starlinkGenRows =
      this.starlinkScenario === "gen3-filing"
        ? `<div class="stat-row"><span>Starlink Gen3 (on)</span><strong>${gen3On.toLocaleString()} / ${STARLINK_GEN3_SYSTEM_MAX.toLocaleString()}</strong></div>`
        : `<div class="stat-row"><span>Starlink Gen1 (on)</span><strong>${stats.starlinkGen1.nominalSats.toLocaleString()} / ${gen1Cap.toLocaleString()}</strong></div>
      <div class="stat-row"><span>Starlink Gen2 (on)</span><strong>${stats.starlinkGen2.nominalSats.toLocaleString()} / ${gen2Cap.toLocaleString()}</strong></div>
      <div class="stat-row"><span>Starlink total (on)</span><strong>${(stats.starlinkGen1.nominalSats + stats.starlinkGen2.nominalSats).toLocaleString()} / ${starlinkTotalCap.toLocaleString()}</strong></div>`;

    this.statsEl.innerHTML = `
      <div class="stat-row"><span>ODC drawn</span><strong>${odcDrawnDetail}</strong></div>
      <div class="stat-row"><span>ODC nominal (on)</span><strong>${stats.odc.nominalSats.toLocaleString()} / ${ODC_NOMINAL_TOTAL.toLocaleString()}</strong></div>
      <div class="stat-row"><span>ODC polar (on)</span><strong>${stats.odcPolar.nominalSats.toLocaleString()} / ${ODC_POLAR_NOMINAL_TOTAL.toLocaleString()}</strong></div>
      <div class="stat-row"><span>ODC inclined (on)</span><strong>${stats.odcInclined.nominalSats.toLocaleString()} / ${ODC_INCLINED_NOMINAL_TOTAL.toLocaleString()}</strong></div>
      ${this.getRepresentativeStatRow()}
      ${starlinkGenRows}
      <div class="stat-row"><span>Groups</span><strong>${stats.enabledGroups}</strong></div>
      <div class="stat-row"><span>Planes</span><strong>${stats.totalPlanes.toLocaleString()}</strong></div>
      <div class="stat-row"><span>Sats in model</span><strong>${stats.visibleSats.toLocaleString()}</strong></div>
      <div class="stat-row"><span>Alt span</span><strong>${alt}</strong></div>
      <div class="stat-row"><span>FPS</span><strong>${fps.toFixed(0)}</strong></div>
      ${budgetNote ? `<div class="stat-budget">${budgetNote}</div>` : ""}
      ${starlinkModeNote}
      ${gapNote}
    `;
  }

  refreshStats(): void {
    void computeStats(this.getModel(), this.getEnabledGroups(), this.enabledOdcShells);
  }

  private getRepresentativeStatRow(): string {
    const model = this.getModel();
    if (!model.buildParams.odcRepresentativeMode) return "";
    let nominal = 0;
    let buffered = 0;
    for (const g of ORBIT_GROUPS) {
      if (!this.odcEnabledGroupIds().has(g.id)) continue;
      const buf = model.gpuBuffers.get(g.id);
      if (buf) {
        nominal += buf.nominalSats;
        buffered += buf.displaySats;
      }
    }
    if (nominal === 0) return "";
    return `<div class="stat-row"><span>ODC GPU buffer</span><strong>${buffered.toLocaleString()} drawn / ${nominal.toLocaleString()} nominal</strong></div>`;
  }

  private wireControls(): void {
    const speedInput = document.getElementById("speed") as HTMLInputElement;
    const speedVal = document.getElementById("speed-val")!;
    speedInput.addEventListener("input", () => {
      speedVal.textContent = `${speedInput.value}×`;
      this.handlers.onTimeScale(Number(speedInput.value));
    });
    this.handlers.onTimeScale(Number(speedInput.value));

    const densitySlider = document.getElementById("density-slider") as HTMLInputElement;
    const densityVal = document.getElementById("density-val")!;
    densitySlider.addEventListener("input", () => {
      this.densityStepIndex = Number(densitySlider.value);
      densityVal.textContent = formatDensityLabel(this.getDensityDivisor());
      this.handlers.onDensityChange(this.getDensityDivisor());
    });
    densityVal.textContent = formatDensityLabel(this.getDensityDivisor());

    const satSize = document.getElementById("sat-size") as HTMLInputElement;
    const satSizeVal = document.getElementById("sat-size-val")!;
    satSize.addEventListener("input", () => {
      const v = Number(satSize.value);
      satSizeVal.textContent = formatSatSizeLabel(v);
      this.handlers.onSatPointScaleChange(satSizeSliderToScale(v));
    });
    satSizeVal.textContent = formatSatSizeLabel(Number(satSize.value));

    (document.getElementById("exaggerate") as HTMLInputElement).addEventListener("change", (e) => {
      const on = (e.target as HTMLInputElement).checked;
      this.handlers.onExaggerationChange(on ? 5 : 1);
    });

    (document.getElementById("isolate-plane") as HTMLInputElement).addEventListener("change", (e) => {
      this.isolatePlane = (e.target as HTMLInputElement).checked;
      const sel = this.getRenderer().getSelection();
      this.handlers.onPlaneSelect(sel, this.isolatePlane);
    });

    (document.getElementById("isolate-shells") as HTMLInputElement).addEventListener("change", (e) => {
      this.handlers.onShellIsolateToggle((e.target as HTMLInputElement).checked);
    });

    (document.getElementById("auto-budget") as HTMLInputElement).addEventListener("change", (e) => {
      this.handlers.onAutoBudgetToggle((e.target as HTMLInputElement).checked);
    });

    (document.getElementById("show-tracks") as HTMLInputElement).addEventListener("change", (e) => {
      this.handlers.onShowTracks((e.target as HTMLInputElement).checked);
    });

    (document.getElementById("track-mode") as HTMLSelectElement).addEventListener("change", (e) => {
      this.handlers.onTrackMode((e.target as HTMLSelectElement).value as TrackMode);
    });

    (document.getElementById("show-ground-tracks") as HTMLInputElement).addEventListener("change", (e) => {
      this.handlers.onShowGroundTracks((e.target as HTMLInputElement).checked);
    });

    (document.getElementById("show-shell-bands") as HTMLInputElement).addEventListener("change", (e) => {
      this.handlers.onShowShellBands((e.target as HTMLInputElement).checked);
    });

    (document.getElementById("show-earth") as HTMLInputElement).addEventListener("change", (e) => {
      this.handlers.onShowEarth((e.target as HTMLInputElement).checked);
    });

    (document.getElementById("earth-day-night") as HTMLInputElement).addEventListener("change", (e) => {
      this.handlers.onEarthDayNightToggle((e.target as HTMLInputElement).checked);
    });

    (document.getElementById("show-coverage") as HTMLInputElement).addEventListener("change", (e) => {
      this.handlers.onCoverageToggle((e.target as HTMLInputElement).checked);
    });

    (document.getElementById("show-bandwidth") as HTMLInputElement).addEventListener("change", (e) => {
      this.handlers.onBandwidthToggle((e.target as HTMLInputElement).checked);
    });

    (document.getElementById("show-coverage-gaps") as HTMLInputElement).addEventListener("change", (e) => {
      this.handlers.onCoverageGapsToggle((e.target as HTMLInputElement).checked);
    });

    (document.getElementById("bandwidth-layer") as HTMLSelectElement).addEventListener("change", (e) => {
      this.handlers.onBandwidthLayerChange(
        (e.target as HTMLSelectElement).value as "broadband" | "dtc"
      );
    });

    const conc = document.getElementById("bandwidth-concurrency") as HTMLInputElement;
    const concVal = document.getElementById("bandwidth-concurrency-val")!;
    conc.addEventListener("input", () => {
      concVal.textContent = `${conc.value}%`;
      this.handlers.onBandwidthConcurrencyChange(Number(conc.value) / 100);
    });
    this.handlers.onBandwidthConcurrencyChange(Number(conc.value) / 100);

    for (const id of ["bw-filter-v1", "bw-filter-v2m", "bw-filter-dtc-v1", "bw-filter-dtc-v2", "bw-filter-v3"]) {
      document.getElementById(id)!.addEventListener("change", () => {
        this.handlers.onBandwidthClassFilterChange();
      });
    }

    document.getElementById("btn-coverage-timeline")!.addEventListener("click", () => {
      const btn = document.getElementById("btn-coverage-timeline") as HTMLButtonElement;
      const playing = btn.textContent === "Stop timeline";
      this.handlers.onCoverageTimelineToggle(!playing);
    });

    (document.getElementById("auto-lod") as HTMLInputElement).addEventListener("change", (e) => {
      this.handlers.onAutoLodToggle((e.target as HTMLInputElement).checked);
    });

    (document.getElementById("odc-representative") as HTMLInputElement).addEventListener("change", (e) => {
      this.handlers.onOdcRepresentativeModeChange((e.target as HTMLInputElement).checked);
    });

    (document.getElementById("starlink-master") as HTMLInputElement).addEventListener("change", (e) => {
      const on = (e.target as HTMLInputElement).checked;
      this.setStarlinkMaster(on);
      this.handlers.onStarlinkMasterToggle(on);
    });

    (document.getElementById("starlink-deployment") as HTMLSelectElement).addEventListener("change", (e) => {
      const mode = (e.target as HTMLSelectElement).value as StarlinkDeploymentMode;
      this.starlinkDeployment = mode;
      this.handlers.onStarlinkDeploymentChange(mode);
    });

    (document.getElementById("starlink-gen2-master") as HTMLInputElement).addEventListener("change", (e) => {
      const on = (e.target as HTMLInputElement).checked;
      this.setStarlinkGen2Master(on);
      this.handlers.onStarlinkGen2MasterToggle(on);
    });

    (document.getElementById("starlink-gen2-mode") as HTMLSelectElement).addEventListener("change", (e) => {
      const mode = (e.target as HTMLSelectElement).value as StarlinkGen2Mode;
      this.starlinkGen2Mode = mode;
      this.updateGen2Inc365Visibility();
      this.handlers.onStarlinkGen2ModeChange(mode);
    });

    (document.getElementById("starlink-gen2-inc365") as HTMLSelectElement).addEventListener("change", (e) => {
      const inc = (e.target as HTMLSelectElement).value as StarlinkGen2Inc365;
      this.starlinkGen2Inc365 = inc;
      this.handlers.onStarlinkGen2Inc365Change(inc);
    });

    (document.getElementById("starlink-view") as HTMLSelectElement).addEventListener("change", (e) => {
      this.starlinkView = (e.target as HTMLSelectElement).value as StarlinkViewMode;
      this.applyStarlinkViewMode();
      this.handlers.onStarlinkViewChange(
        this.starlinkView,
        (document.getElementById("deployment-snapshot") as HTMLSelectElement).value
      );
    });

    (document.getElementById("deployment-snapshot") as HTMLSelectElement).addEventListener("change", (e) => {
      this.deploymentSnapshotId = (e.target as HTMLSelectElement).value;
      this.updateDeploymentSnapshotHint();
      if (this.starlinkView === "operational") {
        this.handlers.onStarlinkViewChange(this.starlinkView, this.deploymentSnapshotId);
      }
    });

    (document.getElementById("starlink-deployed-master") as HTMLInputElement).addEventListener("change", (e) => {
      const on = (e.target as HTMLInputElement).checked;
      this.setStarlinkDeployedMaster(on);
      this.handlers.onStarlinkDeployedMasterToggle(on);
    });

    (document.getElementById("starlink-gen3-master") as HTMLInputElement).addEventListener("change", (e) => {
      const on = (e.target as HTMLInputElement).checked;
      this.setStarlinkGen3Master(on);
      this.handlers.onStarlinkGen3MasterToggle(on);
    });

    (document.getElementById("starlink-gen3-filing-master") as HTMLInputElement).addEventListener(
      "change",
      (e) => {
        const on = (e.target as HTMLInputElement).checked;
        this.setStarlinkGen3Master(on);
        this.handlers.onStarlinkGen3MasterToggle(on);
      }
    );

    const minElev = document.getElementById("min-elevation") as HTMLInputElement;
    const minElevVal = document.getElementById("min-elevation-val")!;
    minElev.addEventListener("input", () => {
      minElevVal.textContent = `${minElev.value}°`;
      this.handlers.onMinElevationChange(Number(minElev.value));
    });

    (document.getElementById("night-side-dimming") as HTMLInputElement).addEventListener("change", (e) => {
      this.handlers.onNightSideDimmingChange((e.target as HTMLInputElement).checked);
    });

    document.getElementById("btn-export-png")!.addEventListener("click", () => {
      this.handlers.onExportScreenshot();
    });

    document.getElementById("btn-copy-share")!.addEventListener("click", () => {
      this.handlers.onCopyShareLink();
    });

    this.buildScenarioSelect();
    this.applyStarlinkViewMode();
    this.buildDeploymentSnapshotSelect();

    this.buildStarlinkGen1ShellList();
    this.buildStarlinkGen2ShellList();
    this.updateGen2Inc365Visibility();
  }

  private odcShellKey(groupId: number, shellIndex: number): string {
    return shellKey(groupId, shellIndex);
  }

  private buildOdcLaunchPlannerPanel(): void {
    this.syncOdcLaunchPlannerInputs();
    this.wireOdcLaunchPlannerControls();
    this.refreshManualLaunchReadout();
  }

  private wireOdcLaunchPlannerControls(): void {
    const payload = document.getElementById("odc-payload-ton") as HTMLInputElement;
    payload.addEventListener("input", () => {
      this.odcLaunchPhysics.payloadTon = Number(payload.value);
      this.syncOdcLaunchPlannerInputs();
      this.syncAllShellLaunchSliders();
      this.refreshManualLaunchReadout();
      this.notifyManualLaunchChange();
    });

    const mass = document.getElementById("odc-sat-mass-ton") as HTMLInputElement;
    mass.addEventListener("change", () => {
      this.odcLaunchPhysics.satMassTon = Math.max(0.1, Number(mass.value) || 0.1);
      if (!this.odcSatsPerLaunchManual) this.syncDerivedSatsPerLaunch();
      this.syncAllShellLaunchSliders();
      this.refreshManualLaunchReadout();
      this.notifyManualLaunchChange();
    });

    const power = document.getElementById("odc-power-mw") as HTMLInputElement;
    power.addEventListener("change", () => {
      this.odcLaunchPhysics.powerMwPerSat = Math.max(0.01, Number(power.value) || 0.01);
      this.refreshManualLaunchReadout();
      this.notifyManualLaunchChange();
    });

    const spsl = document.getElementById("odc-sats-per-launch") as HTMLInputElement;
    spsl.addEventListener("change", () => {
      const v = Math.max(1, Math.floor(Number(spsl.value) || 1));
      this.odcSatsPerLaunchManual = true;
      this.odcLaunchPhysics.satsPerLaunchOverride = v;
      spsl.value = String(v);
      this.syncAllShellLaunchSliders();
      this.refreshManualLaunchReadout();
      this.notifyManualLaunchChange();
    });
  }

  private syncOdcLaunchPlannerInputs(): void {
    const payload = document.getElementById("odc-payload-ton") as HTMLInputElement;
    const payloadVal = document.getElementById("odc-payload-ton-val")!;
    payload.value = String(this.odcLaunchPhysics.payloadTon);
    payloadVal.textContent = `${this.odcLaunchPhysics.payloadTon} t`;

    (document.getElementById("odc-sat-mass-ton") as HTMLInputElement).value = String(
      this.odcLaunchPhysics.satMassTon
    );
    (document.getElementById("odc-power-mw") as HTMLInputElement).value = String(
      this.odcLaunchPhysics.powerMwPerSat
    );

    this.syncDerivedSatsPerLaunch();
  }

  private syncDerivedSatsPerLaunch(): void {
    const derived = derivedSatsPerLaunch(this.odcLaunchPhysics);
    (document.getElementById("odc-sats-per-launch-derived") as HTMLElement).textContent = String(derived);
    const spsl = document.getElementById("odc-sats-per-launch") as HTMLInputElement;
    if (!this.odcSatsPerLaunchManual) {
      this.odcLaunchPhysics.satsPerLaunchOverride = undefined;
      spsl.value = String(Math.max(1, derived));
    } else if (this.odcLaunchPhysics.satsPerLaunchOverride != null) {
      spsl.value = String(this.odcLaunchPhysics.satsPerLaunchOverride);
    }
  }

  private syncAllShellLaunchSliders(): void {
    for (const g of ORBIT_GROUPS) {
      for (let sh = 0; sh < g.shells; sh++) {
        this.syncShellLaunchSlider(g, sh);
      }
    }
  }

  private syncShellLaunchSlider(g: OrbitGroupConfig, shellIndex: number): void {
    const key = this.odcShellKey(g.id, shellIndex);
    const slider = this.odcShellLaunchSliders.get(key);
    if (!slider) return;
    const spsl = effectiveSatsPerLaunch(this.odcLaunchPhysics);
    const max = Math.max(1, maxLaunchesForShell(g, spsl));
    slider.max = String(max);
    const launches = this.odcShellLaunches.get(key) ?? 0;
    slider.value = String(Math.min(launches, max));
    this.refreshShellLaunchMeta(g, shellIndex);
  }

  private refreshShellLaunchMeta(g: OrbitGroupConfig, shellIndex: number): void {
    const key = this.odcShellKey(g.id, shellIndex);
    const meta = this.odcShellLaunchMetas.get(key);
    const valEl = document.querySelector(`.odc-shell-launch-val[data-shell-key="${key}"]`) as HTMLElement;
    const launches = this.odcShellLaunches.get(key) ?? 0;
    const spsl = effectiveSatsPerLaunch(this.odcLaunchPhysics);
    const deployed = deployedSatsForShell(g, launches, spsl);
    const powerMw = deployed * this.odcLaunchPhysics.powerMwPerSat;
    const tierId = this.odcTierOverride ?? DEFAULT_COMPUTE_TIER_ID;
    const tier = ODC_COMPUTE_TIERS[tierId];
    const perSatTflops =
      (tier.tflopsPerSat * (this.odcLaunchPhysics.powerMwPerSat * 1000)) / tier.kwPerSat;
    const compute = formatComputeTflops(deployed * perSatTflops);
    if (valEl) valEl.textContent = String(launches);
    if (meta) {
      meta.textContent =
        launches > 0
          ? `→ ${deployed.toLocaleString()} sats · ${powerMw.toFixed(1)} MW · ${compute}`
          : "→ 0 sats (enable launches to deploy)";
    }
  }

  refreshManualLaunchReadout(): void {
    const host = document.getElementById("odc-manual-readout")!;
    const fleet = this.computeManualFleetCapacity();
    const spsl = effectiveSatsPerLaunch(this.odcLaunchPhysics);
    if (fleet.totalLaunches <= 0) {
      host.innerHTML = `<div class="odc-compute-row"><span>Network</span><strong>Set launches on enabled shells</strong></div>
        <div class="odc-compute-row"><span>Packing</span><strong>${spsl} sats/launch @ ${this.odcLaunchPhysics.payloadTon} t</strong></div>`;
      return;
    }
    host.innerHTML = `
      <div class="odc-compute-section-title">Manual launch plan</div>
      <div class="odc-compute-row"><span>Launches</span><strong>${fleet.totalLaunches.toLocaleString()}</strong></div>
      <div class="odc-compute-row"><span>Deployed</span><strong>${fleet.deployedSats.toLocaleString()} sats</strong></div>
      <div class="odc-compute-row"><span>Orbital power</span><strong>${formatGw(fleet.powerGw)}</strong></div>
      <div class="odc-compute-row"><span>Orbital compute</span><strong>${formatComputeTflops(fleet.computeTflops)} · ${formatRubinMultiple(fleet.rubinMultiple)}</strong></div>
      <div class="odc-compute-row"><span>Packing</span><strong>${spsl} sats/launch · ${this.odcLaunchPhysics.satMassTon} t/sat · ${this.odcLaunchPhysics.powerMwPerSat} MW/sat</strong></div>
    `;
    for (const g of ORBIT_GROUPS) {
      for (let sh = 0; sh < g.shells; sh++) {
        this.refreshShellLaunchMeta(g, sh);
      }
    }
  }

  private notifyManualLaunchChange(): void {
    this.handlers.onOdcManualLaunchChange();
    this.handlers.onOdcShareChange();
  }


  private buildOdcGroupPanel(): void {
    const host = document.getElementById("odc-groups")!;
    host.innerHTML = "";

    for (const g of ORBIT_GROUPS) {
      const li = document.createElement("li");
      li.className = "odc-group-item";

      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = `#${g.color.toString(16).padStart(6, "0")}`;

      const head = document.createElement("label");
      head.className = "odc-group-head";
      const master = document.createElement("input");
      master.type = "checkbox";
      master.checked = false;
      master.addEventListener("change", () => {
        if (master.checked) {
          const all = new Set<number>();
          for (let sh = 0; sh < g.shells; sh++) all.add(sh);
          this.enabledOdcShells.set(g.id, all);
        } else {
          this.enabledOdcShells.delete(g.id);
        }
        this.syncOdcShellCheckboxes(g);
        this.handlers.onOdcShellsChange();
        this.refreshStats();
      });
      this.odcGroupCheckboxes.set(g.id, master);
      head.appendChild(master);
      head.append(` ${g.name} · ${g.maxSats.toLocaleString()} nominal · ${g.shells} shells`);

      const meta = document.createElement("span");
      meta.className = "meta odc-meta";
      meta.dataset.groupId = String(g.id);
      head.appendChild(meta);

      const shellList = document.createElement("ul");
      shellList.className = "odc-shell-list";

      for (let sh = 0; sh < g.shells; sh++) {
        const lo = g.altitudeKm[0];
        const hi = g.altitudeKm[1];
        const altKm =
          g.shells <= 1
            ? (lo + hi) / 2
            : lo + ((hi - lo) * sh) / (g.shells - 1);
        const shellLi = document.createElement("li");
        const shellLabel = document.createElement("label");
        const shellCb = document.createElement("input");
        shellCb.type = "checkbox";
        shellCb.checked = false;
        const key = this.odcShellKey(g.id, sh);

        const launchRow = document.createElement("div");
        launchRow.className = "odc-shell-launch";
        const launchLabel = document.createElement("label");
        launchLabel.textContent = "Launches ";
        const launchVal = document.createElement("span");
        launchVal.className = "odc-shell-launch-val";
        launchVal.dataset.shellKey = key;
        launchVal.textContent = "0";
        const launchSlider = document.createElement("input");
        launchSlider.type = "range";
        launchSlider.min = "0";
        launchSlider.max = "1";
        launchSlider.step = "1";
        launchSlider.value = "0";
        launchSlider.disabled = true;
        launchSlider.addEventListener("input", () => {
          const n = Number(launchSlider.value);
          if (n > 0) this.odcShellLaunches.set(key, n);
          else this.odcShellLaunches.delete(key);
          launchVal.textContent = String(n);
          this.refreshShellLaunchMeta(g, sh);
          this.refreshManualLaunchReadout();
          this.notifyManualLaunchChange();
        });
        this.odcShellLaunchSliders.set(key, launchSlider);
        launchLabel.appendChild(launchVal);
        launchLabel.appendChild(launchSlider);
        const launchMeta = document.createElement("span");
        launchMeta.className = "odc-shell-launch-meta";
        launchMeta.textContent = "→ 0 sats (enable shell first)";
        this.odcShellLaunchMetas.set(key, launchMeta);
        launchRow.appendChild(launchLabel);
        launchRow.appendChild(launchMeta);

        shellCb.addEventListener("change", () => {
          let set = this.enabledOdcShells.get(g.id);
          if (!set) {
            set = new Set();
            this.enabledOdcShells.set(g.id, set);
          }
          if (shellCb.checked) set.add(sh);
          else set.delete(sh);
          if (set.size === 0) this.enabledOdcShells.delete(g.id);
          launchSlider.disabled = !shellCb.checked;
          if (!shellCb.checked) {
            this.odcShellLaunches.delete(key);
            launchSlider.value = "0";
            launchVal.textContent = "0";
            this.refreshShellLaunchMeta(g, sh);
            this.refreshManualLaunchReadout();
            this.notifyManualLaunchChange();
          } else {
            this.syncShellLaunchSlider(g, sh);
          }
          this.syncOdcGroupMaster(g);
          this.handlers.onOdcShellsChange();
          this.refreshStats();
        });
        this.odcShellCheckboxes.set(key, shellCb);
        shellLabel.appendChild(shellCb);
        shellLabel.append(
          ` Shell ${sh} · ~${altKm.toFixed(0)} km · ${(g.planesPerShell * g.satsPerPlane).toLocaleString()} nominal`
        );
        shellLi.appendChild(shellLabel);
        shellLi.appendChild(launchRow);
        shellList.appendChild(shellLi);
      }

      li.appendChild(swatch);
      li.appendChild(head);
      li.appendChild(shellList);
      host.appendChild(li);
    }
    this.syncAllShellLaunchSliders();
    this.updateOdcGroupMetas();
  }

  private syncOdcGroupMaster(g: OrbitGroupConfig): void {
    const master = this.odcGroupCheckboxes.get(g.id);
    const shells = this.enabledOdcShells.get(g.id);
    if (!master) return;
    master.checked = !!shells && shells.size === g.shells;
    master.indeterminate = !!shells && shells.size > 0 && shells.size < g.shells;
  }

  private syncOdcShellCheckboxes(g: OrbitGroupConfig): void {
    const shells = this.enabledOdcShells.get(g.id) ?? new Set();
    for (let sh = 0; sh < g.shells; sh++) {
      const key = this.odcShellKey(g.id, sh);
      const cb = this.odcShellCheckboxes.get(key);
      if (cb) cb.checked = shells.has(sh);
      const slider = this.odcShellLaunchSliders.get(key);
      if (slider) slider.disabled = !shells.has(sh);
    }
    this.syncOdcGroupMaster(g);
  }

  updateOdcGroupMetas(): void {
    const model = this.getModel();
    for (const g of ORBIT_GROUPS) {
      const meta = document.querySelector(`.odc-meta[data-group-id="${g.id}"]`)!;
      const shells = this.enabledOdcShells.get(g.id);
      if (!shells || shells.size === 0) {
        meta.textContent = "";
        continue;
      }
      const planes = model.planesByGroup.get(g.id) ?? [];
      const vis = planes.reduce((n, p) => n + p.satellites.length, 0);
      const nominalOn = shells.size * g.planesPerShell * g.satsPerPlane;
      meta.textContent = ` · ${vis.toLocaleString()} drawn · ${nominalOn.toLocaleString()} nominal (on)`;
    }
  }

  private buildOdcLaunchScenarioSelect(): void {
    const sel = document.getElementById("odc-launch-scenario") as HTMLSelectElement;
    sel.innerHTML = "";
    for (const s of ODC_LAUNCH_SCENARIOS) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.label;
      if (s.id === this.odcLaunchScenario) opt.selected = true;
      sel.appendChild(opt);
    }
    this.syncOdcSimYearSlider();
    this.updateOdcLaunchScenarioHint();
    this.refreshOdcComputeReadout();
  }

  private syncOdcSimYearSlider(): void {
    const scenario = odcLaunchScenarioById(this.odcLaunchScenario);
    const slider = document.getElementById("odc-sim-year") as HTMLInputElement;
    slider.min = String(scenario.startYear);
    slider.max = String(scenario.endYear);
    if (this.odcSimYear < scenario.startYear) this.odcSimYear = scenario.startYear;
    if (this.odcSimYear > scenario.endYear) this.odcSimYear = scenario.endYear;
    slider.value = String(this.odcSimYear);
    (document.getElementById("odc-sim-year-val") as HTMLElement).textContent = String(this.odcSimYear);
  }

  private wireOdcComputeControls(): void {
    (document.getElementById("odc-launch-scenario") as HTMLSelectElement).addEventListener("change", (e) => {
      this.odcLaunchScenario = (e.target as HTMLSelectElement).value as OdcLaunchScenarioId;
      this.syncOdcSimYearSlider();
      this.updateOdcLaunchScenarioHint();
      this.refreshOdcComputeReadout();
      this.syncOdcDeployView();
      this.notifyOdcShareChange();
    });

    const yearSlider = document.getElementById("odc-sim-year") as HTMLInputElement;
    yearSlider.addEventListener("input", () => {
      this.odcSimYear = Number(yearSlider.value);
      (document.getElementById("odc-sim-year-val") as HTMLElement).textContent = yearSlider.value;
      this.refreshOdcComputeReadout();
      this.syncOdcDeployView();
      this.notifyOdcShareChange();
    });

    (document.getElementById("odc-fill-order") as HTMLSelectElement).addEventListener("change", (e) => {
      this.odcFillOrder = (e.target as HTMLSelectElement).value as DeploymentFillOrder;
      this.refreshOdcComputeReadout();
      this.syncOdcDeployView();
      this.notifyOdcShareChange();
    });

    (document.getElementById("odc-compute-tier") as HTMLSelectElement).addEventListener("change", (e) => {
      const val = (e.target as HTMLSelectElement).value;
      this.odcTierOverride = val ? (val as OdcComputeTierId) : undefined;
      this.refreshOdcComputeReadout();
      this.notifyOdcShareChange();
    });

    (document.getElementById("odc-deploy-3d") as HTMLInputElement).addEventListener("change", (e) => {
      const on = (e.target as HTMLInputElement).checked;
      this.odcDeploy3d = on;
      if (on) {
        const gpu = document.getElementById("odc-representative") as HTMLInputElement;
        if (!gpu.checked) {
          gpu.checked = true;
          this.handlers.onOdcRepresentativeModeChange(true);
        }
      }
      this.syncOdcDeployView();
      this.notifyOdcShareChange();
    });

    (document.getElementById("odc-launch-train") as HTMLInputElement).addEventListener("change", (e) => {
      this.odcLaunchTrain = (e.target as HTMLInputElement).checked;
      if (this.odcLaunchTrain && !this.odcDeploy3d) {
        const deploy3d = document.getElementById("odc-deploy-3d") as HTMLInputElement;
        deploy3d.checked = true;
        this.odcDeploy3d = true;
        const gpu = document.getElementById("odc-representative") as HTMLInputElement;
        if (!gpu.checked) {
          gpu.checked = true;
          this.handlers.onOdcRepresentativeModeChange(true);
        }
      }
      this.syncOdcDeployView();
      this.notifyOdcShareChange();
    });

    document.getElementById("btn-odc-copy-summary")!.addEventListener("click", () => {
      void this.copyOdcCapacitySummary();
    });
  }

  private setOdcComputeStatus(msg: string): void {
    const el = document.getElementById("odc-compute-status");
    if (el) el.textContent = msg;
  }

  private async copyOdcCapacitySummary(): Promise<void> {
    const scenario = odcLaunchScenarioById(this.odcLaunchScenario);
    const schedule = this.expandedOdcSchedule();
    const sim = simulateOdcDeployment(schedule, { fillOrder: this.odcFillOrder });
    const text = buildOdcCapacitySummaryText(scenario, sim, this.odcSimYear);
    try {
      await navigator.clipboard.writeText(text);
      this.setOdcComputeStatus("Capacity summary copied");
    } catch {
      this.setOdcComputeStatus("Copy failed — check browser permissions");
    }
  }

  private updateOdcLaunchScenarioHint(): void {
    const hint = document.getElementById("odc-launch-scenario-hint")!;
    hint.textContent = odcLaunchScenarioById(this.odcLaunchScenario).description;
  }

  private buildOdcComputeTierSelect(): void {
    const sel = document.getElementById("odc-compute-tier") as HTMLSelectElement;
    sel.innerHTML = "";
    const fromScenario = document.createElement("option");
    fromScenario.value = "";
    fromScenario.textContent = "From scenario phases";
    fromScenario.selected = !this.odcTierOverride;
    sel.appendChild(fromScenario);
    for (const tier of Object.values(ODC_COMPUTE_TIERS)) {
      const opt = document.createElement("option");
      opt.value = tier.id;
      opt.textContent = tier.label;
      if (this.odcTierOverride === tier.id) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  private buildOdcComputePanel(): void {
    this.buildOdcComputeTierSelect();
    this.wireOdcComputeControls();
    this.buildOdcLaunchScenarioSelect();
  }

  refreshOdcComputeReadout(): void {
    const host = document.getElementById("odc-compute-readout")!;
    const chart = document.getElementById("odc-capacity-chart") as HTMLCanvasElement;
    const schedule = this.expandedOdcSchedule();
    const sim = simulateOdcDeployment(schedule, { fillOrder: this.odcFillOrder });
    const snap = snapshotAtYear(sim, this.odcSimYear);
    const eff = effectiveSnapshot(snap, sim.deployment);
    const duty = weightedSunDuty(sim.deployment);
    const yearDelta = capacityDeltaSincePriorYear(sim, this.odcSimYear);
    const capped = cappedSatsThroughYear(sim, this.odcSimYear);
    const pct = ((snap.deployedSats / ODC_NOMINAL_TOTAL) * 100).toFixed(2);

    const groupLines = groupEffectiveCapacities(snap, sim.deployment)
      .map(
        (g) =>
          `<div class="odc-compute-row"><span>${g.name} · ${(g.sunDuty * 100).toFixed(0)}% sun</span><strong>${g.deployedSats.toLocaleString()} · ${formatComputeTflops(g.effectiveComputeTflops)}</strong></div>`
      )
      .join("");

    const yearDeltaBlock =
      yearDelta.sats > 0 || yearDelta.powerGw > 0 || yearDelta.computeTflops > 0
        ? `<div class="odc-compute-section-title">In ${this.odcSimYear}</div>
      <div class="odc-compute-row"><span>Sats launched</span><strong>+${yearDelta.sats.toLocaleString()}</strong></div>
      <div class="odc-compute-row"><span>Power added</span><strong>+${formatGw(yearDelta.powerGw)}</strong></div>
      <div class="odc-compute-row"><span>Compute added</span><strong>+${formatComputeTflops(yearDelta.computeTflops)}</strong></div>`
        : "";

    host.innerHTML = `
      <div class="odc-compute-section-title">Cumulative @ ${this.odcSimYear}</div>
      <div class="odc-compute-row"><span>Deployed</span><strong>${snap.deployedSats.toLocaleString()} / ${ODC_NOMINAL_TOTAL.toLocaleString()} (${pct}%)</strong></div>
      <div class="odc-compute-row"><span>Power (nominal)</span><strong>${formatGw(snap.powerGw)}</strong></div>
      <div class="odc-compute-row"><span>Power (sun-effective)</span><strong>${formatGw(eff.powerGw)} <span class="hint-inline">· ${(duty * 100).toFixed(0)}% avg duty</span></strong></div>
      <div class="odc-compute-row"><span>Compute (nominal)</span><strong>${formatComputeTflops(snap.computeTflops)}</strong></div>
      <div class="odc-compute-row"><span>Compute (sun-effective)</span><strong>${formatComputeTflops(eff.computeTflops)}</strong></div>
      <div class="odc-compute-row"><span>vs Rubin DR11</span><strong>${formatRubinMultiple(snap.rubinMultiple)} nominal · ${formatRubinMultiple(eff.rubinMultiple)} eff</strong></div>
      ${yearDeltaBlock}
      ${capped > 0 ? `<div class="odc-compute-row cap-note"><span>Capped (filing limit)</span><strong>${capped.toLocaleString()}</strong></div>` : ""}
      ${groupLines ? `<div class="odc-compute-section-title">By group</div><div class="odc-compute-groups">${groupLines}</div>` : ""}
    `;

    drawOdcCapacityChart(chart, {
      timeline: sim.timeline,
      highlightYear: this.odcSimYear,
    });
  }

  private buildScenarioSelect(): void {
    const sel = document.getElementById("starlink-scenario") as HTMLSelectElement;
    sel.innerHTML = "";
    for (const s of STARLINK_SCENARIOS) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.label;
      if (s.id === this.starlinkScenario) opt.selected = true;
      sel.appendChild(opt);
    }
    this.updateScenarioHint();
    sel.addEventListener("change", (e) => {
      const id = (e.target as HTMLSelectElement).value as StarlinkScenarioId;
      this.handlers.onScenarioChange(id);
    });
  }

  rebuildStarlinkDeployedShellList(): void {
    this.starlinkDeployedCheckboxes.clear();
    const list = document.getElementById("starlink-deployed-shells")!;
    list.innerHTML = "";
    this.buildStarlinkDeployedShellList();
  }

  setStarlinkDeployedMaster(on: boolean): void {
    this.enabledStarlinkDeployed.clear();
    if (on) {
      for (const g of starlinkDeployedGroups(this.deploymentSnapshotId)) {
        this.enabledStarlinkDeployed.add(g.id);
      }
    }
    this.syncStarlinkDeployedCheckboxes();
  }

  private syncStarlinkDeployedCheckboxes(): void {
    const master = document.getElementById("starlink-deployed-master") as HTMLInputElement;
    const shells = starlinkDeployedGroups(this.deploymentSnapshotId);
    master.checked = shells.length > 0 && shells.every((g) => this.enabledStarlinkDeployed.has(g.id));
    for (const g of shells) {
      const cb = this.starlinkDeployedCheckboxes.get(g.id);
      if (cb) cb.checked = this.enabledStarlinkDeployed.has(g.id);
    }
  }

  private buildStarlinkDeployedShellList(): void {
    const list = document.getElementById("starlink-deployed-shells")!;
    for (const g of starlinkDeployedGroups(this.deploymentSnapshotId)) {
      const li = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = `#${g.color.toString(16).padStart(6, "0")}`;
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = this.enabledStarlinkDeployed.has(g.id);
      cb.addEventListener("change", () => {
        if (cb.checked) this.enabledStarlinkDeployed.add(g.id);
        else this.enabledStarlinkDeployed.delete(g.id);
        this.syncStarlinkDeployedCheckboxes();
        this.handlers.onStarlinkDeployedShellToggle(g.id, cb.checked);
        this.refreshStats();
      });
      this.starlinkDeployedCheckboxes.set(g.id, cb);
      label.appendChild(cb);
      label.append(` ${deployedShellLabel(g, this.deploymentSnapshotId)}`);
      li.appendChild(swatch);
      li.appendChild(label);
      list.appendChild(li);
    }
  }

  rebuildStarlinkGen1ShellList(): void {
    this.starlinkGen1Checkboxes.clear();
    const list = document.getElementById("starlink-gen1-shells")!;
    list.innerHTML = "";
    this.buildStarlinkGen1ShellList();
  }

  rebuildStarlinkGen2ShellList(): void {
    this.starlinkGen2Checkboxes.clear();
    const list = document.getElementById("starlink-gen2-shells")!;
    list.innerHTML = "";
    this.buildStarlinkGen2ShellList();
  }

  rebuildStarlinkGen3ShellList(): void {
    this.starlinkGen3Checkboxes.clear();
    const partialList = document.getElementById("starlink-gen3-shells");
    const filingList = document.getElementById("starlink-gen3-filing-shells");
    if (partialList) partialList.innerHTML = "";
    if (filingList) filingList.innerHTML = "";
    this.buildStarlinkGen3ShellList();
  }

  setStarlinkGen3Master(on: boolean): void {
    this.enabledStarlinkGen3.clear();
    if (on) {
      for (const g of this.gen3Shells()) this.enabledStarlinkGen3.add(g.id);
    }
    this.syncStarlinkGen3Checkboxes();
  }

  private syncStarlinkGen3Checkboxes(): void {
    const shells = this.gen3Shells();
    const masters = [
      document.getElementById("starlink-gen3-master") as HTMLInputElement | null,
      document.getElementById("starlink-gen3-filing-master") as HTMLInputElement | null,
    ];
    const allOn = shells.length > 0 && shells.every((g) => this.enabledStarlinkGen3.has(g.id));
    for (const master of masters) {
      if (master) master.checked = allOn;
    }
    for (const g of shells) {
      const cb = this.starlinkGen3Checkboxes.get(g.id);
      if (cb) cb.checked = this.enabledStarlinkGen3.has(g.id);
    }
  }

  private buildStarlinkGen3ShellList(): void {
    const shells = this.gen3Shells();
    const listId =
      this.starlinkScenario === "gen3-filing"
        ? "starlink-gen3-filing-shells"
        : "starlink-gen3-shells";
    const list = document.getElementById(listId);
    if (!list) return;
    for (const g of shells) {
      const li = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = `#${g.color.toString(16).padStart(6, "0")}`;
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = this.enabledStarlinkGen3.has(g.id);
      cb.addEventListener("change", () => {
        if (cb.checked) this.enabledStarlinkGen3.add(g.id);
        else this.enabledStarlinkGen3.delete(g.id);
        this.syncStarlinkGen3Checkboxes();
        this.handlers.onStarlinkGen3ShellToggle(g.id, cb.checked);
        this.refreshStats();
      });
      this.starlinkGen3Checkboxes.set(g.id, cb);
      label.appendChild(cb);
      label.append(` ${starlinkGen3ShellLabel(g)}`);
      li.appendChild(swatch);
      li.appendChild(label);
      list.appendChild(li);
    }
  }

  private setStarlinkMaster(on: boolean): void {
    const shells = starlinkGroupsForMode(this.starlinkDeployment);
    this.enabledStarlinkGen1.clear();
    if (on) {
      for (const g of shells) this.enabledStarlinkGen1.add(g.id);
    }
    this.syncStarlinkGen1Checkboxes();
  }

  private setStarlinkGen2Master(on: boolean): void {
    const shells = starlinkGen2GroupsForMode(this.starlinkGen2Mode, this.starlinkGen2Inc365);
    this.enabledStarlinkGen2.clear();
    if (on) {
      for (const g of shells) this.enabledStarlinkGen2.add(g.id);
    }
    this.syncStarlinkGen2Checkboxes();
  }

  private syncStarlinkGen1Checkboxes(): void {
    const master = document.getElementById("starlink-master") as HTMLInputElement;
    const shells = starlinkGroupsForMode(this.starlinkDeployment);
    master.checked = shells.length > 0 && shells.every((g) => this.enabledStarlinkGen1.has(g.id));
    for (const g of shells) {
      const cb = this.starlinkGen1Checkboxes.get(g.id);
      if (cb) cb.checked = this.enabledStarlinkGen1.has(g.id);
    }
  }

  private syncStarlinkGen2Checkboxes(): void {
    const master = document.getElementById("starlink-gen2-master") as HTMLInputElement;
    const shells = starlinkGen2GroupsForMode(this.starlinkGen2Mode, this.starlinkGen2Inc365);
    master.checked = shells.length > 0 && shells.every((g) => this.enabledStarlinkGen2.has(g.id));
    for (const g of shells) {
      const cb = this.starlinkGen2Checkboxes.get(g.id);
      if (cb) cb.checked = this.enabledStarlinkGen2.has(g.id);
    }
  }

  private updateGen2Inc365Visibility(): void {
    const row = document.getElementById("starlink-gen2-inc365-row")!;
    row.style.display = this.starlinkGen2Mode === "granted" ? "" : "none";
  }

  private buildStarlinkGen1ShellList(): void {
    const list = document.getElementById("starlink-gen1-shells")!;
    for (const g of starlinkGroupsForMode(this.starlinkDeployment)) {
      const li = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = `#${g.color.toString(16).padStart(6, "0")}`;
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = this.enabledStarlinkGen1.has(g.id);
      cb.addEventListener("change", () => {
        if (cb.checked) this.enabledStarlinkGen1.add(g.id);
        else this.enabledStarlinkGen1.delete(g.id);
        this.syncStarlinkGen1Checkboxes();
        this.handlers.onStarlinkShellToggle(g.id, cb.checked);
        this.refreshStats();
      });
      this.starlinkGen1Checkboxes.set(g.id, cb);
      label.appendChild(cb);
      label.append(` ${starlinkShellLabel(g)}`);
      li.appendChild(swatch);
      li.appendChild(label);
      list.appendChild(li);
    }
  }

  private buildStarlinkGen2ShellList(): void {
    const list = document.getElementById("starlink-gen2-shells")!;
    for (const g of starlinkGen2GroupsForMode(this.starlinkGen2Mode, this.starlinkGen2Inc365)) {
      const li = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = `#${g.color.toString(16).padStart(6, "0")}`;
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = this.enabledStarlinkGen2.has(g.id);
      cb.addEventListener("change", () => {
        if (cb.checked) this.enabledStarlinkGen2.add(g.id);
        else this.enabledStarlinkGen2.delete(g.id);
        this.syncStarlinkGen2Checkboxes();
        this.handlers.onStarlinkGen2ShellToggle(g.id, cb.checked);
        this.refreshStats();
      });
      this.starlinkGen2Checkboxes.set(g.id, cb);
      label.appendChild(cb);
      label.append(` ${starlinkGen2ShellLabel(g)}`);
      li.appendChild(swatch);
      li.appendChild(label);
      list.appendChild(li);
    }
  }

  private ensureOdcShellEnabled(g: OrbitGroupConfig, sh: number): void {
    let set = this.enabledOdcShells.get(g.id);
    if (!set) {
      set = new Set();
      this.enabledOdcShells.set(g.id, set);
    }
    if (set.has(sh)) return;
    set.add(sh);
    this.syncOdcShellCheckboxes(g);
    this.handlers.onOdcShellsChange();
  }

  private buildInspector(): void {
    this.inspectorEl.innerHTML = "";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn-secondary";
    clearBtn.textContent = "Clear selection";
    clearBtn.addEventListener("click", () => {
      this.focusedShells.clear();
      this.handlers.onShellFocusChange([]);
      this.handlers.onPlaneSelect(null, false);
      this.syncShellSelectUi();
      this.inspectorEl.querySelectorAll(".plane-btn.selected").forEach((el) => el.classList.remove("selected"));
    });
    this.inspectorEl.appendChild(clearBtn);

    for (const g of ORBIT_GROUPS) {
      const gDetails = document.createElement("details");
      gDetails.className = "inspector-group";
      const gSum = document.createElement("summary");
      gSum.textContent = `Group ${g.id} · ${g.shells} shells · ${g.planesPerShell} planes/shell${isPolarGroup(g) ? " (polar SSO)" : ""}`;
      gDetails.appendChild(gSum);

      const shellHost = document.createElement("div");
      shellHost.className = "shell-host";
      gDetails.appendChild(shellHost);

      gDetails.addEventListener("toggle", () => {
        if (!gDetails.open || shellHost.childElementCount > 0) return;
        this.populateShellList(g, shellHost);
      });

      this.inspectorEl.appendChild(gDetails);
    }
  }

  private selectPlane(g: OrbitGroupConfig, sh: number, pl: number, highlight?: HTMLElement): void {
    if (highlight) {
      this.inspectorEl.querySelectorAll(".plane-btn.selected").forEach((el) => el.classList.remove("selected"));
      highlight.classList.add("selected");
    }
    if (!this.enabledOdcShells.get(g.id)?.has(sh)) {
      this.ensureOdcShellEnabled(g, sh);
    }
    this.focusedShells.clear();
    this.focusedShells.add(shellSelectionKey({ groupId: g.id, shellIndex: sh }));
    this.handlers.onShellFocusChange([{ groupId: g.id, shellIndex: sh }]);
    this.syncShellSelectUi();
    const isolate = (document.getElementById("isolate-plane") as HTMLInputElement).checked;
    this.handlers.onPlaneSelect({ groupId: g.id, shellIndex: sh, planeIndex: pl }, isolate);
    this.refreshStats();
  }

  private syncShellSelectUi(): void {
    for (const btn of this.inspectorEl.querySelectorAll<HTMLButtonElement>(".shell-select-btn")) {
      const groupId = Number(btn.dataset.groupId);
      const shellIndex = Number(btn.dataset.shellIndex);
      const key = shellSelectionKey({ groupId, shellIndex });
      const selected = this.focusedShells.has(key);
      btn.classList.toggle("selected", selected);
      btn.textContent = selected ? "Selected" : "Select shell";
      btn.closest(".inspector-shell")?.classList.toggle("selected", selected);
    }
  }

  private toggleShellSelection(g: OrbitGroupConfig, sh: number): void {
    const key = shellSelectionKey({ groupId: g.id, shellIndex: sh });
    if (this.focusedShells.has(key)) {
      this.focusedShells.delete(key);
    } else {
      this.focusedShells.add(key);
      if (!this.enabledOdcShells.get(g.id)?.has(sh)) {
        this.ensureOdcShellEnabled(g, sh);
      }
    }

    const shells = [...this.focusedShells].map((k) => {
      const [groupId, shellIndex] = k.split(":").map(Number);
      return { groupId: groupId!, shellIndex: shellIndex! };
    });

    if (shells.length > 0) {
      (document.getElementById("track-mode") as HTMLSelectElement).value = "shell";
      this.handlers.onTrackMode("shell");
    }

    this.handlers.onShellFocusChange(shells);
    this.syncShellSelectUi();
    this.refreshStats();
  }

  private populateShellList(g: OrbitGroupConfig, host: HTMLElement): void {
    for (let sh = 0; sh < g.shells; sh++) {
      const sDetails = document.createElement("details");
      sDetails.className = "inspector-shell";
      const key = shellSelectionKey({ groupId: g.id, shellIndex: sh });
      if (this.focusedShells.has(key)) sDetails.classList.add("selected");

      const lo = g.altitudeKm[0];
      const hi = g.altitudeKm[1];
      const alt =
        g.shells <= 1
          ? `${((lo + hi) / 2).toFixed(0)} km`
          : `${(lo + ((hi - lo) * sh) / (g.shells - 1)).toFixed(0)} km`;
      const sSum = document.createElement("summary");
      sSum.textContent = `Shell ${sh} · ~${alt} km`;
      sDetails.appendChild(sSum);

      const shellActions = document.createElement("div");
      shellActions.className = "shell-actions";
      const shellBtn = document.createElement("button");
      shellBtn.type = "button";
      shellBtn.className = "btn-secondary shell-select-btn";
      shellBtn.dataset.groupId = String(g.id);
      shellBtn.dataset.shellIndex = String(sh);
      const selected = this.focusedShells.has(key);
      shellBtn.textContent = selected ? "Selected" : "Select shell";
      if (selected) shellBtn.classList.add("selected");
      shellBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.toggleShellSelection(g, sh);
      });
      shellActions.appendChild(shellBtn);
      sDetails.appendChild(shellActions);

      const planeHost = document.createElement("div");
      planeHost.className = "plane-row";
      sDetails.appendChild(planeHost);

      sDetails.addEventListener("toggle", () => {
        if (!sDetails.open || planeHost.childElementCount > 0) return;
        this.populatePlanePicker(g, sh, planeHost);
      });

      host.appendChild(sDetails);
    }
  }

  private populatePlanePicker(g: OrbitGroupConfig, sh: number, host: HTMLElement): void {
    if (g.planesPerShell <= 12) {
      for (let pl = 0; pl < g.planesPerShell; pl++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "plane-btn";
        btn.textContent = `P${pl}`;
        btn.title = `Group ${g.id} shell ${sh} plane ${pl}`;
        btn.addEventListener("click", () => this.selectPlane(g, sh, pl, btn));
        host.appendChild(btn);
      }
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "plane-picker";
    const label = document.createElement("label");
    label.textContent = `Plane 0–${g.planesPerShell - 1}`;
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = String(g.planesPerShell - 1);
    input.value = "0";
    const val = document.createElement("span");
    val.className = "plane-val";
    val.textContent = "P0";
    input.addEventListener("input", () => {
      val.textContent = `P${input.value}`;
    });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-secondary plane-btn";
    btn.textContent = "Focus plane";
    btn.addEventListener("click", () => this.selectPlane(g, sh, Number(input.value), btn));
    label.appendChild(input);
    label.appendChild(val);
    wrap.appendChild(label);
    wrap.appendChild(btn);
    host.appendChild(wrap);
  }
}

