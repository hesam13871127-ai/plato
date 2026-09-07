import 'package:flutter/material.dart';

import '../../domain/entities/game_entities.dart';
import 'bingo_board.dart';
import 'carrom_board.dart';
import 'chess_board.dart';
import 'connect4_board.dart';
import 'dice_party_board.dart';
import 'dominoes_board.dart';
import 'ludo_board.dart';
import 'ocho_board.dart';
import 'pool_board.dart';
import 'sketch_board.dart';
import 'werewolf_board.dart';
import 'trivia_board.dart';
import 'emoji_charades_board.dart';
import 'word_chain_board.dart';
import 'memory_race_board.dart';
import 'impostor_light_board.dart';
import 'quick_challenges_board.dart';
import 'checkers_board.dart';
import 'reversi_board.dart';
import 'backgammon_board.dart';
import 'dots_boxes_board.dart';
import 'sea_battle_board.dart';
import 'mancala_board.dart';
import 'mines_board.dart';
import 'go_fish_board.dart';

typedef BoardAction = Future<void> Function(String type, Map<String, dynamic> payload);

/// Selects the matching board widget for a live session based on the engine
/// slug broadcast by the server. Every board receives the redacted session and
/// a single [onAction] callback that routes moves to the authoritative server.
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
      case 'connect4':
        return Connect4Board(session: session, mySeat: mySeat, onAction: onAction);
      case 'ocho':
        return OchoBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'ludo':
        return LudoBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'chess':
        return ChessBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'bingo':
        return BingoBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'dice_party':
        return DicePartyBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'werewolf':
        return WerewolfBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'sketch_guess':
        return SketchBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'pool_8ball':
        return PoolBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'carrom':
        return CarromBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'trivia':
        return TriviaBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'emoji_charades':
        return EmojiCharadesBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'word_chain':
        return WordChainBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'memory_race':
        return MemoryRaceBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'impostor_light':
        return ImpostorLightBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'quick_challenges':
        return QuickChallengesBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'checkers':
        return CheckersBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'reversi':
        return ReversiBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'backgammon':
        return BackgammonBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'dots_boxes':
        return DotsBoxesBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'sea_battle':
        return SeaBattleBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'mancala':
        return MancalaBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'mines':
        return MinesBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'go_fish':
        return GoFishBoard(session: session, mySeat: mySeat, onAction: onAction);
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
