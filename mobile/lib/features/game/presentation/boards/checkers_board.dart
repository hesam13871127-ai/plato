import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Checkers (draughts): 8×8 board, seat 0 at the bottom moving up. Tap one of
/// your pieces, then a highlighted landing square. The server sends the legal
/// moves for the side to move (`legal: [{from, to, captures}]`) so the board
/// can light up exactly what is allowed, including forced captures.
class CheckersBoard extends StatefulWidget {
  const CheckersBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<CheckersBoard> createState() => _CheckersBoardState();
}

class _CheckersBoardState extends State<CheckersBoard> {
  List<int>? _selected;

  Map<String, dynamic> get b => widget.session.board;

  List<List<String>> get _grid {
    final raw = (b['grid'] as List?) ?? const [];
    return raw.map((row) => (row as List).map((c) => (c as String?) ?? '').toList()).toList();
  }

  List<_Move> get _legal {
    final raw = (b['legal'] as List?) ?? const [];
    return raw.whereType<Map>().map((m) {
      final from = (m['from'] as List).map((n) => (n as num).toInt()).toList();
      final to = (m['to'] as List).map((n) => (n as num).toInt()).toList();
      return _Move(from[0], from[1], to[0], to[1], (m['captures'] as num?)?.toInt() ?? 0);
    }).toList();
  }

  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  int _owner(String cell) {
    if (cell == 'r' || cell == 'R') return 0;
    if (cell == 'b' || cell == 'B') return 1;
    return -1;
  }

  void _tap(int r, int c, List<_Move> legal) {
    if (!_myTurn) return;
    final grid = _grid;
    final cell = grid[r][c];
    if (_selected != null) {
      final sr = _selected![0];
      final sc = _selected![1];
      final move = legal.where((m) => m.fr == sr && m.fc == sc && m.tr == r && m.tc == c).toList();
      if (move.isNotEmpty) {
        GameFeedback.move();
        widget.onAction('move', {
          'from': [sr, sc],
          'to': [r, c],
        });
        setState(() => _selected = null);
        return;
      }
    }
    if (_owner(cell) == widget.mySeat && legal.any((m) => m.fr == r && m.fc == c)) {
      GameFeedback.tap();
      setState(() => _selected = [r, c]);
    } else {
      setState(() => _selected = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final grid = _grid;
    final legal = _legal;
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final captured = ((b['captured'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    final last = b['lastMove'] as Map?;
    final lastPath = ((last?['path'] as List?) ?? const [])
        .whereType<List>()
        .map((p) => [(p[0] as num).toInt(), (p[1] as num).toInt()])
        .toList();
    final mustCapture = legal.any((m) => m.captures > 0);
    final movable = <String>{for (final m in legal) '${m.fr}:${m.fc}'};
    final targets = <String>{
      if (_selected != null)
        for (final m in legal.where((m) => m.fr == _selected![0] && m.fc == _selected![1])) '${m.tr}:${m.tc}',
    };
    // Seat 1 sees the board flipped so their men move "up" too.
    final flip = widget.mySeat == 1;

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress
              ? (_myTurn
                  ? (mustCapture ? 'Capture available — you must jump!' : 'Your move — tap a piece')
                  : 'Opponent is thinking…')
              : 'Game over',
          highlight: _myTurn,
          icon: Icons.filter_tilt_shift_rounded,
        ),
        const SizedBox(height: 6),
        _ScoreRow(session: widget.session, mySeat: widget.mySeat, captured: captured),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(8),
          child: grid.isEmpty
              ? const SizedBox(height: 300, child: Center(child: Text('Setting up…', style: TextStyle(color: AppColors.textMuted))))
              : AspectRatio(
                  aspectRatio: 1,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final cell = constraints.maxWidth / 8;
                      return Column(
                        children: List.generate(8, (dr) {
                          final r = flip ? 7 - dr : dr;
                          return Expanded(
                            child: Row(
                              children: List.generate(8, (dc) {
                                final c = flip ? 7 - dc : dc;
                                final piece = grid[r][c];
                                final dark = (r + c) % 2 == 1;
                                final key = '$r:$c';
                                final selected = _selected != null && _selected![0] == r && _selected![1] == c;
                                final isTarget = targets.contains(key);
                                final canPick = _myTurn && movable.contains(key);
                                final inLastPath = lastPath.any((p) => p[0] == r && p[1] == c);
                                return Expanded(
                                  child: GestureDetector(
                                    behavior: HitTestBehavior.opaque,
                                    onTap: () => _tap(r, c, legal),
                                    child: Stack(
                                      alignment: Alignment.center,
                                      children: [
                                        AnimatedContainer(
                                          duration: const Duration(milliseconds: 160),
                                          decoration: BoxDecoration(
                                            color: dark ? playground.darkSquare : playground.lightSquare,
                                            border: Border.all(
                                              color: selected
                                                  ? playground.accent
                                                  : inLastPath
                                                      ? playground.glow.withValues(alpha: 0.7)
                                                      : Colors.transparent,
                                              width: selected ? 2.5 : 1.5,
                                            ),
                                          ),
                                        ),
                                        if (isTarget)
                                          Container(
                                            width: cell * 0.34,
                                            height: cell * 0.34,
                                            decoration: BoxDecoration(
                                              shape: BoxShape.circle,
                                              color: playground.accent.withValues(alpha: 0.85),
                                              boxShadow: [BoxShadow(color: playground.accent.withValues(alpha: 0.8), blurRadius: 10)],
                                            ),
                                          ),
                                        if (piece.isNotEmpty)
                                          AnimatedScale(
                                            duration: const Duration(milliseconds: 160),
                                            scale: selected ? 1.12 : 1,
                                            child: SkinnedPiece(
                                              skin: TableSkins.pieceSkin(widget.session.cosmeticsOf(_owner(piece)).piece),
                                              seat: _owner(piece),
                                              size: cell * 0.82,
                                              crown: piece == 'R' || piece == 'B',
                                              highlight: canPick && !selected,
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                );
                              }),
                            ),
                          );
                        }),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }
}

class _Move {
  const _Move(this.fr, this.fc, this.tr, this.tc, this.captures);
  final int fr;
  final int fc;
  final int tr;
  final int tc;
  final int captures;
}

class _ScoreRow extends StatelessWidget {
  const _ScoreRow({required this.session, required this.mySeat, required this.captured});
  final GameSessionView session;
  final int mySeat;
  final List<int> captured;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          for (var i = 0; i < session.seats.length && i < 2; i++)
            Row(
              children: [
                SkinnedPiece(skin: TableSkins.pieceSkin(session.cosmeticsOf(i).piece), seat: i, size: 18),
                const SizedBox(width: 6),
                Text(
                  i == mySeat ? 'You' : session.seats[i].displayName,
                  style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700, fontSize: 12),
                ),
                const SizedBox(width: 6),
                Text(
                  '${i < captured.length ? captured[i] : 0} captured',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
