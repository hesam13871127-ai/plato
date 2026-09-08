import { useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';

/* ------------------------------------------------------------------ */
/* Canvas texture helpers                                              */
/* ------------------------------------------------------------------ */

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const probe = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(probe).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = probe;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 ? lines : [''];
}

/** A quiz-show prompt panel: optional category strip + prompt text (or giant emoji). */
export function promptTexture(opts: {
  prompt: string;
  sub?: string;
  lang: 'fa' | 'en';
  accent: string;
  big?: boolean;
}): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const { prompt, sub, lang, accent, big } = opts;
  ctx.fillStyle = '#f8f5ee';
  ctx.fillRect(0, 0, 1024, 512);

  // frame + category strip
  ctx.strokeStyle = accent;
  ctx.lineWidth = 16;
  ctx.strokeRect(12, 12, 1000, 488);
  if (sub) {
    ctx.fillStyle = accent;
    ctx.fillRect(40, 40, 944, 74);
    ctx.fillStyle = '#fff';
    ctx.font = '700 44px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sub, 512, 80);
  }
  ctx.fillStyle = '#221b33';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (big) {
    // giant emoji — no shaping worries
    ctx.font = '230px serif';
    ctx.fillText(prompt, 512, sub ? 290 : 266);
  } else {
    const top = sub ? 180 : 130;
    ctx.font = '700 58px Arial';
    ctx.direction = lang === 'fa' ? 'rtl' : 'ltr';
    const lines = wrapLines(ctx, prompt, 880);
    const shown = lines.slice(0, 4);
    shown.forEach((ln, i) => {
      ctx.fillText(ln, 512, top + i * 74 + (4 - shown.length) * 20);
    });
    ctx.direction = 'ltr';
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** An answer pad face: option text under a letter badge. */
export function answerTexture(opts: {
  text: string;
  letter: string;
  lang: 'fa' | 'en';
  state: 'idle' | 'correct' | 'wrong' | 'dim';
}): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 280;
  const ctx = c.getContext('2d')!;
  const bg = opts.state === 'correct' ? '#14532d' : opts.state === 'wrong' ? '#7f1d1d' : '#f4f0e6';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 640, 280);
  // letter badge
  ctx.fillStyle = opts.state === 'idle' ? '#221b33' : '#ffffff';
  ctx.fillRect(24, 84, 112, 112);
  ctx.fillStyle = opts.state === 'idle' ? '#f4f0e6' : '#221b33';
  ctx.font = '900 64px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.letter, 80, 144);
  // option text
  ctx.fillStyle = opts.state === 'idle' ? '#221b33' : '#ffffff';
  ctx.font = '700 46px Arial';
  ctx.direction = opts.lang === 'fa' ? 'rtl' : 'ltr';
  const lines = wrapLines(ctx, opts.text, 420).slice(0, 3);
  lines.forEach((ln, i) => {
    ctx.fillText(ln, 560, 140 + (i - (lines.length - 1) / 2) * 56);
  });
  ctx.direction = 'ltr';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/* 3D stage                                                            */
/* ------------------------------------------------------------------ */

const LETTERS = ['A', 'B', 'C', 'D'];
const LETTERS_FA = ['۱', '۲', '۳', '۴'];

function AnswerPad({
  text,
  idx,
  lang,
  state,
  onPick,
  interactive,
}: {
  text: string;
  idx: number;
  lang: 'fa' | 'en';
  state: 'idle' | 'correct' | 'wrong' | 'dim';
  onPick: (i: number) => void;
  interactive: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const texture = useMemo(
    () => answerTexture({ text, letter: lang === 'fa' ? LETTERS_FA[idx]! : LETTERS[idx]!, lang, state }),
    [text, idx, lang, state],
  );
  const ref = useRef<THREE.Group>(null);
  useFrame((st, dt) => {
    if (!ref.current) return;
    const want = hovered && interactive ? 1.08 : 1;
    const s = THREE.MathUtils.damp(ref.current.scale.x, want, 10, dt);
    ref.current.scale.setScalar(s);
    ref.current.position.y = THREE.MathUtils.damp(
      ref.current.position.y,
      hovered && interactive ? 0.12 : 0,
      10,
      dt,
    );
  });
  return (
    <group
      ref={ref}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (interactive) {
          setHovered(true);
          void e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (interactive) {
          void e.stopPropagation();
          onPick(idx);
        }
      }}
    >
      <RoundedBox args={[3.5, 1.6, 0.22]} radius={0.09} smoothness={3} castShadow>
        <meshStandardMaterial
          color={state === 'correct' ? '#3ddc97' : state === 'wrong' ? '#fb7185' : '#d9cfb8'}
          roughness={0.6}
        />
      </RoundedBox>
      <mesh position={[0, 0, 0.13]}>
        <planeGeometry args={[3.3, 1.44]} />
        <meshStandardMaterial map={texture} roughness={0.75} />
      </mesh>
    </group>
  );
}

export function QuizStage({
  prompt,
  sub,
  lang,
  options,
  picked,
  correctIdx,
  reveal,
  accent,
  felt = '#2b2350',
  onPick,
  interactive,
  big = false,
}: {
  prompt: string;
  sub?: string;
  lang: 'fa' | 'en';
  options: string[];
  picked: number | null;
  correctIdx: number | null;
  reveal: boolean;
  accent: string;
  felt?: string;
  onPick: (i: number) => void;
  interactive: boolean;
  big?: boolean;
}): ReactNode {
  const qTexture = useMemo(
    () => promptTexture({ prompt, sub, lang, accent, big }),
    [prompt, sub, lang, accent, big],
  );
  const padState = (i: number): 'idle' | 'correct' | 'wrong' | 'dim' => {
    if (!reveal) return 'idle';
    if (i === correctIdx) return 'correct';
    if (i === picked) return 'wrong';
    return 'dim';
  };
  return (
    <group>
      {/* stage floor */}
      <RoundedBox args={[17, 0.6, 11]} radius={0.3} smoothness={4} position={[0, -0.35, 0]} receiveShadow>
        <meshStandardMaterial color={felt} roughness={0.95} />
      </RoundedBox>
      {/* prompt panel */}
      <group position={[0, 3.2, -3.4]} rotation={[-0.16, 0, 0]}>
        <RoundedBox args={[8.6, 4.4, 0.3]} radius={0.14} smoothness={3} castShadow>
          <meshStandardMaterial color="#241d31" roughness={0.65} />
        </RoundedBox>
        <mesh position={[0, 0, 0.17]}>
          <planeGeometry args={[8.2, 4.1]} />
          <meshStandardMaterial map={qTexture} roughness={0.8} />
        </mesh>
        {/* panel legs */}
        <mesh position={[-3.6, -3.3, -0.4]}>
          <cylinderGeometry args={[0.09, 0.09, 2.6, 10]} />
          <meshStandardMaterial color="#8a6f4d" roughness={0.7} />
        </mesh>
        <mesh position={[3.6, -3.3, -0.4]}>
          <cylinderGeometry args={[0.09, 0.09, 2.6, 10]} />
          <meshStandardMaterial color="#8a6f4d" roughness={0.7} />
        </mesh>
      </group>
      {/* answer pads 2×2 */}
      {options.slice(0, 4).map((text, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        return (
          <group key={i} position={[(col === 0 ? -3.1 : 3.1), 0.85 - row * 2.1, 1.6 + row * 1.5]} rotation={[-0.34, 0, 0]}>
            <AnswerPad
              text={text}
              idx={i}
              lang={lang}
              state={padState(i)}
              onPick={onPick}
              interactive={interactive && !reveal}
            />
          </group>
        );
      })}
    </group>
  );
}
