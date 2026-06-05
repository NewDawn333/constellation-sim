import * as THREE from "three";
import { loadEarthTextures, type EarthTextureSet } from "../earthTexture";

/** Align equirectangular lon 0° (Greenwich) with Three.js +X equator point. */
export const EARTH_MESH_Y_ROTATION = -Math.PI / 2;

export interface EarthScene {
  group: THREE.Group;
  sunLight: THREE.DirectionalLight;
  /** true = terminator + city lights; false = evenly lit day map everywhere. */
  setDayNight: (enabled: boolean) => void;
}

function buildEarthMaterial(maps: EarthTextureSet): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: maps.dayMap,
    bumpMap: maps.bumpMap,
    bumpScale: 0.035,
    roughness: 0.88,
    metalness: 0.02,
    emissiveMap: maps.nightMap,
    emissive: new THREE.Color(0x557799),
    emissiveIntensity: 0.65,
  });
}

export async function createEarthScene(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene
): Promise<EarthScene> {
  const group = new THREE.Group();
  const maps = await loadEarthTextures(renderer);
  const earthMaterial = buildEarthMaterial(maps);

  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), earthMaterial);
  earth.rotation.y = EARTH_MESH_Y_ROTATION;
  group.add(earth);

  const atmos = new THREE.Mesh(
    new THREE.SphereGeometry(1.018, 64, 32),
    new THREE.MeshPhongMaterial({
      color: 0x88c4ff,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  atmos.rotation.y = EARTH_MESH_Y_ROTATION;
  group.add(atmos);

  const sunLight = new THREE.DirectionalLight(0xfff5e8, 2.4);
  sunLight.position.set(4.5, 1.2, 2.8);

  const fillLight = new THREE.DirectionalLight(0xb8d4ff, 0);
  fillLight.position.set(-3.8, 0.6, -2.2);

  const ambient = new THREE.AmbientLight(0x3a5070, 0.38);
  const hemi = new THREE.HemisphereLight(0x9ec8ff, 0x2a3548, 0.48);

  scene.add(ambient, hemi, fillLight);

  let dayNight = true;

  function applyLighting(): void {
    if (dayNight) {
      earthMaterial.emissiveMap = maps.nightMap;
      earthMaterial.emissive.set(0x557799);
      earthMaterial.emissiveIntensity = 0.65;
      sunLight.intensity = 2.4;
      fillLight.intensity = 0;
      ambient.intensity = 0.38;
      hemi.intensity = 0.48;
    } else {
      // Self-lit day map at full albedo + gentle fill so the whole globe reads as daytime.
      earthMaterial.emissiveMap = maps.dayMap;
      earthMaterial.emissive.set(0xffffff);
      earthMaterial.emissiveIntensity = 1.0;
      sunLight.intensity = 0.55;
      fillLight.intensity = 0.55;
      ambient.intensity = 0.45;
      hemi.intensity = 0.4;
    }
  }

  function setDayNight(enabled: boolean): void {
    dayNight = enabled;
    applyLighting();
  }

  return { group, sunLight, setDayNight };
}
