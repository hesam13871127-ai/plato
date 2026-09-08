import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  return [c, ctx];
}

function tex(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function cached(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = makeCanvas(w, h);
  draw(ctx);
  const t = tex(c);
  cache.set(key, t);
  return t;
}

/* ---------------- domino / dice pips ---------------- */

export const PIP_POS: Record<number, [number, number][]> = {
  0: [],
  1: [[0.5, 0.5]],
  2: [[0.26, 0.26], [0.74, 0.74]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.26, 0.26], [0.74, 0.26], [0.26, 0.74], [0.74, 0.74]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.26, 0.24], [0.74, 0.24], [0.26, 0.5], [0.74, 0.5], [0.26, 0.76], [0.74, 0.76]],
};

export function drawPips(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  value: number,
  color: string,
) {
  const spots = PIP_POS[Math.max(0, Math.min(6, value))] ?? [];
  const r = size * 0.085;
  ctx.fillStyle = color;
  for (const [px, py] of spots) {
    ctx.beginPath();
    ctx.arc(cx + (px - 0.5) * size, cy + (py - 0.5) * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Top face of a lying domino: two halves side by side (a | b). */
export function dominoFaceTexture(a: number, b: number, skinKey: string, colors: { face: string; pip: string }): THREE.CanvasTexture {
  return cached(`dom-${skinKey}-${a}-${b}`, 256, 128, (ctx) => {
    ctx.fillStyle = colors.face;
    ctx.fillRect(0, 0, 256, 128);
    // soft inner border
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 122);
    // divider
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(125, 10, 6, 108);
    drawPips(ctx, 64, 64, 96, a, colors.pip);
    drawPips(ctx, 192, 64, 96, b, colors.pip);
  });
}

/** Six die faces. */
export function dieFaceTexture(value: number, colors: { face: string; pip: string }): THREE.CanvasTexture {
  return cached(`die-${colors.face}-${colors.pip}-${value}`, 128, 128, (ctx) => {
    ctx.fillStyle = colors.face;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 124, 124);
    drawPips(ctx, 64, 64, 96, value, colors.pip);
  });
}

/* ---------------- ocho cards ---------------- */

export type CardVisualColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
const CARD_BG: Record<CardVisualColor, [string, string]> = {
  red: ['#f43f5e', '#9f1239'],
  yellow: ['#facc15', '#a16207'],
  green: ['#22c55e', '#14532d'],
  blue: ['#3b82f6', '#1e3a8a'],
  wild: ['#a78bfa', '#4c1d95'],
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, kind: 'skip' | 'reverse' | 'draw2' | 'wild4') {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = s * 0.11;
  ctx.lineCap = 'round';
  if (kind === 'skip') {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, s * 0.3);
    ctx.lineTo(s * 0.3, -s * 0.3);
    ctx.stroke();
  } else if (kind === 'reverse') {
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate(dir * s * 0.16, 0);
      ctx.beginPath();
      ctx.moveTo(-s * 0.18 * dir, -s * 0.22);
      ctx.lineTo(s * 0.2 * dir, -s * 0.22);
      ctx.lineTo(s * 0.2 * dir, -s * 0.38);
      ctx.lineTo(s * 0.42 * dir, -s * 0.12);
      ctx.lineTo(s * 0.2 * dir, s * 0.14);
      ctx.lineTo(s * 0.2 * dir, -s * 0.02);
      ctx.lineTo(-s * 0.18 * dir, -s * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else {
    ctx.font = `900 ${s * 0.55}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(kind === 'draw2' ? '+2' : '+4', 0, s * 0.04);
  }
  ctx.restore();
}

/** Face of an Ocho card. */
export function cardFaceTexture(
  color: CardVisualColor,
  value: string,
  skinKey: string,
): THREE.CanvasTexture {
  return cached(`card-${skinKey}-${color}-${value}`, 256, 352, (ctx) => {
    const [c0, c1] = CARD_BG[color];
    ctx.fillStyle = c1;
    roundRect(ctx, 0, 0, 256, 352, 26);
    ctx.fill();
    const grad = ctx.createLinearGradient(0, 0, 256, 352);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    ctx.fillStyle = grad;
    roundRect(ctx, 8, 8, 240, 336, 20);
    ctx.fill();

    // central white ellipse
    ctx.save();
    ctx.translate(128, 176);
    ctx.rotate(-0.28);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 92, 128, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const ink = color === 'wild' ? '#4c1d95' : c1;
    ctx.fillStyle = ink;

    if (value === 'wild') {
      // four color quadrants inside the ellipse
      const quads: [string, number][] = [
        ['#ef4444', -0.75],
        ['#eab308', -0.25],
        ['#3b82f6', 0.25],
        ['#22c55e', 0.75],
      ];
      ctx.save();
      ctx.translate(128, 176);
      for (const [col, off] of quads) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(off * 52, off * 6, 44, 44, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    } else if (value === 'skip' || value === 'reverse' || value === 'draw2' || value === 'wild4') {
      drawSymbol(ctx, 128, 176, 130, value === 'wild4' ? 'draw2' : value);
      ctx.fillStyle = ink;
    } else {
      ctx.font = '900 118px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value, 128, 186);
    }

    // corners
    ctx.fillStyle = '#fff';
    ctx.font = '900 40px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const corner = value === 'wild' ? 'W' : value === 'wild4' ? '+4' : value === 'draw2' ? '+2' : value === 'skip' ? '⊘' : value === 'reverse' ? '⇄' : value;
    ctx.fillText(corner.toUpperCase(), 18, 14);
    ctx.save();
    ctx.translate(238, 338);
    ctx.rotate(Math.PI);
    ctx.fillText(corner.toUpperCase(), -8, -46);
    ctx.restore();
  });
}

/** Card back — big "8" (Ocho!). */
export function cardBackTexture(skinKey: string, colors: { bg: string; fg: string }): THREE.CanvasTexture {
  return cached(`cardback-${skinKey}`, 256, 352, (ctx) => {
    ctx.fillStyle = colors.bg;
    roundRect(ctx, 0, 0, 256, 352, 26);
    ctx.fill();
    ctx.strokeStyle = colors.fg;
    ctx.lineWidth = 7;
    roundRect(ctx, 14, 14, 228, 324, 18);
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(128, 176, 40 + i * 26, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = colors.fg;
    ctx.font = '900 190px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('8', 128, 186);
  });
}

/* ---------------- connect 4 panel ---------------- */

/** Blue panel with 7×6 transparent holes (alpha-tested). */
export function c4PanelTexture(frameColor: string): THREE.CanvasTexture {
  return cached(`c4panel-${frameColor}`, 512, 448, (ctx) => {
    ctx.clearRect(0, 0, 512, 448);
    ctx.fillStyle = frameColor;
    roundRect(ctx, 0, 0, 512, 448, 26);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row < 6; row++) {
        const x = 52 + col * 68;
        const y = 58 + row * 66;
        ctx.beginPath();
        ctx.arc(x, y, 27, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  });
}
