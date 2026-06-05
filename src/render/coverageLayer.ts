import * as THREE from "three";
import type { OrbitGroupConfig } from "../data/groupConfig";
import {
  DEFAULT_HARDWARE_FILTER,
  type BandwidthLayer,
  type HardwareClassFilter,
} from "../data/starlinkHardware";
import { EARTH_MESH_Y_ROTATION } from "./earth";
import {
  buildCapacityGrid,
  buildCoverageGrid,
  cellIndexFromUv,
  formatBandwidth,
  GRID_HEIGHT,
  GRID_WIDTH,
  type CapacityBuildResult,
  type CoverageBuildResult,
  type GridBuildOptions,
} from "../model/coverageGrid";

const UPDATE_SIM_INTERVAL_SEC = 45;

export type OverlayDisplayMode = "coverage" | "bandwidth";

export interface BandwidthOptions {
  concurrency: number;
  layer: BandwidthLayer;
  classFilter: HardwareClassFilter;
}

export const DEFAULT_BANDWIDTH_OPTIONS: BandwidthOptions = {
  concurrency: 0.3,
  layer: "broadband",
  classFilter: { ...DEFAULT_HARDWARE_FILTER },
};

export interface OverlayStats {
  contributingSats: number;
  coveragePercent: number;
  totalNominalGbps: number;
  peakCellGbps: number;
  displayMode: OverlayDisplayMode;
  bandwidthLayer: BandwidthLayer;
}

export interface HoverCellStats {
  gbps: number;
  satCount: number;
  lat: number;
  lon: number;
}

export class CoverageLayer {
  readonly mesh: THREE.Mesh;
  private readonly texture: THREE.DataTexture;
  private readonly material: THREE.ShaderMaterial;
  private visible = false;
  private displayMode: OverlayDisplayMode = "coverage";
  private bandwidthOptions: BandwidthOptions = { ...DEFAULT_BANDWIDTH_OPTIONS, classFilter: { ...DEFAULT_HARDWARE_FILTER } };
  private gridOptions: GridBuildOptions = {};
  private sunDirectionEarthFixed = new THREE.Vector3(1, 0, 0);
  private lastSimTime = -1e9;
  private lastBuildKey = "";
  private stats: OverlayStats = {
    contributingSats: 0,
    coveragePercent: 0,
    totalNominalGbps: 0,
    peakCellGbps: 0,
    displayMode: "coverage",
    bandwidthLayer: "broadband",
  };
  private lastCapacity: CapacityBuildResult | null = null;
  private lastCoverage: CoverageBuildResult | null = null;

  constructor(parent: THREE.Group) {
    this.texture = new THREE.DataTexture(
      new Uint8Array(GRID_WIDTH * GRID_HEIGHT * 4),
      GRID_WIDTH,
      GRID_HEIGHT,
      THREE.RGBAFormat
    );
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.flipY = true;
    this.texture.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      uniforms: {
        covMap: { value: this.texture },
        showGaps: { value: 0 },
        overlayMode: { value: 0 },
      },
      vertexShader: `
        varying vec2 vCovUv;
        void main() {
          vCovUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D covMap;
        uniform float showGaps;
        uniform float overlayMode;
        varying vec2 vCovUv;
        void main() {
          vec4 c = texture2D(covMap, vCovUv);
          if (c.a > 0.02) {
            gl_FragColor = vec4(c.rgb / 255.0, c.a / 255.0 * 0.68);
          } else if (overlayMode < 0.5 && showGaps > 0.5) {
            gl_FragColor = vec4(0.45, 0.12, 0.1, 0.32);
          } else {
            discard;
          }
        }
      `,
    });

    const geo = new THREE.SphereGeometry(1.004, 128, 64);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.rotation.y = EARTH_MESH_Y_ROTATION;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  getStats(): OverlayStats {
    return this.stats;
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.mesh.visible = on;
  }

  isVisible(): boolean {
    return this.visible;
  }

  setDisplayMode(mode: OverlayDisplayMode): void {
    this.displayMode = mode;
    this.material.uniforms.overlayMode!.value = mode === "bandwidth" ? 1 : 0;
    this.invalidate();
  }

  getDisplayMode(): OverlayDisplayMode {
    return this.displayMode;
  }

  setShowGaps(on: boolean): void {
    this.material.uniforms.showGaps!.value = on ? 1 : 0;
  }

  setBandwidthOptions(options: Partial<BandwidthOptions>): void {
    if (options.concurrency !== undefined) {
      this.bandwidthOptions.concurrency = options.concurrency;
    }
    if (options.layer !== undefined) {
      this.bandwidthOptions.layer = options.layer;
    }
    if (options.classFilter !== undefined) {
      this.bandwidthOptions.classFilter = options.classFilter;
    }
    this.invalidate();
  }

  getBandwidthOptions(): BandwidthOptions {
    return this.bandwidthOptions;
  }

  setGridOptions(options: Partial<GridBuildOptions>): void {
    if (options.minElevationDeg !== undefined) {
      this.gridOptions.minElevationDeg = options.minElevationDeg;
    }
    if (options.nightSideDimming !== undefined) {
      this.gridOptions.nightSideDimming = options.nightSideDimming;
    }
    this.invalidate();
  }

  setSunDirectionEarthFixed(dir: THREE.Vector3): void {
    this.sunDirectionEarthFixed.copy(dir);
  }

  sampleHover(u: number, v: number): HoverCellStats | null {
    const idx = cellIndexFromUv(u, v);
    const ix = idx % GRID_WIDTH;
    const iy = Math.floor(idx / GRID_WIDTH);
    const lat = 90 - (iy + 0.5);
    const lon = -180 + (ix + 0.5);

    if (this.displayMode === "bandwidth" && this.lastCapacity) {
      const gbps = this.lastCapacity.gbpsGrid[idx] ?? 0;
      if (gbps <= 0) return null;
      return {
        gbps,
        satCount: this.lastCapacity.satCountGrid[idx] ?? 0,
        lat,
        lon,
      };
    }

    if (this.displayMode === "coverage" && this.lastCoverage) {
      const hits = this.lastCoverage.hits[idx] ?? 0;
      if (hits <= 0) return null;
      return { gbps: 0, satCount: hits, lat, lon };
    }

    return null;
  }

  invalidate(): void {
    this.lastBuildKey = "";
    this.lastSimTime = -1e9;
  }

  update(
    groups: OrbitGroupConfig[],
    enabledGroupIds: Set<number>,
    simTimeSec: number,
    snapshotAsOf: string,
    earthGroup: THREE.Group,
    force = false
  ): void {
    if (!this.visible) return;

    const filterKey = JSON.stringify(this.bandwidthOptions.classFilter);
    const gridKey = `${this.gridOptions.minElevationDeg ?? "d"}:${this.gridOptions.nightSideDimming ? 1 : 0}`;
    const key = `${this.displayMode}:${snapshotAsOf}:${[...enabledGroupIds].sort().join(",")}:${this.bandwidthOptions.concurrency}:${this.bandwidthOptions.layer}:${filterKey}:${gridKey}`;
    const simDelta = Math.abs(simTimeSec - this.lastSimTime);
    if (!force && key === this.lastBuildKey && simDelta < UPDATE_SIM_INTERVAL_SEC) return;

    const stampOptions: GridBuildOptions = {
      minElevationDeg: this.gridOptions.minElevationDeg,
      nightSideDimming: this.gridOptions.nightSideDimming,
      sunDirectionEarthFixed: this.sunDirectionEarthFixed,
    };

    if (this.displayMode === "bandwidth") {
      const result = buildCapacityGrid(
        groups,
        enabledGroupIds,
        simTimeSec,
        snapshotAsOf,
        earthGroup,
        {
          concurrency: this.bandwidthOptions.concurrency,
          layer: this.bandwidthOptions.layer,
          classFilter: this.bandwidthOptions.classFilter,
          ...stampOptions,
        }
      );
      this.lastCapacity = result;
      this.lastCoverage = null;
      this.applyRgba(result.rgba);
      this.stats = {
        contributingSats: result.contributingSats,
        coveragePercent: 0,
        totalNominalGbps: result.totalNominalGbps,
        peakCellGbps: result.peakCellGbps,
        displayMode: "bandwidth",
        bandwidthLayer: result.layer,
      };
    } else {
      const result = buildCoverageGrid(
        groups,
        enabledGroupIds,
        simTimeSec,
        snapshotAsOf,
        earthGroup,
        stampOptions
      );
      this.lastCoverage = result;
      this.lastCapacity = null;
      this.applyRgba(result.rgba);
      this.stats = {
        contributingSats: result.contributingSats,
        coveragePercent: result.coverageFraction * 100,
        totalNominalGbps: 0,
        peakCellGbps: 0,
        displayMode: "coverage",
        bandwidthLayer: this.bandwidthOptions.layer,
      };
    }

    this.lastBuildKey = key;
    this.lastSimTime = simTimeSec;
  }

  formatHover(hover: HoverCellStats): string {
    if (this.displayMode === "bandwidth") {
      return `${formatBandwidth(hover.gbps, this.bandwidthOptions.layer)} · ${hover.satCount} sats · ${hover.lat.toFixed(1)}°, ${hover.lon.toFixed(1)}°`;
    }
    return `${hover.satCount} sats overhead · ${hover.lat.toFixed(1)}°, ${hover.lon.toFixed(1)}°`;
  }

  formatStatsLine(): string {
    const s = this.stats;
    if (s.displayMode === "bandwidth") {
      const total = formatBandwidth(s.totalNominalGbps, s.bandwidthLayer);
      const peak = formatBandwidth(s.peakCellGbps, s.bandwidthLayer);
      return `BW ${s.bandwidthLayer}: ${total} nominal · peak cell ${peak} · ${s.contributingSats.toLocaleString()} sats`;
    }
    return `Coverage ${s.coveragePercent.toFixed(1)}% · ${s.contributingSats.toLocaleString()} sats`;
  }

  private applyRgba(rgba: Uint8Array): void {
    const data = this.texture.image.data as Uint8Array;
    data.set(rgba);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.mesh.removeFromParent();
  }
}
