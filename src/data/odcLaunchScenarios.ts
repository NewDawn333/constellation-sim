import {
  DEFAULT_SAT_MASS_TON,
  STARSHIP_PAYLOAD_TON_BLOCK2,
  STARSHIP_PAYLOAD_TON_REUSABLE,
  STARSHIP_PAYLOAD_TON_REUSABLE_MAX,
  type OdcComputeTierId,
} from "./odcComputeSpec";
import type { LaunchScheduleEntry } from "../model/odcCapacity";

export type OdcLaunchScenarioId =
  | "pilot-2028"
  | "ramp-2030"
  | "moderate"
  | "moderate-2035"
  | "filing-aspirational";

export interface OdcLaunchPhase {
  fromYear: number;
  /** Inclusive; omit for open-ended through scenario endYear. */
  toYear?: number;
  launchesPerYear: number;
  payloadTon: number;
  satMassTon?: number;
  tierId: OdcComputeTierId;
  kwPerSat?: number;
}

export interface OdcLaunchScenario {
  id: OdcLaunchScenarioId;
  label: string;
  description: string;
  startYear: number;
  endYear: number;
  phases: OdcLaunchPhase[];
}

export const ODC_LAUNCH_SCENARIOS: OdcLaunchScenario[] = [
  {
    id: "pilot-2028",
    label: "Pilot 2028",
    description: "4 Starship/yr · 35 t · 10 kW pilot class (Block maturity)",
    startYear: 2028,
    endYear: 2040,
    phases: [
      {
        fromYear: 2028,
        launchesPerYear: 4,
        payloadTon: STARSHIP_PAYLOAD_TON_BLOCK2,
        tierId: "pilot",
      },
    ],
  },
  {
    id: "ramp-2030",
    label: "Ramp 2030 (~weekly)",
    description: "52 launches/yr · 100 t · AI Sat Mini from 2030",
    startYear: 2030,
    endYear: 2045,
    phases: [
      {
        fromYear: 2030,
        launchesPerYear: 52,
        payloadTon: STARSHIP_PAYLOAD_TON_REUSABLE,
        tierId: "mini",
      },
    ],
  },
  {
    id: "moderate",
    label: "Moderate (200/yr)",
    description: "200 launches/yr · 100 t · Mini — analyst mid-case",
    startYear: 2030,
    endYear: 2050,
    phases: [
      {
        fromYear: 2030,
        launchesPerYear: 200,
        payloadTon: STARSHIP_PAYLOAD_TON_REUSABLE,
        tierId: "mini",
      },
    ],
  },
  {
    id: "moderate-2035",
    label: "Moderate ramp → 2035",
    description: "Pilot → 40/yr → 100/yr; demo default through 2035",
    startYear: 2028,
    endYear: 2040,
    phases: [
      {
        fromYear: 2028,
        toYear: 2029,
        launchesPerYear: 6,
        payloadTon: STARSHIP_PAYLOAD_TON_BLOCK2,
        tierId: "pilot",
      },
      {
        fromYear: 2030,
        toYear: 2032,
        launchesPerYear: 40,
        payloadTon: STARSHIP_PAYLOAD_TON_REUSABLE,
        tierId: "mini",
      },
      {
        fromYear: 2033,
        launchesPerYear: 100,
        payloadTon: STARSHIP_PAYLOAD_TON_REUSABLE,
        tierId: "mini",
      },
    ],
  },
  {
    id: "filing-aspirational",
    label: "Filing aspirational",
    description: "~6,700 launches/yr · 150 t · 1 Mt/year → 100 GW/yr (FCC math)",
    startYear: 2030,
    endYear: 2050,
    phases: [
      {
        fromYear: 2030,
        launchesPerYear: 6700,
        payloadTon: STARSHIP_PAYLOAD_TON_REUSABLE_MAX,
        satMassTon: DEFAULT_SAT_MASS_TON,
        tierId: "mini",
      },
    ],
  },
];

export const DEFAULT_ODC_LAUNCH_SCENARIO_ID: OdcLaunchScenarioId = "moderate-2035";

export function odcLaunchScenarioById(id: OdcLaunchScenarioId): OdcLaunchScenario {
  const scenario = ODC_LAUNCH_SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`Unknown ODC launch scenario: ${id}`);
  return scenario;
}

function phaseForYear(scenario: OdcLaunchScenario, year: number): OdcLaunchPhase | null {
  if (year < scenario.startYear || year > scenario.endYear) return null;
  let match: OdcLaunchPhase | null = null;
  for (const phase of scenario.phases) {
    if (year < phase.fromYear) continue;
    if (phase.toYear !== undefined && year > phase.toYear) continue;
    match = phase;
  }
  return match;
}

/** Expand scenario phases into one LaunchScheduleEntry per active year. */
export function expandScenarioSchedule(
  scenario: OdcLaunchScenario,
  options?: { tierOverride?: OdcComputeTierId }
): LaunchScheduleEntry[] {
  const entries: LaunchScheduleEntry[] = [];
  for (let year = scenario.startYear; year <= scenario.endYear; year++) {
    const phase = phaseForYear(scenario, year);
    if (!phase || phase.launchesPerYear <= 0) continue;
    entries.push({
      year,
      launches: phase.launchesPerYear,
      payloadTon: phase.payloadTon,
      satMassTon: phase.satMassTon,
      tierId: options?.tierOverride ?? phase.tierId,
      kwPerSat: phase.kwPerSat,
    });
  }
  return entries;
}

export function expandScenarioScheduleById(id: OdcLaunchScenarioId): LaunchScheduleEntry[] {
  return expandScenarioSchedule(odcLaunchScenarioById(id));
}
