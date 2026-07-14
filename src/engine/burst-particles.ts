import * as THREE from 'three';
import { makeStarSprite } from './textures';

const PARTICLE_COUNT = 64;

const vertexShader = `
  attribute float aSize;
  attribute float aLife;
  uniform float uScale;
  uniform float uDpr;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float ps = aSize * uScale / max(-mv.z, 0.1) * (0.5 + 0.5 * aLife);
    gl_PointSize = clamp(ps, 0.0, 30.0 * uDpr);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = `
  precision highp float;
  uniform sampler2D uTex;
  varying float vLife;
  void main() {
    vec4 t = texture2D(uTex, gl_PointCoord);
    gl_FragColor = vec4(vec3(0.8, 0.86, 1.0), t.a * vLife * 0.9);
  }
`;

export class BurstParticles {
  private readonly positions = new Float32Array(PARTICLE_COUNT * 3);
  private readonly velocities = new Float32Array(PARTICLE_COUNT * 3);
  private readonly life = new Float32Array(PARTICLE_COUNT);
  private readonly sizes = new Float32Array(PARTICLE_COUNT);
  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly lifeAttribute: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.lifeAttribute = new THREE.BufferAttribute(this.life, 1);
    this.lifeAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setAttribute('aLife', this.lifeAttribute);
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTex: { value: new THREE.CanvasTexture(makeStarSprite()) },
        uScale: { value: 900 },
        uDpr: { value: 1 },
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

  resize(projectionScale: number, dpr: number): void {
    this.material.uniforms.uScale.value = projectionScale;
    this.material.uniforms.uDpr.value = dpr;
  }

  spawn(x: number, y: number, z: number, radius: number): void {
    for (let index = 0; index < 18; index += 1) {
      const particle = (this.cursor = (this.cursor + 1) % PARTICLE_COUNT);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 0.05 + Math.random() * 0.09;
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.sin(phi) * Math.sin(theta);
      const dz = Math.cos(phi);
      this.positions[particle * 3] = x + dx * radius * 0.85;
      this.positions[particle * 3 + 1] = y + dy * radius * 0.85;
      this.positions[particle * 3 + 2] = z + dz * radius * 0.85;
      this.velocities[particle * 3] = dx * speed;
      this.velocities[particle * 3 + 1] = dy * speed;
      this.velocities[particle * 3 + 2] = dz * speed * 0.6;
      this.life[particle] = 1;
      this.sizes[particle] = 0.05 + Math.random() * 0.08;
    }
    this.positionAttribute.needsUpdate = true;
  }

  update(): void {
    let anyAlive = false;
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      if (this.life[index] <= 0) continue;
      anyAlive = true;
      this.life[index] = Math.max(0, this.life[index] - 0.028);
      this.positions[index * 3] += this.velocities[index * 3];
      this.positions[index * 3 + 1] += this.velocities[index * 3 + 1];
      this.positions[index * 3 + 2] += this.velocities[index * 3 + 2];
      this.velocities[index * 3] *= 0.92;
      this.velocities[index * 3 + 1] *= 0.92;
      this.velocities[index * 3 + 2] *= 0.92;
    }
    if (anyAlive) {
      this.positionAttribute.needsUpdate = true;
      this.lifeAttribute.needsUpdate = true;
    }
  }
}
