import { describe, expect, it } from "vitest";
import { buildOdcDataCenterSatellites } from "./odcDataCenterLayout";

describe("odcDataCenterLayout batches", () => {
  it("uses inter-launch gap between batches", () => {
    const alt = 600;
    const sats = buildOdcDataCenterSatellites(100, 50, alt, 0);
    const endBatch0 = sats[49]!.meanAnomaly0;
    const startBatch1 = sats[50]!.meanAnomaly0;
    const intra = 55 / (6371 + alt);
    const gap = 120 / (6371 + alt);
    expect(startBatch1 - endBatch0).toBeCloseTo(intra + gap, 5);
  });
});
