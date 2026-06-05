import * as THREE from "three";
import { orbitRadiusKm } from "../orbits";

/** Equatorial guide rings marking shell altitude min/max per group. */
export function createShellBandGroup(
  minAltKm: number,
  maxAltKm: number,
  color: number,
  exaggeration: number
): THREE.Group {
  const group = new THREE.Group();
  const center = (minAltKm + maxAltKm) / 2;
  const minR = orbitRadiusKm(center + (minAltKm - center) * exaggeration);
  const maxR = orbitRadiusKm(center + (maxAltKm - center) * exaggeration);

  for (const [r, opacity] of [
    [minR, 0.12],
    [maxR, 0.18],
  ] as const) {
    const pts = equatorialRingPoints(r, 128);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    group.add(
      new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity,
        })
      )
    );
  }
  return group;
}

function equatorialRingPoints(radius: number, segments: number): Float32Array {
  const buf = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const o = i * 3;
    buf[o] = radius * Math.cos(a);
    buf[o + 1] = 0;
    buf[o + 2] = radius * Math.sin(a);
  }
  return buf;
}
