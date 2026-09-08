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

/* ---------------- pool balls ---------------- */

/** Standard ball colors (1–8 solids, 9–15 stripes). */
const POOL_BALL_COLORS: Record<number, string> = {
  1: '#fcc203', 2: '#1a3a82', 3: '#c8102e', 4: '#5b2c83', 5: '#f57a20',
  6: '#157944', 7: '#6d1a36', 8: '#151515',
  9: '#fcc203', 10: '#1a3a82', 11: '#c8102e', 12: '#5b2c83', 13: '#f57a20',
  14: '#157944', 15: '#6d1a36',
};

/** Sphere texture for a pool ball: solid, striped or the cue. */
export function ballTexture(num: number): THREE.CanvasTexture {
  return cached(`ball-${num}`, 256, 128, (ctx) => {
    const stripe = num >= 9;
    const color = POOL_BALL_COLORS[num] ?? '#ffffff';
    // base
    ctx.fillStyle = num === 0 ? '#f8f6f2' : stripe ? '#f8f6f2' : color;
    ctx.fillRect(0, 0, 256, 128);
    if (num !== 0 && stripe) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 34, 256, 60);
    }
    if (num !== 0) {
      // number circle
      ctx.fillStyle = '#f8f6f2';
      ctx.beginPath();
      ctx.arc(64, 64, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#151515';
      ctx.font = '900 34px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), 64, 66);
    } else {
      // tiny red dot on the cue
      ctx.fillStyle = '#d33';
      ctx.beginPath();
      ctx.arc(64, 64, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // subtle shading bands
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0.16)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
  });
}

/* ---------------- snakes & ladders board ---------------- */

export function snakesBoardTexture(
  colors: { light: string; dark: string; line: string },
  snakes: Record<number, number>,
  ladders: Record<number, number>,
): THREE.CanvasTexture {
  return cached(`snakes-board-${colors.light}-${colors.dark}`, 1024, 1024, (ctx) => {
    const cell = 1024 / 10;
    const rc = (n: number): [number, number] => {
      const i = n - 1;
      const row = Math.floor(i / 10);
      const col = i % 10;
      return [9 - row, row % 2 === 0 ? col : 9 - col]; // canvas coords (top-left origin)
    };
    const center = (n: number): [number, number] => {
      const [r, c] = rc(n);
      return [(c + 0.5) * cell, (r + 0.5) * cell];
    };

    // cells
    for (let n = 1; n <= 100; n++) {
      const [r, c] = rc(n);
      ctx.fillStyle = (r + c) % 2 === 0 ? colors.light : colors.dark;
      ctx.fillRect(c * cell, r * cell, cell, cell);
      ctx.fillStyle = 'rgba(20,15,40,0.75)';
      ctx.font = `700 ${cell * 0.3}px Vazirmatn, Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), (c + 0.5) * cell, (r + 0.18) * cell);
    }

    // ladders
    for (const [from, to] of Object.entries(ladders)) {
      const [x1, y1] = center(Number(from));
      const [x2, y2] = center(Number(to));
      const nx = -(y2 - y1);
      const ny = x2 - x1;
      const len = Math.hypot(nx, ny) || 1;
      const ox = (nx / len) * cell * 0.16;
      const oy = (ny / len) * cell * 0.16;
      ctx.strokeStyle = '#d9a441';
      ctx.lineWidth = cell * 0.075;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1 - ox, y1 - oy);
      ctx.lineTo(x2 - ox, y2 - oy);
      ctx.moveTo(x1 + ox, y1 + oy);
      ctx.lineTo(x2 + ox, y2 + oy);
      ctx.stroke();
      // rungs
      const steps = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / (cell * 0.38)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;
        ctx.lineWidth = cell * 0.05;
        ctx.beginPath();
        ctx.moveTo(px - ox, py - oy);
        ctx.lineTo(px + ox, py + oy);
        ctx.stroke();
      }
    }

    // snakes (wavy bezier with a head)
    const snakeColors = ['#e05252', '#52b788', '#e08fd0', '#7a9cc6', '#c98a3d'];
    let si = 0;
    for (const [from, to] of Object.entries(snakes)) {
      const [x1, y1] = center(Number(from));
      const [x2, y2] = center(Number(to));
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const px = -dy / (len || 1);
      const py = dx / (len || 1);
      const col = snakeColors[si++ % snakeColors.length]!;
      ctx.strokeStyle = col;
      ctx.lineWidth = cell * 0.13;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      const waves = 3;
      for (let i = 1; i <= waves; i++) {
        const t0 = (i - 1) / waves;
        const t1 = i / waves;
        const mx = x1 + dx * (t0 + t1) / 2 + px * cell * (i % 2 === 0 ? 0.45 : -0.45);
        const my = y1 + dy * (t0 + t1) / 2 + py * cell * (i % 2 === 0 ? 0.45 : -0.45);
        ctx.quadraticCurveTo(mx, my, x1 + dx * t1, y1 + dy * t1);
      }
      ctx.stroke();
      // head
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x1, y1, cell * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x1 - cell * 0.06, y1 - cell * 0.04, cell * 0.035, 0, Math.PI * 2);
      ctx.arc(x1 + cell * 0.06, y1 - cell * 0.04, cell * 0.035, 0, Math.PI * 2);
      ctx.fill();
      // tail tip
      ctx.beginPath();
      ctx.arc(x2, y2, cell * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }

    // grid lines
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, 1024);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cell);
      ctx.lineTo(1024, i * cell);
      ctx.stroke();
    }
  });
}


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
