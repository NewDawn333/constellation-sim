import * as THREE from "three";
import {
  GPU_ELEMENTS_STRIDE,
  lodDisplayCount,
  type RepresentativeSatBuffer,
} from "../model/representativeBuffer";

const VERT = /* glsl */ `
attribute float aRadius;
attribute float aInc;
attribute float aRaan;
attribute float aM0;
attribute float aN;

uniform float uTime;
uniform float uPointScale;

varying vec3 vColor;

void main() {
  float nu = aM0 + aN * uTime;
  float xo = aRadius * cos(nu);
  float yo = aRadius * sin(nu);
  float cO = cos(aRaan);
  float sO = sin(aRaan);
  float cI = cos(aInc);
  float sI = sin(aInc);
  float eciX = cO * xo - sO * cI * yo;
  float eciY = sO * xo + cO * cI * yo;
  float eciZ = sI * yo;
  vec3 pos = vec3(eciX, eciZ, -eciY);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPointScale * (220.0 / -mv.z);
  vColor = vec3(1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec3 vColor;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(uColor * vColor, 0.92);
}
`;

export class OdcGpuSatLayer {
  readonly mesh: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private displayCount: number;

  constructor(buffer: RepresentativeSatBuffer, color: number, pointScale = 1.0) {
    this.displayCount = buffer.displaySats;
    this.geometry = new THREE.BufferGeometry();
    const el = buffer.elements;
    const interleaved = new THREE.InterleavedBuffer(el, GPU_ELEMENTS_STRIDE);

    this.geometry.setAttribute("aRadius", new THREE.InterleavedBufferAttribute(interleaved, 1, 0));
    this.geometry.setAttribute("aInc", new THREE.InterleavedBufferAttribute(interleaved, 1, 1));
    this.geometry.setAttribute("aRaan", new THREE.InterleavedBufferAttribute(interleaved, 1, 2));
    this.geometry.setAttribute("aM0", new THREE.InterleavedBufferAttribute(interleaved, 1, 3));
    this.geometry.setAttribute("aN", new THREE.InterleavedBufferAttribute(interleaved, 1, 4));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uPointScale: { value: pointScale },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: true,
    });

    this.mesh = new THREE.Points(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  setVisible(on: boolean): void {
    this.mesh.visible = on;
  }

  update(simTime: number, cameraDistance: number, autoLod: boolean): number {
    this.material.uniforms.uTime!.value = simTime;
    const count = lodDisplayCount(this.displayCount, cameraDistance, autoLod);
    this.geometry.setDrawRange(0, count);
    return count;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export function cameraSceneDistance(camera: THREE.Camera): number {
  return camera.position.length();
}
