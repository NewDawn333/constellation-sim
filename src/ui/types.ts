import type { PlaneSelection, ShellSelection, TrackMode } from "../constellationRenderer";
import type {
  StarlinkDeploymentMode,
  StarlinkGen2Inc365,
  StarlinkGen2Mode,
  StarlinkViewMode,
} from "../constellation";
import type { StarlinkScenarioId } from "../data/starlinkScenarios";

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
  onOdcDeployViewChange: () => void;
  onOdcShareChange: () => void;
  onOdcManualLaunchChange: () => void;
}
