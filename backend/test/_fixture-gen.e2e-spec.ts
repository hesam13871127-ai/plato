import * as fs from 'fs';
import * as path from 'path';
import { EngineRegistry } from '../src/game/engine/engine.registry';

const engines = [
  new (require('../src/game/engine/dominoes.engine').DominoesEngine)(),
  new (require('../src/game/engine/ludo.engine').LudoEngine)(),
  new (require('../src/game/engine/ocho.engine').OchoEngine)(),
  new (require('../src/game/engine/connect4.engine').Connect4Engine)(),
  new (require('../src/game/engine/checkers.engine').CheckersEngine)(),
  new (require('../src/game/engine/chess.engine').ChessEngine)(),
  new (require('../src/game/engine/pool.engine').PoolEngine)(),
  new (require('../src/game/engine/carrom.engine').CarromEngine)(),
  new (require('../src/game/engine/dots-and-boxes.engine').DotsAndBoxesEngine)(),
  new (require('../src/game/engine/bingo.engine').BingoEngine)(),
  new (require('../src/game/engine/dice-party.engine').DicePartyEngine)(),
  new (require('../src/game/engine/backgammon.engine').BackgammonEngine)(),
  new (require('../src/game/engine/mancala.engine').MancalaEngine)(),
  new (require('../src/game/engine/bowling.engine').BowlingEngine)(),
  new (require('../src/game/engine/sketch.engine').SketchEngine)(),
  new (require('../src/game/engine/werewolf.engine').WerewolfEngine)(),
  new (require('../src/game/engine/darts.engine').DartsEngine)(),
  new (require('../src/game/engine/minigolf.engine').MinigolfEngine)(),
  new (require('../src/game/engine/bankroll.engine').BankrollEngine)(),
  new (require('../src/game/engine/battleship.engine').BattleshipEngine)(),
  new (require('../src/game/engine/reversi.engine').ReversiEngine)(),
  new (require('../src/game/engine/minesweeper.engine').MinesweeperEngine)(),
  new (require('../src/game/engine/gofish.engine').GoFishEngine)(),
  new (require('../src/game/engine/poker.engine').PokerEngine)(),
];

const OUT = path.resolve(__dirname, '../../mobile/test/fixtures');

function cfg(engine: any, players: number) {
  return {
    matchId: `fixture-${engine.slug}`,
    gameSlug: engine.slug,
    seats: Array.from({ length: players }, (_, i) => ({
      playerId: `bot-${i}`, seatNumber: i, isBot: true, botDifficulty: 'hard',
      displayName: `Bot ${i}`, avatarUrl: null,
    })),
    isLive: engine.isLive,
  };
}

test('generate real-state fixtures for all games', () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report: Record<string, string> = {};
  for (const engine of engines) {
    const players = Math.max(engine.minPlayers, 2);
    const n = Math.min(engine.maxPlayers, Math.max(engine.minPlayers, players));
    let state: any = engine.createInitialState(cfg(engine, n));
    const initial = engine.playerView(state, 0);
    // Drive with bots for up to 30 moves (or to completion).
    for (let t = 0; t < 30 && state.phase === 'in_progress'; t++) {
      const move = engine.chooseBotMove(state, state.currentSeat, 'hard');
      const action = { ...move.action, seat: state.currentSeat };
      const v = engine.validate(state, action);
      if (!v.ok) break;
      state = engine.applyAction(state, action);
    }
    const mid = engine.playerView(state, 0);
    fs.writeFileSync(path.join(OUT, `${engine.slug}_initial.json`), JSON.stringify({ sessionId: 'fixture', channel: 'fixture', gameSlug: engine.slug, version: initial.version, state: initial }));
    fs.writeFileSync(path.join(OUT, `${engine.slug}_mid.json`), JSON.stringify({ sessionId: 'fixture', channel: 'fixture', gameSlug: engine.slug, version: mid.version, state: mid }));
    report[engine.slug] = `${n}p initial=${JSON.stringify((initial as any).board).length}B mid=${JSON.stringify((mid as any).board).length}B phase=${state.phase}`;
  }
  console.log(JSON.stringify(report, null, 1));
  expect(engines.length).toBe(24);
});
