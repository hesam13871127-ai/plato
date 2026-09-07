import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Ocho — the UNO-style shedding game. Opponents sit around the felt with
/// fanned card backs, the discard pile sits in the middle (tilted, with the
/// active colour as a glowing halo), the draw pile beside it, and a direction
/// arrow circles the table. Your hand fans along the bottom: playable cards
/// lift and glow; wilds open an in-table colour picker. Penalty stacks (+2/+4)
/// show as a pulsing badge you can either stack on or take.
class OchoBoard extends StatefulWidget {
  const OchoBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<OchoBoard> createState() => _OchoBoardState();
}

class _OchoBoardState extends State<OchoBoard> {
  static const Map<String, Color> _colors = {
    'R': Color(0xFFFF5C5C),
    'G': Color(0xFF2EE6A8),
    'B': Color(0xFF4C8DFF),
    'Y': Color(0xFFFFC857),
    'W': Color(0xFF2A2657),
  };

  Map<String, dynamic>? _pendingWild; // wild card awaiting a colour choice
  bool _busy = false;
  int _lastHandCount = -1;
  String? _lastTopId;

  Map<String, dynamic> get b => widget.session.board;
  List<Map<String, dynamic>> get _hand => ((b['hand'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  List<int> get _handSizes => ((b['handSizes'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
  Map<String, dynamic>? get _top => b['discardTop'] is Map ? Map<String, dynamic>.from(b['discardTop'] as Map) : null;
  String get _activeColor => (b['activeColor'] as String?) ?? (_top?['color'] as String?) ?? 'R';
  int get _drawPending => (b['drawPending'] as num?)?.toInt() ?? 0;
  int get _direction => (b['direction'] as num?)?.toInt() ?? 1;
  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  bool _playable(Map<String, dynamic> card) {
    final top = _top;
    if (top == null) return true;
    if (_drawPending > 0) {
      return (top['rank'] == 'P' && card['rank'] == 'P') || (top['rank'] == 'X' && card['rank'] == 'X');
    }
    if (card['color'] == 'W') return true;
    return card['color'] == _activeColor || card['rank'] == top['rank'];
  }

  bool get _haveMove => _hand.any(_playable);

  @override
  void didUpdateWidget(covariant OchoBoard old) {
    super.didUpdateWidget(old);
    final topId = _top?['id'] as String?;
    if (topId != null && topId != _lastTopId) {
      _lastTopId = topId;
      final rank = _top?['rank'];
      if (rank == 'P' || rank == 'X' || rank == 'S' || rank == 'R') {
        GameFeedback.hit();
      } else {
        GameFeedback.move();
      }
    }
    final n = _hand.length;
    if (_lastHandCount >= 0 && n > _lastHandCount) GameFeedback.roll();
    _lastHandCount = n;
    if (_pendingWild != null && !_hand.any((c) => c['id'] == _pendingWild!['id'])) _pendingWild = null;
  }

  Future<void> _tapCard(Map<String, dynamic> card) async {
    if (!_myTurn || _busy || !_playable(card)) return;
    GameFeedback.tap();
    if (card['color'] == 'W') {
      setState(() => _pendingWild = _pendingWild?['id'] == card['id'] ? null : card);
      return;
    }
    await _play(card, null);
  }

  Future<void> _play(Map<String, dynamic> card, String? color) async {
    setState(() {
      _busy = true;
      _pendingWild = null;
    });
    await widget.onAction('play', {'cardId': card['id'], if (color != null) 'color': color});
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _draw() async {
    if (!_myTurn || _busy) return;
    setState(() {
      _busy = true;
      _pendingWild = null;
    });
    GameFeedback.roll();
    await widget.onAction('draw', {});
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final hand = _hand;
    final sizes = _handSizes;
    final top = _top;
    final drawCount = (b['drawCount'] as num?)?.toInt() ?? 0;
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final seats = widget.session.seats;
    final me = widget.mySeat;
    final current = widget.session.currentSeat;
    final active = _colors[_activeColor] ?? playground.accent;
    final opponents = <int>[for (var i = 0; i < seats.length; i++) if (i != me) i];

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (_myTurn) {
      if (_pendingWild != null) {
        status = 'Pick a colour for your wild';
      } else if (_drawPending > 0) {
        status = _haveMove ? 'Stack another +${top?['rank'] == 'X' ? 4 : 2} or take $_drawPending cards' : 'Ouch — take $_drawPending cards';
      } else if (_haveMove) {
        status = 'Your turn — match ${_colorName(_activeColor)} or ${_rankName(top?['rank'])}';
      } else {
        status = 'No match — draw a card';
      }
    } else {
      final name = current >= 0 && current < seats.length ? seats[current].displayName : 'Opponent';
      status = '$name is playing…';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn, icon: Icons.style_rounded),
        const SizedBox(height: 6),
        Playground(
          skin: playground,
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 8),
          child: Column(
            children: [
              // Opponents.
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  for (final seat in opponents)
                    Expanded(
                      child: _OpponentHand(
                        session: widget.session,
                        seat: seat,
                        cards: seat < sizes.length ? sizes[seat] : 0,
                        active: widget.session.isInProgress && current == seat,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              // Centre: draw pile, discard, direction.
              SizedBox(
                height: 132,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    // Direction ring.
                    Positioned.fill(
                      child: IgnorePointer(
                        child: CustomPaint(painter: _DirectionRingPainter(clockwise: _direction >= 0, color: active.withValues(alpha: 0.35))),
                      ),
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // Draw pile.
                        GestureDetector(
                          onTap: _myTurn && !_busy && (!_haveMove || _drawPending > 0) ? _draw : null,
                          child: _DrawPile(count: drawCount, canDraw: _myTurn && !_busy && (!_haveMove || _drawPending > 0), accent: playground.accent, penalty: _drawPending),
                        ),
                        const SizedBox(width: 26),
                        // Discard.
                        AnimatedSwitcher(
                          duration: const Duration(milliseconds: 260),
                          transitionBuilder: (child, anim) => ScaleTransition(scale: CurvedAnimation(parent: anim, curve: Curves.easeOutBack), child: child),
                          child: top == null
                              ? const SizedBox(width: 68, height: 100)
                              : Container(
                                  key: ValueKey(top['id']),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(14),
                                    boxShadow: [BoxShadow(color: active.withValues(alpha: 0.55), blurRadius: 26, spreadRadius: 2)],
                                  ),
                                  child: Transform.rotate(
                                    angle: -0.08,
                                    child: _OchoCard(color: top['color'] as String? ?? 'W', rank: top['rank'] as String? ?? '0', width: 68, height: 100, overrideColor: (top['color'] == 'W') ? _activeColor : null),
                                  ),
                                ),
                        ),
                      ],
                    ),
                    // Active colour chip.
                    Positioned(
                      right: 4,
                      top: 4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.45), borderRadius: BorderRadius.circular(10), border: Border.all(color: active)),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(width: 10, height: 10, decoration: BoxDecoration(shape: BoxShape.circle, color: active)),
                            const SizedBox(width: 6),
                            Text(_colorName(_activeColor), style: TextStyle(color: active, fontSize: 11, fontWeight: FontWeight.w800)),
                          ],
                        ),
                      ),
                    ),
                    if (_drawPending > 0)
                      Positioned(
                        left: 4,
                        top: 4,
                        child: _PenaltyBadge(count: _drawPending),
                      ),
                  ],
                ),
              ),
              // Wild colour picker (inline).
              AnimatedSize(
                duration: const Duration(milliseconds: 200),
                child: _pendingWild == null
                    ? const SizedBox(height: 4)
                    : Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            for (final c in const ['R', 'G', 'B', 'Y'])
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 6),
                                child: GestureDetector(
                                  onTap: () => _play(_pendingWild!, c),
                                  child: Container(
                                    width: 46,
                                    height: 46,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      gradient: RadialGradient(center: const Alignment(-0.3, -0.3), colors: [Color.lerp(_colors[c], Colors.white, 0.4)!, _colors[c]!]),
                                      border: Border.all(color: Colors.white, width: 2),
                                      boxShadow: [BoxShadow(color: _colors[c]!.withValues(alpha: 0.6), blurRadius: 14)],
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        // My hand.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Column(
            children: [
              Row(
                children: [
                  const SizedBox(width: 8),
                  Text('Your cards · ${hand.length}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
                  if (hand.length == 1) ...[
                    const SizedBox(width: 8),
                    const Text('OCHO!', style: TextStyle(color: AppColors.gold, fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 1)),
                  ],
                  const Spacer(),
                  if (_myTurn && (!_haveMove || _drawPending > 0))
                    ActionButton(
                      label: _drawPending > 0 ? 'Take $_drawPending' : 'Draw',
                      icon: Icons.download_rounded,
                      expanded: false,
                      color: _drawPending > 0 ? AppColors.coral : AppColors.electricPurple,
                      onPressed: _busy ? null : _draw,
                    ),
                  const SizedBox(width: 8),
                ],
              ),
              const SizedBox(height: 6),
              _HandFan(
                cards: hand,
                playable: _myTurn && !_busy ? hand.where(_playable).map((c) => c['id'].toString()).toSet() : const <String>{},
                selectedId: _pendingWild?['id'] as String?,
                enabled: _myTurn && !_busy,
                onTap: _tapCard,
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _colorName(String c) {
    switch (c) {
      case 'R':
        return 'Red';
      case 'G':
        return 'Green';
      case 'B':
        return 'Blue';
      case 'Y':
        return 'Yellow';
      default:
        return 'Wild';
    }
  }

  String _rankName(Object? rank) {
    switch (rank) {
      case 'S':
        return 'a Skip';
      case 'R':
        return 'a Reverse';
      case 'P':
        return 'a +2';
      case 'W':
        return 'a Wild';
      case 'X':
        return 'a +4';
      default:
        return 'a ${rank ?? '?'}';
    }
  }
}

// ── Hand ──────────────────────────────────────────────────────────────────────

class _HandFan extends StatelessWidget {
  const _HandFan({required this.cards, required this.playable, required this.selectedId, required this.enabled, required this.onTap});
  final List<Map<String, dynamic>> cards;
  final Set<String> playable;
  final String? selectedId;
  final bool enabled;
  final ValueChanged<Map<String, dynamic>> onTap;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const cardW = 60.0;
        const cardH = 88.0;
        final n = cards.length;
        if (n == 0) {
          return const SizedBox(height: cardH + 18, child: Center(child: Text('No cards', style: TextStyle(color: AppColors.textMuted))));
        }
        final available = constraints.maxWidth - cardW;
        final step = n > 1 ? math.min(cardW * 0.7, available / (n - 1)) : 0.0;
        final total = cardW + step * (n - 1);
        final left0 = (constraints.maxWidth - total) / 2;
        return SizedBox(
          height: cardH + 18,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              for (var i = 0; i < n; i++)
                AnimatedPositioned(
                  key: ValueKey(cards[i]['id']),
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOut,
                  left: left0 + step * i,
                  top: cards[i]['id'] == selectedId ? 0 : (playable.contains(cards[i]['id']) ? 8 : 18),
                  child: GestureDetector(
                    onTap: enabled ? () => onTap(cards[i]) : null,
                    child: Transform.rotate(
                      angle: n > 1 ? (i - (n - 1) / 2) * 0.03 : 0,
                      child: _OchoCard(
                        color: cards[i]['color'] as String? ?? 'W',
                        rank: cards[i]['rank'] as String? ?? '0',
                        width: cardW,
                        height: cardH,
                        glow: cards[i]['id'] == selectedId ? AppColors.gold : (playable.contains(cards[i]['id']) ? Colors.white : null),
                        dim: enabled && !playable.contains(cards[i]['id']),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

// ── Card ──────────────────────────────────────────────────────────────────────

class _OchoCard extends StatelessWidget {
  const _OchoCard({required this.color, required this.rank, required this.width, required this.height, this.glow, this.dim = false, this.overrideColor});
  final String color;
  final String rank;
  final double width;
  final double height;
  final Color? glow;
  final bool dim;
  /// For a wild on the discard pile: paint it in the chosen active colour.
  final String? overrideColor;

  static const Map<String, Color> _colors = {
    'R': Color(0xFFFF5C5C),
    'G': Color(0xFF2EE6A8),
    'B': Color(0xFF4C8DFF),
    'Y': Color(0xFFFFC857),
  };

  @override
  Widget build(BuildContext context) {
    final isWild = color == 'W';
    final base = _colors[overrideColor ?? color] ?? const Color(0xFF2A2657);
    final label = _label(rank);
    final small = rank == 'S' || rank == 'R' || rank == 'P' || rank == 'X' || rank == 'W';
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 150),
      opacity: dim ? 0.45 : 1,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(width * 0.16),
          gradient: isWild && overrideColor == null
              ? const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF3B2A9E), Color(0xFF1B1E33)])
              : LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color.lerp(base, Colors.white, 0.18)!, base, Color.lerp(base, Colors.black, 0.28)!]),
          border: Border.all(color: glow ?? Colors.white.withValues(alpha: 0.85), width: glow != null ? 2.2 : 1.6),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 6, offset: const Offset(0, 3)),
            if (glow != null) BoxShadow(color: glow!.withValues(alpha: 0.6), blurRadius: 14),
          ],
        ),
        child: Stack(
          children: [
            // Inner oval like a classic shedding-game card.
            Center(
              child: Transform.rotate(
                angle: -0.55,
                child: Container(
                  width: width * 0.62,
                  height: height * 0.78,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.all(Radius.elliptical(width * 0.4, height * 0.5)),
                    color: Colors.white.withValues(alpha: isWild && overrideColor == null ? 0.10 : 0.92),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.6), width: 0.8),
                  ),
                ),
              ),
            ),
            if (isWild && overrideColor == null) Center(child: _WildQuad(size: width * 0.5)),
            Center(
              child: Text(
                label,
                style: TextStyle(
                  color: isWild && overrideColor == null ? Colors.white : base,
                  fontSize: small ? width * 0.36 : width * 0.52,
                  fontWeight: FontWeight.w900,
                  shadows: const [Shadow(color: Colors.black38, blurRadius: 2, offset: Offset(1, 1))],
                ),
              ),
            ),
            Positioned(left: 5, top: 3, child: Text(label, style: TextStyle(color: Colors.white, fontSize: width * 0.2, fontWeight: FontWeight.w900))),
            Positioned(
              right: 5,
              bottom: 3,
              child: Transform.rotate(angle: math.pi, child: Text(label, style: TextStyle(color: Colors.white, fontSize: width * 0.2, fontWeight: FontWeight.w900))),
            ),
          ],
        ),
      ),
    );
  }

  String _label(String rank) {
    switch (rank) {
      case 'S':
        return '⊘';
      case 'R':
        return '⇄';
      case 'P':
        return '+2';
      case 'W':
        return 'W';
      case 'X':
        return '+4';
      default:
        return rank;
    }
  }
}

class _WildQuad extends StatelessWidget {
  const _WildQuad({required this.size});
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: ClipOval(
        child: Column(
          children: [
            Expanded(child: Row(children: [Expanded(child: Container(color: const Color(0xFFFF5C5C))), Expanded(child: Container(color: const Color(0xFF4C8DFF)))])),
            Expanded(child: Row(children: [Expanded(child: Container(color: const Color(0xFFFFC857))), Expanded(child: Container(color: const Color(0xFF2EE6A8)))])),
          ],
        ),
      ),
    );
  }
}

// ── Table furniture ───────────────────────────────────────────────────────────

class _DrawPile extends StatelessWidget {
  const _DrawPile({required this.count, required this.canDraw, required this.accent, required this.penalty});
  final int count;
  final bool canDraw;
  final Color accent;
  final int penalty;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: 74,
      height: 104,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        boxShadow: canDraw ? [BoxShadow(color: (penalty > 0 ? AppColors.coral : accent).withValues(alpha: 0.6), blurRadius: 18)] : null,
      ),
      child: Stack(
        children: [
          for (var i = 0; i < (count > 4 ? 4 : (count == 0 ? 0 : count)); i++)
            Positioned(
              left: 3.0 + i * 1.5,
              top: 6.0 - i * 1.5,
              child: _CardBack(width: 64, height: 94),
            ),
          if (count == 0)
            Center(
              child: Container(
                width: 64,
                height: 94,
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white24)),
              ),
            ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(8)),
                child: Text(canDraw ? 'DRAW' : '$count', style: TextStyle(color: canDraw ? (penalty > 0 ? AppColors.coral : Colors.white) : Colors.white70, fontSize: 10, fontWeight: FontWeight.w900)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CardBack extends StatelessWidget {
  const _CardBack({required this.width, required this.height});
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(width * 0.16),
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF8A6CFF), Color(0xFF2B1F7A)]),
        border: Border.all(color: Colors.white.withValues(alpha: 0.8), width: 1.4),
        boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 4, offset: Offset(0, 2))],
      ),
      child: Center(
        child: Transform.rotate(
          angle: -0.55,
          child: Container(
            width: width * 0.6,
            height: height * 0.75,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.all(Radius.elliptical(width * 0.4, height * 0.5)),
              border: Border.all(color: Colors.white.withValues(alpha: 0.5)),
              color: Colors.black.withValues(alpha: 0.2),
            ),
            child: Center(child: Text('8', style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: width * 0.4, fontWeight: FontWeight.w900))),
          ),
        ),
      ),
    );
  }
}

class _OpponentHand extends StatelessWidget {
  const _OpponentHand({required this.session, required this.seat, required this.cards, required this.active});
  final GameSessionView session;
  final int seat;
  final int cards;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final palette = TableSkins.paletteFor(session, seat);
    final name = seat < session.seats.length ? session.seats[seat].displayName : 'Seat $seat';
    final shown = math.min(cards, 8);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      margin: const EdgeInsets.symmetric(horizontal: 3),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: active ? palette.base.withValues(alpha: 0.22) : Colors.black.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: active ? palette.light : Colors.white.withValues(alpha: 0.12), width: active ? 1.6 : 1),
        boxShadow: active ? [BoxShadow(color: palette.glow.withValues(alpha: 0.35), blurRadius: 12)] : null,
      ),
      child: Column(
        children: [
          SizedBox(
            height: 36,
            child: Stack(
              alignment: Alignment.center,
              children: [
                for (var i = 0; i < shown; i++)
                  Positioned(
                    left: 14.0 + i * 6 - (shown * 3),
                    child: Transform.rotate(
                      angle: (i - (shown - 1) / 2) * 0.12,
                      child: const _CardBack(width: 20, height: 30),
                    ),
                  ),
                if (cards == 0) const Text('🏆', style: TextStyle(fontSize: 18)),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
          Text(
            cards == 1 ? 'OCHO!' : '$cards cards',
            style: TextStyle(color: cards == 1 ? AppColors.gold : Colors.white70, fontSize: 10, fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class _PenaltyBadge extends StatefulWidget {
  const _PenaltyBadge({required this.count});
  final int count;

  @override
  State<_PenaltyBadge> createState() => _PenaltyBadgeState();
}

class _PenaltyBadgeState extends State<_PenaltyBadge> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: AppColors.coral.withValues(alpha: 0.25 + 0.2 * _c.value),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.coral),
          boxShadow: [BoxShadow(color: AppColors.coral.withValues(alpha: 0.3 + 0.3 * _c.value), blurRadius: 12)],
        ),
        child: Text('+${widget.count} pending', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
      ),
    );
  }
}

class _DirectionRingPainter extends CustomPainter {
  _DirectionRingPainter({required this.clockwise, required this.color});
  final bool clockwise;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final rect = Rect.fromCenter(center: center, width: size.width * 0.78, height: size.height * 1.05);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = color;
    // Two dashed arcs with arrowheads showing play direction.
    for (final start in [-2.6, 0.5]) {
      final sweep = 1.6;
      final s = clockwise ? start : start + sweep;
      final sw = clockwise ? sweep : -sweep;
      canvas.drawArc(rect, s, sw, false, paint);
      final endAngle = s + sw;
      final tip = center + Offset(math.cos(endAngle) * rect.width / 2, math.sin(endAngle) * rect.height / 2);
      final tangent = endAngle + (clockwise ? math.pi / 2 : -math.pi / 2);
      final path = Path()
        ..moveTo(tip.dx, tip.dy)
        ..lineTo(tip.dx - math.cos(tangent - 0.5) * 8, tip.dy - math.sin(tangent - 0.5) * 8)
        ..lineTo(tip.dx - math.cos(tangent + 0.5) * 8, tip.dy - math.sin(tangent + 0.5) * 8)
        ..close();
      canvas.drawPath(path, Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(covariant _DirectionRingPainter old) => old.clockwise != clockwise || old.color != color;
}
