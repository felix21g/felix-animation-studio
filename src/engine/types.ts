import type * as THREE from 'three';
import type { Project } from '../data/projects';

export type RandomSource = () => number;

export interface Point2D {
  x: number;
  y: number;
}

export interface Tile {
  project: Project;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  tgt: THREE.Vector3;
  hx: number;
  hy: number;
  hz: number;
  ph: number;
  fr: number;
  cell: number;
  spin: number;
  spinAngle: number;
  tilt: number;
  s: number;
  sT: number;
  hover: number;
  k: number;
  hidden?: boolean;
}
