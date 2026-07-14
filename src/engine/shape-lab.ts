import * as THREE from 'three';
import type { Project } from '../data/projects';
import { BubbleField, FIELD_FAR } from './bubble-field';
import { BurstParticles } from './burst-particles';
import { FisheyePass } from './fisheye-pass';
import { StarField } from './star-field';
import { makeNebula, mulberry } from './textures';
import type { Point2D } from './types';

const MAX_BUBBLES = 76;
const DEFAULT_PROJECT_COUNT = 12;

const defaultProjects: Project[] = Array.from(
  { length: DEFAULT_PROJECT_COUNT },
  (_, index) => ({
    index,
    slug: `coming-soon-${index + 1}`,
    title: 'Coming soon',
    year: '2026',
    kind: 'In progress',
    desc: 'This project is coming soon. A finished animation will live here — check back shortly.',
  }),
);

class ShapeLab extends HTMLElement {
  private _projects = defaultProjects;
  private _auto = true;
  private _ready = false;
  private _paused = false;
  private _distort = 0.17;
  private _cardSize = 1.75;
  private _flySpeed = 1;
  private _activeN = 52;
  private _openIdx = -1;
  private _booted = false;
  private _raf = 0;
  private _baseFov = 52;
  private _dragZoom = 0;
  private _aspect = 16 / 9;
  private _baseZ = 8;
  private _renderScale = 1;
  private _pointerIn = false;
  private _dragging = false;
  private _lastHoverProject: Project | null = null;
  private _travel = 0;
  private _travelVel = 0;
  private _camOff: Point2D = { x: 0, y: 0 };
  private _panVel: Point2D = { x: 0, y: 0 };
  private _time = 0;
  private _renderer!: THREE.WebGLRenderer;
  private _scene!: THREE.Scene;
  private _camera!: THREE.PerspectiveCamera;
  private _bubbles!: BubbleField;
  private _stars!: StarField;
  private _burst!: BurstParticles;
  private _fisheye!: FisheyePass;
  private _ndc = new THREE.Vector2(2, 2);
  private _resizeObserver?: ResizeObserver;
  private _onFlatten?: (event: CustomEvent<{ flat: boolean }>) => void;

  static get observedAttributes(): string[] {
    return ['distortion', 'cardsize', 'density', 'flyspeed', 'automotion'];
  }

  get projects(): Project[] {
    return this._projects;
  }

  set projects(projects: Project[]) {
    if (!Array.isArray(projects) || !projects.length) return;
    this._projects = projects;
    if (this._bubbles) this._bubbles.setProjects(projects);
  }

  attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
    if (name === 'distortion') {
      const distortion = Number.parseFloat(value ?? '');
      if (!Number.isNaN(distortion)) {
        this._distort = distortion;
        if (this._ready) this._fisheye.setDistortion(distortion);
      }
    } else if (name === 'cardsize') {
      const cardSize = Number.parseFloat(value ?? '');
      if (!Number.isNaN(cardSize)) this._cardSize = cardSize;
    } else if (name === 'flyspeed') {
      const flySpeed = Number.parseFloat(value ?? '');
      if (!Number.isNaN(flySpeed)) this._flySpeed = flySpeed;
    } else if (name === 'density') {
      const density = Number.parseFloat(value ?? '');
      if (!Number.isNaN(density)) {
        this._activeN = Math.max(12, Math.min(MAX_BUBBLES, Math.round(density)));
      }
    } else if (name === 'automotion') {
      this._auto = value !== 'off' && value !== 'false';
    }
  }

  connectedCallback(): void {
    if (this._booted) return;
    this._booted = true;
    this.style.display = 'block';
    this.style.width = '100%';
    this.style.height = '100%';
    this.style.touchAction = 'none';
    this.style.cursor = 'grab';
    this.style.userSelect = 'none';
    this.style.webkitUserSelect = 'none';
    this.initialize();
  }

  disconnectedCallback(): void {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._resizeObserver?.disconnect();
    if (this._onFlatten) window.removeEventListener('sphere:flatten', this._onFlatten);
    this._bubbles?.dispose();
    this._fisheye?.dispose();
    this._renderer?.dispose();
    this._booted = false;
    this._ready = false;
  }

  private initialize(): void {
    THREE.ColorManagement.enabled = false;
    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setClearColor(0x04050a, 1);
    this.appendChild(this._renderer.domElement);
    this._renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';

    this._scene = new THREE.Scene();
    const nebula = new THREE.CanvasTexture(makeNebula());
    nebula.colorSpace = THREE.SRGBColorSpace;
    this._scene.background = nebula;
    this._scene.fog = new THREE.Fog(0x05060c, 16, FIELD_FAR + 6);

    this._camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
    this._aspect = this.clientWidth / this.clientHeight || 16 / 9;
    this._camera.position.set(0, 0, this._baseZ);

    this._stars = new StarField(this._scene, mulberry(11));
    this._burst = new BurstParticles(this._scene);

    const sun = new THREE.DirectionalLight(0xfff1dc, 1.3);
    sun.position.set(-0.55, 0.75, 0.65);
    this._scene.add(sun);
    this._scene.add(new THREE.AmbientLight(0x4a5a8a, 0.72));

    this._bubbles = new BubbleField(this._scene, this._renderer, this._projects, mulberry(11));
    this._fisheye = new FisheyePass(this._aspect, this._distort);

    this._bubbles.seed(0, 0, this._baseZ);
    this.resize();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this);

    this._onFlatten = (event: CustomEvent<{ flat: boolean }>) => {
      const flat = Boolean(event.detail?.flat);
      this._paused = flat;
      if (!flat && this._openIdx >= 0) {
        const tile = this._bubbles.tiles[this._openIdx];
        tile.hidden = false;
        tile.s = 0;
        this._openIdx = -1;
      }
    };
    window.addEventListener('sphere:flatten', this._onFlatten);

    this.bindPointerEvents();
    this._ready = true;
    this.loop = this.loop.bind(this);
    this._raf = requestAnimationFrame(this.loop);
  }

  private resize(): void {
    const width = this.clientWidth;
    const height = this.clientHeight;
    if (!width || !height || width <= 1) {
      requestAnimationFrame(() => {
        if (this._ready !== undefined) this.resize();
      });
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._renderer.setPixelRatio(dpr);
    this._renderer.setSize(width, height, false);
    this._aspect = width / height;
    this._camera.aspect = this._aspect;
    this._camera.updateProjectionMatrix();
    this._fisheye.resize(width, height, dpr, this._renderScale);
    const projectionScale = this._stars.resize(height, dpr, this._renderScale, this._camera.fov);
    this._burst.resize(projectionScale, dpr);
  }

  private bindPointerEvents(): void {
    const pointers = new Map<number, Point2D>();
    let moved = 0;

    const pickAt = (clientX: number, clientY: number) => {
      const bounds = this.getBoundingClientRect();
      this._fisheye.pointerToNdc(
        (clientX - bounds.left) / bounds.width,
        (clientY - bounds.top) / bounds.height,
        this._ndc,
      );
      this._pointerIn = true;
    };

    this.addEventListener(
      'wheel',
      (event) => {
        if (this._paused) return;
        event.preventDefault();
        this._travelVel += event.deltaY * 0.01 * this._flySpeed;
      },
      { passive: false },
    );

    this.addEventListener('pointerdown', (event) => {
      if (this._paused) return;
      try {
        this.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointer events do not have an active pointer to capture.
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        this._dragging = true;
        this.style.cursor = 'grabbing';
        moved = 0;
        this._travelVel *= 0.3;
        pickAt(event.clientX, event.clientY);
      } else {
        moved = 999;
      }
    });

    this.addEventListener('pointermove', (event) => {
      if (pointers.size <= 1) pickAt(event.clientX, event.clientY);
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;

      if (pointers.size === 1) {
        const deltaX = event.clientX - pointer.x;
        const deltaY = event.clientY - pointer.y;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        moved += Math.abs(deltaX) + Math.abs(deltaY);
        this._panVel.x += deltaX * 0.012;
        this._panVel.y -= deltaY * 0.012;
      } else if (pointers.size === 2) {
        const points = Array.from(pointers.values());
        const oldDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const oldCenterX = (points[0].x + points[1].x) / 2;
        const oldCenterY = (points[0].y + points[1].y) / 2;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        const newDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const newCenterX = (points[0].x + points[1].x) / 2;
        const newCenterY = (points[0].y + points[1].y) / 2;
        if (!this._paused) {
          this._travelVel += (newDistance - oldDistance) * 0.006 * this._flySpeed;
          this._panVel.x += (newCenterX - oldCenterX) * 0.012;
          this._panVel.y -= (newCenterY - oldCenterY) * 0.012;
        }
      }
    });

    const release = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (pointers.size > 0) {
        moved = 999;
        return;
      }

      if (this._dragging) {
        this._dragging = false;
        this.style.cursor = 'grab';
        const tapSlop = event.pointerType === 'touch' ? 9 : 4;
        if (moved < tapSlop && !this._paused) {
          pickAt(event.clientX, event.clientY);
          const hit = this._bubbles.raycast(this._ndc, this._camera);
          if (hit >= 0) {
            this._travelVel = 0;
            const tile = this._bubbles.tiles[hit];
            this._openIdx = hit;
            tile.hidden = true;
            this._burst.spawn(tile.pos.x, tile.pos.y, tile.pos.z, tile.s * 0.5);
            const screen = this._fisheye.worldToScreen(
              tile.pos,
              this._camera,
              this.getBoundingClientRect(),
            );
            window.dispatchEvent(
              new CustomEvent('sphere:open', { detail: { ...tile.project, screen } }),
            );
          }
        }
      }

      if (event.pointerType === 'touch') {
        this._pointerIn = false;
        this._ndc.set(2, 2);
      }
    };

    this.addEventListener('pointerup', release);
    this.addEventListener('pointercancel', release);
    this.addEventListener('pointerleave', () => {
      this._pointerIn = false;
    });
  }

  private loop(): void {
    this._raf = requestAnimationFrame(this.loop);
    this._time += 1 / 60;

    if (this._paused) {
      this._travelVel *= 0.75;
      this._panVel.x *= 0.75;
      this._panVel.y *= 0.75;
    } else if (this._auto && !this._dragging && Math.abs(this._travelVel) < 0.012) {
      this._travelVel += 0.006 * this._flySpeed;
    }
    this._travel += this._travelVel;
    this._travelVel *= 0.9;

    this._camOff.x += this._panVel.x;
    this._camOff.y += this._panVel.y;
    this._panVel.x *= 0.86;
    this._panVel.y *= 0.86;

    const zoomTarget = this._dragging && !this._paused ? 1 : 0;
    this._dragZoom += (zoomTarget - this._dragZoom) * 0.09;
    const fov = this._baseFov + this._dragZoom * 11;
    if (Math.abs(this._camera.fov - fov) > 0.005) {
      this._camera.fov = fov;
      this._camera.updateProjectionMatrix();
    }

    const cameraZ = this._baseZ - this._travel;
    const cameraX = this._camOff.x;
    const cameraY = this._camOff.y;
    this._camera.position.set(cameraX, cameraY, cameraZ);
    this._camera.lookAt(cameraX, cameraY, cameraZ - 12);

    this._stars.update(this._time, cameraX, cameraY, cameraZ);
    this._burst.update();
    this._bubbles.updateTargets(
      cameraX,
      cameraY,
      cameraZ,
      this._time,
      this._activeN,
      this._cardSize,
    );

    let hoveredIndex = -1;
    if (this._pointerIn && !this._paused) {
      hoveredIndex = this._bubbles.raycast(this._ndc, this._camera);
    }
    const hoveredProject = hoveredIndex >= 0 ? this._bubbles.tiles[hoveredIndex].project : null;
    if (hoveredProject !== this._lastHoverProject) {
      this._lastHoverProject = hoveredProject;
      window.dispatchEvent(new CustomEvent('sphere:hover', { detail: hoveredProject }));
    }

    this._bubbles.writeMatrices(hoveredIndex);
    this.style.cursor =
      hoveredIndex >= 0 && !this._dragging
        ? 'pointer'
        : this._dragging
          ? 'grabbing'
          : 'grab';
    this._fisheye.render(this._renderer, this._scene, this._camera);
  }
}

if (!customElements.get('shape-lab')) customElements.define('shape-lab', ShapeLab);
