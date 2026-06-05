import * as THREE from "three";
import {
  isPolarGroup,
  type OrbitGroupConfig,
  type UnifiedConstellation,
} from "./constellation";
import { createGroundTrackLine, shouldDrawGroundTrack } from "./render/groundTrack";
import { OdcGpuSatLayer, cameraSceneDistance } from "./render/odcGpuSats";
import { createPerShellBandGroup } from "./render/shellThicknessBands";
import { createShellBandGroup } from "./render/shellBands";
import { orbitRingPoints, planeKey, positionOnPlane, type OrbitalPlane } from "./orbits";

export type TrackMode = "all" | "shell" | "selected";

export interface PlaneSelection {
  groupId: number;
  shellIndex: number;
  planeIndex: number;
}

export interface ShellSelection {
  groupId: number;
  shellIndex: number;
}

export interface SlotRef {
  plane: OrbitalPlane;
  satIndex: number;
}

interface TrackEntry {
  plane: OrbitalPlane;
  line: THREE.Line;
  baseOpacity: number;
}

const DEFAULT_SAT_RADIUS = 0.008;

export class ConstellationRenderer {
  readonly groupMeshes = new Map<number, THREE.InstancedMesh>();
  readonly groupGpuLayers = new Map<number, OdcGpuSatLayer>();
  readonly groupTracks = new Map<number, THREE.Group>();
  readonly groupGroundTracks = new Map<number, THREE.Group>();
  readonly groupShellBands = new Map<number, THREE.Group>();
  readonly slotIndexByGroup = new Map<number, SlotRef[]>();
  readonly trackByKey = new Map<string, TrackEntry>();

  private readonly scene: THREE.Scene;
  private readonly earthGroup: THREE.Group;
  private readonly satGeometries = new Map<number, THREE.SphereGeometry>();
  private model: UnifiedConstellation;
  private builtGroups = new Set<number>();
  private enabledGroups = new Set<number>();
  private selection: PlaneSelection | null = null;
  private focusShell: ShellSelection | null = null;
  private isolateSelection = false;
  private showTracks = true;
  private showGroundTracks = true;
  private showShellBands = true;
  private trackMode: TrackMode = "all";
  private autoLod = true;
  private zoomCull = false;
  private camera: THREE.Camera | null = null;

  constructor(scene: THREE.Scene, earthGroup: THREE.Group, model: UnifiedConstellation) {
    this.scene = scene;
    this.earthGroup = earthGroup;
    this.model = model;
  }

  setAutoLod(on: boolean): void {
    this.autoLod = on;
    this.applyVisibility();
  }

  /** Hide and skip satellite updates when camera is zoomed out to solar-system scale. */
  setZoomCull(cull: boolean): void {
    this.zoomCull = cull;
    this.applyVisibility();
  }

  isZoomCulled(): boolean {
    return this.zoomCull;
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  isGpuGroup(groupId: number): boolean {
    return this.groupGpuLayers.has(groupId);
  }

  getModel(): UnifiedConstellation {
    return this.model;
  }

  private usesGpuSats(groupId: number): boolean {
    return this.model.gpuBuffers.has(groupId);
  }

  private getGroupConfig(groupId: number): OrbitGroupConfig | undefined {
    return this.model.groups.find((g) => g.id === groupId);
  }

  private satGeometryFor(g: OrbitGroupConfig): THREE.SphereGeometry {
    let geo = this.satGeometries.get(g.id);
    if (!geo) {
      const r = DEFAULT_SAT_RADIUS * (g.satScale ?? 1);
      geo = new THREE.SphereGeometry(r, 6, 4);
      this.satGeometries.set(g.id, geo);
    }
    return geo;
  }

  rebuild(model: UnifiedConstellation, enabled: Set<number>): void {
    this.dispose();
    this.model = model;
    this.builtGroups.clear();
    for (const id of enabled) this.buildGroup(id);
    this.enabledGroups = new Set(enabled);
    this.applyVisibility();
  }

  private dispose(): void {
    for (const mesh of this.groupMeshes.values()) {
      this.scene.remove(mesh);
      (mesh.material as THREE.Material).dispose();
    }
    for (const layer of this.groupGpuLayers.values()) {
      this.scene.remove(layer.mesh);
      layer.dispose();
    }
    for (const geo of this.satGeometries.values()) geo.dispose();
    for (const tg of this.groupTracks.values()) this.disposeLineGroup(tg, this.scene);
    for (const gt of this.groupGroundTracks.values()) this.disposeLineGroup(gt, this.earthGroup);
    for (const sb of this.groupShellBands.values()) this.disposeLineGroup(sb, this.scene);

    this.groupMeshes.clear();
    this.groupGpuLayers.clear();
    this.groupTracks.clear();
    this.groupGroundTracks.clear();
    this.groupShellBands.clear();
    this.slotIndexByGroup.clear();
    this.trackByKey.clear();
    this.builtGroups.clear();
    this.satGeometries.clear();
  }

  private disposeLineGroup(group: THREE.Group, parent: THREE.Object3D): void {
    parent.remove(group);
    group.traverse((obj) => {
      if (obj instanceof THREE.Line) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }

  private shouldBuildTrack(plane: OrbitalPlane, g: OrbitGroupConfig): boolean {
    if (!this.usesGpuSats(g.id)) return true;
    if (g.planesPerShell <= 4) return true;
    return plane.planeIndex === 0 || plane.planeIndex % 6 === 0;
  }

  private buildGroup(groupId: number): void {
    if (this.builtGroups.has(groupId)) return;
    const g = this.getGroupConfig(groupId);
    if (!g) return;

    const planes = this.model.planesByGroup.get(groupId)!;
    const gpuBuf = this.model.gpuBuffers.get(groupId);

    if (gpuBuf) {
      const layer = new OdcGpuSatLayer(gpuBuf, g.color, isPolarGroup(g) ? 1.4 : 1.0);
      this.groupGpuLayers.set(groupId, layer);
      this.scene.add(layer.mesh);
      this.slotIndexByGroup.set(groupId, []);
    } else {
      const slots: SlotRef[] = [];
      for (const plane of planes) {
        for (let si = 0; si < plane.satellites.length; si++) {
          slots.push({ plane, satIndex: si });
        }
      }
      this.slotIndexByGroup.set(groupId, slots);

      const mesh = new THREE.InstancedMesh(
        this.satGeometryFor(g),
        new THREE.MeshBasicMaterial({ color: g.color }),
        Math.max(slots.length, 1)
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.groupMeshes.set(groupId, mesh);
      this.scene.add(mesh);
    }

    const trackOpacity = g.trackOpacity ?? (gpuBuf ? 0.08 : 0.18);
    const trackGroup = new THREE.Group();
    const trackSegments = g.layer.startsWith("starlink") ? 48 : gpuBuf ? 48 : 64;

    for (const plane of planes) {
      if (!this.shouldBuildTrack(plane, g)) continue;
      const pts = orbitRingPoints(plane, trackSegments);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      const mat = new THREE.LineBasicMaterial({
        color: g.color,
        transparent: true,
        opacity: trackOpacity,
      });
      const line = new THREE.Line(geo, mat);
      trackGroup.add(line);
      this.trackByKey.set(planeKey(plane.groupId, plane.shellIndex, plane.planeIndex), {
        plane,
        line,
        baseOpacity: trackOpacity,
      });
    }
    this.groupTracks.set(groupId, trackGroup);
    this.scene.add(trackGroup);

    const groundGroup = new THREE.Group();
    const seenGround = new Set<string>();
    for (const plane of planes) {
      if (!shouldDrawGroundTrack(plane, g.planesPerShell)) continue;
      const key =
        g.planesPerShell <= 8 ? `${plane.shellIndex}` : `${plane.shellIndex}:${plane.planeIndex}`;
      if (seenGround.has(key)) continue;
      seenGround.add(key);
      groundGroup.add(createGroundTrackLine(plane, g.color, isPolarGroup(g)));
    }
    this.groupGroundTracks.set(groupId, groundGroup);
    this.earthGroup.add(groundGroup);

    const ex = this.model.buildParams.altitudeExaggeration;
    if (g.layer === "odc") {
      const bandGroup = gpuBuf
        ? createPerShellBandGroup(g, g.color, ex)
        : createShellBandGroup(g.altitudeKm[0], g.altitudeKm[1], g.color, ex);
      this.groupShellBands.set(groupId, bandGroup);
      this.scene.add(bandGroup);
    } else {
      const bandGroup = createShellBandGroup(g.altitudeKm[0], g.altitudeKm[0], g.color, ex);
      this.groupShellBands.set(groupId, bandGroup);
      this.scene.add(bandGroup);
    }

    this.builtGroups.add(groupId);
  }

  setEnabledGroups(ids: Set<number>): void {
    for (const id of ids) this.buildGroup(id);
    this.enabledGroups = new Set(ids);
    this.applyVisibility();
  }

  setTrackMode(mode: TrackMode): void {
    this.trackMode = mode;
    this.applyVisibility();
  }

  setFocusShell(shell: ShellSelection | null): void {
    this.focusShell = shell;
    if (shell) this.buildGroup(shell.groupId);
    this.applyVisibility();
  }

  setShowTracks(show: boolean): void {
    this.showTracks = show;
    this.applyVisibility();
  }

  setShowGroundTracks(show: boolean): void {
    this.showGroundTracks = show;
    this.applyVisibility();
  }

  setShowShellBands(show: boolean): void {
    this.showShellBands = show;
    this.applyVisibility();
  }

  setSelection(sel: PlaneSelection | null, isolate = false): void {
    this.selection = sel;
    this.isolateSelection = isolate && sel !== null;
    if (sel) {
      this.buildGroup(sel.groupId);
      this.focusShell = { groupId: sel.groupId, shellIndex: sel.shellIndex };
    }
    this.applyVisibility();
  }

  getSelection(): PlaneSelection | null {
    return this.selection;
  }

  private trackVisible(plane: OrbitalPlane): boolean {
    if (this.trackMode === "selected") {
      return (
        !!this.selection &&
        plane.groupId === this.selection.groupId &&
        plane.shellIndex === this.selection.shellIndex &&
        plane.planeIndex === this.selection.planeIndex
      );
    }
    if (this.trackMode === "shell") {
      const shell =
        this.focusShell ??
        (this.selection
          ? { groupId: this.selection.groupId, shellIndex: this.selection.shellIndex }
          : null);
      if (!shell) return true;
      return plane.groupId === shell.groupId && plane.shellIndex === shell.shellIndex;
    }
    return true;
  }

  private planeVisible(plane: OrbitalPlane): boolean {
    if (!this.enabledGroups.has(plane.groupId)) return false;
    if (!this.isolateSelection || !this.selection) return true;
    return (
      plane.groupId === this.selection.groupId &&
      plane.shellIndex === this.selection.shellIndex &&
      plane.planeIndex === this.selection.planeIndex
    );
  }

  private applyVisibility(): void {
    const camDist = this.camera ? cameraSceneDistance(this.camera) : 5;
    const hideAll = this.zoomCull;

    for (const g of this.model.groups) {
      const groupOn = this.enabledGroups.has(g.id) && this.builtGroups.has(g.id);
      const mesh = this.groupMeshes.get(g.id);
      const gpu = this.groupGpuLayers.get(g.id);
      const tg = this.groupTracks.get(g.id);
      const gt = this.groupGroundTracks.get(g.id);
      const sb = this.groupShellBands.get(g.id);
      const farGpuLod = !!gpu && this.autoLod && camDist > 7;

      if (!tg) continue;

      if (!groupOn || hideAll) {
        if (mesh) mesh.visible = false;
        if (gpu) gpu.setVisible(false);
        tg.visible = false;
        if (gt) gt.visible = false;
        if (sb) sb.visible = false;
        continue;
      }

      tg.visible = this.showTracks && !farGpuLod;
      if (gt) gt.visible = this.showGroundTracks;
      if (sb) sb.visible = this.showShellBands;
      if (gpu) gpu.setVisible(true);
      if (mesh) mesh.visible = true;

      for (const entry of this.trackByKey.values()) {
        if (entry.plane.groupId !== g.id) continue;
        const satVis = this.planeVisible(entry.plane);
        const trkVis = this.trackVisible(entry.plane);
        entry.line.visible = this.showTracks && !farGpuLod && satVis && trkVis;
        const mat = entry.line.material as THREE.LineBasicMaterial;
        const selected =
          this.selection &&
          entry.plane.groupId === this.selection.groupId &&
          entry.plane.shellIndex === this.selection.shellIndex &&
          entry.plane.planeIndex === this.selection.planeIndex;
        mat.opacity = selected ? 0.9 : trkVis ? entry.baseOpacity : 0.04;
      }
    }
  }

  updateInstances(simTime: number): number {
    if (this.zoomCull) return 0;

    const dummy = new THREE.Object3D();
    const pos = new THREE.Vector3();
    let drawn = 0;
    const camDist = this.camera ? cameraSceneDistance(this.camera) : 5;

    for (const g of this.model.groups) {
      if (!this.enabledGroups.has(g.id)) continue;

      const gpu = this.groupGpuLayers.get(g.id);
      if (gpu) {
        drawn += gpu.update(simTime, camDist, this.autoLod);
        continue;
      }

      const mesh = this.groupMeshes.get(g.id);
      if (!mesh) continue;

      const slots = this.slotIndexByGroup.get(g.id)!;
      let i = 0;
      for (const slot of slots) {
        if (!this.planeVisible(slot.plane)) continue;
        const sat = slot.plane.satellites[slot.satIndex]!;
        positionOnPlane(slot.plane, sat.meanAnomaly0, simTime, pos);
        dummy.position.copy(pos);
        dummy.updateMatrix();
        mesh.setMatrixAt(i++, dummy.matrix);
        drawn++;
      }
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
    }

    return drawn;
  }
}

export function frameGroupCamera(
  g: OrbitGroupConfig,
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
  exaggeration: number
): void {
  const midAlt = (g.altitudeKm[0] + g.altitudeKm[1]) / 2;
  const span = (g.altitudeKm[1] - g.altitudeKm[0]) * exaggeration;
  const r = 1 + (midAlt + span / 2) * (1 / 6371);
  const dist = Math.max(2.2, r * 2.4);

  if (isPolarGroup(g)) {
    camera.position.set(dist * 0.2, dist * 0.92, dist * 0.25);
  } else if (g.planesPerShell >= 20) {
    camera.position.set(dist * 0.85, dist * 0.35, dist * 0.55);
  } else {
    camera.position.set(dist * 0.6, dist * 0.45, dist * 0.65);
  }

  controls.target.set(0, 0, 0);
  controls.update();
}
