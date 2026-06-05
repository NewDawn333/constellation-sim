import * as THREE from "three";
import type { OrbitGroupConfig } from "../data/groupConfig";
import { orbitRadiusKm, shellInclinationDeg } from "../orbits";

/** Per-shell min/max altitude rings (physical shell thickness in filing). */
export function createPerShellBandGroup(
  g: OrbitGroupConfig,
  color: number,
  exaggeration: number
): THREE.Group {
  const group = new THREE.Group();
  const [lo, hi] = g.altitudeKm;
  const span = hi - lo;
  const thicknessKm = g.shells > 1 ? Math.min(50, Math.max(18, span / g.shells)) : span;

  for (let sh = 0; sh < g.shells; sh++) {
    const center = g.shells <= 1 ? (lo + hi) / 2 : lo + (sh / (g.shells - 1)) * span;
    const half = thicknessKm / 2;
    const minAlt = center - half;
    const maxAlt = center + half;
    const mid = (lo + hi) / 2;
    const minR = orbitRadiusKm(mid + (minAlt - mid) * exaggeration);
    const maxR = orbitRadiusKm(mid + (maxAlt - mid) * exaggeration);
    const incDeg = shellInclinationDeg(g.inclinationDeg, sh, g.shells);
    const opacity = 0.06 + (sh / Math.max(1, g.shells - 1)) * 0.1;

    for (const r of [minR, maxR]) {
      const pts = inclinedRingPoints(r, incDeg, 64);
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
  }

  return group;
}

function inclinedRingPoints(radius: number, incDeg: number, segments: number): Float32Array {
  const incRad = (incDeg * Math.PI) / 180;
  const buf = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const nu = (i / segments) * Math.PI * 2;
    const xo = radius * Math.cos(nu);
    const yo = radius * Math.sin(nu);
    const eciX = xo;
    const eciZ = yo * Math.sin(incRad);
    const eciYrot = yo * Math.cos(incRad);
    buf[i * 3] = eciX;
    buf[i * 3 + 1] = eciZ;
    buf[i * 3 + 2] = -eciYrot;
  }
  return buf;
}
