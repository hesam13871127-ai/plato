import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { GameConfig, GameEngine, RNG } from './types';
import { makeRng } from './rng';

interface Ctx<S, A> {
  engine: GameEngine<S, A>;
  rng: RNG;
  config: GameConfig;
}

type Msg<S, A> = { type: 'act'; action: A; actor: number } | { type: 'restart' };

function reducer<S, A>(ctx: Ctx<S, A>, state: S, msg: Msg<S, A>): S {
  switch (msg.type) {
    case 'restart':
      return ctx.engine.createInitialState(
        { ...ctx.config, seed: (ctx.rng.next() * 2 ** 31) | 0 },
        ctx.rng,
      );
    case 'act': {
      if (ctx.engine.isGameOver(state)) return state;
      if (!ctx.engine.validate(state, msg.action, msg.actor)) return state;
      return ctx.engine.applyAction(state, msg.action, msg.actor, ctx.rng);
    }
  }
}

export interface GameRuntime<S, A> {
  state: S;
  /** Dispatch an action as `actor` (defaults to the player(s) currently on turn). */
  dispatch: (action: A, actor?: number) => void;
  restart: () => void;
}

export function useGameRuntime<S, A>(
  engine: GameEngine<S, A>,
  config: GameConfig,
  opts?: { botDelayMs?: number; onGameOver?: (winners: number[]) => void },
): GameRuntime<S, A> {
  const ctxRef = useRef<Ctx<S, A> | null>(null);
  if (!ctxRef.current) {
    ctxRef.current = { engine, rng: makeRng(config.seed), config };
  }
  const ctx = ctxRef.current;

  const [state, dispatchMsg] = useReducer(
    (state: S, msg: Msg<S, A>): S => reducer(ctx, state, msg),
    config,
    (cfg: GameConfig): S => engine.createInitialState(cfg, ctxRef.current ? ctxRef.current.rng : makeRng(cfg.seed)),
  );

  // Mirror the latest state so imperative dispatches can resolve the actor.
  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatch = useCallback(
    (action: A, actor?: number) => {
      const s = stateRef.current;
      if (engine.isGameOver(s)) return;
      const who = actor ?? engine.currentPlayers(s)[0];
      if (who === undefined) return;
      dispatchMsg({ type: 'act', action, actor: who });
    },
    [engine],
  );

  const restart = useCallback(() => dispatchMsg({ type: 'restart' }), []);

  // Bot driver: whenever the expected actor is a bot, play for it after a delay.
  const botDelay = opts?.botDelayMs ?? 850;
  const onGameOver = opts?.onGameOver;
  useEffect(() => {
    if (engine.isGameOver(state)) return;
    const actors = engine.currentPlayers(state);
    const bot = config.slots.find((s) => actors.includes(s.id) && s.kind === 'bot');
    if (!bot) return;
    const jitter = Math.round(Math.random() * 250);
    const timer = setTimeout(() => {
      const move = engine.chooseBotMove(state, bot.id, ctx.rng, bot.difficulty ?? 'medium');
      if (move === null) return;
      dispatchMsg({ type: 'act', action: move, actor: bot.id });
    }, botDelay + jitter);
    return () => clearTimeout(timer);
  }, [state, engine, config, ctx, botDelay]);

  // Fire the game-over callback exactly once per finished game.
  const firedRef = useRef(false);
  useEffect(() => {
    if (engine.isGameOver(state)) {
      if (!firedRef.current) {
        firedRef.current = true;
        onGameOver?.(engine.winners(state));
      }
    } else {
      firedRef.current = false;
    }
  }, [state, engine, onGameOver]);

  return { state, dispatch, restart };
}
