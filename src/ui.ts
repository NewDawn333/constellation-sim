import {
  computeStats,
  groupNominalBreakdown,
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
  groupLabel,
} from "./constellation";
import type { ConstellationRenderer, PlaneSelection, ShellSelection, TrackMode } from "./constellationRenderer";
import { DENSITY_PRESETS, type BuildParams, type DensityPreset } from "./orbits";

export interface SimUIHandlers {
  onDensityChange: (divisor: DensityPreset) => void;
  onExaggerationChange: (exaggeration: number) => void;
  onIntroNext: () => void;
  onIntroReset: () => void;
  onIntroToggle: (on: boolean) => void;
  onGroupToggle: (groupId: number, enabled: boolean) => void;
  onShowAllGroups: () => void;
  onPlaneSelect: (sel: PlaneSelection | null, isolate: boolean) => void;
  onShellFocus: (sel: ShellSelection | null) => void;
  onTrackMode: (mode: TrackMode) => void;
  onShowGroundTracks: (show: boolean) => void;
  onShowShellBands: (show: boolean) => void;
  onAutoBudgetToggle: (on: boolean) => void;
  onShowTracks: (show: boolean) => void;
  onShowEarth: (show: boolean) => void;
  onEarthDayNightToggle: (enabled: boolean) => void;
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
  onOdcRepresentativeModeChange: (on: boolean) => void;
  onAutoLodToggle: (on: boolean) => void;
}

export class ControlPanel {
  private enabledGroups = new Set<number>([1]);
  private enabledStarlinkGen1 = new Set<number>();
  private enabledStarlinkGen2 = new Set<number>();
  private enabledStarlinkDeployed = new Set<number>();
  private starlinkView: StarlinkViewMode = "nominal";
  private deploymentSnapshotId = "2026-06-03";
  private starlinkDeployment: StarlinkDeploymentMode = "authorized";
  private starlinkGen2Mode: StarlinkGen2Mode = "granted";
  private starlinkGen2Inc365: StarlinkGen2Inc365 = "28";
  private introMode = true;
  private introStep = 1;
  private isolatePlane = false;

  private readonly statsEl: HTMLElement;
  private readonly introStatusEl: HTMLElement;
  private readonly inspectorEl: HTMLElement;
  private readonly groupCheckboxes = new Map<number, HTMLInputElement>();
  private readonly starlinkGen1Checkboxes = new Map<number, HTMLInputElement>();
  private readonly starlinkGen2Checkboxes = new Map<number, HTMLInputElement>();
  private readonly starlinkDeployedCheckboxes = new Map<number, HTMLInputElement>();

  constructor(
    private handlers: SimUIHandlers,
    private getModel: () => UnifiedConstellation,
    private getRenderer: () => ConstellationRenderer
  ) {
    this.statsEl = document.getElementById("stats")!;
    this.introStatusEl = document.getElementById("intro-status")!;
    this.inspectorEl = document.getElementById("inspector")!;

    this.wireControls();
    this.buildInspector();
    this.syncIntroUI();
    this.refreshStats();
  }

  getEnabledGroups(): Set<number> {
    if (this.starlinkView === "operational") {
      return new Set([...this.enabledGroups, ...this.enabledStarlinkDeployed]);
    }
    return new Set([...this.enabledGroups, ...this.enabledStarlinkGen1, ...this.enabledStarlinkGen2]);
  }

  getStarlinkView(): StarlinkViewMode {
    return this.starlinkView;
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
    const isOp = this.starlinkView === "operational";
    nominalPanel.hidden = isOp;
    operationalPanel.hidden = !isOp;
    snapshotRow.hidden = !isOp;
    this.updateDeploymentSnapshotHint();
    if (isOp) {
      this.rebuildStarlinkDeployedShellList();
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
    return new Set(this.enabledGroups);
  }

  isIntroMode(): boolean {
    return this.introMode;
  }

  getIntroStep(): number {
    return this.introStep;
  }

  enableGroupOnly(groupId: number): void {
    this.enabledGroups = new Set([groupId]);
    this.syncGroupCheckboxes();
    this.handlers.onGroupToggle(groupId, true);
    for (const g of ORBIT_GROUPS) {
      if (g.id !== groupId) this.handlers.onGroupToggle(g.id, false);
    }
    this.refreshStats();
  }

  advanceIntro(): void {
    if (this.introStep >= ORBIT_GROUPS.length) return;
    this.introStep++;
    const g = ORBIT_GROUPS[this.introStep - 1]!;
    this.enabledGroups.add(g.id);
    this.syncGroupCheckboxes();
    this.handlers.onGroupToggle(g.id, true);
    this.handlers.onIntroNext();
    this.syncIntroUI();
    this.refreshStats();
  }

  resetIntro(): void {
    this.introStep = 1;
    this.enabledGroups = new Set([1]);
    this.syncGroupCheckboxes();
    for (const g of ORBIT_GROUPS) {
      this.handlers.onGroupToggle(g.id, g.id === 1);
    }
    this.handlers.onIntroReset();
    this.syncIntroUI();
    this.refreshStats();
  }

  setDensity(divisor: DensityPreset): void {
    const sel = document.getElementById("density") as HTMLSelectElement;
    sel.value = String(divisor);
    document.getElementById("density-val")!.textContent = divisor === 1 ? "1:1 (cap)" : `1:${divisor}`;
    this.handlers.onDensityChange(divisor);
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
      <div class="stat-row"><span>ODC (on)</span><strong>${stats.odc.nominalSats.toLocaleString()} / ${ODC_NOMINAL_TOTAL.toLocaleString()}</strong></div>
      <div class="stat-row"><span>ODC polar (on)</span><strong>${stats.odcPolar.nominalSats.toLocaleString()} / ${ODC_POLAR_NOMINAL_TOTAL.toLocaleString()}</strong></div>
      <div class="stat-row"><span>ODC inclined (on)</span><strong>${stats.odcInclined.nominalSats.toLocaleString()} / ${ODC_INCLINED_NOMINAL_TOTAL.toLocaleString()}</strong></div>
      ${this.getRepresentativeStatRow()}
      <div class="stat-row"><span>Starlink Gen1 (on)</span><strong>${stats.starlinkGen1.nominalSats.toLocaleString()} / ${gen1Cap.toLocaleString()}</strong></div>
      <div class="stat-row"><span>Starlink Gen2 (on)</span><strong>${stats.starlinkGen2.nominalSats.toLocaleString()} / ${gen2Cap.toLocaleString()}</strong></div>
      <div class="stat-row"><span>Starlink total (on)</span><strong>${(stats.starlinkGen1.nominalSats + stats.starlinkGen2.nominalSats).toLocaleString()} / ${starlinkTotalCap.toLocaleString()}</strong></div>
      <div class="stat-row"><span>Groups</span><strong>${stats.enabledGroups}</strong></div>
      <div class="stat-row"><span>Planes</span><strong>${stats.totalPlanes.toLocaleString()}</strong></div>
      <div class="stat-row"><span>Sats drawn</span><strong>${drawnSats.toLocaleString()}</strong></div>
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
      if (!this.enabledGroups.has(g.id)) continue;
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

    (document.getElementById("density") as HTMLSelectElement).addEventListener("change", (e) => {
      const v = Number((e.target as HTMLSelectElement).value) as DensityPreset;
      document.getElementById("density-val")!.textContent = v === 1 ? "1:1 (cap)" : `1:${v}`;
      this.handlers.onDensityChange(v);
    });

    (document.getElementById("exaggerate") as HTMLInputElement).addEventListener("change", (e) => {
      const on = (e.target as HTMLInputElement).checked;
      this.handlers.onExaggerationChange(on ? 5 : 1);
    });

    document.getElementById("btn-intro-next")!.addEventListener("click", () => this.advanceIntro());
    document.getElementById("btn-intro-reset")!.addEventListener("click", () => this.resetIntro());
    document.getElementById("btn-show-all")!.addEventListener("click", () => {
      this.introMode = false;
      this.introStep = ORBIT_GROUPS.length;
      this.enabledGroups = new Set(ORBIT_GROUPS.map((g) => g.id));
      this.syncGroupCheckboxes();
      this.handlers.onShowAllGroups();
      (document.getElementById("intro-mode") as HTMLInputElement).checked = false;
      this.syncIntroUI();
      this.refreshStats();
    });

    (document.getElementById("intro-mode") as HTMLInputElement).addEventListener("change", (e) => {
      this.introMode = (e.target as HTMLInputElement).checked;
      if (this.introMode) this.resetIntro();
      this.handlers.onIntroToggle(this.introMode);
      this.syncIntroUI();
    });

    (document.getElementById("isolate-plane") as HTMLInputElement).addEventListener("change", (e) => {
      this.isolatePlane = (e.target as HTMLInputElement).checked;
      const sel = this.getRenderer().getSelection();
      this.handlers.onPlaneSelect(sel, this.isolatePlane);
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

    this.applyStarlinkViewMode();
    this.buildDeploymentSnapshotSelect();

    this.buildStarlinkGen1ShellList();
    this.buildStarlinkGen2ShellList();
    this.updateGen2Inc365Visibility();

    for (const g of ORBIT_GROUPS) {
      const li = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = `#${g.color.toString(16).padStart(6, "0")}`;
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = g.id === 1;
      cb.addEventListener("change", () => {
        if (cb.checked) this.enabledGroups.add(g.id);
        else this.enabledGroups.delete(g.id);
        this.handlers.onGroupToggle(g.id, cb.checked);
        this.refreshStats();
      });
      this.groupCheckboxes.set(g.id, cb);
      label.appendChild(cb);
      label.append(` ${groupLabel(g)}`);
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.dataset.groupId = String(g.id);
      label.appendChild(meta);
      li.appendChild(swatch);
      li.appendChild(label);
      document.getElementById("groups")!.appendChild(li);
    }
    this.updateGroupMetas();
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

  updateGroupMetas(): void {
    const model = this.getModel();
    for (const g of ORBIT_GROUPS) {
      const meta = document.querySelector(`.meta[data-group-id="${g.id}"]`)!;
      const groupPlanes = model.planesByGroup.get(g.id)!;
      const vis = groupPlanes.reduce((n, p) => n + p.satellites.length, 0);
      const { planes: planeCount, nominalSats } = groupNominalBreakdown(g);
      meta.textContent = isPolarGroup(g)
        ? `${g.shells} shells · ${g.planesPerShell} planes/shell · ${planeCount.toLocaleString()} planes · ${nominalSats.toLocaleString()} nominal (${g.satsPerPlane.toLocaleString()}/plane)`
        : `${g.shells} shells · ${planeCount.toLocaleString()} planes · ${vis.toLocaleString()} drawn / ${nominalSats.toLocaleString()} nominal`;
    }
  }

  private syncGroupCheckboxes(): void {
    for (const g of ORBIT_GROUPS) {
      this.groupCheckboxes.get(g.id)!.checked = this.enabledGroups.has(g.id);
    }
  }

  private syncIntroUI(): void {
    const btn = document.getElementById("btn-intro-next") as HTMLButtonElement;
    if (this.introStep >= ORBIT_GROUPS.length) {
      btn.disabled = true;
      btn.textContent = "All groups shown";
      this.introStatusEl.textContent = `Intro complete — all ${ORBIT_GROUPS.length} groups visible.`;
    } else {
      btn.disabled = false;
      const next = ORBIT_GROUPS[this.introStep]!;
      btn.textContent = `Add Group ${next.id}`;
      this.introStatusEl.textContent = `Showing groups 1–${this.introStep}. Next: ${groupLabel(next)}`;
    }
  }

  private buildInspector(): void {
    this.inspectorEl.innerHTML = "";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn-secondary";
    clearBtn.textContent = "Clear selection";
    clearBtn.addEventListener("click", () => {
      this.handlers.onPlaneSelect(null, false);
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
    if (!this.enabledGroups.has(g.id)) {
      this.enabledGroups.add(g.id);
      this.syncGroupCheckboxes();
      this.handlers.onGroupToggle(g.id, true);
    }
    const isolate = (document.getElementById("isolate-plane") as HTMLInputElement).checked;
    this.handlers.onPlaneSelect({ groupId: g.id, shellIndex: sh, planeIndex: pl }, isolate);
    this.refreshStats();
  }

  private populateShellList(g: OrbitGroupConfig, host: HTMLElement): void {
    for (let sh = 0; sh < g.shells; sh++) {
      const sDetails = document.createElement("details");
      sDetails.className = "inspector-shell";
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
      shellBtn.className = "btn-secondary";
      shellBtn.textContent = "Tracks: this shell only";
      shellBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (!this.enabledGroups.has(g.id)) {
          this.enabledGroups.add(g.id);
          this.syncGroupCheckboxes();
          this.handlers.onGroupToggle(g.id, true);
        }
        (document.getElementById("track-mode") as HTMLSelectElement).value = "shell";
        this.handlers.onTrackMode("shell");
        this.handlers.onShellFocus({ groupId: g.id, shellIndex: sh });
        this.refreshStats();
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

export { DENSITY_PRESETS, type BuildParams, type DensityPreset };
