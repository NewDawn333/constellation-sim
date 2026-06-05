import * as THREE from "three";

/**
 * Bundled equirectangular Earth maps (public/textures/earth/).
 * Day + night imagery derived from NASA Blue Marble / Black Marble (public domain).
 * Bump from Natural Earth topography (via three-globe example assets).
 */
const TEXTURE_BASE = "/textures/earth/";

export interface EarthTextureSet {
  dayMap: THREE.Texture;
  nightMap: THREE.Texture;
  bumpMap: THREE.Texture;
}

function tuneColorMap(tex: THREE.Texture, renderer: THREE.WebGLRenderer): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
}

function tuneDataMap(tex: THREE.Texture, renderer: THREE.WebGLRenderer): void {
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
}

/** Load high-resolution Earth surface maps for the globe mesh. */
export async function loadEarthTextures(renderer: THREE.WebGLRenderer): Promise<EarthTextureSet> {
  const loader = new THREE.TextureLoader();
  const [dayMap, nightMap, bumpMap] = await Promise.all([
    loader.loadAsync(`${TEXTURE_BASE}day.jpg`),
    loader.loadAsync(`${TEXTURE_BASE}night.jpg`),
    loader.loadAsync(`${TEXTURE_BASE}topology.png`),
  ]);

  tuneColorMap(dayMap, renderer);
  tuneColorMap(nightMap, renderer);
  tuneDataMap(bumpMap, renderer);

  return { dayMap, nightMap, bumpMap };
}
