import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Mines — competitive minesweeper for 2–4 players on one shared field. Tap a
/// hidden cell: a mine plants your flag (drawn as your piece) and you go
/// again; a number passes the turn. Pinch/scroll to explore larger fields.
class MinesBoard extends StatefulWidget {
  const MinesBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<MinesBoard> createState() => _MinesBoardState();
}

class _MinesBoardState extends State<MinesBoard> {
  final TransformationController _zoom = TransformationController();

  Map<String, dynamic> get b => widget.session.board;
  List<List<int>> _matrix(String key) =>
      ((b[key] as List?) ?? const []).map((row) => (row as List).map((v) => (v as num).toInt()).toList()).toList();
  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  @override
  void dispose() {
    _zoom.dispose();
    super.dispose();
  }

  void _reveal(int r, int c) {
    if (!_myTurn) return;
    GameFeedback.tap();
    widget.onAction('reveal', {'r': r, 'c': c});
  }

  static const _numberColors = [
    Colors.transparent,
    Color(0xFF5DB8FF),
    Color(0xFF3DF2C4),
    Color(0xFFFF6B8B),
    Color(0xFF8A6CFF),
    Color(0xFFFFC857),
    Color(0xFF7DF9FF),
    Color(0xFFFFFFFF),
    Color(0xFFFF9DB4),
  ];

  @override
  Widget build(BuildContext context) {
    final cells = _matrix('cells');
    final owners = _matrix('owners');
    final size = (b['size'] as num?)?.toInt() ?? cells.length;
    final flags = ((b['flags'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    final remaining = (b['remaining'] as num?)?.toInt() ?? 0;
    final last = b['lastMove'] as Map?;
    final lastR = (last?['r'] as num?)?.toInt();
    final lastC = (last?['c'] as num?)?.toInt();
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final current = widget.session.currentSeat;

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (_myTurn) {
      status = last != null && last['mine'] == true && last['seat'] == widget.mySeat ? 'Mine! Go again' : 'Your turn — tap a hidden cell';
    } else {
      final name = current >= 0 && current < widget.session.seats.length ? widget.session.seats[current].displayName : 'Opponent';
      status = '$name is sweeping…';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn, icon: Icons.flag_rounded),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    for (var i = 0; i < widget.session.seats.length; i++)
                      _FlagChip(
                        session: widget.session,
                        seat: i,
                        isMe: i == widget.mySeat,
                        flags: i < flags.length ? flags[i] : 0,
                        active: i == current && widget.session.isInProgress,
                      ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.glassStroke)),
                child: Row(
                  children: [
                    const Icon(Icons.brightness_7_rounded, size: 14, color: AppColors.coral),
                    const SizedBox(width: 4),
                    Text('$remaining left', style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(8),
          child: cells.isEmpty
              ? const SizedBox(height: 300, child: Center(child: Text('Laying the field…', style: TextStyle(color: AppColors.textMuted))))
              : AspectRatio(
                  aspectRatio: 1,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: InteractiveViewer(
                      transformationController: _zoom,
                      minScale: 1,
                      maxScale: 3,
                      child: LayoutBuilder(
                        builder: (context, constraints) {
                          final cell = constraints.maxWidth / size;
                          return Column(
                            children: [
                              for (var r = 0; r < size; r++)
                                Expanded(
                                  child: Row(
                                    children: [
                                      for (var c = 0; c < size; c++)
                                        Expanded(
                                          child: _Cell(
                                            value: r < cells.length && c < cells[r].length ? cells[r][c] : -1,
                                            owner: r < owners.length && c < owners[r].length ? owners[r][c] : -1,
                                            size: cell,
                                            session: widget.session,
                                            playground: playground,
                                            isLast: lastR == r && lastC == c,
                                            canTap: _myTurn,
                                            onTap: () => _reveal(r, c),
                                            numberColor: (v) => _numberColors[v.clamp(0, 8)],
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                            ],
                          );
                        },
                      ),
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.value,
    required this.owner,
    required this.size,
    required this.session,
    required this.playground,
    required this.isLast,
    required this.canTap,
    required this.onTap,
    required this.numberColor,
  });

  final int value; // -1 hidden, 0-8 number, 9 mine
  final int owner;
  final double size;
  final GameSessionView session;
  final PlaygroundSkin playground;
  final bool isLast;
  final bool canTap;
  final VoidCallback onTap;
  final Color Function(int) numberColor;

  @override
  Widget build(BuildContext context) {
    final hidden = value == -1;
    final mine = value == 9;
    final gap = size > 28 ? 2.0 : 1.0;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: hidden && canTap ? onTap : null,
      child: Padding(
        padding: EdgeInsets.all(gap),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(size * 0.18),
            gradient: hidden
                ? LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color.lerp(playground.lightSquare, Colors.white, 0.18)!, playground.lightSquare, playground.darkSquare],
                  )
                : null,
            color: hidden ? null : (mine ? Colors.black.withValues(alpha: 0.35) : playground.feltBottom.withValues(alpha: 0.7)),
            border: Border.all(
              color: isLast ? playground.accent : (hidden ? Colors.white.withValues(alpha: 0.12) : Colors.black.withValues(alpha: 0.25)),
              width: isLast ? 1.6 : 0.8,
            ),
            boxShadow: hidden ? [BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: 2, offset: const Offset(0, 1.5))] : null,
          ),
          child: Center(
            child: mine
                ? TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0.2, end: 1),
                    duration: const Duration(milliseconds: 320),
                    curve: Curves.elasticOut,
                    builder: (context, t, child) => Transform.scale(scale: t, child: child),
                    child: SkinnedPiece(
                      skin: TableSkins.pieceSkin(session.cosmeticsOf(owner < 0 ? 0 : owner).piece),
                      seat: owner < 0 ? 0 : owner,
                      size: size * 0.8,
                      highlight: isLast,
                    ),
                  )
                : (!hidden && value > 0
                    ? Text(
                        '$value',
                        style: TextStyle(
                          color: numberColor(value),
                          fontSize: size * 0.55,
                          fontWeight: FontWeight.w900,
                          shadows: const [Shadow(color: Colors.black54, blurRadius: 2)],
                        ),
                      )
                    : null),
          ),
        ),
      ),
    );
  }
}

class _FlagChip extends StatelessWidget {
  const _FlagChip({required this.session, required this.seat, required this.isMe, required this.flags, required this.active});
  final GameSessionView session;
  final int seat;
  final bool isMe;
  final int flags;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final name = isMe ? 'You' : session.seats[seat].displayName;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: active ? AppColors.electricPurple.withValues(alpha: 0.28) : AppColors.glassFill,
        border: Border.all(color: active ? AppColors.softCyan : AppColors.glassStroke),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SkinnedPiece(skin: TableSkins.pieceSkin(session.cosmeticsOf(seat).piece), seat: seat, size: 14),
          const SizedBox(width: 5),
          Text(name, style: const TextStyle(color: AppColors.textPrimary, fontSize: 11, fontWeight: FontWeight.w700)),
          const SizedBox(width: 5),
          Text('$flags', style: TextStyle(color: active ? AppColors.softCyan : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}
