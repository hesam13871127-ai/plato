import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Backgammon. Points are indexed 0–23 by the server; seat 0 moves 23 → 0 and
/// bears off past 0, seat 1 moves 0 → 23. The board is always drawn from the
/// viewer's perspective (own home board bottom-right). Roll, tap a checker
/// (or the bar) and then a die to move it; legal moves come from the server.
class BackgammonBoard extends StatefulWidget {
  const BackgammonBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<BackgammonBoard> createState() => _BackgammonBoardState();
}

class _BackgammonBoardState extends State<BackgammonBoard> {
  int? _from; // selected origin point (-1 = bar)

  Map<String, dynamic> get b => widget.session.board;

  List<int> get _points => ((b['points'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
  List<int> get _bar => ((b['bar'] as List?) ?? const [0, 0]).whereType<num>().map((n) => n.toInt()).toList();
  List<int> get _off => ((b['off'] as List?) ?? const [0, 0]).whereType<num>().map((n) => n.toInt()).toList();
  List<int> get _dice => ((b['dice'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
  List<int> get _remaining => ((b['remaining'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
  List<_Legal> get _legal => ((b['legal'] as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _Legal((m['from'] as num).toInt(), (m['to'] as num).toInt(), (m['die'] as num).toInt()))
      .toList();

  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;
  int get _me => widget.mySeat < 0 ? 0 : widget.mySeat;

  void _selectFrom(int from) {
    if (!_myTurn) return;
    final legal = _legal;
    if (!legal.any((m) => m.from == from)) return;
    GameFeedback.tap();
    setState(() => _from = _from == from ? null : from);
  }

  void _moveWithDie(int die) {
    if (_from == null) return;
    final legal = _legal.where((m) => m.from == _from && m.die == die).toList();
    if (legal.isEmpty) return;
    GameFeedback.move();
    widget.onAction('move', {'from': _from, 'to': legal.first.to, 'die': die});
    setState(() => _from = null);
  }

  /// Auto-move when only one die is usable from the selected origin.
  void _tapTarget(int to) {
    if (_from == null) return;
    final options = _legal.where((m) => m.from == _from && m.to == to).toList();
    if (options.isEmpty) return;
    _moveWithDie(options.first.die);
  }

  @override
  Widget build(BuildContext context) {
    final points = _points;
    final bar = _bar;
    final off = _off;
    final dice = _dice;
    final remaining = _remaining;
    final legal = _legal;
    final hasRolled = (b['hasRolled'] as bool?) ?? false;
    final opening = b['opening'] as Map?;
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final pip = ((b['pipCount'] as List?) ?? const [0, 0]).whereType<num>().map((n) => n.toInt()).toList();
    final me = _me;
    final opp = 1 - me;
    final result = b['result'] as String?;

    final fromSet = <int>{for (final m in legal) m.from};
    final targets = <int>{if (_from != null) for (final m in legal.where((m) => m.from == _from)) m.to};
    final usableDice = <int>{if (_from != null) for (final m in legal.where((m) => m.from == _from)) m.die};

    String status;
    if (!widget.session.isInProgress) {
      status = result == null ? 'Game over' : 'Game over — ${result == 'single' ? 'single game' : result}!';
    } else if (opening != null) {
      status = _myTurn ? 'Opening roll — roll one die' : 'Opponent rolls for the start…';
    } else if (!_myTurn) {
      status = 'Opponent is moving…';
    } else if (!hasRolled) {
      status = 'Roll the dice!';
    } else if (legal.isEmpty) {
      status = 'No legal move — passing';
    } else if (_from == null) {
      status = bar[me] > 0 ? 'Enter from the bar first' : 'Tap a checker to move';
    } else {
      status = 'Tap a target or a die';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn, icon: Icons.casino_rounded),
        const SizedBox(height: 4),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _PlayerChip(session: widget.session, seat: opp, isMe: false, pips: pip.length > opp ? pip[opp] : 0, off: off.length > opp ? off[opp] : 0),
              _PlayerChip(session: widget.session, seat: me, isMe: widget.mySeat >= 0, pips: pip.length > me ? pip[me] : 0, off: off.length > me ? off[me] : 0),
            ],
          ),
        ),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(6),
          child: points.length < 24
              ? const SizedBox(height: 300, child: Center(child: Text('Setting up…', style: TextStyle(color: AppColors.textMuted))))
              : AspectRatio(
                  aspectRatio: 1.05,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final w = constraints.maxWidth;
                      final h = constraints.maxHeight;
                      final barW = w * 0.09;
                      final trayW = w * 0.09;
                      final pointW = (w - barW - trayW) / 12;
                      final pointH = h * 0.42;
                      final checker = pointW * 0.86;

                      // Display column → server point index, from the viewer's
                      // perspective: home board bottom-right for seat 0; seat 1
                      // sees the board rotated 180°.
                      int pointAt(bool top, int col) {
                        // col 0..11 left→right (skipping the bar visually).
                        if (me == 0) {
                          return top ? 12 + col : 11 - col;
                        }
                        return top ? 11 - col : 12 + col;
                      }

                      Widget buildPoint(bool top, int col) {
                        final idx = pointAt(top, col);
                        final count = points[idx];
                        final owner = count > 0 ? 0 : (count < 0 ? 1 : -1);
                        final n = count.abs();
                        final canPick = _myTurn && fromSet.contains(idx);
                        final isTarget = targets.contains(idx);
                        final selected = _from == idx;
                        final even = col.isEven;
                        final tri = even ? playground.lightSquare : playground.darkSquare;
                        return GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () {
                            if (isTarget) {
                              _tapTarget(idx);
                            } else {
                              _selectFrom(idx);
                            }
                          },
                          child: SizedBox(
                            width: pointW,
                            height: pointH,
                            child: Stack(
                              alignment: top ? Alignment.topCenter : Alignment.bottomCenter,
                              children: [
                                CustomPaint(
                                  size: Size(pointW, pointH),
                                  painter: _TrianglePainter(
                                    color: isTarget ? playground.accent.withValues(alpha: 0.85) : tri,
                                    glow: selected ? playground.glow : null,
                                    pointsDown: top,
                                  ),
                                ),
                                if (n > 0)
                                  Column(
                                    mainAxisSize: MainAxisSize.min,
                                    verticalDirection: top ? VerticalDirection.down : VerticalDirection.up,
                                    children: [
                                      for (var i = 0; i < (n > 5 ? 5 : n); i++)
                                        SizedBox(
                                          height: i == 0 ? checker : checker * 0.78,
                                          child: OverflowBox(
                                            maxHeight: checker,
                                            alignment: top ? Alignment.topCenter : Alignment.bottomCenter,
                                            child: SkinnedPiece(
                                              skin: TableSkins.pieceSkin(widget.session.cosmeticsOf(owner).piece),
                                              seat: owner,
                                              size: checker,
                                              highlight: (canPick && i == (n > 5 ? 4 : n - 1)) || selected,
                                              label: n > 5 && i == 4 ? '$n' : null,
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                              ],
                            ),
                          ),
                        );
                      }

                      Widget half(bool top) {
                        return Row(
                          crossAxisAlignment: top ? CrossAxisAlignment.start : CrossAxisAlignment.end,
                          children: [
                            for (var col = 0; col < 6; col++) buildPoint(top, col),
                            SizedBox(width: barW),
                            for (var col = 6; col < 12; col++) buildPoint(top, col),
                          ],
                        );
                      }

                      return Stack(
                        children: [
                          // Board frame with bar + trays.
                          Positioned.fill(
                            child: Container(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(10),
                                color: Colors.black.withValues(alpha: 0.18),
                                border: Border.all(color: playground.line.withValues(alpha: 0.4)),
                              ),
                            ),
                          ),
                          Positioned(
                            left: pointW * 6,
                            top: 0,
                            bottom: 0,
                            width: barW,
                            child: Container(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [Color.lerp(playground.rail, Colors.black, 0.2)!, playground.rail, Color.lerp(playground.rail, Colors.black, 0.4)!],
                                ),
                              ),
                            ),
                          ),
                          // Points.
                          Positioned(left: 0, top: 0, right: trayW, child: half(true)),
                          Positioned(left: 0, bottom: 0, right: trayW, child: half(false)),
                          // Bar checkers (opponent on top, mine on bottom).
                          Positioned(
                            left: pointW * 6,
                            width: barW,
                            top: 8,
                            child: _BarStack(session: widget.session, seat: opp, count: bar.length > opp ? bar[opp] : 0, size: barW * 0.8),
                          ),
                          Positioned(
                            left: pointW * 6,
                            width: barW,
                            bottom: 8,
                            child: GestureDetector(
                              onTap: () => _selectFrom(-1),
                              child: _BarStack(
                                session: widget.session,
                                seat: me,
                                count: bar.length > me ? bar[me] : 0,
                                size: barW * 0.8,
                                highlight: _myTurn && fromSet.contains(-1),
                                selected: _from == -1,
                              ),
                            ),
                          ),
                          // Bear-off tray (right).
                          Positioned(
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: trayW,
                            child: GestureDetector(
                              onTap: targets.contains(24) ? () => _tapTarget(24) : null,
                              child: Container(
                                decoration: BoxDecoration(
                                  color: targets.contains(24) ? playground.accent.withValues(alpha: 0.35) : Colors.black.withValues(alpha: 0.25),
                                  borderRadius: const BorderRadius.horizontal(right: Radius.circular(10)),
                                  border: Border(left: BorderSide(color: playground.line.withValues(alpha: 0.4))),
                                ),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    _OffStack(session: widget.session, seat: opp, count: off.length > opp ? off[opp] : 0, width: trayW),
                                    Icon(Icons.exit_to_app_rounded, size: trayW * 0.6, color: playground.accent.withValues(alpha: 0.6)),
                                    _OffStack(session: widget.session, seat: me, count: off.length > me ? off[me] : 0, width: trayW),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          // Dice in the middle of the right half.
                          Positioned(
                            left: pointW * 6 + barW + pointW * 1.2,
                            right: trayW + pointW * 1.2,
                            top: h / 2 - 26,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                if (opening != null) ...[
                                  for (var s = 0; s < 2; s++)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 6),
                                      child: (opening['rolls'] as List?)?[s] == null
                                          ? SkinnedDie(skin: TableSkins.diceFor(widget.session, s), value: 6, size: 42, dim: true)
                                          : SkinnedDie(skin: TableSkins.diceFor(widget.session, s), value: ((opening['rolls'] as List)[s] as num).toInt(), size: 42),
                                    ),
                                ] else if (dice.isNotEmpty) ...[
                                  for (var i = 0; i < dice.length; i++)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 5),
                                      child: GestureDetector(
                                        onTap: usableDice.contains(dice[i]) ? () => _moveWithDie(dice[i]) : null,
                                        child: _DieWithUses(
                                          skin: TableSkins.diceFor(widget.session, widget.session.currentSeat),
                                          value: dice[i],
                                          used: !remaining.contains(dice[i]),
                                          usable: usableDice.contains(dice[i]),
                                          count: dice[0] == dice[1] ? (i == 0 ? remaining.length : 0) : 1,
                                          accent: playground.accent,
                                        ),
                                      ),
                                    ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
          child: Row(
            children: [
              ActionButton(
                label: opening != null ? 'Roll for start' : 'Roll dice',
                icon: Icons.casino_rounded,
                onPressed: _myTurn && !hasRolled
                    ? () {
                        GameFeedback.roll();
                        widget.onAction('roll', {});
                      }
                    : null,
              ),
              if (_myTurn && hasRolled && legal.isEmpty) ...[
                const SizedBox(width: 10),
                ActionButton(
                  label: 'Pass',
                  icon: Icons.skip_next_rounded,
                  color: AppColors.surfaceElevated,
                  onPressed: () {
                    GameFeedback.tap();
                    widget.onAction('pass', {});
                  },
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Legal {
  const _Legal(this.from, this.to, this.die);
  final int from;
  final int to;
  final int die;
}

class _TrianglePainter extends CustomPainter {
  _TrianglePainter({required this.color, required this.pointsDown, this.glow});
  final Color color;
  final bool pointsDown;
  final Color? glow;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path();
    if (pointsDown) {
      path
        ..moveTo(2, 0)
        ..lineTo(size.width - 2, 0)
        ..lineTo(size.width / 2, size.height)
        ..close();
    } else {
      path
        ..moveTo(2, size.height)
        ..lineTo(size.width - 2, size.height)
        ..lineTo(size.width / 2, 0)
        ..close();
    }
    if (glow != null) {
      canvas.drawPath(
        path,
        Paint()
          ..color = glow!.withValues(alpha: 0.7)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
      );
    }
    canvas.drawPath(
      path,
      Paint()
        ..shader = LinearGradient(
          begin: pointsDown ? Alignment.topCenter : Alignment.bottomCenter,
          end: pointsDown ? Alignment.bottomCenter : Alignment.topCenter,
          colors: [color, Color.lerp(color, Colors.black, 0.35)!],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8
        ..color = Colors.white.withValues(alpha: 0.12),
    );
  }

  @override
  bool shouldRepaint(covariant _TrianglePainter old) => old.color != color || old.glow != glow || old.pointsDown != pointsDown;
}

class _BarStack extends StatelessWidget {
  const _BarStack({required this.session, required this.seat, required this.count, required this.size, this.highlight = false, this.selected = false});
  final GameSessionView session;
  final int seat;
  final int count;
  final double size;
  final bool highlight;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return SizedBox(height: size);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SkinnedPiece(
          skin: TableSkins.pieceSkin(session.cosmeticsOf(seat).piece),
          seat: seat,
          size: size,
          highlight: highlight || selected,
          label: count > 1 ? '$count' : null,
        ),
      ],
    );
  }
}

class _OffStack extends StatelessWidget {
  const _OffStack({required this.session, required this.seat, required this.count, required this.width});
  final GameSessionView session;
  final int seat;
  final int count;
  final double width;

  @override
  Widget build(BuildContext context) {
    final palette = TableSkins.paletteFor(session, seat);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < (count > 8 ? 8 : count); i++)
            Container(
              width: width * 0.7,
              height: 5,
              margin: const EdgeInsets.only(bottom: 2),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(2),
                gradient: LinearGradient(colors: [palette.light, palette.base, palette.dark]),
              ),
            ),
          if (count > 0)
            Text('$count', style: TextStyle(color: palette.light, fontSize: 11, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _DieWithUses extends StatelessWidget {
  const _DieWithUses({required this.skin, required this.value, required this.used, required this.usable, required this.count, required this.accent});
  final DiceSkin skin;
  final int value;
  final bool used;
  final bool usable;
  final int count;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          decoration: usable
              ? BoxDecoration(borderRadius: BorderRadius.circular(12), boxShadow: [BoxShadow(color: accent.withValues(alpha: 0.9), blurRadius: 14)])
              : null,
          child: SkinnedDie(skin: skin, value: value, size: 42, dim: used),
        ),
        if (count > 1)
          Positioned(
            right: -6,
            top: -6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(8)),
              child: Text('×$count', style: const TextStyle(color: Colors.black, fontSize: 10, fontWeight: FontWeight.w900)),
            ),
          ),
      ],
    );
  }
}

class _PlayerChip extends StatelessWidget {
  const _PlayerChip({required this.session, required this.seat, required this.isMe, required this.pips, required this.off});
  final GameSessionView session;
  final int seat;
  final bool isMe;
  final int pips;
  final int off;

  @override
  Widget build(BuildContext context) {
    final name = seat < session.seats.length ? session.seats[seat].displayName : 'Player';
    return Row(
      children: [
        SkinnedPiece(skin: TableSkins.pieceSkin(session.cosmeticsOf(seat).piece), seat: seat, size: 18),
        const SizedBox(width: 6),
        Text(isMe ? 'You' : name, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700, fontSize: 12)),
        const SizedBox(width: 6),
        Text('$pips pips · $off off', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
      ],
    );
  }
}
