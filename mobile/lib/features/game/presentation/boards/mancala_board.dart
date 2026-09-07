import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Mancala (Kalah). Cups 0–5 belong to seat 0 (bottom row, left→right), 6 is
/// seat 0's store (right), 7–12 belong to seat 1 (top row, right→left) and 13
/// is seat 1's store (left). The board is drawn from the viewer's side, so
/// your pits are always the bottom row and your store is on the right.
/// Stones are drawn as small skinned pieces in each owner's piece set.
class MancalaBoard extends StatelessWidget {
  const MancalaBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  Map<String, dynamic> get b => session.board;
  List<int> get _cups => ((b['cups'] as List?) ?? List.filled(14, 0)).whereType<num>().map((n) => n.toInt()).toList();
  List<int> get _legal => ((b['legal'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
  bool get _myTurn => session.isInProgress && session.currentSeat == mySeat;
  int get _me => mySeat < 0 ? 0 : mySeat;

  void _sow(int pit) {
    if (!_myTurn || !_legal.contains(pit)) return;
    GameFeedback.move();
    onAction('sow', {'pit': pit});
  }

  @override
  Widget build(BuildContext context) {
    final cups = _cups;
    if (cups.length < 14) return const SizedBox(height: 200, child: Center(child: Text('Setting up…', style: TextStyle(color: AppColors.textMuted))));
    final legal = _legal;
    final playground = TableSkins.playgroundFor(session, mySeat);
    final me = _me;
    final opp = 1 - me;
    final last = b['lastMove'] as Map?;
    final lastPath = ((last?['path'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toSet();
    final lastSeat = (last?['seat'] as num?)?.toInt();
    final captured = (last?['captured'] as num?)?.toInt() ?? 0;
    final extra = last?['extraTurn'] == true;

    // Row layout from the viewer's perspective.
    final myPits = me == 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
    final oppPits = me == 0 ? [12, 11, 10, 9, 8, 7] : [5, 4, 3, 2, 1, 0];
    final myStore = me == 0 ? 6 : 13;
    final oppStore = me == 0 ? 13 : 6;

    String status;
    if (!session.isInProgress) {
      status = 'Game over';
    } else if (_myTurn) {
      status = extra && lastSeat == me ? 'Extra turn! Sow again' : 'Your turn — tap one of your pits';
    } else {
      status = 'Opponent is sowing…';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn, icon: Icons.grain_rounded),
        const SizedBox(height: 4),
        if (last != null)
          Text(
            captured > 0
                ? '${lastSeat == mySeat ? 'You' : 'Opponent'} captured $captured stones!'
                : extra
                    ? '${lastSeat == mySeat ? 'You' : 'Opponent'} landed in the store — again!'
                    : '${lastSeat == mySeat ? 'You' : 'Opponent'} sowed ${lastPath.length} stones',
            style: TextStyle(color: captured > 0 ? AppColors.coral : AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w700),
          ),
        const SizedBox(height: 4),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(10),
          child: Column(
            children: [
              _NameRow(session: session, seat: opp, isMe: false, stones: cups[oppStore], active: session.isInProgress && session.currentSeat == opp, alignEnd: false),
              const SizedBox(height: 6),
              AspectRatio(
                aspectRatio: 1.9,
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final w = constraints.maxWidth;
                    final h = constraints.maxHeight;
                    final storeW = w * 0.14;
                    final pitW = (w - storeW * 2 - 14) / 6;
                    return Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(h * 0.3),
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Color.lerp(playground.rail, Colors.white, 0.15)!, playground.rail, Color.lerp(playground.rail, Colors.black, 0.4)!],
                        ),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 18, offset: const Offset(0, 10)),
                          BoxShadow(color: playground.glow.withValues(alpha: 0.2), blurRadius: 30, spreadRadius: -6),
                        ],
                      ),
                      padding: const EdgeInsets.all(7),
                      child: Row(
                        children: [
                          _Store(
                            count: cups[oppStore],
                            width: storeW,
                            session: session,
                            owner: opp,
                            playground: playground,
                            highlight: lastPath.contains(oppStore),
                          ),
                          const SizedBox(width: 7),
                          Expanded(
                            child: Column(
                              children: [
                                Expanded(
                                  child: Row(
                                    children: [
                                      for (final pit in oppPits)
                                        Expanded(
                                          child: _Pit(
                                            count: cups[pit],
                                            session: session,
                                            owner: opp,
                                            playground: playground,
                                            width: pitW,
                                            highlight: lastPath.contains(pit),
                                            selectable: false,
                                            onTap: null,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Expanded(
                                  child: Row(
                                    children: [
                                      for (final pit in myPits)
                                        Expanded(
                                          child: _Pit(
                                            count: cups[pit],
                                            session: session,
                                            owner: me,
                                            playground: playground,
                                            width: pitW,
                                            highlight: lastPath.contains(pit),
                                            selectable: _myTurn && legal.contains(pit),
                                            onTap: () => _sow(pit),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 7),
                          _Store(
                            count: cups[myStore],
                            width: storeW,
                            session: session,
                            owner: me,
                            playground: playground,
                            highlight: lastPath.contains(myStore),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 6),
              _NameRow(session: session, seat: me, isMe: mySeat >= 0, stones: cups[myStore], active: _myTurn, alignEnd: true),
              if (_myTurn) ...[
                const SizedBox(height: 6),
                Text(
                  'Stones go counter-clockwise → your store is on the right. Land there for a free turn.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 10),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _NameRow extends StatelessWidget {
  const _NameRow({required this.session, required this.seat, required this.isMe, required this.stones, required this.active, required this.alignEnd});
  final GameSessionView session;
  final int seat;
  final bool isMe;
  final int stones;
  final bool active;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    final name = isMe ? 'You' : (seat < session.seats.length ? session.seats[seat].displayName : 'Player');
    final children = [
      SkinnedPiece(skin: TableSkins.pieceSkin(session.cosmeticsOf(seat).piece), seat: seat, size: 16),
      const SizedBox(width: 6),
      Text(name, style: TextStyle(color: active ? AppColors.softCyan : AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 12)),
      const SizedBox(width: 8),
      Text('$stones banked', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
    ];
    return Row(mainAxisAlignment: alignEnd ? MainAxisAlignment.end : MainAxisAlignment.start, children: children);
  }
}

class _Pit extends StatelessWidget {
  const _Pit({
    required this.count,
    required this.session,
    required this.owner,
    required this.playground,
    required this.width,
    required this.highlight,
    required this.selectable,
    required this.onTap,
  });

  final int count;
  final GameSessionView session;
  final int owner;
  final PlaygroundSkin playground;
  final double width;
  final bool highlight;
  final bool selectable;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final skin = TableSkins.pieceSkin(session.cosmeticsOf(owner).piece);
    return GestureDetector(
      onTap: selectable ? onTap : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(60),
            gradient: RadialGradient(
              center: const Alignment(0, 0.3),
              colors: [Color.lerp(playground.feltBottom, Colors.black, 0.35)!, playground.feltBottom, Color.lerp(playground.feltTop, Colors.white, 0.05)!],
              stops: const [0.0, 0.7, 1.0],
            ),
            border: Border.all(
              color: selectable ? playground.accent : (highlight ? playground.glow.withValues(alpha: 0.8) : Colors.white.withValues(alpha: 0.08)),
              width: selectable ? 2.2 : 1.2,
            ),
            boxShadow: [
              const BoxShadow(color: Colors.black54, blurRadius: 6, offset: Offset(0, 3)),
              if (selectable) BoxShadow(color: playground.accent.withValues(alpha: 0.45), blurRadius: 14),
            ],
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              _StoneCluster(count: count, skin: skin, seat: owner, size: width),
              Positioned(
                bottom: 2,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(8)),
                  child: Text('$count', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Store extends StatelessWidget {
  const _Store({required this.count, required this.width, required this.session, required this.owner, required this.playground, required this.highlight});
  final int count;
  final double width;
  final GameSessionView session;
  final int owner;
  final PlaygroundSkin playground;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final skin = TableSkins.pieceSkin(session.cosmeticsOf(owner).piece);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      width: width,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(width),
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color.lerp(playground.feltBottom, Colors.black, 0.3)!, playground.feltBottom],
        ),
        border: Border.all(color: highlight ? playground.glow : Colors.white.withValues(alpha: 0.1), width: highlight ? 2 : 1.2),
        boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 6, offset: Offset(0, 3))],
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          _StoneCluster(count: count, skin: skin, seat: owner, size: width, tall: true),
          Positioned(
            bottom: 6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(8)),
              child: Text('$count', style: TextStyle(color: playground.accent, fontSize: 13, fontWeight: FontWeight.w900)),
            ),
          ),
        ],
      ),
    );
  }
}

/// Draws up to [count] small stones scattered deterministically inside a pit.
class _StoneCluster extends StatelessWidget {
  const _StoneCluster({required this.count, required this.skin, required this.seat, required this.size, this.tall = false});
  final int count;
  final PieceSkin skin;
  final int seat;
  final double size;
  final bool tall;

  @override
  Widget build(BuildContext context) {
    final shown = math.min(count, 14);
    final stone = math.max(7.0, size * 0.22);
    final rnd = math.Random(seat * 31 + 7);
    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        final h = constraints.maxHeight;
        return Stack(
          children: [
            for (var i = 0; i < shown; i++)
              Positioned(
                left: w / 2 - stone / 2 + (rnd.nextDouble() - 0.5) * (w - stone) * 0.75,
                top: h / 2 - stone / 2 + (rnd.nextDouble() - 0.5) * (h - stone) * (tall ? 0.8 : 0.6) - (tall ? 6 : 4),
                child: SkinnedPiece(skin: skin, seat: seat, size: stone),
              ),
          ],
        );
      },
    );
  }
}
