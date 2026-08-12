import { describe, expect, it } from "vitest";
import {
  KW_PER_SAT_MINI,
  LAUNCHES_PER_WEEK_REFERENCE,
  ODC_COMPUTE_TIERS,
  RUBIN_TFLOPS_DR11,
  STARSHIP_PAYLOAD_TON_REUSABLE,
  tierTflopsPerKw,
} from "../data/odcComputeSpec";
import { ODC_NOMINAL_TOTAL } from "../data/odcGroups";
import {
  annualLaunchCapacity,
  computeTflopsFromKw,
  computeTflopsPerSat,
  cumulativeCapacity,
  fullFleetCapacity,
  powerMwFromPayloadTonnes,
  powerMwPerLaunch,
  rubinMultiple,
  satsPerLaunch,
  singleLaunchCapacity,
} from "./odcCapacity";

describe("odcCapacity — launch packing", () => {
  it("fits 100 AI Sat Minis at 1 t each in 100 t payload", () => {
    expect(satsPerLaunch(100, 1)).toBe(100);
  });

  it("golden: one launch at 100 t, 1 t/sat, 100 kW/sat → 10 MW", () => {
    expect(powerMwPerLaunch(100, 1, KW_PER_SAT_MINI)).toBe(10);
    const snap = singleLaunchCapacity(100, 1, KW_PER_SAT_MINI, "mini");
    expect(snap.deployedSats).toBe(100);
    expect(snap.powerGw).toBe(0.01);
    expect(snap.computeTflops).toBe(10_000);
  });

  it("filing density: 100 t → 10 MW via kW/tonne", () => {
    expect(powerMwFromPayloadTonnes(100)).toBe(10);
  });

  it("heavy 10 t Mini: 10 sats and 1 MW per 100 t launch", () => {
    expect(satsPerLaunch(100, 10)).toBe(10);
    expect(powerMwPerLaunch(100, 10, KW_PER_SAT_MINI)).toBe(1);
  });
});

describe("odcCapacity — compute conversion", () => {
  it("computeTflopsFromKw at 2 TFLOPS/W", () => {
    expect(computeTflopsFromKw(50, 2)).toBe(100);
  });

  it("mini tier: 50 kW compute → 100 TFLOPS", () => {
    const tier = ODC_COMPUTE_TIERS.mini;
    expect(tierTflopsPerKw(tier)).toBe(2);
    expect(computeTflopsPerSat(tier)).toBe(100);
  });

  it("rubinMultiple scales against DR11 anchor", () => {
    expect(rubinMultiple(950)).toBe(1);
    expect(rubinMultiple(95_000)).toBe(100);
  });
});

describe("odcCapacity — weekly launch cadence", () => {
  it("52 launches/yr @ 100 t → 5200 sats, 520 MW (0.52 GW), 520 PFLOPS (mini tier)", () => {
    const snap = annualLaunchCapacity(
      LAUNCHES_PER_WEEK_REFERENCE,
      STARSHIP_PAYLOAD_TON_REUSABLE,
      1,
      KW_PER_SAT_MINI,
      "mini"
    );
    expect(snap.deployedSats).toBe(5200);
    expect(snap.powerGw).toBeCloseTo(0.52, 6);
    expect(snap.computePflops).toBeCloseTo(520, 6);
  });
});

describe("odcCapacity — cumulative schedule", () => {
  it("accumulates across years and caps at filing total", () => {
    const timeline = cumulativeCapacity([
      { year: 2030, launches: 52, payloadTon: 100, satMassTon: 1, tierId: "mini" },
      { year: 2031, launches: 52, payloadTon: 100, satMassTon: 1, tierId: "mini" },
    ]);
    expect(timeline.totals.deployedSats).toBe(10_400);
    expect(timeline.totals.powerGw).toBeCloseTo(1.04, 6);
    expect(timeline.byYear).toHaveLength(2);
    expect(timeline.byYear[1]!.snapshot.deployedSats).toBe(10_400);
  });

  it("respects maxSats cap", () => {
    const huge = cumulativeCapacity(
      [{ year: 2040, launches: 50_000, payloadTon: 100, satMassTon: 1, tierId: "mini" }],
      { maxSats: 1000 }
    );
    expect(huge.totals.deployedSats).toBe(1000);
    expect(huge.satsCapped).toBeGreaterThan(0);
  });

  it("honors throughYear filter", () => {
    const partial = cumulativeCapacity(
      [
        { year: 2030, launches: 10, payloadTon: 100, tierId: "mini" },
        { year: 2035, launches: 10, payloadTon: 100, tierId: "mini" },
      ],
      { throughYear: 2030 }
    );
    expect(partial.totals.deployedSats).toBe(1000);
    expect(partial.byYear).toHaveLength(1);
  });
});

describe("odcCapacity — full fleet", () => {
  it("nominal 1.198M sats at mini tier ≈ 120 GW and 120 EFLOPS", () => {
    const fleet = fullFleetCapacity("mini");
    expect(fleet.deployedSats).toBe(ODC_NOMINAL_TOTAL);
    expect(fleet.powerGw).toBeCloseTo(119.812, 0);
    expect(fleet.computeEflops).toBeCloseTo(119.812, 0);
    expect(fleet.rubinMultiple).toBeCloseTo(
      (ODC_NOMINAL_TOTAL * 100) / RUBIN_TFLOPS_DR11,
      -2
    );
  });
});
