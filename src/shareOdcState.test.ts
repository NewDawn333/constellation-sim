import { describe, expect, it } from "vitest";
import {
  decodeOdcShareHash,
  defaultOdcShareState,
  encodeOdcShareHash,
  extractOdcHashFromLocation,
} from "./shareOdcState";
import { decodeShareState, encodeShareState, shareUrlFromState } from "./shareState";

describe("shareOdcState", () => {
  it("round-trips human-readable odc hash", () => {
    const state = {
      ...defaultOdcShareState(),
      scenario: "ramp-2030" as const,
      year: 2035,
      tier: "mini" as const,
      fill: "polar-first" as const,
      deploy3d: true,
      train: true,
    };
    const encoded = encodeOdcShareHash(state);
    expect(encoded).toContain("scenario:ramp-2030");
    expect(encoded).toContain("year:2035");
    expect(encoded).toContain("tier:mini");
    expect(decodeOdcShareHash(encoded)).toEqual(state);
  });

  it("omits default tier and fill from hash", () => {
    const encoded = encodeOdcShareHash(defaultOdcShareState());
    expect(encoded).not.toContain("tier:");
    expect(encoded).not.toContain("fill:");
  });

  it("extracts odc segment from combined location hash", () => {
    const hash = "#s=abc123&odc=scenario:moderate-2035;year:2035;tier:mini";
    const odc = extractOdcHashFromLocation(hash);
    expect(odc?.scenario).toBe("moderate-2035");
    expect(odc?.year).toBe(2035);
    expect(odc?.tier).toBe("mini");
  });
});

describe("shareState with odc", () => {
  it("share URL includes readable odc segment", () => {
    const url = shareUrlFromState(
      {
        v: 1,
        scenario: "today",
        view: "operational",
        snapshotId: "2026-06-03",
        density: 100,
        showCoverage: false,
        showBandwidth: false,
        bandwidthLayer: "broadband",
        concurrencyPct: 30,
        minElevationDeg: 25,
        nightSideDimming: false,
        odc: {
          scenario: "ramp-2030",
          year: 2035,
          tier: "mini",
        },
      },
      "https://example.com/app"
    );
    expect(url).toMatch(/#s=/);
    expect(url).toContain("odc=scenario:ramp-2030;year:2035;tier:mini");
  });

  it("sim share state round-trips with odc block", () => {
    const state = {
      v: 1 as const,
      scenario: "today" as const,
      view: "operational" as const,
      snapshotId: "2026-06-03",
      density: 100 as const,
      showCoverage: false,
      showBandwidth: false,
      bandwidthLayer: "broadband" as const,
      concurrencyPct: 30,
      minElevationDeg: 25,
      nightSideDimming: false,
      odc: {
        scenario: "moderate-2035" as const,
        year: 2034,
        deploy3d: true,
      },
    };
    const decoded = decodeShareState(encodeShareState(state));
    expect(decoded?.odc).toEqual(state.odc);
  });
});
