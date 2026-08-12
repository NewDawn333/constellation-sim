import { describe, expect, it } from "vitest";
import { ORBIT_GROUPS } from "../data/odcGroups";
import { buildOrbitalPlanes, DEFAULT_BUILD_PARAMS } from "../orbits";
import {
  buildOdcDataCenterSatellites,
  ODC_INTRA_LAUNCH_SPACING_KM,
} from "./odcDataCenterLayout";
import { deployedSatsForShell, effectiveSatsPerLaunch } from "./odcManualLaunch";
import { buildConstellationModel, computeStats } from "./unifiedConstellation";

describe("odcDataCenterLayout", () => {
  it("packs one launch into a short along-track arc, not full orbit", () => {
    const sats = buildOdcDataCenterSatellites(50, 50, 550, 0);
    expect(sats).toHaveLength(50);
    const span = sats[49]!.meanAnomaly0 - sats[0]!.meanAnomaly0;
    expect(span).toBeGreaterThan(0);
    expect(span).toBeLessThan(Math.PI / 2);
  });

  it("strings second launch after first with inter-launch gap", () => {
    const alt = 550;
    const one = buildOdcDataCenterSatellites(50, 50, alt, 0);
    const two = buildOdcDataCenterSatellites(100, 50, alt, 0);
    expect(two[50]!.meanAnomaly0).toBeGreaterThan(one[49]!.meanAnomaly0);
    const step = two[50]!.meanAnomaly0 - one[49]!.meanAnomaly0;
    const intra = ODC_INTRA_LAUNCH_SPACING_KM / (6371 + alt);
    expect(step).toBeGreaterThan(intra);
  });
});

describe("manual launch instanced build", () => {
  it("builds exact deployed sat count on plane 0 only", () => {
    const g = ORBIT_GROUPS[1]!;
    const physics = { payloadTon: 100, satMassTon: 1, powerMwPerSat: 0.1 };
    const spsl = effectiveSatsPerLaunch(physics);
    const deployed = deployedSatsForShell(g, 1, spsl);

    const planes = buildOrbitalPlanes(
      g.id,
      g.altitudeKm,
      g.inclinationDeg,
      g.shells,
      g.planesPerShell,
      g.satsPerPlane,
      {
        ...DEFAULT_BUILD_PARAMS,
        enabledShellIndices: new Set([0]),
        deployedSatsByShell: new Map([[0, deployed]]),
        manualSatsPerLaunch: spsl,
        odcManualLaunchExact: true,
      }
    );
    const onPlane0 = planes.filter((p) => p.planeIndex === 0).reduce((n, p) => n + p.satellites.length, 0);
    const elsewhere = planes.filter((p) => p.planeIndex !== 0).reduce((n, p) => n + p.satellites.length, 0);
    expect(onPlane0).toBe(deployed);
    expect(elsewhere).toBe(0);
  });

  it("draws more than 1500 sats on one shell (no plane-per-launch cap)", () => {
    const g = ORBIT_GROUPS[0]!;
    const physics = { payloadTon: 100, satMassTon: 1, powerMwPerSat: 0.1 };
    const spsl = effectiveSatsPerLaunch(physics);
    const launches = 40;
    const deployed = deployedSatsForShell(g, launches, spsl);
    expect(deployed).toBeGreaterThan(1500);

    const planes = buildOrbitalPlanes(
      g.id,
      g.altitudeKm,
      g.inclinationDeg,
      g.shells,
      g.planesPerShell,
      g.satsPerPlane,
      {
        ...DEFAULT_BUILD_PARAMS,
        enabledShellIndices: new Set([0]),
        deployedSatsByShell: new Map([[0, deployed]]),
        manualSatsPerLaunch: spsl,
      }
    );
    const vis = planes.reduce((n, p) => n + p.satellites.length, 0);
    expect(vis).toBe(deployed);
  });

  it("computeStats uses enabled shell nominal and deployed visible count", () => {
    const physics = { payloadTon: 100, satMassTon: 1, powerMwPerSat: 0.1 };
    const g = ORBIT_GROUPS[1]!;
    const enabledShells = new Map<number, Set<number>>([[g.id, new Set([0])]]);
    const model = buildConstellationModel(ORBIT_GROUPS, [], [], DEFAULT_BUILD_PARAMS, {
      enabledShellsByGroup: enabledShells,
      manualLaunch: {
        physics,
        shellLaunches: new Map([[`${g.id}:0`, 1]]),
      },
    });
    const shellNominal = g.planesPerShell * g.satsPerPlane;
    const stats = computeStats(model, new Set([g.id]), enabledShells);
    expect(stats.odc.nominalSats).toBe(shellNominal);
    expect(stats.odc.visibleSats).toBe(effectiveSatsPerLaunch(physics));
  });
});
