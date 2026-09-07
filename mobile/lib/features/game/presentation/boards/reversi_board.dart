import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Reversi (Othello): 8×8 grid of discs. Legal cells for the side to move come
/// from the server (`legal`) and glow; the last move and its flips are
/// highlighted. A "Pass" button appears only when you have no legal move.
class ReversiBoard extends StatelessWidget {
  const ReversiBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  Map<String, dynamic> get b => session.board;

  List<List<int>> get _grid {
    final raw = (b['grid'] as List?) ?? const [];
    return raw.map((row) => (row as List).map((v) => (v as num?)?.toInt() ?? -1).toList()).toList();
  }

  @override
  Widget build(BuildContext context) {
    final grid = _grid;
    final myTurn = session.isInProgress && session.currentSeat == mySeat;
    final playground = TableSkins.playgroundFor(session, mySeat);
    final counts = ((b['counts'] as List?) ?? const [2, 2]).whereType<num>().map((n) => n.toInt()).toList();
    final legal = <String>{
      for (final cell in ((b['legal'] as List?) ?? const []).whereType<List>()) '${(cell[0] as num).toInt()}:${(cell[1] as num).toInt()}',
    };
    final last = b['lastMove'] as Map?;
    final lastR = (last?['r'] as num?)?.toInt();
    final lastC = (last?['c'] as num?)?.toInt();
    final flipped = <String>{
      for (final f in ((last?['flipped'] as List?) ?? const []).whereType<List>()) '${(f[0] as num).toInt()}:${(f[1] as num).toInt()}',
    };
    final mustPass = myTurn && legal.isEmpty;

    return Column(
      children: [
        TurnIndicator(
          text: session.isInProgress
              ? (myTurn ? (mustPass ? 'No legal move — pass' : 'Your move — tap a glowing square') : 'Opponent is thinking…')
              : 'Game over',
          highlight: myTurn,
          icon: Icons.flip_camera_android_rounded,
        ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (var i = 0; i < 2 && i < session.seats.length; i++)
                Row(
                  children: [
                    SkinnedPiece(skin: TableSkins.pieceSkin(session.cosmeticsOf(i).piece), seat: i, size: 20),
                    const SizedBox(width: 6),
                    Text(
                      '${i == mySeat ? 'You' : session.seats[i].displayName}  ',
                      style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700, fontSize: 12),
                    ),
                    Text(
                      '${i < counts.length ? counts[i] : 0}',
                      style: TextStyle(color: playground.accent, fontWeight: FontWeight.w900, fontSize: 16),
                    ),
                  ],
                ),
            ],
          ),
        ),
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
                      return Container(
                        decoration: BoxDecoration(
                          color: playground.darkSquare,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: playground.line),
                        ),
                        child: Column(
                          children: List.generate(8, (r) {
                            return Expanded(
                              child: Row(
                                children: List.generate(8, (c) {
                                  final owner = grid[r][c];
                                  final key = '$r:$c';
                                  final isLegal = myTurn && legal.contains(key);
                                  final isLast = lastR == r && lastC == c;
                                  final wasFlipped = flipped.contains(key);
                                  return Expanded(
                                    child: GestureDetector(
                                      behavior: HitTestBehavior.opaque,
                                      onTap: isLegal
                                          ? () {
                                              GameFeedback.move();
                                              onAction('place', {'r': r, 'c': c});
                                            }
                                          : null,
                                      child: Container(
                                        decoration: BoxDecoration(
                                          border: Border.all(color: playground.line.withValues(alpha: 0.35), width: 0.6),
                                          color: isLast ? playground.glow.withValues(alpha: 0.25) : null,
                                        ),
                                        child: Center(
                                          child: owner >= 0
                                              ? AnimatedSwitcher(
                                                  duration: const Duration(milliseconds: 260),
                                                  transitionBuilder: (child, anim) => ScaleTransition(scale: anim, child: child),
                                                  child: SkinnedPiece(
                                                    key: ValueKey('$key:$owner'),
                                                    skin: TableSkins.pieceSkin(session.cosmeticsOf(owner).piece),
                                                    seat: owner,
                                                    size: cell * 0.8,
                                                    highlight: wasFlipped || isLast,
                                                  ),
                                                )
                                              : isLegal
                                                  ? Container(
                                                      width: cell * 0.3,
                                                      height: cell * 0.3,
                                                      decoration: BoxDecoration(
                                                        shape: BoxShape.circle,
                                                        color: playground.accent.withValues(alpha: 0.7),
                                                        boxShadow: [BoxShadow(color: playground.accent.withValues(alpha: 0.7), blurRadius: 8)],
                                                      ),
                                                    )
                                                  : null,
                                        ),
                                      ),
                                    ),
                                  );
                                }),
                              ),
                            );
                          }),
                        ),
                      );
                    },
                  ),
                ),
        ),
        if (mustPass)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
            child: Row(
              children: [
                ActionButton(
                  label: 'Pass',
                  icon: Icons.skip_next_rounded,
                  onPressed: () {
                    GameFeedback.tap();
                    onAction('pass', {});
                  },
                ),
              ],
            ),
          ),
      ],
    );
  }
}
