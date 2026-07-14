export function mulberry(seed: number): () => number {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNebula(): HTMLCanvasElement {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;

  context.fillStyle = '#04050A';
  context.fillRect(0, 0, size, size);

  const blob = (x: number, y: number, radius: number, color: string, alpha: string) => {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color.replace('ALPHA', alpha));
    gradient.addColorStop(1, color.replace('ALPHA', '0'));
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  };

  blob(size * 0.46, size * 0.4, size * 0.62, 'rgba(28,36,74,ALPHA)', '0.9');
  blob(size * 0.72, size * 0.66, size * 0.42, 'rgba(46,32,78,ALPHA)', '0.55');
  blob(size * 0.24, size * 0.72, size * 0.4, 'rgba(20,44,72,ALPHA)', '0.45');
  blob(size * 0.6, size * 0.2, size * 0.3, 'rgba(58,44,86,ALPHA)', '0.35');
  return canvas;
}

export function makeStarSprite(): HTMLCanvasElement {
  const size = 128;
  const center = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;

  const glow = context.createRadialGradient(center, center, 0, center, center, center);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.13, 'rgba(255,255,255,0.95)');
  glow.addColorStop(0.32, 'rgba(255,255,255,0.4)');
  glow.addColorStop(0.7, 'rgba(255,255,255,0.07)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);

  context.globalCompositeOperation = 'lighter';
  const horizontal = context.createLinearGradient(0, center, size, center);
  horizontal.addColorStop(0, 'rgba(255,255,255,0)');
  horizontal.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  horizontal.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = horizontal;
  context.fillRect(0, center - 1, size, 2);

  const vertical = context.createLinearGradient(center, 0, center, size);
  vertical.addColorStop(0, 'rgba(255,255,255,0)');
  vertical.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  vertical.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = vertical;
  context.fillRect(center - 1, 0, 2, size);

  const core = context.createRadialGradient(center, center, 0, center, center, size * 0.09);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = core;
  context.fillRect(0, 0, size, size);
  return canvas;
}

export function makePlaceholderTexture(seed: number): HTMLCanvasElement {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const random = mulberry(seed);

  context.fillStyle = '#EEF0F5';
  context.fillRect(0, 0, width, height);
  for (let index = 0; index < 6; index += 1) {
    const y = random() * height;
    const bandHeight = height * (0.05 + random() * 0.1);
    context.fillStyle = random() > 0.5 ? '#DDE0E8' : '#F7F8FB';
    context.globalAlpha = 0.35;
    context.fillRect(0, y, width, bandHeight);
  }
  context.globalAlpha = 1;
  return canvas;
}
