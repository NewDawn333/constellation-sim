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
} from "./constellation";
import { STARLINK_GEN3_PARTIAL, starlinkGen3ShellLabel } from "./data/starlinkGen3";
import {
  STARLINK_SCENARIOS,
  scenarioApplyHints,
  type StarlinkScenarioId,
} from "./data/starlinkScenarios";
import type { ConstellationRenderer, PlaneSelection, ShellSelection, TrackMode } from "./constellationRenderer";
import { shellSelectionKey } from "./constellationRenderer";
import { DENSITY_STEPS, formatDensityLabel, formatSatSizeLabel, satSizeSliderToScale, type BuildParams } from "./orbits";

export interface SimUIHandlers {
  onDensityChange: (divisor: number) => void;
  onSatPointScaleChange: (scale: number) => void;
  onExaggerationChange: (exaggeration: number) => void;
  onOdcShellsChange: () => void;
  onPlaneSelect: (sel: PlaneSelection | null, isolate: boolean) => void;
  onShellFocusChange: (shells: ShellSelection[]) => void;
  onShellIsolateToggle: (on: boolean) => void;
  onTrackMode: (mode: TrackMode) => void;
  onShowGroundTracks: (show: boolean) => void;
  onShowShellBands: (show: boolean) => void;
  onAutoBudgetToggle: (on: boolean) => void;
  onShowTracks: (show: boolean) => void;
  onShowEarth: (show: boolean) => void;
  onEarthDayNightToggle: (enabled: boolean) => void;
  onCoverageToggle: (show: boolean) => void;
  onCoverageGapsToggle: (show: boolean) => void;
  onBandwidthToggle: (show: boolean) => void;
  onBandwidthLayerChange: (layer: "broadband" | "dtc") => void;
  onBandwidthConcurrencyChange: (factor: number) => void;
  onBandwidthClassFilterChange: () => void;
  onCoverageTimelineToggle: (play: boolean) => void;
  onTimeScale: (scale: number) => void;
  onStarlinkMasterToggle: (on: boolean) => void;
  onStarlinkShellToggle: (groupId: number, enabled: boolean) => void;
  onStarlinkDeploymentChange: (mode: StarlinkDeploymentMode) => void;
  onStarlinkGen2MasterToggle: (on: boolean) => void;
  onStarlinkGen2ShellToggle: (groupId: number, enabled: boolean) => void;
  onStarlinkGen2ModeChange: (mode: StarlinkGen2Mode) => void;
  onStarlinkGen2Inc365Change: (inc: StarlinkGen2Inc365) => void;
  onStarlinkViewChange: (view: StarlinkViewMode, snapshotId: string) => void;
  onStarlinkDeployedMasterToggle: (on: boolean) => void;
  onStarlinkDeployedShellToggle: (groupId: number, enabled: boolean) => void;
  onStarlinkGen3ShellToggle: (groupId: number, enabled: boolean) => void;
  onStarlinkGen3MasterToggle: (on: boolean) => void;
  onScenarioChange: (scenarioId: StarlinkScenarioId) => void;
  onMinElevationChange: (deg: number) => void;
  onNightSideDimmingChange: (on: boolean) => void;
  onExportScreenshot: () => void;
  onCopyShareLink: () => void;
  onOdcRepresentativeModeChange: (on: boolean) => void;
  onAutoLodToggle: (on: boolean) => void;
}

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
    this.buildOdcGroupPanel();
    this.buildInspector();
    this.refreshStats();
  }

  getEnabledOdcShellsByGroup(): Map<number, Set<number>> {
    return this.enabledOdcShells;
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
    if (this.starlinkScenario === "gen3-partial" && this.starlinkView === "operational") {
      return new Set([...odc, ...this.enabledStarlinkDeployed, ...this.enabledStarlinkGen3]);
    }
    if (this.starlinkView === "operational") {
      return new Set([...odc, ...this.enabledStarlinkDeployed]);
    }
    return new Set([...odc, ...this.enabledStarlinkGen1, ...this.enabledStarlinkGen2]);
  }

  getStarlinkScenario(): StarlinkScenarioId {
    return this.starlinkScenario;
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
    const gen3Panel = document.getElementById("starlink-gen3-panel")!;
    const isOp = this.starlinkView === "operational";
    nominalPanel.hidden = isOp;
    operationalPanel.hidden = !isOp;
    snapshotRow.hidden = !isOp;
    gen3Panel.hidden = !(isOp && this.starlinkScenario === "gen3-partial");
    this.updateDeploymentSnapshotHint();
    if (isOp) {
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

    if (hints.enableAllStarlink) {
      if (hints.view === "operational") {
        this.setStarlinkDeployedMaster(true);
        if (scenarioId === "gen3-partial") {
          this.setStarlinkGen3Master(true);
        }
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
    const stats = computeStats(model, this.getEnabledGroups());
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
      this.starlinkView === "operational" && snap
        ? snap.gen2Total
        : this.starlinkGen2Mode === "application"
          ? STARLINK_GEN2_NOMINAL_APPLICATION
          : STARLINK_GEN2_FCC_TRANCHE_CAP;
    const starlinkTotalCap =
      this.starlinkView === "operational" && snap ? snap.totalOperational : gen1Cap + gen2Cap;
    const gapNote =
      this.starlinkView === "nominal" &&
      this.enabledStarlinkGen1.size > 0 &&
      this.enabledStarlinkGen2.size > 0
        ? `<div class="stat-budget">Gen1–Gen2 gap: ${GEN1_GEN2_ALTITUDE_GAP_KM[0]}–${GEN1_GEN2_ALTITUDE_GAP_KM[1]} km</div>`
        : "";
    const starlinkModeNote =
      this.starlinkView === "operational" && snap
        ? `<div class="stat-budget">${snap.label} · ${snap.reconciliationMethod}</div>`
        : "";

    this.statsEl.innerHTML = `
      <div class="stat-row"><span>ODC drawn</span><strong>${drawnSats.toLocaleString()} / ${stats.odc.visibleSats.toLocaleString()} buf · ${formatDensityLabel(model.buildParams.sampleDivisor)}</strong></div>
      <div class="stat-row"><span>ODC nominal (on)</span><strong>${stats.odc.nominalSats.toLocaleString()} / ${ODC_NOMINAL_TOTAL.toLocaleString()}</strong></div>
      <div class="stat-row"><span>ODC polar (on)</span><strong>${stats.odcPolar.nominalSats.toLocaleString()} / ${ODC_POLAR_NOMINAL_TOTAL.toLocaleString()}</strong></div>
      <div class="stat-row"><span>ODC inclined (on)</span><strong>${stats.odcInclined.nominalSats.toLocaleString()} / ${ODC_INCLINED_NOMINAL_TOTAL.toLocaleString()}</strong></div>
      ${this.getRepresentativeStatRow()}
      <div class="stat-row"><span>Starlink Gen1 (on)</span><strong>${stats.starlinkGen1.nominalSats.toLocaleString()} / ${gen1Cap.toLocaleString()}</strong></div>
      <div class="stat-row"><span>Starlink Gen2 (on)</span><strong>${stats.starlinkGen2.nominalSats.toLocaleString()} / ${gen2Cap.toLocaleString()}</strong></div>
      <div class="stat-row"><span>Starlink total (on)</span><strong>${(stats.starlinkGen1.nominalSats + stats.starlinkGen2.nominalSats).toLocaleString()} / ${starlinkTotalCap.toLocaleString()}</strong></div>
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
    void computeStats(this.getModel(), this.getEnabledGroups());
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
    return `${groupId}:${shellIndex}`;
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
        shellCb.addEventListener("change", () => {
          let set = this.enabledOdcShells.get(g.id);
          if (!set) {
            set = new Set();
            this.enabledOdcShells.set(g.id, set);
          }
          if (shellCb.checked) set.add(sh);
          else set.delete(sh);
          if (set.size === 0) this.enabledOdcShells.delete(g.id);
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
        shellList.appendChild(shellLi);
      }

      li.appendChild(swatch);
      li.appendChild(head);
      li.appendChild(shellList);
      host.appendChild(li);
    }
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
      const cb = this.odcShellCheckboxes.get(this.odcShellKey(g.id, sh));
      if (cb) cb.checked = shells.has(sh);
    }
    this.syncOdcGroupMaster(g);
  }

  updateOdcGroupMetas(): void {
    const model = this.getModel();
    const divisor = model.buildParams.sampleDivisor;
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
      const gpu = model.gpuBuffers.get(g.id);
      if (gpu) {
        meta.textContent = ` · GPU ${gpu.displaySats.toLocaleString()} pts · 1:${divisor}`;
      } else {
        meta.textContent = ` · ${vis.toLocaleString()} drawn · ${nominalOn.toLocaleString()} nominal shell cap · 1:${divisor}`;
      }
    }
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
    const list = document.getElementById("starlink-gen3-shells")!;
    list.innerHTML = "";
    this.buildStarlinkGen3ShellList();
  }

  setStarlinkGen3Master(on: boolean): void {
    this.enabledStarlinkGen3.clear();
    if (on) {
      for (const g of STARLINK_GEN3_PARTIAL) this.enabledStarlinkGen3.add(g.id);
    }
    this.syncStarlinkGen3Checkboxes();
  }

  private syncStarlinkGen3Checkboxes(): void {
    const master = document.getElementById("starlink-gen3-master") as HTMLInputElement;
    master.checked =
      STARLINK_GEN3_PARTIAL.length > 0 &&
      STARLINK_GEN3_PARTIAL.every((g) => this.enabledStarlinkGen3.has(g.id));
    for (const g of STARLINK_GEN3_PARTIAL) {
      const cb = this.starlinkGen3Checkboxes.get(g.id);
      if (cb) cb.checked = this.enabledStarlinkGen3.has(g.id);
    }
  }

  private buildStarlinkGen3ShellList(): void {
    const list = document.getElementById("starlink-gen3-shells")!;
    for (const g of STARLINK_GEN3_PARTIAL) {
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

export { DENSITY_STEPS, type BuildParams };
