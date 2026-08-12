import * as THREE from "three";
import {
  GPU_ELEMENTS_STRIDE,
  lodDisplayCount,
  type RepresentativeSatBuffer,
  type ShellSlotAttributes,
} from "../model/representativeBuffer";
import type { GroupDisplayDeployAttributes } from "../model/odcDeployIndex";

export type { ShellSlotAttributes };

const MAX_SHELL_UNIFORMS = 32;

export interface OdcDeployVisualState {
  enabled: boolean;
  simYear: number;
  deployOrdinalCap: number;
  colorByYear: boolean;
  minYear: number;
  maxYear: number;
}

export const DEFAULT_ODC_DEPLOY_VISUAL: OdcDeployVisualState = {
  enabled: false,
  simYear: 2035,
  deployOrdinalCap: Number.POSITIVE_INFINITY,
  colorByYear: true,
  minYear: 2028,
  maxYear: 2035,
};

export interface OdcManualLaunchVisualState {
  enabled: boolean;
  shellDeployed: Float32Array;
}

export const DEFAULT_MANUAL_LAUNCH_VISUAL: OdcManualLaunchVisualState = {
  enabled: false,
  shellDeployed: new Float32Array(MAX_SHELL_UNIFORMS),
};

const VERT = /* glsl */ `
attribute float aRadius;
attribute float aInc;
attribute float aRaan;
attribute float aM0;
attribute float aN;
attribute float aDeployYear;
attribute float aDeployOrdinal;
attribute float aShellIndex;
attribute float aNominalSlot;

uniform float uTime;
uniform float uPointScale;
uniform float uSimYear;
uniform float uDeployOrdinalCap;
uniform float uMinYear;
uniform float uMaxYear;
uniform float uColorByYear;
uniform float uDeployViz;
uniform float uManualLaunch;
uniform float uShellDeployed[${MAX_SHELL_UNIFORMS}];

varying vec3 vColor;
varying float vAlpha;

void main() {
  if (uManualLaunch > 0.5) {
    int sh = int(aShellIndex + 0.5);
    if (sh >= 0 && sh < ${MAX_SHELL_UNIFORMS}) {
      if (aNominalSlot >= uShellDeployed[sh] - 0.5) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        return;
      }
    }
  } else if (uDeployViz > 0.5) {
    if (aDeployYear < 1.0 || aDeployYear > uSimYear + 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    if (aDeployOrdinal > uDeployOrdinalCap + 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
  }

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
  vAlpha = 0.92;
  if (uDeployViz > 0.5 && uColorByYear > 0.5 && uMaxYear > uMinYear) {
    float t = clamp((aDeployYear - uMinYear) / (uMaxYear - uMinYear), 0.0, 1.0);
    float hue = mix(0.58, 0.08, t);
    vColor = vec3(
      0.55 + 0.45 * sin(hue * 6.28318),
      0.45 + 0.35 * sin(hue * 6.28318 + 2.094),
      0.55 + 0.35 * sin(hue * 6.28318 + 4.188)
    );
    vAlpha = 0.55 + 0.4 * t;
  }
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(uColor * vColor, vAlpha);
}
`;

function emptyShellUniforms(): Float32Array {
  return new Float32Array(MAX_SHELL_UNIFORMS);
}

export class OdcGpuSatLayer {
  readonly mesh: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private displayCount: number;
  private deployVisual = { ...DEFAULT_ODC_DEPLOY_VISUAL };
  private manualVisual = { ...DEFAULT_MANUAL_LAUNCH_VISUAL, shellDeployed: emptyShellUniforms() };

  constructor(
    buffer: RepresentativeSatBuffer,
    color: number,
    pointScale = 1.0,
    deploy?: GroupDisplayDeployAttributes | null,
    shellSlots?: ShellSlotAttributes | null
  ) {
    this.displayCount = buffer.displaySats;
    this.geometry = new THREE.BufferGeometry();
    const el = buffer.elements;
    const interleaved = new THREE.InterleavedBuffer(el, GPU_ELEMENTS_STRIDE);

    this.geometry.setAttribute("aRadius", new THREE.InterleavedBufferAttribute(interleaved, 1, 0));
    this.geometry.setAttribute("aInc", new THREE.InterleavedBufferAttribute(interleaved, 1, 1));
    this.geometry.setAttribute("aRaan", new THREE.InterleavedBufferAttribute(interleaved, 1, 2));
    this.geometry.setAttribute("aM0", new THREE.InterleavedBufferAttribute(interleaved, 1, 3));
    this.geometry.setAttribute("aN", new THREE.InterleavedBufferAttribute(interleaved, 1, 4));

    const yearArr = deploy?.deployYear ?? new Float32Array(buffer.displaySats);
    const ordArr = deploy?.deployOrdinal ?? new Float32Array(buffer.displaySats);
    this.geometry.setAttribute("aDeployYear", new THREE.BufferAttribute(yearArr, 1));
    this.geometry.setAttribute("aDeployOrdinal", new THREE.BufferAttribute(ordArr, 1));

    const shellIdx = shellSlots?.shellIndex ?? new Float32Array(buffer.displaySats);
    const nomSlot = shellSlots?.nominalSlot ?? new Float32Array(buffer.displaySats);
    this.geometry.setAttribute("aShellIndex", new THREE.BufferAttribute(shellIdx, 1));
    this.geometry.setAttribute("aNominalSlot", new THREE.BufferAttribute(nomSlot, 1));

    if (deploy) {
      this.deployVisual.minYear = deploy.minYear;
      this.deployVisual.maxYear = deploy.maxYear;
    }

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uPointScale: { value: pointScale },
        uSimYear: { value: this.deployVisual.simYear },
        uDeployOrdinalCap: { value: this.deployVisual.deployOrdinalCap },
        uMinYear: { value: this.deployVisual.minYear },
        uMaxYear: { value: this.deployVisual.maxYear },
        uColorByYear: { value: 1 },
        uDeployViz: { value: 0 },
        uManualLaunch: { value: 0 },
        uShellDeployed: { value: emptyShellUniforms() },
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

  setDeployAttributes(deploy: GroupDisplayDeployAttributes | null): void {
    const yearAttr = this.geometry.getAttribute("aDeployYear") as THREE.BufferAttribute;
    const ordAttr = this.geometry.getAttribute("aDeployOrdinal") as THREE.BufferAttribute;
    if (deploy && deploy.deployYear.length === yearAttr.count) {
      yearAttr.array.set(deploy.deployYear);
      ordAttr.array.set(deploy.deployOrdinal);
      yearAttr.needsUpdate = true;
      ordAttr.needsUpdate = true;
      this.deployVisual.minYear = deploy.minYear;
      this.deployVisual.maxYear = deploy.maxYear;
    }
  }

  setDeployVisual(state: Partial<OdcDeployVisualState>): void {
    this.deployVisual = { ...this.deployVisual, ...state };
    const u = this.material.uniforms;
    u.uSimYear!.value = this.deployVisual.simYear;
    u.uDeployOrdinalCap!.value = Number.isFinite(this.deployVisual.deployOrdinalCap)
      ? this.deployVisual.deployOrdinalCap
      : 1e12;
    u.uMinYear!.value = this.deployVisual.minYear;
    u.uMaxYear!.value = this.deployVisual.maxYear;
    u.uColorByYear!.value = this.deployVisual.colorByYear ? 1 : 0;
    u.uDeployViz!.value = this.deployVisual.enabled ? 1 : 0;
  }

  setManualLaunchVisual(state: Partial<OdcManualLaunchVisualState>): void {
    this.manualVisual = { ...this.manualVisual, ...state };
    if (state.shellDeployed) {
      this.material.uniforms.uShellDeployed!.value = state.shellDeployed;
    }
    this.material.uniforms.uManualLaunch!.value = this.manualVisual.enabled ? 1 : 0;
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
