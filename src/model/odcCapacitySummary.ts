import type { OdcLaunchScenario } from "../data/odcLaunchScenarios";
import { ODC_NOMINAL_TOTAL } from "../data/odcGroups";
import {
  formatComputeTflops,
  formatGw,
  formatRubinMultiple,
  type OdcDeploymentSimulation,
} from "./odcDeployment";
import {
  capacityDeltaSincePriorYear,
  cappedSatsThroughYear,
  effectiveSnapshot,
  groupEffectiveCapacities,
  weightedSunDuty,
} from "./odcSunDuty";
import { snapshotAtYear } from "./odcDeployment";

export function buildOdcCapacitySummaryText(
  scenario: OdcLaunchScenario,
  sim: OdcDeploymentSimulation,
  throughYear: number
): string {
  const snap = snapshotAtYear(sim, throughYear);
  const eff = effectiveSnapshot(snap, sim.deployment);
  const duty = weightedSunDuty(sim.deployment);
  const yearDelta = capacityDeltaSincePriorYear(sim, throughYear);
  const capped = cappedSatsThroughYear(sim, throughYear);
  const pct = ((snap.deployedSats / ODC_NOMINAL_TOTAL) * 100).toFixed(2);

  const lines = [
    `ODC Compute — ${scenario.label} @ ${throughYear}`,
    `Deployed: ${snap.deployedSats.toLocaleString()} / ${ODC_NOMINAL_TOTAL.toLocaleString()} (${pct}% of filing cap)`,
    `Power (nominal): ${formatGw(snap.powerGw)}`,
    `Power (sun-effective, ${(duty * 100).toFixed(0)}% avg duty): ${formatGw(eff.powerGw)}`,
    `Compute (nominal): ${formatComputeTflops(snap.computeTflops)} · ${formatRubinMultiple(snap.rubinMultiple)}`,
    `Compute (sun-effective): ${formatComputeTflops(eff.computeTflops)} · ${formatRubinMultiple(eff.rubinMultiple)}`,
    `In ${throughYear}: +${yearDelta.sats.toLocaleString()} sats · +${formatGw(yearDelta.powerGw)} · +${formatComputeTflops(yearDelta.computeTflops)}`,
  ];

  if (capped > 0) {
    lines.push(`Capped at filing limit (through ${throughYear}): ${capped.toLocaleString()} sats`);
  }

  const groups = groupEffectiveCapacities(snap, sim.deployment);
  if (groups.length > 0) {
    lines.push("", "By group (sun-effective compute):");
    for (const g of groups) {
      const dutyPct = (g.sunDuty * 100).toFixed(0);
      lines.push(
        `  ${g.name}: ${g.deployedSats.toLocaleString()} sats · ${dutyPct}% sun · ${formatComputeTflops(g.effectiveComputeTflops)}`
      );
    }
  }

  lines.push("", scenario.description);
  return lines.join("\n");
}

/** Compact lines for PNG screenshot overlay. */
export function buildOdcCapacityOverlayLines(
  scenario: OdcLaunchScenario,
  sim: OdcDeploymentSimulation,
  throughYear: number,
  tierLabel?: string
): string[] {
  const snap = snapshotAtYear(sim, throughYear);
  const eff = effectiveSnapshot(snap, sim.deployment);
  const duty = weightedSunDuty(sim.deployment);
  const tierNote = tierLabel ? ` · ${tierLabel}` : "";
  return [
    `ODC · ${scenario.label} @ ${throughYear}${tierNote}`,
    `${snap.deployedSats.toLocaleString()} sats · ${formatGw(snap.powerGw)} · ${formatComputeTflops(snap.computeTflops)} (${formatRubinMultiple(snap.rubinMultiple)})`,
    `Sun-effective (${(duty * 100).toFixed(0)}% duty): ${formatGw(eff.powerGw)} · ${formatComputeTflops(eff.computeTflops)}`,
  ];
}
