import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Dots & Boxes for 2–4 players. Tap the gap between two dots to draw a line;
/// closing a box stamps it with your piece and gives you another turn. The
/// board is `size × size` boxes (5 for 2 players, up to 7 for 4).
class DotsBoxesBoard extends StatelessWidget {
  const DotsBoxesBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  Map<String, dynamic> get b => session.board;

  List<List<int>> _matrix(String key) {
    final raw = (b[key] as List?) ?? const [];
    return raw.map((row) => (row as List).map((v) => (v as num?)?.toInt() ?? -1).toList()).toList();
  }

  @override
  Widget build(BuildContext context) {
    final size = (b['size'] as num?)?.toInt() ?? 5;
    final h = _matrix('h');
    final v = _matrix('v');
    final boxes = _matrix('boxes');
    final claimed = ((b['claimed'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    final last = b['lastEdge'] as Map?;
    final myTurn = session.isInProgress && session.currentSeat == mySeat;
    final playground = TableSkins.playgroundFor(session, mySeat);
    final remaining = (b['remainingEdges'] as num?)?.toInt() ?? 0;

    return Column(
      children: [
        TurnIndicator(
          text: session.isInProgress
              ? (myTurn ? 'Your turn — draw a line' : '${_name(session.currentSeat)} is drawing…')
              : 'Game over',
          highlight: myTurn,
          icon: Icons.grid_on_rounded,
        ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              for (var i = 0; i < session.seats.length; i++)
                _SeatScore(
                  session: session,
                  seat: i,
                  isMe: i == mySeat,
                  active: session.isInProgress && session.currentSeat == i,
                  boxes: i < claimed.length ? claimed[i] : 0,
                  accent: playground.accent,
                ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(14),
          child: h.isEmpty
              ? const SizedBox(height: 300, child: Center(child: Text('Setting up…', style: TextStyle(color: AppColors.textMuted))))
              : AspectRatio(
                  aspectRatio: 1,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final total = constraints.maxWidth;
                      const dot = 12.0;
                      final cell = (total - dot) / size;
                      return Stack(
                        children: [
                          // Boxes.
                          for (var r = 0; r < size; r++)
                            for (var c = 0; c < size; c++)
                              Positioned(
                                left: dot / 2 + c * cell,
                                top: dot / 2 + r * cell,
                                width: cell,
                                height: cell,
                                child: _Box(
                                  owner: boxes[r][c],
                                  session: session,
                                  glow: playground.glow,
                                ),
                              ),
                          // Horizontal edges.
                          for (var r = 0; r <= size; r++)
                            for (var c = 0; c < size; c++)
                              Positioned(
                                left: dot / 2 + c * cell + dot * 0.4,
                                top: dot / 2 + r * cell - cell * 0.16,
                                width: cell - dot * 0.8,
                                height: cell * 0.32,
                                child: _Edge(
                                  owner: h[r][c],
                                  horizontal: true,
                                  session: session,
                                  enabled: myTurn && h[r][c] == -1,
                                  isLast: last != null && last['kind'] == 'h' && last['r'] == r && last['c'] == c,
                                  line: playground.line,
                                  onTap: () {
                                    GameFeedback.move();
                                    onAction('draw', {'kind': 'h', 'r': r, 'c': c});
                                  },
                                ),
                              ),
                          // Vertical edges.
                          for (var r = 0; r < size; r++)
                            for (var c = 0; c <= size; c++)
                              Positioned(
                                left: dot / 2 + c * cell - cell * 0.16,
                                top: dot / 2 + r * cell + dot * 0.4,
                                width: cell * 0.32,
                                height: cell - dot * 0.8,
                                child: _Edge(
                                  owner: v[r][c],
                                  horizontal: false,
                                  session: session,
                                  enabled: myTurn && v[r][c] == -1,
                                  isLast: last != null && last['kind'] == 'v' && last['r'] == r && last['c'] == c,
                                  line: playground.line,
                                  onTap: () {
                                    GameFeedback.move();
                                    onAction('draw', {'kind': 'v', 'r': r, 'c': c});
                                  },
                                ),
                              ),
                          // Dots on top.
                          for (var r = 0; r <= size; r++)
                            for (var c = 0; c <= size; c++)
                              Positioned(
                                left: c * cell,
                                top: r * cell,
                                child: IgnorePointer(
                                  child: Container(
                                    width: dot,
                                    height: dot,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      gradient: RadialGradient(
                                        center: const Alignment(-0.3, -0.3),
                                        colors: [Colors.white, playground.accent],
                                      ),
                                      boxShadow: [BoxShadow(color: playground.accent.withValues(alpha: 0.6), blurRadius: 6)],
                                    ),
                                  ),
                                ),
                              ),
                        ],
                      );
                    },
                  ),
                ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text('$remaining lines left', style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
        ),
      ],
    );
  }

  String _name(int seat) {
    if (seat < 0 || seat >= session.seats.length) return 'Someone';
    return session.seats[seat].displayName;
  }
}

class _SeatScore extends StatelessWidget {
  const _SeatScore({
    required this.session,
    required this.seat,
    required this.isMe,
    required this.active,
    required this.boxes,
    required this.accent,
  });
  final GameSessionView session;
  final int seat;
  final bool isMe;
  final bool active;
  final int boxes;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: active ? accent.withValues(alpha: 0.16) : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: active ? accent : Colors.transparent),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SkinnedPiece(skin: TableSkins.pieceSkin(session.cosmeticsOf(seat).piece), seat: seat, size: 18),
          const SizedBox(width: 6),
          Text(
            isMe ? 'You' : session.seats[seat].displayName.split(' ').first,
            style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w700),
          ),
          const SizedBox(width: 6),
          Text('$boxes', style: TextStyle(color: accent, fontSize: 15, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

class _Box extends StatelessWidget {
  const _Box({required this.owner, required this.session, required this.glow});
  final int owner;
  final GameSessionView session;
  final Color glow;

  @override
  Widget build(BuildContext context) {
    if (owner < 0) return const SizedBox.shrink();
    final palette = TableSkins.paletteFor(session, owner);
    return IgnorePointer(
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 260),
        margin: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [palette.base.withValues(alpha: 0.55), palette.dark.withValues(alpha: 0.6)],
          ),
          boxShadow: [BoxShadow(color: palette.glow.withValues(alpha: 0.35), blurRadius: 8)],
        ),
        child: Center(
          child: LayoutBuilder(
            builder: (context, c) => SkinnedPiece(
              skin: TableSkins.pieceSkin(session.cosmeticsOf(owner).piece),
              seat: owner,
              size: c.maxWidth * 0.5,
            ),
          ),
        ),
      ),
    );
  }
}

class _Edge extends StatelessWidget {
  const _Edge({
    required this.owner,
    required this.horizontal,
    required this.session,
    required this.enabled,
    required this.isLast,
    required this.line,
    required this.onTap,
  });
  final int owner;
  final bool horizontal;
  final GameSessionView session;
  final bool enabled;
  final bool isLast;
  final Color line;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final drawn = owner >= 0;
    final palette = drawn ? TableSkins.paletteFor(session, owner) : null;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: enabled ? onTap : null,
      child: Center(
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          width: horizontal ? double.infinity : (drawn ? 6 : 4),
          height: horizontal ? (drawn ? 6 : 4) : double.infinity,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(4),
            color: drawn ? palette!.base : line.withValues(alpha: enabled ? 0.35 : 0.15),
            boxShadow: drawn
                ? [BoxShadow(color: palette!.glow.withValues(alpha: isLast ? 0.9 : 0.4), blurRadius: isLast ? 10 : 4)]
                : null,
          ),
        ),
      ),
    );
  }
}
