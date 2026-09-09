import 'package:flutter/material.dart';

import '../../domain/entities/game_entities.dart';
import 'dominoes_board.dart';
import 'ludo_board.dart';
import 'ocho_board.dart';
import 'connect4_board.dart';
import 'checkers_board.dart';
import 'chess_board.dart';

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
      case 'checkers':
        return CheckersBoard(session: session, mySeat: mySeat, onAction: onAction);
      case 'chess':
        return ChessBoard(session: session, mySeat: mySeat, onAction: onAction);
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
