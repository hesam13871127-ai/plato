import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Dominoes (Phase 4): draw dominoes, match the open ends of the chain, or
/// draw/pass. The board state is the redacted domino projection (own hand +
/// opponents' tile counts + the played chain).
class DominoesBoard extends StatelessWidget {
  const DominoesBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  List<List<int>> get _chain {
    final domino = session.dominoBoard;
    final out = <List<int>>[];
    for (final link in domino?.chain ?? const <Map<String, dynamic>>[]) {
      final raw = link['tile'];
      if (raw is List && raw.length == 2) {
        out.add([(raw[0] as num).toInt(), (raw[1] as num).toInt()]);
      }
    }
    return out;
  }

  List<List<int>> get _hand =>
      session.dominoBoard?.myHand ?? const <List<int>>[];

  int get _boneyard => session.dominoBoard?.boneyard ?? 0;

  bool get _myTurn => session.isInProgress && session.currentSeat == mySeat;

  @override
  Widget build(BuildContext context) {
    final tiles = _chain;
    return Column(
      children: [
        TurnIndicator(
          text: session.isInProgress ? (_myTurn ? 'Your turn' : 'Waiting…') : 'Game over',
          highlight: _myTurn,
        ),
        const SizedBox(height: 8),
        TableSurface(
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.inventory_2, size: 16, color: AppColors.textSecondary),
                  const SizedBox(width: 6),
                  Text('Boneyard: $_boneyard',
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                ],
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 90,
                child: tiles.isEmpty
                    ? const Center(
                        child: Text('The table is empty — lead a tile!',
                            style: TextStyle(color: AppColors.textMuted)))
                    : ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: tiles.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 6),
                        itemBuilder: (context, i) =>
                            _DominoTile(a: tiles[i][0], b: tiles[i][1], horizontal: true),
                      ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        if (session.isInProgress)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _myTurn
                        ? () {
                            GameFeedback.roll();
                            onAction('draw', {});
                          }
                        : null,
                    icon: const Icon(Icons.download, size: 18),
                    label: const Text('Draw'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.softCyan,
                      side: BorderSide(color: AppColors.glassStroke),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _myTurn
                        ? () {
                            GameFeedback.tap();
                            onAction('pass', {});
                          }
                        : null,
                    icon: const Icon(Icons.skip_next, size: 18),
                    label: const Text('Pass'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.warning,
                      side: BorderSide(color: AppColors.glassStroke),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 8),
        SizedBox(
          height: 118,
          child: _hand.isEmpty
              ? const Center(
                  child: Text('No tiles in hand.', style: TextStyle(color: AppColors.textMuted)))
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  itemCount: _hand.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, i) => GestureDetector(
                    onTap: _myTurn
                        ? () {
                            GameFeedback.move();
                            onAction('play_tile', {
                              'tile': _hand[i],
                            });
                          }
                        : null,
                    child: Opacity(
                      opacity: _myTurn ? 1 : 0.7,
                      child: _DominoTile(a: _hand[i][0], b: _hand[i][1], horizontal: false),
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}

class _DominoTile extends StatelessWidget {
  const _DominoTile({required this.a, required this.b, required this.horizontal});
  final int a;
  final int b;
  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    final double width = horizontal ? 62 : 46;
    final double height = horizontal ? 46 : 88;
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.white, Color(0xFFD9E2F5)],
        ),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.glassStroke),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 6, offset: const Offset(0, 3))],
      ),
      child: horizontal
          ? Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _Pips(value: a),
                const VerticalDivider(width: 1, thickness: 1, color: AppColors.deepNavy),
                _Pips(value: b),
              ],
            )
          : Column(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _Pips(value: a),
                const Divider(height: 1, thickness: 1, color: AppColors.deepNavy),
                _Pips(value: b),
              ],
            ),
    );
  }
}

class _Pips extends StatelessWidget {
  const _Pips({required this.value});
  final int value;

  static const _layout = {
    0: <List<int>>[],
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  };

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 22,
      height: 22,
      child: Stack(
        children: [
          for (final p in _layout[value] ?? const <List<int>>[])
            Positioned(
              left: p[1] * 8.0 + 2,
              top: p[0] * 8.0 + 2,
              child: Container(
                width: 5,
                height: 5,
                decoration: const BoxDecoration(color: AppColors.deepNavy, shape: BoxShape.circle),
              ),
            ),
        ],
      ),
    );
  }
}
