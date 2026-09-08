export type Pt = [number, number];

export interface SketchTarget {
  name: { fa: string; en: string };
  /** polylines in normalized [0..1]² space (y down, like a canvas) */
  strokes: Pt[][];
}

/* ---------------- shape helpers ---------------- */

const poly = (...pts: Pt[]): Pt[] => [...pts, pts[0]!];

const rect = (x: number, y: number, w: number, h: number): Pt[] =>
  poly([x, y], [x + w, y], [x + w, y + h], [x, y + h]);

const line = (x1: number, y1: number, x2: number, y2: number): Pt[] => [[x1, y1], [x2, y2]];

function circle(cx: number, cy: number, r: number, segs = 28): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, segs = 18): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function star(cx: number, cy: number, outer: number, inner: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  pts.push(pts[0]!);
  return pts;
}

/* ---------------- target gallery ---------------- */

export const TARGETS: readonly SketchTarget[] = [
  {
    name: { fa: 'خانه', en: 'House' },
    strokes: [rect(0.28, 0.48, 0.44, 0.34), poly([0.24, 0.48], [0.5, 0.26], [0.76, 0.48]), rect(0.44, 0.6, 0.12, 0.22)],
  },
  {
    name: { fa: 'ستاره', en: 'Star' },
    strokes: [star(0.5, 0.52, 0.24, 0.1)],
  },
  {
    name: { fa: 'درخت', en: 'Tree' },
    strokes: [circle(0.5, 0.34, 0.17), line(0.45, 0.51, 0.45, 0.84), line(0.55, 0.51, 0.55, 0.84), line(0.38, 0.84, 0.62, 0.84)],
  },
  {
    name: { fa: 'ماهی', en: 'Fish' },
    strokes: [
      poly([0.22, 0.5], [0.44, 0.34], [0.7, 0.34], [0.84, 0.5], [0.7, 0.66], [0.44, 0.66]),
      poly([0.22, 0.5], [0.1, 0.38], [0.1, 0.62]),
      circle(0.72, 0.46, 0.025),
    ],
  },
  {
    name: { fa: 'قایق', en: 'Boat' },
    strokes: [
      poly([0.2, 0.62], [0.8, 0.62], [0.68, 0.8], [0.32, 0.8]),
      line(0.5, 0.62, 0.5, 0.24),
      poly([0.52, 0.28], [0.74, 0.58], [0.52, 0.58]),
    ],
  },
  {
    name: { fa: 'فنجان', en: 'Cup' },
    strokes: [poly([0.32, 0.36], [0.68, 0.36], [0.63, 0.72], [0.37, 0.72]), arc(0.71, 0.52, 0.11, -Math.PI / 2, Math.PI / 2), line(0.3, 0.8, 0.7, 0.8)],
  },
  {
    name: { fa: 'چتر', en: 'Umbrella' },
    strokes: [arc(0.5, 0.5, 0.28, Math.PI, Math.PI * 2), line(0.5, 0.5, 0.5, 0.82), arc(0.44, 0.82, 0.06, Math.PI, Math.PI * 2)],
  },
  {
    name: { fa: 'بادکنک', en: 'Balloon' },
    strokes: [circle(0.5, 0.36, 0.17), line(0.5, 0.53, 0.5, 0.86), line(0.44, 0.6, 0.56, 0.66), line(0.56, 0.6, 0.44, 0.66)],
  },
  {
    name: { fa: 'صورت خندان', en: 'Smiley' },
    strokes: [circle(0.5, 0.5, 0.24), circle(0.42, 0.44, 0.025), circle(0.58, 0.44, 0.025), arc(0.5, 0.52, 0.13, Math.PI * 0.15, Math.PI * 0.85)],
  },
  {
    name: { fa: 'کوه و خورشید', en: 'Mountains' },
    strokes: [poly([0.1, 0.78], [0.38, 0.34], [0.66, 0.78]), poly([0.42, 0.78], [0.68, 0.42], [0.9, 0.78]), circle(0.82, 0.24, 0.09)],
  },
];
