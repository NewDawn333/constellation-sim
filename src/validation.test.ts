import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ORBIT_GROUPS } from "./data/odcGroups";
import {
  STARLINK_GEN1_AUTHORIZED,
  STARLINK_GEN1_NOMINAL_AUTHORIZED,
} from "./data/starlinkGen1";
import {
  STARLINK_DEPLOYED_TOTAL,
  STARLINK_DEPLOYED_GEN1_TOTAL,
  STARLINK_DEPLOYED_GEN2_TOTAL,
  STARLINK_DEPLOYED_2026_06_03,
  DEPLOYMENT_SNAPSHOTS,
  deploymentSnapshotById,
  deployedShellsForSnapshot,
  reconcileDeploymentTotal,
  starlinkDeployedGroups,
  starlinkGroupsForView,
} from "./data/starlinkDeployed";
import { DEPLOYMENT_MILESTONES } from "./data/starlinkDeploymentMilestones";
import {
  STARLINK_GEN2_APPLICATION,
  STARLINK_GEN2_GRANTED,
  STARLINK_GEN2_NOMINAL_APPLICATION,
  starlinkGen2GroupsForMode,
} from "./data/starlinkGen2";
import { buildUnifiedConstellation } from "./model/unifiedConstellation";
import {
  DEFAULT_BUILD_PARAMS,
  groundTrackPoints,
  planeKey,
  positionOnPlane,
  shellInclinationDeg,
} from "./orbits";

describe("ODC constellation structure", () => {
  const model = buildUnifiedConstellation(ORBIT_GROUPS, DEFAULT_BUILD_PARAMS);

  it("plane count equals shells × planes per shell per group", () => {
    for (const g of ORBIT_GROUPS) {
      const planes = model.planesByGroup.get(g.id)!;
      expect(planes.length).toBe(g.shells * g.planesPerShell);
    }
  });

  it("Group 1 inclination spans 26°–32° across shells", () => {
    const planes = model.planesByGroup.get(1)!;
    const incs = [...new Set(planes.map((p) => p.inclinationDeg))].sort((a, b) => a - b);
    expect(incs[0]).toBeCloseTo(26, 5);
    expect(incs[incs.length - 1]!).toBeCloseTo(32, 5);
    expect(shellInclinationDeg([26, 32], 0, 10)).toBeCloseTo(26, 5);
    expect(shellInclinationDeg([26, 32], 9, 10)).toBeCloseTo(32, 5);
  });

  it("RAAN spacing is uniform within each shell", () => {
    for (const g of ORBIT_GROUPS) {
      const planes = model.planesByGroup.get(g.id)!;
      for (let sh = 0; sh < g.shells; sh++) {
        const shellPlanes = planes.filter((p) => p.shellIndex === sh).sort((a, b) => a.planeIndex - b.planeIndex);
        const step = (2 * Math.PI) / g.planesPerShell;
        for (let i = 1; i < shellPlanes.length; i++) {
          const delta = shellPlanes[i]!.raanRad - shellPlanes[i - 1]!.raanRad;
          expect(delta).toBeCloseTo(step, 5);
        }
      }
    }
  });
});

describe("Starlink Gen1", () => {
  const model = buildUnifiedConstellation(
    [...ORBIT_GROUPS, ...STARLINK_GEN1_AUTHORIZED],
    DEFAULT_BUILD_PARAMS
  );

  it("authorized shells total 4,408 nominal satellites", () => {
    expect(STARLINK_GEN1_NOMINAL_AUTHORIZED).toBe(4408);
  });

  it("primary shell is 550 km at 53° with 72×22", () => {
    const g1 = STARLINK_GEN1_AUTHORIZED[0]!;
    expect(g1.altitudeKm[0]).toBe(550);
    expect(g1.inclinationDeg).toBe(53);
    expect(g1.planesPerShell).toBe(72);
    expect(g1.satsPerPlane).toBe(22);
    const planes = model.planesByGroup.get(101)!;
    expect(planes.length).toBe(72);
  });

  it("uses distinct group ids from ODC", () => {
    const odcIds = new Set(ORBIT_GROUPS.map((g) => g.id));
    for (const g of STARLINK_GEN1_AUTHORIZED) {
      expect(odcIds.has(g.id)).toBe(false);
      expect(g.layer).toBe("starlink-gen1");
    }
  });
});

describe("orbital mechanics", () => {
  const model = buildUnifiedConstellation(ORBIT_GROUPS, DEFAULT_BUILD_PARAMS);
  const plane = model.planes[0]!;

  it("ECI position has orbit radius", () => {
    const v = new THREE.Vector3();
    positionOnPlane(plane, 0, 0, v);
    const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    expect(r).toBeCloseTo(plane.radius, 4);
  });

  it("ground track lies on unit sphere", () => {
    const pts = groundTrackPoints(plane);
    for (let i = 0; i < pts.length; i += 3) {
      const r = Math.sqrt(pts[i]! ** 2 + pts[i + 1]! ** 2 + pts[i + 2]! ** 2);
      expect(r).toBeCloseTo(1.002, 3);
    }
  });

  it("plane keys are unique across combined model", () => {
    const combined = buildUnifiedConstellation(
      [...ORBIT_GROUPS, ...STARLINK_GEN1_AUTHORIZED],
      DEFAULT_BUILD_PARAMS
    );
    const keys = new Set(combined.planes.map((p) => planeKey(p.groupId, p.shellIndex, p.planeIndex)));
    expect(keys.size).toBe(combined.planes.length);
  });

  it("polar inclination reaches high latitude (Y = north pole)", () => {
    const plane = {
      radius: 1.1,
      inclinationRad: (97.6 * Math.PI) / 180,
      raanRad: 0,
      meanMotionRadPerSec: 0,
    };
    const v = new THREE.Vector3();
    let maxAbsY = 0;
    for (let i = 0; i <= 64; i++) {
      positionOnPlane(plane, (i / 64) * Math.PI * 2, 0, v);
      maxAbsY = Math.max(maxAbsY, Math.abs(v.y));
    }
    expect(maxAbsY / plane.radius).toBeGreaterThan(0.92);
  });

  it("equatorial inclination stays near equatorial plane", () => {
    const plane = {
      radius: 1.1,
      inclinationRad: 0,
      raanRad: 0,
      meanMotionRadPerSec: 0,
    };
    const v = new THREE.Vector3();
    let maxAbsY = 0;
    for (let i = 0; i <= 64; i++) {
      positionOnPlane(plane, (i / 64) * Math.PI * 2, 0, v);
      maxAbsY = Math.max(maxAbsY, Math.abs(v.y));
    }
    expect(maxAbsY / plane.radius).toBeLessThan(0.05);
  });
});

describe("Starlink Gen2", () => {
  it("full application totals 29,988 nominal satellites", () => {
    expect(STARLINK_GEN2_NOMINAL_APPLICATION).toBe(29_988);
  });

  it("application includes retrograde 604/614 km shells", () => {
    const ids = STARLINK_GEN2_APPLICATION.map((g) => g.altitudeKm[0]);
    expect(ids).toContain(604);
    expect(ids).toContain(614);
  });

  it("granted mode exposes 365 km inclination variant toggle", () => {
    const inc28 = starlinkGen2GroupsForMode("granted", "28").map((g) => g.id);
    const inc32 = starlinkGen2GroupsForMode("granted", "32").map((g) => g.id);
    expect(inc28).toContain(206);
    expect(inc28).not.toContain(207);
    expect(inc32).toContain(207);
    expect(inc32).not.toContain(206);
  });

  it("uses distinct group ids from Gen1 and ODC", () => {
    const reserved = new Set([
      ...ORBIT_GROUPS.map((g) => g.id),
      ...STARLINK_GEN1_AUTHORIZED.map((g) => g.id),
    ]);
    for (const g of STARLINK_GEN2_APPLICATION) {
      expect(reserved.has(g.id)).toBe(false);
      expect(g.layer).toBe("starlink-gen2");
    }
  });

  it("VLEO granted shells sit below Gen1 primary altitude", () => {
    const vleoMax = Math.max(...STARLINK_GEN2_GRANTED.map((g) => g.altitudeKm[1]));
    const gen1Min = Math.min(...STARLINK_GEN1_AUTHORIZED.map((g) => g.altitudeKm[0]));
    expect(vleoMax).toBeLessThan(gen1Min);
  });
});

describe("ODC 1M representative GPU buffers", () => {
  it("builds typed buffer with correct nominal total at 1:100", () => {
    const params = { ...DEFAULT_BUILD_PARAMS, odcRepresentativeMode: true, sampleDivisor: 100 as const };
    const model = buildUnifiedConstellation(ORBIT_GROUPS, params);
    const g1 = model.gpuBuffers.get(1)!;
    expect(g1.nominalSats).toBe(99_900);
    expect(g1.displaySats).toBe(10 * 30 * 4);
    expect(g1.elements.length).toBe(g1.displaySats * 5);
  });

  it("planes are tracks-only without JS satellite objects", () => {
    const params = { ...DEFAULT_BUILD_PARAMS, odcRepresentativeMode: true };
    const model = buildUnifiedConstellation(ORBIT_GROUPS, params);
    const planes = model.planesByGroup.get(1)!;
    expect(planes.length).toBe(300);
    expect(planes.every((p) => p.satellites.length === 0)).toBe(true);
  });

  it("full constellation nominal addressable at 1:100", () => {
    const params = { ...DEFAULT_BUILD_PARAMS, odcRepresentativeMode: true, sampleDivisor: 100 as const };
    const model = buildUnifiedConstellation(ORBIT_GROUPS, params);
    let nominal = 0;
    let display = 0;
    for (const g of ORBIT_GROUPS) {
      const buf = model.gpuBuffers.get(g.id)!;
      nominal += buf.nominalSats;
      display += buf.displaySats;
    }
    expect(nominal).toBe(1_198_120);
    expect(display).toBeGreaterThan(10_000);
    expect(display).toBeLessThan(15_000);
  });
});

describe("Starlink operational snapshots", () => {
  it("Jun 3 2026 exact totals match McDowell GCAT", () => {
    expect(STARLINK_DEPLOYED_GEN1_TOTAL).toBe(2844);
    expect(STARLINK_DEPLOYED_GEN2_TOTAL).toBe(6369);
    expect(STARLINK_DEPLOYED_TOTAL).toBe(9213);
    const sum = STARLINK_DEPLOYED_2026_06_03.reduce((n, s) => n + s.operationalSats, 0);
    expect(sum).toBe(9213);
  });

  it("registry includes Jan 1 milestones 2019–2026 plus Jun 2026 cut", () => {
    expect(DEPLOYMENT_SNAPSHOTS.length).toBe(9);
    const ids = DEPLOYMENT_SNAPSHOTS.map((s) => s.id);
    expect(ids).toContain("2026-06-03");
    for (const y of ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"]) {
      expect(ids).toContain(`${y}-01-01`);
    }
  });

  it("reconciles early era milestones", () => {
    const m2019 = DEPLOYMENT_MILESTONES.find((x) => x.id === "2019-01-01")!;
    expect(reconcileDeploymentTotal(m2019.primary, m2019.secondary, m2019.mcdowellWorking).total).toBe(2);

    const m2020 = DEPLOYMENT_MILESTONES.find((x) => x.id === "2020-01-01")!;
    expect(reconcileDeploymentTotal(m2020.primary, m2020.secondary, m2020.mcdowellWorking).total).toBe(117);

    const m2021 = DEPLOYMENT_MILESTONES.find((x) => x.id === "2021-01-01")!;
    expect(reconcileDeploymentTotal(m2021.primary, m2021.secondary, m2021.mcdowellWorking).total).toBe(861);
  });

  it("reconciles 2022 Jan 1 when UCS and McDowell working agree", () => {
    const m = DEPLOYMENT_MILESTONES.find((x) => x.id === "2022-01-01")!;
    const { total, method } = reconcileDeploymentTotal(m.primary, m.secondary, m.mcdowellWorking);
    expect(total).toBe(1752);
    expect(method).toContain("McDowell working");
  });

  it("milestone shell totals match reconciled metadata", () => {
    for (const m of DEPLOYMENT_MILESTONES) {
      const meta = deploymentSnapshotById(m.id)!;
      const shells = deployedShellsForSnapshot(m.id);
      const sum = shells.reduce((n, s) => n + s.operationalSats, 0);
      expect(sum).toBe(meta.totalOperational);
    }
  });

  it("Gen1 grows 2023→2024 then declines through 2026 (no allocation artifact)", () => {
    const g2023 = deploymentSnapshotById("2023-01-01")!.gen1Total;
    const g2024 = deploymentSnapshotById("2024-01-01")!.gen1Total;
    const g2025 = deploymentSnapshotById("2025-01-01")!.gen1Total;
    const g2026Jan = deploymentSnapshotById("2026-01-01")!.gen1Total;
    expect(g2023).toBeLessThan(g2024);
    expect(g2024).toBeGreaterThan(g2025);
    expect(g2025).toBeGreaterThan(g2026Jan);
    expect(g2026Jan).toBeGreaterThan(STARLINK_DEPLOYED_GEN1_TOTAL);
  });

  it("early era uses launch-train plane layout (not one sat per Walker plane)", () => {
    const groups = starlinkDeployedGroups("2020-01-01");
    const g301 = groups.find((g) => g.id === 301)!;
    expect(g301.satLayout).toBe("launch_train");
    expect(g301.planesPerShell).toBe(2);
    expect(g301.satsPerPlane).toBe(60);
    expect(g301.maxSats).toBe(117);

    const model = buildUnifiedConstellation(groups, DEFAULT_BUILD_PARAMS);
    const planes = model.planesByGroup.get(301)!;
    expect(planes.length).toBe(2);
    expect(planes[0]!.nominalSatsPerPlane).toBe(60);
    expect(planes[1]!.nominalSatsPerPlane).toBe(57);
  });

  it("launch-train planes spread sats equidistant along orbit (not post-deploy clusters)", () => {
    const groups = starlinkDeployedGroups("2022-01-01");
    const params = { ...DEFAULT_BUILD_PARAMS, sampleDivisor: 10 as const };
    const model = buildUnifiedConstellation(groups, params);
    const plane = model.planesByGroup.get(301)![0]!;
    const phases = plane.satellites.map((s) => s.meanAnomaly0).sort((a, b) => a - b);
    expect(phases.length).toBeGreaterThan(2);
    const visStep = (Math.PI * 2) / phases.length;
    for (let i = 1; i < phases.length; i++) {
      expect(phases[i]! - phases[i - 1]!).toBeCloseTo(visStep, 5);
    }
    const wrapGap = Math.PI * 2 - phases[phases.length - 1]! + phases[0]!;
    expect(wrapGap).toBeCloseTo(visStep, 5);
  });

  it("launch-train default density shows enough sats to fill each ring at 1:100", () => {
    const groups = starlinkDeployedGroups("2020-01-01");
    const model = buildUnifiedConstellation(groups, DEFAULT_BUILD_PARAMS);
    const plane = model.planesByGroup.get(301)![0]!;
    expect(plane.satellites.length).toBeGreaterThanOrEqual(6);
    const step = (Math.PI * 2) / plane.satellites.length;
    expect(step).toBeLessThanOrEqual(Math.PI / 3);
  });

  it("2023 snapshot includes Gen2 shell alongside growing Gen1", () => {
    const meta = deploymentSnapshotById("2023-01-01")!;
    expect(meta.gen1Total).toBe(3180);
    expect(meta.gen2Total).toBe(146);
    expect(meta.layout).toBe("launch_train");
  });

  it("operational view returns era-appropriate shells for 2019 and 2022", () => {
    const early = starlinkGroupsForView("operational", "2019-01-01", {
      gen1Mode: "authorized",
      gen2Mode: "granted",
      gen2Inc365: "28",
    });
    expect(early.map((g) => g.id)).toEqual([301]);
    expect(early.reduce((n, g) => n + g.maxSats, 0)).toBe(2);

    const y2022 = starlinkGroupsForView("operational", "2022-01-01", {
      gen1Mode: "authorized",
      gen2Mode: "granted",
      gen2Inc365: "28",
    });
    expect(y2022.map((g) => g.id).sort()).toEqual([301, 305]);
    expect(y2022.reduce((n, g) => n + g.maxSats, 0)).toBe(1752);
    expect(y2022.every((g) => g.satLayout === "launch_train")).toBe(true);
  });

  it("operational view returns 15 shells for Jun 2026", () => {
    const groups = starlinkGroupsForView("operational", "2026-06-03", {
      gen1Mode: "authorized",
      gen2Mode: "granted",
      gen2Inc365: "28",
    });
    expect(groups).toHaveLength(15);
    expect(groups.reduce((n, g) => n + g.maxSats, 0)).toBe(9213);
  });

  it("deployed group maxSats equals shell record for exact cut", () => {
    for (const rec of STARLINK_DEPLOYED_2026_06_03) {
      const g = starlinkDeployedGroups("2026-06-03").find((x) => x.id === rec.id)!;
      expect(g.maxSats).toBe(rec.operationalSats);
    }
  });

  it("nominal view still returns filing shells", () => {
    const groups = starlinkGroupsForView("nominal", "2026-06-03", {
      gen1Mode: "authorized",
      gen2Mode: "granted",
      gen2Inc365: "28",
    });
    expect(groups.some((g) => g.id === 101)).toBe(true);
    expect(groups.some((g) => g.id === 301)).toBe(false);
  });
});

describe("coverage footprints", () => {
  it("550 km / 25° footprint ground radius is ~940 km", async () => {
    const { footprintGroundRadiusKm } = await import("./model/coverageGrid");
    const r = footprintGroundRadiusKm(550, 25);
    expect(r).toBeGreaterThan(850);
    expect(r).toBeLessThan(1050);
  });

  it("angular distance at equator matches haversine", async () => {
    const { angularDistanceDeg } = await import("./model/coverageGrid");
    expect(angularDistanceDeg(0, 0, 0, 1)).toBeCloseTo(1, 0);
    expect(angularDistanceDeg(0, 0, 0, 90)).toBeCloseTo(90, 0);
  });

  it("maps DTC shells to dtc-v2 after 2025", async () => {
    const { hardwareClassForShellId } = await import("./data/starlinkHardware");
    expect(hardwareClassForShellId(403, "2024-01-01")).toBe("dtc-v1");
    expect(hardwareClassForShellId(403, "2026-06-03")).toBe("dtc-v2");
  });

  it("early snapshot has lower coverage than Jun 2026", async () => {
    const THREE = await import("three");
    const { buildCoverageGrid } = await import("./model/coverageGrid");
    const { starlinkDeployedGroups } = await import("./data/starlinkDeployed");
    const earth = new THREE.Group();

    const early = starlinkDeployedGroups("2020-01-01");
    const today = starlinkDeployedGroups("2026-06-03");
    const enabledEarly = new Set(early.map((g) => g.id));
    const enabledToday = new Set(today.map((g) => g.id));

    const rEarly = buildCoverageGrid(early, enabledEarly, 0, "2020-01-01", earth);
    const rToday = buildCoverageGrid(today, enabledToday, 0, "2026-06-03", earth);

    expect(rEarly.contributingSats).toBeLessThan(rToday.contributingSats);
    expect(rEarly.coverageFraction).toBeLessThan(rToday.coverageFraction);
  });
});

describe("bandwidth heatmap", () => {
  it("footprint at 550 km spans hundreds of grid cells", async () => {
    const { estimateFootprintCellCount, footprintRadiusDeg } = await import("./model/coverageGrid");
    const r = footprintRadiusDeg(550, 25);
    const n = estimateFootprintCellCount(r);
    expect(n).toBeGreaterThan(200);
    expect(n).toBeLessThan(5000);
  });

  it("Jun 2026 nominal downlink is within 2× of public ~450 Tbps cumulative", async () => {
    const THREE = await import("three");
    const { buildCapacityGrid } = await import("./model/coverageGrid");
    const { DEFAULT_HARDWARE_FILTER } = await import("./data/starlinkHardware");
    const { starlinkDeployedGroups } = await import("./data/starlinkDeployed");
    const earth = new THREE.Group();

    const groups = starlinkDeployedGroups("2026-06-03");
    const enabled = new Set(groups.map((g) => g.id));
    const r = buildCapacityGrid(groups, enabled, 0, "2026-06-03", earth, {
      concurrency: 1,
      layer: "broadband",
      classFilter: DEFAULT_HARDWARE_FILTER,
    });

    const tbps = r.totalNominalGbps / 1000;
    expect(tbps).toBeGreaterThan(225);
    expect(tbps).toBeLessThan(900);
  });

  it("2026 peak cell bandwidth exceeds 2021 with concurrency applied", async () => {
    const THREE = await import("three");
    const { buildCapacityGrid } = await import("./model/coverageGrid");
    const { DEFAULT_HARDWARE_FILTER } = await import("./data/starlinkHardware");
    const { starlinkDeployedGroups } = await import("./data/starlinkDeployed");
    const earth = new THREE.Group();

    const opts = { concurrency: 0.3, layer: "broadband" as const, classFilter: DEFAULT_HARDWARE_FILTER };
    const g2021 = starlinkDeployedGroups("2021-01-01");
    const g2026 = starlinkDeployedGroups("2026-06-03");
    const r2021 = buildCapacityGrid(g2021, new Set(g2021.map((x) => x.id)), 0, "2021-01-01", earth, opts);
    const r2026 = buildCapacityGrid(g2026, new Set(g2026.map((x) => x.id)), 0, "2026-06-03", earth, opts);

    expect(r2026.peakCellGbps).toBeGreaterThan(r2021.peakCellGbps);
    expect(r2026.totalNominalGbps).toBeGreaterThan(r2021.totalNominalGbps * 5);
  });

  it("DTC layer excludes broadband shells", async () => {
    const THREE = await import("three");
    const { buildCapacityGrid } = await import("./model/coverageGrid");
    const { DEFAULT_HARDWARE_FILTER } = await import("./data/starlinkHardware");
    const { starlinkDeployedGroups } = await import("./data/starlinkDeployed");
    const earth = new THREE.Group();

    const groups = starlinkDeployedGroups("2026-06-03");
    const enabled = new Set(groups.map((g) => g.id));
    const bb = buildCapacityGrid(groups, enabled, 0, "2026-06-03", earth, {
      concurrency: 0.3,
      layer: "broadband",
      classFilter: DEFAULT_HARDWARE_FILTER,
    });
    const dtc = buildCapacityGrid(groups, enabled, 0, "2026-06-03", earth, {
      concurrency: 0.3,
      layer: "dtc",
      classFilter: DEFAULT_HARDWARE_FILTER,
    });

    expect(dtc.contributingSats).toBeLessThan(bb.contributingSats);
    expect(dtc.totalNominalGbps).toBeLessThan(bb.totalNominalGbps);
  });
});

describe("Phase 9 · scenarios & share", () => {
  it("gen2-full scenario includes application shells", async () => {
    const { starlinkGroupsForScenario } = await import("./data/starlinkScenarios");
    const groups = starlinkGroupsForScenario("gen2-full", {
      view: "nominal",
      snapshotId: "2026-06-03",
      gen1Mode: "deployed",
      gen2Mode: "application",
      gen2Inc365: "28",
    });
    expect(groups.some((g) => g.id === 211)).toBe(true);
    expect(groups.reduce((n, g) => n + g.maxSats, 0)).toBeGreaterThan(25_000);
  });

  it("gen3-partial adds future shells marked future", async () => {
    const { starlinkGroupsForScenario } = await import("./data/starlinkScenarios");
    const { STARLINK_GEN3_PARTIAL_NOMINAL } = await import("./data/starlinkGen3");
    const groups = starlinkGroupsForScenario("gen3-partial", {
      view: "operational",
      snapshotId: "2026-06-03",
      gen1Mode: "deployed",
      gen2Mode: "granted",
      gen2Inc365: "28",
    });
    const future = groups.filter((g) => g.future);
    expect(future.length).toBe(4);
    expect(future.every((g) => g.id >= 501)).toBe(true);
    expect(future.reduce((n, g) => n + g.maxSats, 0)).toBe(STARLINK_GEN3_PARTIAL_NOMINAL);
  });

  it("future groups are excluded from coverage stamps", async () => {
    const THREE = await import("three");
    const { buildCoverageGrid } = await import("./model/coverageGrid");
    const { STARLINK_GEN3_PARTIAL } = await import("./data/starlinkGen3");
    const earth = new THREE.Group();
    const enabled = new Set(STARLINK_GEN3_PARTIAL.map((g) => g.id));
    const r = buildCoverageGrid(STARLINK_GEN3_PARTIAL, enabled, 0, "2026-06-03", earth);
    expect(r.contributingSats).toBe(0);
    expect(r.coverageFraction).toBe(0);
  });

  it("min elevation slider shrinks footprint", async () => {
    const { footprintGroundRadiusKm } = await import("./model/coverageGrid");
    const wide = footprintGroundRadiusKm(550, 15);
    const narrow = footprintGroundRadiusKm(550, 35);
    expect(wide).toBeGreaterThan(narrow);
  });

  it("Gen3 shell ids map to v3 hardware", async () => {
    const { hardwareClassForShellId } = await import("./data/starlinkHardware");
    expect(hardwareClassForShellId(501)).toBe("v3");
  });

  it("share state round-trips through URL hash", async () => {
    const { encodeShareState, decodeShareState } = await import("./shareState");
    const state = {
      v: 1 as const,
      scenario: "gen3-partial" as const,
      view: "operational" as const,
      snapshotId: "2026-06-03",
      density: 100 as const,
      showCoverage: true,
      showBandwidth: false,
      bandwidthLayer: "broadband" as const,
      concurrencyPct: 30,
      minElevationDeg: 20,
      nightSideDimming: true,
    };
    const encoded = encodeShareState(state);
    const decoded = decodeShareState(encoded);
    expect(decoded).toEqual(state);
  });
});

describe("polar vs inclined topology", () => {
  it("polar groups use 2 planes per shell, inclined use 30", () => {
    const polar = ORBIT_GROUPS.filter((g) => g.planesPerShell === 2);
    const inclined = ORBIT_GROUPS.filter((g) => g.planesPerShell === 30);
    expect(polar.map((g) => g.id).sort()).toEqual([2, 4, 6]);
    expect(inclined.map((g) => g.id).sort()).toEqual([1, 3, 5]);
  });
});
