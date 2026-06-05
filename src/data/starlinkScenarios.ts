import type { OrbitGroupConfig } from "./groupConfig";
import {
  starlinkDeployedGroups,
  type StarlinkViewMode,
} from "./starlinkDeployed";
import { starlinkGroupsForMode, type StarlinkDeploymentMode } from "./starlinkGen1";
import {
  starlinkGen2GroupsForMode,
  type StarlinkGen2Inc365,
  type StarlinkGen2Mode,
} from "./starlinkGen2";
import { STARLINK_GEN3_PARTIAL } from "./starlinkGen3";
import { starlinkGroupsForView } from "./starlinkDeployed";

export type StarlinkScenarioId = "today" | "gen2-full" | "gen3-partial";

export interface StarlinkScenarioDef {
  id: StarlinkScenarioId;
  label: string;
  description: string;
}

export const STARLINK_SCENARIOS: StarlinkScenarioDef[] = [
  {
    id: "today",
    label: "Today · Jun 2026 operational",
    description: "McDowell operational snapshot — as-deployed shells and counts.",
  },
  {
    id: "gen2-full",
    label: "Full Gen2 filing (nominal)",
    description: "Gen1 as-deployed + complete 29,988-sat Gen2 application shells.",
  },
  {
    id: "gen3-partial",
    label: "Gen3 partial (+ today)",
    description: "Jun 2026 operational constellation plus ~480 planned Gen3 sats (dashed).",
  },
];

export interface ScenarioBuildContext {
  view: StarlinkViewMode;
  snapshotId: string;
  gen1Mode: StarlinkDeploymentMode;
  gen2Mode: StarlinkGen2Mode;
  gen2Inc365: StarlinkGen2Inc365;
}

/** UI / model defaults when a scenario is selected. */
export interface ScenarioApplyHints {
  view: StarlinkViewMode;
  snapshotId: string;
  gen1Mode: StarlinkDeploymentMode;
  gen2Mode: StarlinkGen2Mode;
  gen2Inc365: StarlinkGen2Inc365;
  enableAllStarlink: boolean;
}

export function scenarioApplyHints(scenarioId: StarlinkScenarioId): ScenarioApplyHints {
  switch (scenarioId) {
    case "gen2-full":
      return {
        view: "nominal",
        snapshotId: "2026-06-03",
        gen1Mode: "deployed",
        gen2Mode: "application",
        gen2Inc365: "28",
        enableAllStarlink: false,
      };
    case "gen3-partial":
      return {
        view: "operational",
        snapshotId: "2026-06-03",
        gen1Mode: "deployed",
        gen2Mode: "granted",
        gen2Inc365: "28",
        enableAllStarlink: false,
      };
    default:
      return {
        view: "operational",
        snapshotId: "2026-06-03",
        gen1Mode: "authorized",
        gen2Mode: "granted",
        gen2Inc365: "28",
        enableAllStarlink: false,
      };
  }
}

export function starlinkGroupsForScenario(
  scenarioId: StarlinkScenarioId,
  ctx: ScenarioBuildContext
): OrbitGroupConfig[] {
  switch (scenarioId) {
    case "gen2-full":
      return [
        ...starlinkGroupsForMode("deployed"),
        ...starlinkGen2GroupsForMode("application", ctx.gen2Inc365),
      ];
    case "gen3-partial":
      return [...starlinkDeployedGroups("2026-06-03"), ...STARLINK_GEN3_PARTIAL];
    case "today":
    default:
      return starlinkGroupsForView(ctx.view, ctx.snapshotId, {
        gen1Mode: ctx.gen1Mode,
        gen2Mode: ctx.gen2Mode,
        gen2Inc365: ctx.gen2Inc365,
      });
  }
}

export function scenarioById(id: string): StarlinkScenarioDef | undefined {
  return STARLINK_SCENARIOS.find((s) => s.id === id);
}
