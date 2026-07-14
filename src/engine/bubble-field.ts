import * as THREE from 'three';
import type { Project } from '../data/projects';
import { makePlaceholderTexture } from './textures';
import type { RandomSource, Tile } from './types';

export const FIELD_NEAR = 3;
export const FIELD_FAR = 48;

const MAX_BUBBLES = 76;
const PROJECT_COUNT = 12;
const FADE_NEAR = 3.5;
const FADE_FAR = 14;
const HALF_WIDTH = 32;
const HALF_HEIGHT = 19;
const FADE_LATERAL = 6;

const vertexShader = `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    #ifdef USE_INSTANCING
    mat4 im = instanceMatrix;
    #else
    mat4 im = mat4(1.0);
    #endif
    vN = normalize(mat3(modelViewMatrix * im) * normal);
    vec4 mv = modelViewMatrix * im * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uLightDir;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(vV);
    float ndv = max(dot(N, V), 0.0);
    float fres = pow(1.0 - ndv, 2.6);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 48.0);
    vec3 col = uColor + fres * vec3(0.42, 0.48, 0.6) + spec * 0.9;
    float alpha = clamp(0.07 + fres * 0.82 + spec * 0.55, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

export class BubbleField {
  readonly tiles: Tile[] = [];
  private projects: Project[];
  private readonly random: RandomSource;
  private readonly mesh: THREE.InstancedMesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly dummy = new THREE.Object3D();
  private readonly raycaster = new THREE.Raycaster();
  private readonly textures: THREE.CanvasTexture[] = [];
  private projectCursor = 0;

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    projects: Project[],
    random: RandomSource,
  ) {
    this.projects = projects;
    this.random = random;

    for (let index = 0; index < PROJECT_COUNT; index += 1) {
      const texture = new THREE.CanvasTexture(makePlaceholderTexture(index + 3));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      this.textures.push(texture);
    }

    const geometry = new THREE.SphereGeometry(0.5, 40, 28);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uColor: { value: new THREE.Vector3(0.3, 0.36, 0.5) },
        uLightDir: { value: new THREE.Vector3(-0.4, 0.55, 0.85) },
      },
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.NormalBlending,
      side: THREE.FrontSide,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_BUBBLES);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    const zeroMatrix = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    for (let index = 0; index < MAX_BUBBLES; index += 1) {
      const cell = index % PROJECT_COUNT;
      this.mesh.setMatrixAt(index, zeroMatrix);
      this.tiles.push({
        project: this.projects[cell % this.projects.length],
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        tgt: new THREE.Vector3(),
        hx: 0,
        hy: 0,
        hz: -20,
        ph: 0,
        fr: 0.35,
        cell,
        spin: (this.random() - 0.5) * 0.012,
        spinAngle: this.random() * 6.28,
        tilt: (this.random() - 0.5) * 0.6,
        s: 0,
        sT: 0,
        hover: 0,
        k: 0.1,
      });
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setProjects(projects: Project[]): void {
    if (!projects.length) return;
    this.projects = projects;
    for (const tile of this.tiles) tile.project = projects[tile.cell % projects.length];
  }

  seed(cameraX: number, cameraY: number, cameraZ: number): void {
    for (const tile of this.tiles) {
      tile.hz = cameraZ - (FIELD_NEAR + this.random() * (FIELD_FAR - FIELD_NEAR));
      tile.hx = cameraX + (this.random() - 0.5) * 2 * HALF_WIDTH;
      tile.hy = cameraY + (this.random() - 0.5) * 2 * HALF_HEIGHT;
      tile.ph = this.random() * Math.PI * 2;
      tile.fr = 0.3 + this.random() * 0.4;
      tile.pos.set(tile.hx, tile.hy, tile.hz);
      tile.vel.set(0, 0, 0);
      tile.s = 0;
    }
  }

  updateTargets(
    cameraX: number,
    cameraY: number,
    cameraZ: number,
    time: number,
    activeCount: number,
    bubbleSize: number,
  ): void {
    for (let index = 0; index < MAX_BUBBLES; index += 1) {
      const tile = this.tiles[index];
      if (index >= activeCount) {
        tile.sT = 0;
        continue;
      }

      let recycled = false;
      let depth = cameraZ - tile.hz;
      if (depth < FIELD_NEAR) {
        tile.hz = cameraZ - FIELD_FAR;
        this.reseedPosition(tile, cameraX, cameraY);
        this.reproject(tile);
        recycled = true;
      } else if (depth > FIELD_FAR) {
        tile.hz = cameraZ - FIELD_NEAR;
        this.reseedPosition(tile, cameraX, cameraY);
        this.reproject(tile);
        recycled = true;
      }

      let lateralX = tile.hx - cameraX;
      let lateralY = tile.hy - cameraY;
      if (lateralX > HALF_WIDTH) {
        tile.hx -= 2 * HALF_WIDTH;
        recycled = true;
      } else if (lateralX < -HALF_WIDTH) {
        tile.hx += 2 * HALF_WIDTH;
        recycled = true;
      }
      if (lateralY > HALF_HEIGHT) {
        tile.hy -= 2 * HALF_HEIGHT;
        recycled = true;
      } else if (lateralY < -HALF_HEIGHT) {
        tile.hy += 2 * HALF_HEIGHT;
        recycled = true;
      }

      depth = cameraZ - tile.hz;
      lateralX = tile.hx - cameraX;
      lateralY = tile.hy - cameraY;
      const nearVisibility = Math.min(1, Math.max(0, (depth - FIELD_NEAR) / FADE_NEAR));
      const farVisibility = Math.min(1, Math.max(0, (FIELD_FAR - depth) / FADE_FAR));
      const xVisibility = Math.min(1, Math.max(0, (HALF_WIDTH - Math.abs(lateralX)) / FADE_LATERAL));
      const yVisibility = Math.min(1, Math.max(0, (HALF_HEIGHT - Math.abs(lateralY)) / FADE_LATERAL));

      tile.tgt.set(
        tile.hx + Math.sin(time * tile.fr + tile.ph) * 0.4,
        tile.hy + Math.cos(time * tile.fr * 0.8 + tile.ph * 2) * 0.32,
        tile.hz,
      );
      tile.sT = bubbleSize * nearVisibility * farVisibility * xVisibility * yVisibility;
      if (tile.hidden) tile.sT = 0;
      if (recycled) {
        tile.pos.copy(tile.tgt);
        tile.vel.set(0, 0, 0);
        tile.s = 0;
      }
    }

    for (const tile of this.tiles) {
      if (!Number.isFinite(tile.pos.x + tile.pos.y + tile.pos.z)) {
        tile.pos.copy(tile.tgt);
        tile.vel.set(0, 0, 0);
      }
    }
  }

  raycast(ndc: THREE.Vector2, camera: THREE.Camera): number {
    if (ndc.x < -1 || ndc.x > 1) return -1;
    this.raycaster.setFromCamera(ndc, camera);
    this.mesh.boundingSphere = null;
    const intersections = this.raycaster.intersectObject(this.mesh, false);
    for (const intersection of intersections) {
      const index = intersection.instanceId;
      if (index != null && this.tiles[index]?.s > 0.5) return index;
    }
    return -1;
  }

  writeMatrices(hoveredIndex: number): void {
    for (let index = 0; index < MAX_BUBBLES; index += 1) {
      const tile = this.tiles[index];
      tile.vel.x += (tile.tgt.x - tile.pos.x) * tile.k;
      tile.vel.y += (tile.tgt.y - tile.pos.y) * tile.k;
      tile.vel.z += (tile.tgt.z - tile.pos.z) * tile.k;
      tile.vel.multiplyScalar(0.76);
      tile.pos.add(tile.vel);
      tile.hover += ((index === hoveredIndex ? 1 : 0) - tile.hover) * 0.14;
      const targetScale = tile.sT * (1 + tile.hover * 0.1);
      tile.s += (targetScale - tile.s) * (tile.hidden ? 0.32 : 0.12);
      const scale = Math.max(tile.s, 0.0001);
      tile.spinAngle += tile.spin;
      this.dummy.position.set(
        tile.pos.x,
        tile.pos.y,
        tile.pos.z + (tile.hover > 0.01 ? tile.hover * 0.6 : 0),
      );
      this.dummy.rotation.set(tile.tilt, tile.spinAngle, 0);
      this.dummy.scale.set(scale, scale, scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    for (const texture of this.textures) texture.dispose();
  }

  private reproject(tile: Tile): void {
    const cell = this.projectCursor % PROJECT_COUNT;
    this.projectCursor += 1;
    tile.project = this.projects[cell % this.projects.length];
    tile.cell = cell;
  }

  private reseedPosition(tile: Tile, cameraX: number, cameraY: number): void {
    tile.hx = cameraX + (this.random() - 0.5) * 2 * HALF_WIDTH;
    tile.hy = cameraY + (this.random() - 0.5) * 2 * HALF_HEIGHT;
    tile.ph = this.random() * Math.PI * 2;
    tile.fr = 0.3 + this.random() * 0.4;
    tile.tilt = (this.random() - 0.5) * 0.6;
    tile.spin = (this.random() - 0.5) * 0.012;
  }
}
