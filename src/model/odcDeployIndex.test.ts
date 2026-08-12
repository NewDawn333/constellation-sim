import { describe, expect, it } from "vitest";
import { ORBIT_GROUPS } from "../data/odcGroups";
import { expandScenarioScheduleById } from "../data/odcLaunchScenarios";
import { DEFAULT_BUILD_PARAMS } from "../orbits";
import {
  buildNominalDeployMaps,
  buildDisplayDeployAttributes,
  buildOdcDisplayDeployAttributes,
  maxDeployOrdinalThroughYear,
  nominalSlotIndex,
} from "./odcDeployIndex";

describe("odcDeployIndex", () => {
  it("nominalSlotIndex matches shell-plane-sat layout", () => {
    const g = ORBIT_GROUPS[0]!;
    const idx = nominalSlotIndex(g, 1, 2, 3);
    expect(idx).toBe(1 * g.planesPerShell * g.satsPerPlane + 2 * g.satsPerPlane + 3);
  });

  it("buildNominalDeployMaps assigns sequential ordinals", () => {
    const schedule = expandScenarioScheduleById("pilot-2028");
    const maps = buildNominalDeployMaps(schedule, "altitude-asc");
    let maxOrd = 0;
    let deployed = 0;
    for (const m of maps.values()) {
      for (let i = 0; i < m.deployOrdinal.length; i++) {
        if (m.deployOrdinal[i]! > 0) {
          deployed++;
          maxOrd = Math.max(maxOrd, m.deployOrdinal[i]!);
        }
      }
    }
    expect(deployed).toBeGreaterThan(0);
    expect(maxOrd).toBe(deployed);
  });

  it("display attributes align with GPU buffer count", () => {
    const schedule = expandScenarioScheduleById("moderate-2035");
    const params = { ...DEFAULT_BUILD_PARAMS, odcRepresentativeMode: true, sampleDivisor: 100 as const };
    const attrs = buildOdcDisplayDeployAttributes(schedule, "altitude-asc", params);
    const g = ORBIT_GROUPS[0]!;
    const nominal = buildNominalDeployMaps(schedule, "altitude-asc").get(g.id)!;
    const display = buildDisplayDeployAttributes(g, params, nominal);
    expect(display).not.toBeNull();
    expect(attrs.get(g.id)!.deployYear.length).toBe(display!.deployYear.length);
  });

  it("maxDeployOrdinalThroughYear respects sim year filter", () => {
    const schedule = expandScenarioScheduleById("moderate-2035");
    const params = { ...DEFAULT_BUILD_PARAMS, odcRepresentativeMode: true };
    const attrs = buildOdcDisplayDeployAttributes(schedule, "altitude-asc", params);
    const early = maxDeployOrdinalThroughYear(attrs, 2028);
    const later = maxDeployOrdinalThroughYear(attrs, 2035);
    expect(later).toBeGreaterThanOrEqual(early);
    expect(early).toBeGreaterThan(0);
  });
});
