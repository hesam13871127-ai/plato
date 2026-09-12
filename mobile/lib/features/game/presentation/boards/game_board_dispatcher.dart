import 'package:flutter/material.dart';

import '../../domain/entities/game_entities.dart';
import 'dominoes_board.dart';
import 'ludo_board.dart';
import 'ocho_board.dart';
import 'connect4_board.dart';
import 'checkers_board.dart';
import 'chess_board.dart';
import 'pool_board.dart';
import 'carrom_board.dart';
import 'dots_board.dart';
import 'snakes_board.dart';
import 'bingo_board.dart';
import 'dice_board.dart';
import 'backgammon_board.dart';
import 'mancala_board.dart';
import 'bowling_board.dart';
import 'trivia_board.dart';
import 'word_chain_board.dart';
import 'emoji_charades_board.dart';
import 'memory_board.dart';
import 'sketch_board.dart';
import 'werewolf_board.dart';
import 'impostor_board.dart';
import 'darts_board.dart';
import 'minigolf_board.dart';
import 'bankroll_board.dart';
import 'battleship_board.dart';
import 'reversi_board.dart';
import 'gomoku_board.dart';
import 'blackjack_board.dart';
import 'hangman_board.dart';
import 'tic_tac_toe_board.dart';
import 'tile_duel_board.dart';

typedef BoardAction = Future<void> Function(String type, Map<String, dynamic> payload);

/// Selects the matching board widget for a live session based on the engine
/// slug broadcast by the server. Every board receives the redacted session and
/// a single [onAction] callback that routes moves to the authoritative server.
///
/// Boards are registered per wave as games are rebuilt; an unknown slug (or a
/// catalogue between waves) shows the placeholder below.
class GameBoardDispatcher extends StatelessWidget {
  const GameBoardDispatcher({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final BoardAction onAction;

  @override
  Widget build(BuildContext context) {
    switch (session.gameSlug) {
      case 'dominoes':
        return DominoesBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'ludo':
        return LudoBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'ocho':
        return OchoBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'connect4':
        return Connect4Board(session: session, mySeat: mySeat, onAction: onAction);
      case 'checkers':
        return CheckersBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'chess':
        return ChessBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'pool':
        return PoolBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'carrom':
        return CarromBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'dots_and_boxes':
        return DotsBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'snakes_ladders':
        return SnakesBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'bingo':
        return BingoBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'dice_party':
        return DiceBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'backgammon':
        return BackgammonBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'mancala':
        return MancalaBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'bowling':
        return BowlingBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'trivia':
        return TriviaBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'word_chain':
        return WordChainBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'emoji_charades':
        return EmojiCharadesBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'memory':
        return MemoryBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'sketch':
        return SketchBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'werewolf':
        return WerewolfBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'impostor':
        return ImpostorBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'darts':
        return DartsBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'minigolf':
        return MinigolfBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'bankroll':
        return BankrollBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'battleship':
        return BattleshipBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'reversi':
        return ReversiBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'gomoku':
        return GomokuBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'blackjack':
        return BlackjackBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'hangman':
        return HangmanBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'tic_tac_toe':
        return TicTacToeBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'tile_duel':
        return TileDuelBoard(session: session, mySeat: mySeat, onAction: onAction);
      default:
        return _UnknownBoard(slug: session.gameSlug);
    }
  }
}

class _UnknownBoard extends StatelessWidget {
  const _UnknownBoard({required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: Text(
          slug.isEmpty ? 'Waiting for table…' : 'Unknown game: $slug',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white70),
        ),
      ),
    );
  }
}
