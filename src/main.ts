import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ORBIT_GROUPS,
  buildConstellationModel,
  starlinkGroupsForMode,
  starlinkGen2GroupsForMode,
  DEPLOYMENT_SNAPSHOTS,
  deploymentSnapshotById,
  type StarlinkDeploymentMode,
  type StarlinkGen2Mode,
  type StarlinkGen2Inc365,
  type StarlinkViewMode,
  type UnifiedConstellation,
} from "./constellation";
import {
  starlinkGroupsForScenario,
  scenarioApplyHints,
  type StarlinkScenarioId,
} from "./data/starlinkScenarios";
import { exportCanvasPng, screenshotFilename } from "./exportScreenshot";
import {
  readShareStateFromLocation,
  shareUrlFromState,
  type SimShareState,
} from "./shareState";
import {
  ConstellationRenderer,
  frameGroupCamera,
  type PlaneSelection,
  type TrackMode,
} from "./constellationRenderer";
import { createEarthScene } from "./render/earth";
import { CoverageLayer } from "./render/coverageLayer";
import type { HardwareClassFilter } from "./data/starlinkHardware";
import { isStarlinkGroup } from "./data/groupConfig";
import {
  DEFAULT_BUILD_PARAMS,
  DENSITY_STEPS,
  densityStepIndex,
  type BuildParams,
} from "./orbits";
import { ControlPanel } from "./ui";

function nextDensityStep(current: number): number | null {
  const i = densityStepIndex(current);
  return i < DENSITY_STEPS.length - 1 ? DENSITY_STEPS[i + 1]! : null;
}

function prevDensityStep(current: number): number | null {
  const i = densityStepIndex(current);
  return i > 0 ? DENSITY_STEPS[i - 1]! : null;
}

function setLoader(msg: string, show: boolean): void {
  const el = document.getElementById("loader")!;
  el.style.display = show ? "flex" : "none";
  el.querySelector(".loader-msg")!.textContent = msg;
}

function showFatalError(err: unknown): void {
  const el = document.getElementById("loader")!;
  el.style.display = "flex";
  el.classList.add("loader-error");
  const msg = err instanceof Error ? err.message : String(err);
  el.querySelector(".loader-msg")!.textContent = `Failed to start: ${msg}`;
  console.error(err);
}

async function main(): Promise<void> {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  setLoader("Building constellation…", true);

  let buildParams: BuildParams = { ...DEFAULT_BUILD_PARAMS };
  let starlinkDeployment: StarlinkDeploymentMode = "authorized";
  let starlinkGen2Mode: StarlinkGen2Mode = "granted";
  let starlinkGen2Inc365: StarlinkGen2Inc365 = "28";
  let starlinkView: StarlinkViewMode = "nominal";
  let deploymentSnapshotId = "2026-06-03";
  let starlinkScenario: StarlinkScenarioId = "today";
  let minElevationDeg = 25;
  let nightSideDimming = false;
  let panel!: ControlPanel;

  function buildModel(): UnifiedConstellation {
    const starlink = starlinkGroupsForScenario(starlinkScenario, {
      view: starlinkView,
      snapshotId: deploymentSnapshotId,
      gen1Mode: starlinkDeployment,
      gen2Mode: starlinkGen2Mode,
      gen2Inc365: starlinkGen2Inc365,
    });
    const gen1 = starlink.filter((g) => g.layer === "starlink-gen1");
    const gen2 = starlink.filter((g) => g.layer === "starlink-gen2");
    return buildConstellationModel(ORBIT_GROUPS, gen1, gen2, buildParams, {
      enabledShellsByGroup: panel?.getEnabledOdcShellsByGroup?.() ?? new Map(),
    });
  }

  let model: UnifiedConstellation = buildModel();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050810);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 200);
  camera.position.set(2.5, 1.8, 3.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.minDistance = 1.2;
  controls.maxDistance = 12;

  setLoader("Loading Earth…", true);
  const earthScene = await createEarthScene(renderer, scene);
  const { group: earthGroup, sunLight, setDayNight: setEarthDayNight } = earthScene;
  scene.add(earthGroup, sunLight);

  const starsGeo = new THREE.BufferGeometry();
  const starCount = 800;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 35 + Math.random() * 25;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPos[i * 3 + 2] = r * Math.cos(phi);
  }
  starsGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  scene.add(
    new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({ color: 0x99aacc, size: 0.025, sizeAttenuation: true })
    )
  );

  const constellation = new ConstellationRenderer(scene, earthGroup, model);
  constellation.setCamera(camera);
  constellation.setAutoLod(false);
  constellation.setEnabledGroups(new Set());
  constellation.setShowTracks(false);
  constellation.setShowGroundTracks(false);
  constellation.setShowShellBands(false);

  const coverage = new CoverageLayer(earthGroup);

  const timelineSnapshots = [...DEPLOYMENT_SNAPSHOTS].sort((a, b) =>
    a.asOf.localeCompare(b.asOf)
  );
  let coverageTimelineTimer: ReturnType<typeof setInterval> | null = null;
  let coverageTimelineIndex = 0;

  function stopCoverageTimeline(): void {
    if (coverageTimelineTimer !== null) {
      clearInterval(coverageTimelineTimer);
      coverageTimelineTimer = null;
    }
    const btn = document.getElementById("btn-coverage-timeline") as HTMLButtonElement | null;
    if (btn) btn.textContent = "Play timeline";
  }

  function applyDeploymentSnapshot(snapshotId: string): void {
    deploymentSnapshotId = snapshotId;
    const sel = document.getElementById("deployment-snapshot") as HTMLSelectElement;
    sel.value = snapshotId;
    rebuildConstellation();
    coverage.invalidate();
    panel.applyStarlinkViewMode();
  }

  function ensureOperationalForCoverage(): void {
    if (starlinkView === "operational") return;
    starlinkView = "operational";
    (document.getElementById("starlink-view") as HTMLSelectElement).value = "operational";
    panel.applyStarlinkViewMode();
    panel.setStarlinkDeployedMaster(true);
    rebuildConstellation();
    syncRendererFromPanel();
    coverage.invalidate();
  }

  function coverageHudNote(): string {
    if (!coverage.isVisible()) return "";
    if (starlinkView !== "operational") {
      return "Service map · switch to Operational snapshot";
    }
    return coverage.formatStatsLine();
  }

  function suspendServiceOverlay(): void {
    stopCoverageTimeline();
    coverage.setVisible(false);
    (document.getElementById("show-coverage") as HTMLInputElement).checked = false;
    (document.getElementById("show-bandwidth") as HTMLInputElement).checked = false;
    hoverNote = "";
    const readout = document.getElementById("bandwidth-readout");
    if (readout) readout.textContent = "";
  }

  function isServiceOverlayActive(): boolean {
    return starlinkView === "operational" && coverage.isVisible();
  }

  function syncServiceOverlayUi(): void {
    panel.syncServiceOverlayControls(starlinkView === "operational");
  }

  function readBandwidthClassFilter(): HardwareClassFilter {
    return {
      v1: (document.getElementById("bw-filter-v1") as HTMLInputElement).checked,
      v1_5: (document.getElementById("bw-filter-v1") as HTMLInputElement).checked,
      v2m: (document.getElementById("bw-filter-v2m") as HTMLInputElement).checked,
      dtcV1: (document.getElementById("bw-filter-dtc-v1") as HTMLInputElement).checked,
      dtcV2: (document.getElementById("bw-filter-dtc-v2") as HTMLInputElement).checked,
      v3: (document.getElementById("bw-filter-v3") as HTMLInputElement).checked,
    };
  }

  function applyBandwidthOptions(): void {
    coverage.setBandwidthOptions({
      concurrency: Number((document.getElementById("bandwidth-concurrency") as HTMLInputElement).value) / 100,
      layer: (document.getElementById("bandwidth-layer") as HTMLSelectElement).value as "broadband" | "dtc",
      classFilter: readBandwidthClassFilter(),
    });
  }

  function starlinkEnabledGroupIds(): Set<number> {
    const enabled = panel.getEnabledGroups();
    return new Set([...enabled].filter((id) => {
      const g = model.groups.find((x) => x.id === id);
      return g && isStarlinkGroup(g);
    }));
  }


  let simTime = 0;
  let timeScale = 80;
  const earthRotationRate = (2 * Math.PI) / 86164;
  let autoBudget = true;
  let budgetNote = "";
  let budgetCooldown = 0;
  let highFpsStreak = 0;
  let ready = false;
  let hoverNote = "";

  const overlayRaycaster = new THREE.Raycaster();
  const overlayPointer = new THREE.Vector2();
  const sunDirEarthScratch = new THREE.Vector3();
  const earthWorldScratch = new THREE.Vector3();
  const earthInvScratch = new THREE.Matrix4();

  function collectShareState(): SimShareState {
    return {
      v: 1,
      scenario: starlinkScenario,
      view: starlinkView,
      snapshotId: deploymentSnapshotId,
      density: buildParams.sampleDivisor,
      showCoverage: (document.getElementById("show-coverage") as HTMLInputElement).checked,
      showBandwidth: (document.getElementById("show-bandwidth") as HTMLInputElement).checked,
      bandwidthLayer: (document.getElementById("bandwidth-layer") as HTMLSelectElement)
        .value as "broadband" | "dtc",
      concurrencyPct: Number((document.getElementById("bandwidth-concurrency") as HTMLInputElement).value),
      minElevationDeg,
      nightSideDimming,
    };
  }

  function updateShareHash(): void {
    const url = shareUrlFromState(collectShareState());
    history.replaceState(null, "", url);
  }

  function applyShareState(state: SimShareState): void {
    minElevationDeg = state.minElevationDeg;
    nightSideDimming = state.nightSideDimming;
    coverage.setGridOptions({ minElevationDeg, nightSideDimming });

    const minElevEl = document.getElementById("min-elevation") as HTMLInputElement;
    minElevEl.value = String(minElevationDeg);
    (document.getElementById("min-elevation-val") as HTMLElement).textContent = `${minElevationDeg}°`;
    (document.getElementById("night-side-dimming") as HTMLInputElement).checked = nightSideDimming;

    (document.getElementById("bandwidth-layer") as HTMLSelectElement).value = state.bandwidthLayer;
    const conc = document.getElementById("bandwidth-concurrency") as HTMLInputElement;
    conc.value = String(state.concurrencyPct);
    (document.getElementById("bandwidth-concurrency-val") as HTMLElement).textContent = `${state.concurrencyPct}%`;

    buildParams = { ...buildParams, sampleDivisor: state.density };
    panel.setDensityStepIndex(densityStepIndex(state.density));

    applyScenario(state.scenario, {
      skipHash: true,
      view: state.view,
      snapshotId: state.snapshotId,
    });

    if (state.showBandwidth) {
      (document.getElementById("show-bandwidth") as HTMLInputElement).checked = true;
      (document.getElementById("show-coverage") as HTMLInputElement).checked = false;
      coverage.setDisplayMode("bandwidth");
      applyBandwidthOptions();
      coverage.setVisible(true);
    } else if (state.showCoverage) {
      (document.getElementById("show-coverage") as HTMLInputElement).checked = true;
      (document.getElementById("show-bandwidth") as HTMLInputElement).checked = false;
      coverage.setDisplayMode("coverage");
      coverage.setVisible(true);
    } else {
      coverage.setVisible(false);
    }
    coverage.invalidate();
    updateShareHash();
  }

  function applyScenario(
    scenarioId: StarlinkScenarioId,
    opts?: { skipHash?: boolean; view?: StarlinkViewMode; snapshotId?: string }
  ): void {
    starlinkScenario = scenarioId;
    const hints = scenarioApplyHints(scenarioId);
    starlinkView = opts?.view ?? hints.view;
    deploymentSnapshotId = opts?.snapshotId ?? hints.snapshotId;
    starlinkDeployment = hints.gen1Mode;
    starlinkGen2Mode = hints.gen2Mode;
    starlinkGen2Inc365 = hints.gen2Inc365;

    panel.applyScenario(scenarioId);
    panel.setStarlinkView(starlinkView, deploymentSnapshotId);
    (document.getElementById("starlink-view") as HTMLSelectElement).value = starlinkView;
    (document.getElementById("deployment-snapshot") as HTMLSelectElement).value = deploymentSnapshotId;
    panel.applyStarlinkViewMode();

    if (starlinkView === "nominal") {
      suspendServiceOverlay();
    }

    rebuildConstellation();
    syncRendererFromPanel();
    syncServiceOverlayUi();
    if (!opts?.skipHash) updateShareHash();
  }

  function updateSunDirectionEarthFixed(): void {
    sunDirEarthScratch.copy(sunLight.position).normalize();
    earthGroup.getWorldPosition(earthWorldScratch);
    earthInvScratch.copy(earthGroup.matrixWorld).invert();
    sunDirEarthScratch.transformDirection(earthInvScratch).normalize();
    coverage.setSunDirectionEarthFixed(sunDirEarthScratch);
  }

  canvas.addEventListener("pointermove", (e) => {
    if (!isServiceOverlayActive()) {
      hoverNote = "";
      const el = document.getElementById("bandwidth-readout");
      if (el) el.textContent = "";
      return;
    }
    if ((e.target as HTMLElement).closest("#panel")) return;

    overlayPointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    overlayPointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    overlayRaycaster.setFromCamera(overlayPointer, camera);
    const hits = overlayRaycaster.intersectObject(coverage.mesh, false);
    const readout = document.getElementById("bandwidth-readout")!;

    if (hits.length === 0 || !hits[0]!.uv) {
      hoverNote = "";
      readout.textContent = "";
      return;
    }

    const uv = hits[0]!.uv;
    const cell = coverage.sampleHover(uv.x, uv.y);
    if (!cell) {
      hoverNote = "";
      readout.textContent = "";
      return;
    }

    hoverNote = coverage.formatHover(cell);
    readout.textContent = hoverNote;
  });

  const fpsSamples: number[] = [];
  let displayedFps = 60;


  function syncRendererFromPanel(): void {
    if (!panel) return;
    constellation.setEnabledGroups(panel.getEnabledGroups());
    constellation.setShowTracks((document.getElementById("show-tracks") as HTMLInputElement).checked);
    constellation.setShowGroundTracks((document.getElementById("show-ground-tracks") as HTMLInputElement).checked);
    constellation.setShowShellBands((document.getElementById("show-shell-bands") as HTMLInputElement).checked);
    constellation.setTrackMode((document.getElementById("track-mode") as HTMLSelectElement).value as TrackMode);
  }

  function rebuildConstellation(): void {
    const enabled = panel?.getEnabledGroups() ?? new Set<number>();
    model = buildModel();
    constellation.rebuild(model, enabled);
    syncRendererFromPanel();
    const sel = constellation.getSelection();
    if (sel) {
      const isolate = (document.getElementById("isolate-plane") as HTMLInputElement).checked;
      constellation.setSelection(sel, isolate);
    }
    panel?.updateOdcGroupMetas();
    coverage.invalidate();
  }

  panel = new ControlPanel(
    {
      onDensityChange(divisor) {
        buildParams = { ...buildParams, sampleDivisor: divisor };
        rebuildConstellation();
        budgetNote = "";
      },
      onSatPointScaleChange(scale) {
        buildParams = { ...buildParams, satPointScale: scale };
        rebuildConstellation();
      },
      onOdcShellsChange() {
        setLoader("Building ODC shells…", true);
        requestAnimationFrame(() => {
          rebuildConstellation();
          setLoader("", false);
        });
      },
      onExaggerationChange(exaggeration) {
        buildParams = { ...buildParams, altitudeExaggeration: exaggeration };
        rebuildConstellation();
        const active = [...panel.getOdcEnabledGroups()].sort((a, b) => b - a)[0];
        const g = ORBIT_GROUPS.find((x) => x.id === active);
        if (g) frameGroupCamera(g, camera, controls, exaggeration);
      },
      onPlaneSelect(sel: PlaneSelection | null, isolate: boolean) {
        constellation.setSelection(sel, isolate);
        if (sel) {
          const g = model.groups.find((x) => x.id === sel.groupId)!;
          frameGroupCamera(g, camera, controls, buildParams.altitudeExaggeration);
        }
      },
      onShellFocusChange(shells) {
        constellation.setFocusShells(shells);
      },
      onShellIsolateToggle(on) {
        constellation.setIsolateShells(on);
      },
      onTrackMode(mode: TrackMode) {
        constellation.setTrackMode(mode);
      },
      onShowGroundTracks(show) {
        constellation.setShowGroundTracks(show);
      },
      onShowShellBands(show) {
        constellation.setShowShellBands(show);
      },
      onAutoBudgetToggle(on) {
        autoBudget = on;
        budgetNote = on ? "" : "Auto budget off";
      },
      onAutoLodToggle(on) {
        constellation.setAutoLod(on);
      },
      onOdcRepresentativeModeChange(on) {
        buildParams = { ...buildParams, odcRepresentativeMode: on };
        setLoader(on ? "Building ODC GPU buffers…" : "Rebuilding constellation…", true);
        requestAnimationFrame(() => {
          rebuildConstellation();
          setLoader("", false);
        });
      },
      onShowTracks(show) {
        constellation.setShowTracks(show);
      },
      onShowEarth(show) {
        earthGroup.visible = show;
      },
      onEarthDayNightToggle(enabled) {
        setEarthDayNight(enabled);
      },
      onCoverageToggle(show) {
        if (show) {
          ensureOperationalForCoverage();
          (document.getElementById("show-bandwidth") as HTMLInputElement).checked = false;
          coverage.setDisplayMode("coverage");
        }
        coverage.setVisible(show);
        if (!show) stopCoverageTimeline();
        coverage.invalidate();
      },
      onCoverageGapsToggle(show) {
        coverage.setShowGaps(show);
      },
      onBandwidthToggle(show) {
        if (show) {
          ensureOperationalForCoverage();
          (document.getElementById("show-coverage") as HTMLInputElement).checked = false;
          coverage.setDisplayMode("bandwidth");
          applyBandwidthOptions();
        }
        coverage.setVisible(show);
        if (!show) stopCoverageTimeline();
        coverage.invalidate();
      },
      onBandwidthLayerChange(_layer) {
        applyBandwidthOptions();
      },
      onBandwidthConcurrencyChange(factor) {
        coverage.setBandwidthOptions({ concurrency: factor });
      },
      onBandwidthClassFilterChange() {
        applyBandwidthOptions();
      },
      onCoverageTimelineToggle(play) {
        if (!play) {
          stopCoverageTimeline();
          return;
        }
        ensureOperationalForCoverage();
        coverage.setVisible(true);
        if (coverage.getDisplayMode() === "bandwidth") {
          (document.getElementById("show-bandwidth") as HTMLInputElement).checked = true;
        } else {
          coverage.setDisplayMode("coverage");
          (document.getElementById("show-coverage") as HTMLInputElement).checked = true;
        }
        coverageTimelineIndex = 0;
        const btn = document.getElementById("btn-coverage-timeline") as HTMLButtonElement;
        btn.textContent = "Stop timeline";
        applyDeploymentSnapshot(timelineSnapshots[coverageTimelineIndex]!.id);
        coverageTimelineTimer = setInterval(() => {
          coverageTimelineIndex = (coverageTimelineIndex + 1) % timelineSnapshots.length;
          applyDeploymentSnapshot(timelineSnapshots[coverageTimelineIndex]!.id);
        }, 3500);
      },
      onTimeScale(scale) {
        timeScale = scale;
      },
      onStarlinkMasterToggle(on) {
        if (on) {
          setLoader("Building Starlink shells…", true);
          requestAnimationFrame(() => {
            syncRendererFromPanel();
            setLoader("", false);
          });
        } else {
          syncRendererFromPanel();
        }
      },
      onStarlinkShellToggle(id, enabled) {
        if (enabled) {
          setLoader(`Building ${id}…`, true);
          requestAnimationFrame(() => {
            syncRendererFromPanel();
            setLoader("", false);
          });
        } else {
          syncRendererFromPanel();
        }
      },
      onStarlinkDeploymentChange(mode) {
        starlinkDeployment = mode;
        const prev = [...panel.getEnabledStarlinkGen1()];
        const valid = new Set(starlinkGroupsForMode(mode).map((g) => g.id));
        rebuildConstellation();
        panel.rebuildStarlinkGen1ShellList();
        panel.restoreStarlinkGen1Enabled(prev.filter((id) => valid.has(id)));
        syncRendererFromPanel();
      },
      onStarlinkGen2MasterToggle(on) {
        if (on) {
          setLoader("Building Starlink Gen2 shells…", true);
          requestAnimationFrame(() => {
            syncRendererFromPanel();
            setLoader("", false);
          });
        } else {
          syncRendererFromPanel();
        }
      },
      onStarlinkGen2ShellToggle(id, enabled) {
        if (enabled) {
          setLoader(`Building Gen2 shell ${id}…`, true);
          requestAnimationFrame(() => {
            syncRendererFromPanel();
            setLoader("", false);
          });
        } else {
          syncRendererFromPanel();
        }
      },
      onStarlinkGen2ModeChange(mode) {
        starlinkGen2Mode = mode;
        const prev = [...panel.getEnabledStarlinkGen2()];
        const valid = new Set(starlinkGen2GroupsForMode(mode, starlinkGen2Inc365).map((g) => g.id));
        rebuildConstellation();
        panel.rebuildStarlinkGen2ShellList();
        panel.restoreStarlinkGen2Enabled(prev.filter((id) => valid.has(id)));
        syncRendererFromPanel();
      },
      onStarlinkGen2Inc365Change(inc) {
        starlinkGen2Inc365 = inc;
        const prev = [...panel.getEnabledStarlinkGen2()];
        rebuildConstellation();
        panel.rebuildStarlinkGen2ShellList();
        panel.restoreStarlinkGen2Enabled(prev.filter((id) => id !== 206 && id !== 207));
        syncRendererFromPanel();
      },
      onStarlinkViewChange(view, snapshotId) {
        starlinkView = view;
        deploymentSnapshotId = snapshotId;
        if (view === "nominal") {
          suspendServiceOverlay();
        }
        if (view === "operational") {
          panel.setStarlinkDeployedMaster(true);
        }
        rebuildConstellation();
        panel.applyStarlinkViewMode();
        syncServiceOverlayUi();
        syncRendererFromPanel();
      },
      onStarlinkDeployedMasterToggle(on) {
        if (on) {
          setLoader("Building operational Starlink shells…", true);
          requestAnimationFrame(() => {
            syncRendererFromPanel();
            setLoader("", false);
          });
        } else {
          syncRendererFromPanel();
        }
      },
      onStarlinkDeployedShellToggle(id, enabled) {
        if (enabled) {
          setLoader(`Building shell ${id}…`, true);
          requestAnimationFrame(() => {
            syncRendererFromPanel();
            setLoader("", false);
          });
        } else {
          syncRendererFromPanel();
        }
      },
      onStarlinkGen3MasterToggle(on) {
        if (on) {
          setLoader("Building Gen3 shells…", true);
          requestAnimationFrame(() => {
            syncRendererFromPanel();
            setLoader("", false);
          });
        } else {
          syncRendererFromPanel();
        }
      },
      onStarlinkGen3ShellToggle(id, enabled) {
        if (enabled) {
          setLoader(`Building Gen3 shell ${id}…`, true);
          requestAnimationFrame(() => {
            syncRendererFromPanel();
            setLoader("", false);
          });
        } else {
          syncRendererFromPanel();
        }
      },
      onScenarioChange(scenarioId) {
        applyScenario(scenarioId);
      },
      onMinElevationChange(deg) {
        minElevationDeg = deg;
        coverage.setGridOptions({ minElevationDeg });
        updateShareHash();
      },
      onNightSideDimmingChange(on) {
        nightSideDimming = on;
        coverage.setGridOptions({ nightSideDimming });
        updateShareHash();
      },
      onExportScreenshot() {
        renderer.render(scene, camera);
        exportCanvasPng(canvas, screenshotFilename());
        panel.setShareStatus("PNG saved");
      },
      onCopyShareLink() {
        updateShareHash();
        const url = shareUrlFromState(collectShareState());
        navigator.clipboard.writeText(url).then(
          () => panel.setShareStatus("Share link copied"),
          () => panel.setShareStatus(url)
        );
      },
    },
    () => model,
    () => constellation
  );

  syncServiceOverlayUi();

  const shared = readShareStateFromLocation();
  if (shared) {
    applyShareState(shared);
  } else {
    applyScenario("today", { skipHash: true });
    coverage.setGridOptions({ minElevationDeg, nightSideDimming });
    updateShareHash();
  }

  const clock = new THREE.Clock();

  function tickBudget(dt: number, fps: number): void {
    if (!autoBudget || buildParams.odcRepresentativeMode) return;
    budgetCooldown -= dt;
    if (budgetCooldown > 0) return;

    if (fps < 38) {
      const next = nextDensityStep(buildParams.sampleDivisor);
      if (next) {
        buildParams = { ...buildParams, sampleDivisor: next };
        panel.setDensityStepIndex(densityStepIndex(next));
        rebuildConstellation();
        budgetNote = `Auto: lowered density → 1:${next}`;
        budgetCooldown = 3;
        highFpsStreak = 0;
      }
      return;
    }

    if (fps > 56) highFpsStreak += dt;
    else highFpsStreak = 0;

    if (highFpsStreak > 5) {
      const prev = prevDensityStep(buildParams.sampleDivisor);
      if (prev) {
        buildParams = { ...buildParams, sampleDivisor: prev };
        panel.setDensityStepIndex(densityStepIndex(prev));
        rebuildConstellation();
        budgetNote = `Auto: raised density → 1:${prev === 1 ? "1 (every sat)" : prev}`;
        budgetCooldown = 4;
      }
      highFpsStreak = 0;
    }
  }

  function animate(): void {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    simTime += dt * timeScale;
    earthGroup.rotation.y += dt * timeScale * 0.15 * earthRotationRate;

    const instFps = 1 / Math.max(dt, 1e-6);
    fpsSamples.push(instFps);
    if (fpsSamples.length > 30) fpsSamples.shift();
    displayedFps = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;

    tickBudget(dt, displayedFps);

    const drawn = constellation.updateInstances(simTime);
    if (isServiceOverlayActive()) {
      updateSunDirectionEarthFixed();
      coverage.update(
        model.groups,
        starlinkEnabledGroupIds(),
        simTime,
        deploymentSnapshotById(deploymentSnapshotId)?.asOf ?? deploymentSnapshotId,
        earthGroup
      );
    }

    const hudNote = [budgetNote, coverageHudNote(), hoverNote].filter(Boolean).join(" · ");
    panel.updateStats(model, displayedFps, drawn, hudNote);

    controls.update();
    renderer.render(scene, camera);

    if (!ready) {
      ready = true;
      setLoader("", false);
    }
  }

  animate();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

try {
  main().catch(showFatalError);
} catch (err) {
  showFatalError(err);
}
