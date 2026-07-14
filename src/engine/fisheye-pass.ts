import * as THREE from 'three';
import type { ScreenPoint } from '../data/projects';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform sampler2D uTex;
  uniform float uK;
  uniform float uAspect;
  uniform vec3 uRimColor;
  varying vec2 vUv;
  void main() {
    vec2 off = vUv - 0.5;
    vec2 q = off * vec2(uAspect, 1.0);
    float r2 = dot(q, q);
    float f = 1.0 + uK * r2;
    vec3 col = texture2D(uTex, 0.5 + off * f).rgb;
    float rim = smoothstep(0.60, 1.04, sqrt(r2));
    col = mix(col, uRimColor, rim * 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class FisheyePass {
  private readonly material: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly target = new THREE.WebGLRenderTarget(4, 4, { samples: 4 });
  private aspect: number;
  private distortion: number;

  constructor(aspect: number, distortion: number) {
    this.aspect = aspect;
    this.distortion = distortion;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTex: { value: this.target.texture },
        uK: { value: 0 },
        uAspect: { value: aspect },
        uRimColor: { value: new THREE.Vector3(0.02, 0.03, 0.07) },
      },
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.applyLens();
  }

  setDistortion(distortion: number): void {
    this.distortion = distortion;
    this.applyLens();
  }

  resize(width: number, height: number, dpr: number, renderScale: number): void {
    this.aspect = width / height;
    this.target.setSize(
      Math.max(4, Math.round(width * dpr * renderScale)),
      Math.max(4, Math.round(height * dpr * renderScale)),
    );
    this.applyLens();
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  pointerToNdc(screenU: number, screenV: number, target: THREE.Vector2): void {
    const offsetX = screenU - 0.5;
    const offsetY = 1 - screenV - 0.5;
    const x = offsetX * this.aspect;
    const radiusSquared = x * x + offsetY * offsetY;
    const factor = 1 + -this.distortion * this.aspect * radiusSquared;
    target.set((0.5 + offsetX * factor) * 2 - 1, (0.5 + offsetY * factor) * 2 - 1);
  }

  worldToScreen(
    position: THREE.Vector3,
    camera: THREE.Camera,
    bounds: DOMRect,
  ): ScreenPoint {
    const projected = position.clone().project(camera);
    const projectedX = projected.x / 2;
    const projectedY = projected.y / 2;
    let offsetX = projectedX;
    let offsetY = projectedY;
    const strength = -this.distortion * this.aspect;
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const aspectX = offsetX * this.aspect;
      const factor = 1 + strength * (aspectX * aspectX + offsetY * offsetY);
      offsetX = projectedX / factor;
      offsetY = projectedY / factor;
    }
    return {
      x: bounds.left + (offsetX + 0.5) * bounds.width,
      y: bounds.top + (0.5 - offsetY) * bounds.height,
    };
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }

  private applyLens(): void {
    this.material.uniforms.uK.value = -this.distortion * this.aspect;
    this.material.uniforms.uAspect.value = this.aspect;
  }
}
