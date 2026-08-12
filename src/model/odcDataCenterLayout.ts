/** Along-track spacing within one Starship launch batch (~tight cluster). */
export const ODC_INTRA_LAUNCH_SPACING_KM = 55;

/** Gap between successive launch batches on the same orbital plane. */
export const ODC_INTER_LAUNCH_GAP_KM = 120;

const R_EARTH_KM = 6371;

export function kmAlongTrackToMeanAnomaly(km: number, altitudeKm: number): number {
  const orbitRadiusKm = R_EARTH_KM + altitudeKm;
  return km / orbitRadiusKm;
}

/**
 * ODC deploys as a along-track data-center chain on one plane — not Walker spread.
 * Each launch adds a dense batch; batches string together with a small gap.
 */
export function buildOdcDataCenterSatellites(
  totalDeployed: number,
  satsPerLaunch: number,
  altitudeKm: number,
  shellPhaseRad = 0
): { meanAnomaly0: number }[] {
  if (totalDeployed <= 0 || satsPerLaunch <= 0) return [];

  const intra = kmAlongTrackToMeanAnomaly(ODC_INTRA_LAUNCH_SPACING_KM, altitudeKm);
  const gap = kmAlongTrackToMeanAnomaly(ODC_INTER_LAUNCH_GAP_KM, altitudeKm);
  const out: { meanAnomaly0: number }[] = [];
  let nu = shellPhaseRad;
  let placed = 0;
  let launchIndex = 0;

  while (placed < totalDeployed) {
    if (launchIndex > 0) nu += gap;
    const batch = Math.min(satsPerLaunch, totalDeployed - placed);
    for (let i = 0; i < batch; i++) {
      out.push({ meanAnomaly0: nu });
      nu += intra;
      placed++;
    }
    launchIndex++;
  }

  return out;
}
