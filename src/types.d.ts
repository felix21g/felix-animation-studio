import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { Project, ProjectOpenDetail } from './data/projects';

declare global {
  interface ShapeLabElement extends HTMLElement {
    projects: Project[];
  }

  interface WindowEventMap {
    'sphere:flatten': CustomEvent<{ flat: boolean }>;
    'sphere:hover': CustomEvent<Project | null>;
    'sphere:open': CustomEvent<ProjectOpenDetail>;
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'shape-lab': DetailedHTMLProps<HTMLAttributes<ShapeLabElement>, ShapeLabElement> & {
        distortion?: string;
        cardsize?: string;
        density?: string;
        flyspeed?: string;
        automotion?: 'on' | 'off';
      };
    }
  }
}

export {};
