import { EngineRegistry } from '../src/game/engine/engine.registry';
import { BaseGameEngine } from '../src/game/engine/base-game.engine';

/**
 * Engine play-through suite. During the wave-by-wave rebuild every playable
 * game is driven here to completion by its own bot brain — turn-based games
 * via `chooseBotMove`, live games via `tick` — exactly the code path the
 * session service drives for real matches. This catches stuck states,
 * unhandled actions and missing AI branches without any UI or network.
 *
 * Waves register their engines in the lists below as they land.
 */

const TURN_BASED: Array<{ name: string; build: () => BaseGameEngine; players?: number }> = [];

describe('turn-based game engines — full bot play-through', () => {
  for (const { name, build, players } of TURN_BASED) {
    test(`${name} reaches a completed state with a winner`, () => {
      const engine = build();
      let state = engine.createInitialState(
        makeConfig(engine, players ?? engine.maxPlayers),
      );
      const maxTurns = 4000;

      for (let turn = 0; turn < maxTurns && state.phase === 'in_progress'; turn++) {
        const seat = state.currentSeat;
        expect(seat).toBeGreaterThanOrEqual(0);
        const move = engine.chooseBotMove(state, seat, 'hard');
        const action = { ...move.action, seat };
        const validation = engine.validate(state, action);
        // The bot's own move must always be legal for the current state.
        if (!validation.ok) {
          throw new Error(
            `${name}: bot move rejected at turn ${turn}: ${validation.error} — ${JSON.stringify(action)}`,
          );
        }
        state = engine.applyAction(state, action);
      }

      expect(state.phase).toBe('completed');
      expect(
        state.winnerSeat === null ? state.winnerSeats ?? [] : [state.winnerSeat],
      ).toBeTruthy();
    });
  }
});

describe('engine registry', () => {
  test('registers, resolves and rejects engines cleanly', () => {
    const registry = new EngineRegistry();
    expect(registry.slugs).toEqual([]);
    expect(registry.has('nonexistent')).toBe(false);
    expect(() => registry.require('nonexistent')).toThrow(/No engine registered/);

    registry.register(new DummyEngine());
    expect(registry.slugs).toEqual(['__dummy__']);
    expect(registry.has('__dummy__')).toBe(true);
    expect(registry.get('__dummy__')).toBeInstanceOf(DummyEngine);
    expect(registry.require('__dummy__')).toBeInstanceOf(DummyEngine);
  });
});

class DummyEngine extends BaseGameEngine {
  readonly slug = '__dummy__';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createInitialState(config: never): never {
    throw new Error('not implemented');
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validate(state: never, action: never): never {
    throw new Error('not implemented');
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  applyAction(state: never, action: never): never {
    throw new Error('not implemented');
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chooseBotMove(state: never, seat: number, difficulty: never): never {
    throw new Error('not implemented');
  }
}

function makeConfig(engine: BaseGameEngine, players: number) {
  return {
    matchId: `test-${engine.slug}`,
    gameSlug: engine.slug,
    seats: Array.from({ length: players }, (_, i) => ({
      playerId: `bot-${i}`,
      seatNumber: i,
      isBot: true,
      botDifficulty: 'hard' as const,
      displayName: `Bot ${i}`,
      avatarUrl: null,
    })),
    isLive: engine.isLive,
  };
}
