import * as THREE from "three";
import { groundTrackPoints, type OrbitalPlane } from "../orbits";

const POLAR_DENSITY_REF = 6000;

/** Ground-track overlay on Earth; polar planes use width/opacity ∝ sats/plane. */
export function createGroundTrackLine(
  plane: OrbitalPlane,
  color: number,
  polarDense: boolean
): THREE.Line {
  const pts = groundTrackPoints(plane);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));

  let opacity = 0.35;
  if (polarDense && plane.inclinationDeg > 85) {
    const density = Math.min(1, plane.nominalSatsPerPlane / POLAR_DENSITY_REF);
    opacity = 0.25 + density * 0.55;
  }

  return new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: true,
    })
  );
}

export function shouldDrawGroundTrack(plane: OrbitalPlane, planesPerShell: number): boolean {
  return plane.inclinationDeg > 85 || planesPerShell <= 4;
}
