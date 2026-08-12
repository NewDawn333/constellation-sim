import { describe, expect, it } from "vitest";
import { ODC_NOMINAL_TOTAL, ORBIT_GROUPS } from "../data/odcGroups";
import {
  DEFAULT_ODC_LAUNCH_SCENARIO_ID,
  expandScenarioSchedule,
  expandScenarioScheduleById,
  odcLaunchScenarioById,
} from "../data/odcLaunchScenarios";
import {
  allocateSatsToGroups,
  emptyDeploymentState,
  orderedOdcGroups,
  simulateOdcDeployment,
} from "./odcDeployment";

describe("odcLaunchScenarios", () => {
  it("expands moderate-2035 with phased launch rates", () => {
    const schedule = expandScenarioScheduleById("moderate-2035");
    const y2028 = schedule.find((e) => e.year === 2028)!;
    const y2031 = schedule.find((e) => e.year === 2031)!;
    const y2034 = schedule.find((e) => e.year === 2034)!;
    expect(y2028.launches).toBe(6);
    expect(y2028.tierId).toBe("pilot");
    expect(y2031.launches).toBe(40);
    expect(y2034.launches).toBe(100);
  });

  it("filing aspirational hits nominal cap within a few years", () => {
    const schedule = expandScenarioScheduleById("filing-aspirational");
    const sim = simulateOdcDeployment(schedule, { throughYear: 2032 });
    expect(sim.timeline.totals.deployedSats).toBe(ODC_NOMINAL_TOTAL);
    expect(sim.timeline.satsCapped).toBeGreaterThan(0);
  });

  it("default scenario id is moderate-2035", () => {
    expect(DEFAULT_ODC_LAUNCH_SCENARIO_ID).toBe("moderate-2035");
    expect(odcLaunchScenarioById(DEFAULT_ODC_LAUNCH_SCENARIO_ID).phases.length).toBeGreaterThan(1);
  });
});

describe("odcDeployment — group allocation", () => {
  it("fills lowest altitude group first (G1 before G3)", () => {
    const state = emptyDeploymentState();
    const adds = allocateSatsToGroups(500, state, "altitude-asc");
    expect(adds.get(1)).toBe(500);
    expect(adds.get(3) ?? 0).toBe(0);
  });

  it("polar-first prioritizes SSO groups", () => {
    const order = orderedOdcGroups("polar-first");
    expect(order[0]!.id).toBe(2);
    expect(order[1]!.id).toBe(4);
  });

  it("respects group maxSats caps", () => {
    const state = emptyDeploymentState();
    const g1max = ORBIT_GROUPS.find((g) => g.id === 1)!.maxSats;
    const adds = allocateSatsToGroups(g1max + 1000, state, "altitude-asc");
    expect(adds.get(1)).toBe(g1max);
    expect([...adds.values()].reduce((a, b) => a + b, 0)).toBe(g1max + 1000);
  });
});

describe("odcDeployment — timeline simulation", () => {
  it("moderate-2035 through 2035 deploys thousands of minis", () => {
    const schedule = expandScenarioSchedule(odcLaunchScenarioById("moderate-2035"));
    const sim = simulateOdcDeployment(schedule, { throughYear: 2035 });
    expect(sim.timeline.totals.deployedSats).toBeGreaterThan(10_000);
    expect(sim.timeline.totals.powerGw).toBeGreaterThan(0.5);
    expect(sim.timeline.totals.rubinMultiple).toBeGreaterThan(100);
  });

  it("tracks per-year deltas", () => {
    const schedule = expandScenarioScheduleById("pilot-2028");
    const sim = simulateOdcDeployment(schedule, { throughYear: 2030 });
    expect(sim.years.length).toBe(3);
    expect(sim.years[0]!.year).toBe(2028);
    expect(sim.years[0]!.satsAdded).toBeGreaterThan(0);
  });

  it("group deployment sums match total deployed", () => {
    const schedule = expandScenarioScheduleById("ramp-2030");
    const sim = simulateOdcDeployment(schedule, { throughYear: 2032 });
    const groupSum = [...sim.deployment.byGroupId.values()].reduce((a, b) => a + b, 0);
    expect(groupSum).toBe(sim.timeline.totals.deployedSats);
  });
});
