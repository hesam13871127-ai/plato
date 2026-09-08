import { useEffect, useRef, useState } from 'react';
import type { GameConfig } from '../../core/types';
import { useGameRuntime } from '../../core/runtime';
import { useI18n } from '../../i18n';
import { useProfile, winReward } from '../../state/store';
import { useSkin } from '../../state/skins';
import { GameFrame, TurnBanner } from '../../ui/hud';
import { Button } from '../../ui/components';
import { GameCanvas } from '../../ui/three/shared';
import { ROUNDS, sketchEngine } from './engine';
import type { Pt } from './targets';
import { TARGETS } from './targets';
import { Easel, GalleryWall, StudioFloor } from './Board';
import { sketchMeta } from './meta';

const ACCENTS = ['#f43f5e', '#0ea5e9', '#22c55e', '#eab308'];
const PAD = 460; // DOM canvas size in px

export function SketchPlay({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const { t, lang } = useI18n();
  const [reward, setReward] = useState<number | null>(null);
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const drawing = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recordResult = useProfile((s) => s.recordResult);
  const boardSkin = useSkin(sketchMeta.skins, 'board');
  const wood = boardSkin.skin?.colors.wood ?? '#b98a4e';

  const rt = useGameRuntime(sketchEngine, config, {
    onGameOver: (winners) => {
      const humans = config.slots.filter((s) => s.kind === 'human').map((s) => s.id);
      const won = winners.some((w) => humans.includes(w));
      const amount = winners.length > 0 ? winReward(config.slots) : 15;
      recordResult(won, amount);
      setReward(amount);
    },
  });
  const { state, dispatch } = rt;

  const actors = sketchEngine.currentPlayers(state);
  const viewer =
    config.slots.find((s) => actors.includes(s.id) && s.kind === 'human')?.id ??
    config.slots.find((s) => s.kind === 'human')?.id ??
    0;
  const isMyTurn = actors.includes(viewer) && config.slots[viewer]?.kind === 'human';
  const actor = actors[0];
  const seatName = (id: number) => config.slots[id]?.name ?? `P${id}`;

  const targetIdx = state.targets[Math.min(state.round, ROUNDS - 1)]!;
  const target = TARGETS[targetIdx]!;
  const myLast = state.lastEvent;

  // reset the pad when the turn changes
  useEffect(() => {
    setStrokes([]);
  }, [state.turn, state.round, state.attempts.length]);

  // redraw the DOM pad
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f6efe0';
    ctx.fillRect(0, 0, PAD, PAD);
    ctx.strokeStyle = 'rgba(40,30,60,0.15)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((PAD / 4) * i, 0);
      ctx.lineTo((PAD / 4) * i, PAD);
      ctx.moveTo(0, (PAD / 4) * i);
      ctx.lineTo(PAD, (PAD / 4) * i);
      ctx.stroke();
    }
    ctx.strokeStyle = ACCENTS[actor ?? 0] ?? '#f43f5e';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const st of strokes) {
      if (st.length === 1) {
        ctx.beginPath();
        ctx.arc(st[0]![0] * PAD, st[0]![1] * PAD, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = ACCENTS[actor ?? 0] ?? '#f43f5e';
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(st[0]![0] * PAD, st[0]![1] * PAD);
      for (let i = 1; i < st.length; i++) ctx.lineTo(st[i]![0] * PAD, st[i]![1] * PAD);
      ctx.stroke();
    }
  }, [strokes, actor]);

  const posOf = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    ];
  };

  const submit = () => {
    if (strokes.length === 0) return;
    dispatch({ type: 'submit', strokes });
    setStrokes([]);
  };

  const banner = (
    <TurnBanner
      text={isMyTurn ? t('game.yourTurn') : actor !== undefined ? t('game.turnOf', { name: seatName(actor) }) : ''}
      hint={
        myLast && !isMyTurn
          ? `${seatName(myLast.player)}: ${t('game.similarity')} ${myLast.score}%`
          : `${t('game.drawThis')} ${target.name[lang]}`
      }
    />
  );

  const actions = (
    <div className="sketch-toolbar">
      {isMyTurn && (
        <>
          <Button onClick={() => setStrokes((s) => s.slice(0, -1))}>↩︎ {t('game.undo')}</Button>
          <Button onClick={() => setStrokes([])}>🗑 {t('game.clear')}</Button>
          <Button variant="primary" onClick={submit} disabled={strokes.length === 0}>
            ✅ {t('game.submit')}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <GameFrame
      meta={sketchMeta}
      config={config}
      engine={sketchEngine}
      state={state}
      onExit={onExit}
      onRematch={() => {
        setReward(null);
        rt.restart();
      }}
      banner={banner}
      actions={actions}
      reward={reward}
      seatColors={ACCENTS}
      renderChipExtra={(seat) => (
        <>
          🎨 {state.scores[seat.id] ?? 0}
          {seat.id === actor && state.phase === 'draw' ? ' ✍️' : ''}
        </>
      )}
      winnerSummary={`${t('game.round')}: ${Math.min(state.attempts.length + 1, ROUNDS * state.playerCount)}/${ROUNDS * state.playerCount} · ${t('game.similarity')}: ${myLast ? `${seatName(myLast.player)} ${myLast.score}%` : '—'}`}
    >
      <GameCanvas camera={{ position: [0, 5.6, 10.2], fov: 48 }} minDistance={6} maxDistance={24} maxPolarAngle={1.35}>
        <StudioFloor wood="#6b5138" />
        <Easel targetIdx={targetIdx} wood={wood} />
        <GalleryWall
          attempts={state.attempts}
          names={config.slots.map((s) => s.name)}
          accents={ACCENTS}
          wall="#2c2440"
        />
      </GameCanvas>
      {isMyTurn && state.phase === 'draw' && (
        <div className="sketch-pad-wrap">
          <div className="sketch-pad-title">
            ✍️ {t('game.drawThis')} <b>{target.name[lang]}</b>
          </div>
          <canvas
            ref={canvasRef}
            className="sketch-pad"
            width={PAD}
            height={PAD}
            onPointerDown={(e) => {
              drawing.current = true;
              const p = posOf(e);
              setStrokes((s) => [...s, [p]]);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const p = posOf(e);
              setStrokes((s) => {
                if (s.length === 0) return s;
                const lastStroke = s[s.length - 1]!;
                const lastPt = lastStroke[lastStroke.length - 1];
                if (lastPt && Math.hypot(p[0] - lastPt[0], p[1] - lastPt[1]) < 0.006) return s;
                return [...s.slice(0, -1), [...lastStroke, p]];
              });
            }}
            onPointerUp={() => {
              drawing.current = false;
            }}
            onPointerLeave={() => {
              drawing.current = false;
            }}
          />
        </div>
      )}
    </GameFrame>
  );
}
