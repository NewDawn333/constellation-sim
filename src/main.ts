import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ORBIT_GROUPS,
  buildConstellationModel,
  starlinkGroupsForView,
  starlinkGroupsForMode,
  starlinkGen2GroupsForMode,
  type StarlinkDeploymentMode,
  type StarlinkGen2Mode,
  type StarlinkGen2Inc365,
  type StarlinkViewMode,
  type UnifiedConstellation,
} from "./constellation";
import {
  ConstellationRenderer,
  frameGroupCamera,
  type PlaneSelection,
  type TrackMode,
} from "./constellationRenderer";
import { createEarthScene } from "./render/earth";
import {
  DEFAULT_BUILD_PARAMS,
  DENSITY_PRESETS,
  type BuildParams,
  type DensityPreset,
} from "./orbits";
import { ControlPanel } from "./ui";

function nextDensity(current: DensityPreset): DensityPreset | null {
  const i = DENSITY_PRESETS.indexOf(current);
  return i < DENSITY_PRESETS.length - 1 ? DENSITY_PRESETS[i + 1]! : null;
}

function prevDensity(current: DensityPreset): DensityPreset | null {
  const i = DENSITY_PRESETS.indexOf(current);
  return i > 0 ? DENSITY_PRESETS[i - 1]! : null;
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

  function buildModel(): UnifiedConstellation {
    const starlink = starlinkGroupsForView(starlinkView, deploymentSnapshotId, {
      gen1Mode: starlinkDeployment,
      gen2Mode: starlinkGen2Mode,
      gen2Inc365: starlinkGen2Inc365,
    });
    const gen1 = starlink.filter((g) => g.layer === "starlink-gen1");
    const gen2 = starlink.filter((g) => g.layer === "starlink-gen2");
    return buildConstellationModel(ORBIT_GROUPS, gen1, gen2, buildParams);
  }

  let model: UnifiedConstellation = buildModel();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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
  constellation.setEnabledGroups(new Set([1]));
  constellation.setShowTracks(true);
  constellation.setShowGroundTracks(true);
  constellation.setShowShellBands(true);

  frameGroupCamera(ORBIT_GROUPS[0]!, camera, controls, buildParams.altitudeExaggeration);

  let simTime = 0;
  let timeScale = 80;
  const earthRotationRate = (2 * Math.PI) / 86164;
  let autoBudget = true;
  let budgetNote = "";
  let budgetCooldown = 0;
  let highFpsStreak = 0;
  let ready = false;

  const fpsSamples: number[] = [];
  let displayedFps = 60;

  let panel!: ControlPanel;

  function syncRendererFromPanel(): void {
    constellation.setEnabledGroups(panel.getEnabledGroups());
    constellation.setShowTracks((document.getElementById("show-tracks") as HTMLInputElement).checked);
    constellation.setShowGroundTracks((document.getElementById("show-ground-tracks") as HTMLInputElement).checked);
    constellation.setShowShellBands((document.getElementById("show-shell-bands") as HTMLInputElement).checked);
    constellation.setTrackMode((document.getElementById("track-mode") as HTMLSelectElement).value as TrackMode);
  }

  function rebuildConstellation(): void {
    const enabled = panel.getEnabledGroups();
    model = buildModel();
    constellation.rebuild(model, enabled);
    syncRendererFromPanel();
    const sel = constellation.getSelection();
    if (sel) {
      const isolate = (document.getElementById("isolate-plane") as HTMLInputElement).checked;
      constellation.setSelection(sel, isolate);
    }
    panel.updateGroupMetas();
  }

  panel = new ControlPanel(
    {
      onDensityChange(divisor) {
        buildParams = { ...buildParams, sampleDivisor: divisor };
        rebuildConstellation();
        budgetNote = "";
      },
      onExaggerationChange(exaggeration) {
        buildParams = { ...buildParams, altitudeExaggeration: exaggeration };
        rebuildConstellation();
        const active = [...panel.getOdcEnabledGroups()].sort((a, b) => b - a)[0];
        const g = ORBIT_GROUPS.find((x) => x.id === active);
        if (g) frameGroupCamera(g, camera, controls, exaggeration);
      },
      onIntroNext() {
        const step = panel.getIntroStep();
        const g = ORBIT_GROUPS[step - 1]!;
        frameGroupCamera(g, camera, controls, buildParams.altitudeExaggeration);
      },
      onIntroReset() {
        frameGroupCamera(ORBIT_GROUPS[0]!, camera, controls, buildParams.altitudeExaggeration);
      },
      onIntroToggle(on) {
        if (on) panel.resetIntro();
      },
      onGroupToggle() {
        syncRendererFromPanel();
      },
      onShowAllGroups() {
        setLoader("Building all ODC groups…", true);
        requestAnimationFrame(() => {
          syncRendererFromPanel();
          frameGroupCamera(
            ORBIT_GROUPS[ORBIT_GROUPS.length - 1]!,
            camera,
            controls,
            buildParams.altitudeExaggeration
          );
          setLoader("", false);
        });
      },
      onPlaneSelect(sel: PlaneSelection | null, isolate: boolean) {
        constellation.setSelection(sel, isolate);
        if (sel) {
          const g = model.groups.find((x) => x.id === sel.groupId)!;
          frameGroupCamera(g, camera, controls, buildParams.altitudeExaggeration);
        }
      },
      onShellFocus(sel) {
        constellation.setFocusShell(sel);
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
        if (view === "operational") {
          panel.setStarlinkDeployedMaster(true);
        }
        rebuildConstellation();
        panel.applyStarlinkViewMode();
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
    },
    () => model,
    () => constellation
  );

  const clock = new THREE.Clock();

  function tickBudget(dt: number, fps: number): void {
    if (!autoBudget || buildParams.odcRepresentativeMode) return;
    budgetCooldown -= dt;
    if (budgetCooldown > 0) return;

    if (fps < 38) {
      const next = nextDensity(buildParams.sampleDivisor);
      if (next) {
        buildParams = { ...buildParams, sampleDivisor: next };
        panel.setDensity(next);
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
      const prev = prevDensity(buildParams.sampleDivisor);
      if (prev) {
        buildParams = { ...buildParams, sampleDivisor: prev };
        panel.setDensity(prev);
        rebuildConstellation();
        budgetNote = `Auto: raised density → 1:${prev === 1 ? "1 (cap)" : prev}`;
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
    panel.updateStats(model, displayedFps, drawn, budgetNote);

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
