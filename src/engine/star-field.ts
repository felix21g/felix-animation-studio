import * as THREE from 'three';
import { makeStarSprite } from './textures';
import type { RandomSource } from './types';

const STAR_COUNT = 1200;
const HALF_WIDTH = 80;
const HALF_HEIGHT = 54;
const HALF_DEPTH = 80;

const vertexShader = `
  attribute float aSize;
  attribute float aBright;
  attribute float aTw;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uScale;
  uniform float uDpr;
  varying float vBright;
  varying vec3 vColor;
  varying float vFog;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 0.6 + 0.4 * sin(uTime * (0.8 + aTw * 2.5) + aTw * 40.0);
    vBright = aBright * mix(0.7, 1.0, tw);
    vColor = aColor;
    vFog = -mv.z;
    float ps = aSize * uScale / max(-mv.z, 0.1);
    gl_PointSize = clamp(ps, 1.0, 46.0 * uDpr);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = `
  precision highp float;
  uniform sampler2D uTex;
  uniform float uFogNear;
  uniform float uFogFar;
  varying float vBright;
  varying vec3 vColor;
  varying float vFog;
  void main() {
    vec4 t = texture2D(uTex, gl_PointCoord);
    float f = clamp((uFogFar - vFog) / (uFogFar - uFogNear), 0.0, 1.0);
    float a = t.a * vBright * f;
    gl_FragColor = vec4(t.rgb * vColor, a);
  }
`;

export class StarField {
  private readonly basePositions = new Float32Array(STAR_COUNT * 3);
  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, random: RandomSource) {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    const brightness = new Float32Array(STAR_COUNT);
    const twinkle = new Float32Array(STAR_COUNT);

    for (let index = 0; index < STAR_COUNT; index += 1) {
      const x = (random() - 0.5) * 2 * HALF_WIDTH;
      const y = (random() - 0.5) * 2 * HALF_HEIGHT;
      const z = (random() - 0.5) * 2 * HALF_DEPTH;
      this.basePositions[index * 3] = positions[index * 3] = x;
      this.basePositions[index * 3 + 1] = positions[index * 3 + 1] = y;
      this.basePositions[index * 3 + 2] = positions[index * 3 + 2] = z;

      const tint = random();
      let red = 1;
      let green = 1;
      let blue = 1;
      if (tint > 0.82) [red, green, blue] = [0.72, 0.82, 1];
      else if (tint > 0.72) [red, green, blue] = [0.86, 0.9, 1];
      else if (tint > 0.64) [red, green, blue] = [1, 0.93, 0.78];
      colors[index * 3] = red;
      colors[index * 3 + 1] = green;
      colors[index * 3 + 2] = blue;

      const sizeGroup = random();
      if (sizeGroup > 0.975) {
        sizes[index] = 0.3 + random() * 0.22;
        brightness[index] = 1;
      } else if (sizeGroup > 0.86) {
        sizes[index] = 0.16 + random() * 0.1;
        brightness[index] = 0.9;
      } else {
        sizes[index] = 0.055 + random() * 0.075;
        brightness[index] = 0.5 + random() * 0.35;
      }
      twinkle[index] = random();
    }

    const geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(positions, 3);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aBright', new THREE.BufferAttribute(brightness, 1));
    geometry.setAttribute('aTw', new THREE.BufferAttribute(twinkle, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTex: { value: new THREE.CanvasTexture(makeStarSprite()) },
        uTime: { value: 0 },
        uScale: { value: 900 },
        uDpr: { value: 1 },
        uFogNear: { value: 16 },
        uFogFar: { value: 68 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });

    const points = new THREE.Points(geometry, this.material);
    points.frustumCulled = false;
    scene.add(points);
  }

  resize(height: number, dpr: number, renderScale: number, fov: number): number {
    const heightInPixels = height * dpr * renderScale;
    const projectionScale = heightInPixels / (2 * Math.tan((fov * Math.PI) / 360));
    this.material.uniforms.uScale.value = projectionScale;
    this.material.uniforms.uDpr.value = dpr;
    return projectionScale;
  }

  update(time: number, cameraX: number, cameraY: number, cameraZ: number): void {
    this.material.uniforms.uTime.value = time;
    const positions = this.positionAttribute.array;
    for (let index = 0; index < STAR_COUNT; index += 1) {
      let x = this.basePositions[index * 3] - cameraX;
      x = ((x + HALF_WIDTH) % (2 * HALF_WIDTH) + 2 * HALF_WIDTH) % (2 * HALF_WIDTH) - HALF_WIDTH;
      let y = this.basePositions[index * 3 + 1] - cameraY;
      y = ((y + HALF_HEIGHT) % (2 * HALF_HEIGHT) + 2 * HALF_HEIGHT) % (2 * HALF_HEIGHT) - HALF_HEIGHT;
      let z = this.basePositions[index * 3 + 2] - cameraZ;
      z = ((z + HALF_DEPTH) % (2 * HALF_DEPTH) + 2 * HALF_DEPTH) % (2 * HALF_DEPTH) - HALF_DEPTH;
      positions[index * 3] = cameraX + x;
      positions[index * 3 + 1] = cameraY + y;
      positions[index * 3 + 2] = cameraZ + z;
    }
    this.positionAttribute.needsUpdate = true;
  }
}
