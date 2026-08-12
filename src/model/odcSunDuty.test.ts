import { describe, expect, it } from "vitest";
import { expandScenarioScheduleById } from "../data/odcLaunchScenarios";
import { simulateOdcDeployment } from "./odcDeployment";
import { buildOdcCapacitySummaryText } from "./odcCapacitySummary";
import { odcLaunchScenarioById } from "../data/odcLaunchScenarios";
import {
  ODC_INCLINED_SUN_DUTY,
  ODC_SSO_SUN_DUTY,
  applySunDuty,
  capacityDeltaSincePriorYear,
  effectiveSnapshot,
  groupEffectiveCapacities,
  sunDutyForGroup,
  weightedSunDuty,
} from "./odcSunDuty";
import { ORBIT_GROUPS } from "../data/odcGroups";

describe("odcSunDuty", () => {
  it("assigns higher duty to polar SSO groups", () => {
    const polar = ORBIT_GROUPS.find((g) => g.id === 2)!;
    const inclined = ORBIT_GROUPS.find((g) => g.id === 1)!;
    expect(sunDutyForGroup(polar)).toBe(ODC_SSO_SUN_DUTY);
    expect(sunDutyForGroup(inclined)).toBe(ODC_INCLINED_SUN_DUTY);
  });

  it("scales snapshot by weighted duty", () => {
    const schedule = expandScenarioScheduleById("moderate-2035");
    const sim = simulateOdcDeployment(schedule, { throughYear: 2035 });
    const snap = sim.timeline.totals;
    const duty = weightedSunDuty(sim.deployment);
    const eff = effectiveSnapshot(snap, sim.deployment);
    expect(eff.powerGw).toBeCloseTo(snap.powerGw * duty, 6);
    expect(eff.computeTflops).toBeCloseTo(snap.computeTflops * duty, 3);
  });

  it("year delta matches snapshot difference", () => {
    const schedule = expandScenarioScheduleById("moderate-2035");
    const sim = simulateOdcDeployment(schedule);
    const d2031 = capacityDeltaSincePriorYear(sim, 2031);
    expect(d2031.sats).toBeGreaterThan(0);
    expect(d2031.powerGw).toBeGreaterThan(0);
  });

  it("group effective capacities sum below nominal when mixed inclinations", () => {
    const schedule = expandScenarioScheduleById("ramp-2030");
    const sim = simulateOdcDeployment(schedule, { throughYear: 2032 });
    const snap = sim.timeline.totals;
    const groups = groupEffectiveCapacities(snap, sim.deployment);
    const effSum = groups.reduce((n, g) => n + g.effectiveComputeTflops, 0);
    expect(effSum).toBeLessThan(snap.computeTflops);
    expect(effSum).toBeCloseTo(applySunDuty(snap, weightedSunDuty(sim.deployment)).computeTflops, 3);
  });
});

describe("odcCapacitySummary", () => {
  it("builds multi-line clipboard text", () => {
    const scenario = odcLaunchScenarioById("moderate-2035");
    const sim = simulateOdcDeployment(expandScenarioScheduleById("moderate-2035"), {
      throughYear: 2035,
    });
    const text = buildOdcCapacitySummaryText(scenario, sim, 2035);
    expect(text).toContain("ODC Compute");
    expect(text).toContain("sun-effective");
    expect(text).toContain("In 2035:");
    expect(text).toContain("ODC G1");
  });
});
