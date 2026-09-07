import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Hearts — a round card table. Opponents sit around the felt with their
/// card counts and points; the current trick is laid in the middle, each card
/// angled toward the seat that played it. Your hand fans along the bottom
/// (legal cards lift and glow). Before a hand you pick three cards to pass
/// (with a direction arrow); the last trick and the running scores sit in a
/// side panel, and "shooting the moon" gets a dramatic banner.
class HeartsBoard extends StatefulWidget {
  const HeartsBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<HeartsBoard> createState() => _HeartsBoardState();
}

class _HCard {
  _HCard({required this.id, required this.rank, required this.suit});
  final String id;
  final int rank;
  final String suit; // C D H S

  static _HCard? from(Object? raw) {
    if (raw is! Map) return null;
    return _HCard(id: raw['id'].toString(), rank: (raw['rank'] as num?)?.toInt() ?? 2, suit: raw['suit']?.toString() ?? 'C');
  }

  bool get red => suit == 'H' || suit == 'D';
  bool get isQueen => id == 'QS';
  int get points => suit == 'H' ? 1 : (isQueen ? 13 : 0);

  String get rankLabel {
    switch (rank) {
      case 14:
        return 'A';
      case 13:
        return 'K';
      case 12:
        return 'Q';
      case 11:
        return 'J';
      default:
        return '$rank';
    }
  }

  String get glyph {
    switch (suit) {
      case 'H':
        return '♥';
      case 'D':
        return '♦';
      case 'S':
        return '♠';
      default:
        return '♣';
    }
  }
}

class _HeartsBoardState extends State<HeartsBoard> {
  final Set<String> _passPick = {};
  bool _busy = false;
  int _lastTrickNumber = -1;
  int _lastHand = -1;
  String? _lastMoonKey;

  Map<String, dynamic> get b => widget.session.board;
  String get _phase => (b['phase'] as String?) ?? 'play';
  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat && _phase == 'play';
  List<_HCard> get _hand => ((b['myHand'] as List?) ?? const []).map(_HCard.from).whereType<_HCard>().toList();
  Set<String> get _legal => ((b['legal'] as List?) ?? const []).map((e) => e.toString()).toSet();
  bool get _iPassed => b['myPassed'] != null;
  bool get _canPass => widget.session.isInProgress && _phase == 'pass' && !_iPassed && widget.mySeat >= 0;

  @override
  void didUpdateWidget(covariant HeartsBoard old) {
    super.didUpdateWidget(old);
    final trickNumber = (b['trickNumber'] as num?)?.toInt() ?? 0;
    if (_lastTrickNumber >= 0 && trickNumber != _lastTrickNumber) {
      final lt = b['lastTrick'];
      if (lt is Map && ((lt['points'] as num?)?.toInt() ?? 0) > 0) {
        GameFeedback.hit();
      } else {
        GameFeedback.move();
      }
    }
    _lastTrickNumber = trickNumber;
    final hand = (b['hand'] as num?)?.toInt() ?? 0;
    if (hand != _lastHand) {
      _lastHand = hand;
      _passPick.clear();
      if (hand > 1) GameFeedback.roll();
    }
    final moon = b['moonShooter'];
    final moonKey = '$hand-$moon';
    if (moon != null && moonKey != _lastMoonKey) {
      _lastMoonKey = moonKey;
      GameFeedback.roll();
    }
  }

  Future<void> _tapCard(_HCard c) async {
    if (_busy) return;
    if (_canPass) {
      GameFeedback.tap();
      setState(() {
        if (_passPick.contains(c.id)) {
          _passPick.remove(c.id);
        } else if (_passPick.length < 3) {
          _passPick.add(c.id);
        }
      });
      return;
    }
    if (!_myTurn || !_legal.contains(c.id)) return;
    GameFeedback.move();
    setState(() => _busy = true);
    await widget.onAction('play', {'card': c.id});
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _confirmPass() async {
    if (_passPick.length != 3 || _busy) return;
    GameFeedback.move();
    setState(() => _busy = true);
    await widget.onAction('pass', {'cards': _passPick.toList()});
    if (mounted) {
      setState(() {
        _busy = false;
        _passPick.clear();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final seats = widget.session.seats;
    final n = seats.length;
    final players = ((b['players'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final trick = ((b['trick'] as List?) ?? const []).whereType<Map>().toList();
    final lastTrick = b['lastTrick'] is Map ? Map<String, dynamic>.from(b['lastTrick'] as Map) : null;
    final hand = _hand;
    final legal = _legal;
    final heartsBroken = b['heartsBroken'] == true;
    final handNo = (b['hand'] as num?)?.toInt() ?? 1;
    final passDir = (b['passDirection'] as String?) ?? 'none';
    final target = (b['targetScore'] as num?)?.toInt() ?? 50;
    final moon = (b['moonShooter'] as num?)?.toInt();
    final current = widget.session.currentSeat;
    final log = ((b['log'] as List?) ?? const []).map((e) => e.toString()).toList();

    String status;
    IconData icon = Icons.favorite_rounded;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (_phase == 'pass') {
      status = _iPassed ? 'Waiting for the others to pass…' : 'Pick 3 cards to pass ${_dirLabel(passDir)}';
      icon = Icons.swap_horiz_rounded;
    } else if (_myTurn) {
      final trickNo = (b['trickNumber'] as num?)?.toInt() ?? 1;
      status = trick.isEmpty ? (trickNo == 1 ? 'Lead the lowest club' : 'Your lead${heartsBroken ? '' : ' — hearts not broken'}') : 'Your turn — follow ${_suitName(trick.first['card']?['suit']?.toString())}';
    } else {
      final name = current >= 0 && current < n ? seats[current].displayName : 'Opponent';
      status = '$name is thinking…';
    }

    // Seat placement around the table (me at the bottom).
    final positions = <int, Alignment>{};
    for (var i = 0; i < n; i++) {
      final rel = widget.mySeat >= 0 ? (i - widget.mySeat + n) % n : i;
      if (n == 2) {
        positions[i] = rel == 0 ? Alignment.bottomCenter : Alignment.topCenter;
      } else if (n == 3) {
        positions[i] = rel == 0 ? Alignment.bottomCenter : (rel == 1 ? Alignment.centerRight : Alignment.centerLeft);
      } else {
        positions[i] = rel == 0 ? Alignment.bottomCenter : (rel == 1 ? Alignment.centerRight : (rel == 2 ? Alignment.topCenter : Alignment.centerLeft));
      }
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn || _canPass, icon: icon),
        const SizedBox(height: 6),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(8),
          child: Column(
            children: [
              // Header.
              Row(
                children: [
                  _Pill(text: 'Hand $handNo', color: AppColors.textSecondary),
                  const SizedBox(width: 6),
                  _Pill(text: 'To $target', color: AppColors.textSecondary),
                  const SizedBox(width: 6),
                  _Pill(text: heartsBroken ? '♥ broken' : '♥ not broken', color: heartsBroken ? AppColors.coral : AppColors.textMuted),
                  const Spacer(),
                  if (_phase == 'pass') _Pill(text: 'Pass ${_dirLabel(passDir)} ${_dirArrow(passDir)}', color: AppColors.gold),
                ],
              ),
              const SizedBox(height: 6),
              // Table.
              AspectRatio(
                aspectRatio: 1.25,
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final w = constraints.maxWidth;
                    final h = constraints.maxHeight;
                    final center = Offset(w / 2, h / 2);
                    return Stack(
                      children: [
                        // Felt oval.
                        Positioned.fill(
                          child: Container(
                            margin: const EdgeInsets.symmetric(horizontal: 44, vertical: 46),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.all(Radius.elliptical(w / 2, h / 2)),
                              gradient: RadialGradient(colors: [playground.feltTop.withValues(alpha: 0.9), playground.feltBottom]),
                              border: Border.all(color: playground.rail, width: 6),
                              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 18, offset: const Offset(0, 8))],
                            ),
                          ),
                        ),
                        // Opponent badges.
                        for (var i = 0; i < n; i++)
                          if (i != widget.mySeat)
                            Align(
                              alignment: positions[i]!,
                              child: _SeatBadge(
                                session: widget.session,
                                seat: i,
                                player: i < players.length ? players[i] : const {},
                                active: widget.session.isInProgress && current == i && _phase == 'play',
                                passed: _phase == 'pass' && (i < players.length && players[i]['passed'] == true),
                                compact: positions[i] == Alignment.centerLeft || positions[i] == Alignment.centerRight,
                              ),
                            ),
                        // My badge (small, bottom-left corner of the table).
                        if (widget.mySeat >= 0 && widget.mySeat < players.length)
                          Positioned(
                            left: 4,
                            bottom: 4,
                            child: _MiniScore(player: players[widget.mySeat], label: 'You'),
                          ),
                        // Trick cards.
                        for (final t in trick)
                          Builder(
                            builder: (context) {
                              final seat = (t['seat'] as num?)?.toInt() ?? 0;
                              final card = _HCard.from(t['card']);
                              if (card == null) return const SizedBox.shrink();
                              final al = positions[seat] ?? Alignment.center;
                              final offset = Offset(al.x * 34, al.y * 30);
                              final angle = al.x * 0.25 + (al.y < 0 ? math.pi * 0.02 : 0.0);
                              return AnimatedPositioned(
                                duration: const Duration(milliseconds: 260),
                                curve: Curves.easeOutBack,
                                left: center.dx + offset.dx - 24,
                                top: center.dy + offset.dy - 34,
                                child: Transform.rotate(angle: angle, child: _PlayingCard(card: card, width: 48, height: 68, small: true)),
                              );
                            },
                          ),
                        if (trick.isEmpty && lastTrick != null && _phase == 'play')
                          Positioned(
                            left: 0,
                            right: 0,
                            top: h / 2 - 12,
                            child: Center(
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.4), borderRadius: BorderRadius.circular(8)),
                                child: Text(
                                  '${_nameOf((lastTrick['winner'] as num).toInt())} took the trick${((lastTrick['points'] as num?)?.toInt() ?? 0) > 0 ? ' · +${lastTrick['points']}' : ''}',
                                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                                ),
                              ),
                            ),
                          ),
                        if (moon != null)
                          Positioned(
                            left: 0,
                            right: 0,
                            top: h / 2 - 22,
                            child: Center(
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                decoration: BoxDecoration(color: AppColors.gold, borderRadius: BorderRadius.circular(12), boxShadow: const [BoxShadow(color: AppColors.gold, blurRadius: 18)]),
                                child: Text('🌙 ${_nameOf(moon)} shot the moon!', style: const TextStyle(color: Color(0xFF1B1B2F), fontSize: 14, fontWeight: FontWeight.w900)),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
              const SizedBox(height: 4),
              // Pass controls.
              if (_phase == 'pass' && widget.session.isInProgress)
                Padding(
                  padding: const EdgeInsets.only(top: 4, bottom: 4),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          _iPassed ? 'Cards passed ✓' : '${_passPick.length}/3 selected',
                          style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                      ),
                      ActionButton(label: 'Pass ${_dirArrow(passDir)}', icon: Icons.send_rounded, expanded: false, color: AppColors.gold, onPressed: _canPass && _passPick.length == 3 && !_busy ? _confirmPass : null),
                    ],
                  ),
                ),
              // My hand.
              _HandFan(
                cards: hand,
                playable: _myTurn && !_busy ? legal : (_canPass ? hand.map((c) => c.id).toSet() : const <String>{}),
                selected: _passPick,
                enabled: (_myTurn || _canPass) && !_busy,
                onTap: _tapCard,
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        // Scores.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.glassStroke)),
            child: Column(
              children: [
                for (var i = 0; i < n; i++)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      children: [
                        Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: TableSkins.paletteFor(widget.session, i).base)),
                        const SizedBox(width: 6),
                        Expanded(child: Text(i == widget.mySeat ? 'You' : seats[i].displayName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: current == i ? AppColors.gold : AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w800))),
                        if (i < players.length && (players[i]['hasQueen'] == true)) const Padding(padding: EdgeInsets.only(right: 6), child: Text('Q♠', style: TextStyle(color: AppColors.textPrimary, fontSize: 11, fontWeight: FontWeight.w900))),
                        if (i < players.length && ((players[i]['heartsTaken'] as num?)?.toInt() ?? 0) > 0) Padding(padding: const EdgeInsets.only(right: 6), child: Text('♥${players[i]['heartsTaken']}', style: const TextStyle(color: AppColors.coral, fontSize: 11, fontWeight: FontWeight.w900))),
                        Text('+${i < players.length ? players[i]['roundPoints'] ?? 0 : 0}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)),
                        const SizedBox(width: 10),
                        SizedBox(width: 30, child: Text('${i < players.length ? players[i]['score'] ?? 0 : 0}', textAlign: TextAlign.right, style: const TextStyle(color: AppColors.gold, fontSize: 13, fontWeight: FontWeight.w900))),
                      ],
                    ),
                  ),
                if (log.isNotEmpty) ...[
                  const Divider(height: 10, color: Colors.white12),
                  Text(log.first, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  String _nameOf(int seat) => seat == widget.mySeat ? 'You' : (seat >= 0 && seat < widget.session.seats.length ? widget.session.seats[seat].displayName : 'Player ${seat + 1}');

  String _dirLabel(String d) {
    switch (d) {
      case 'left':
        return 'left';
      case 'right':
        return 'right';
      case 'across':
        return 'across';
      default:
        return 'nowhere';
    }
  }

  String _dirArrow(String d) {
    switch (d) {
      case 'left':
        return '←';
      case 'right':
        return '→';
      case 'across':
        return '↑';
      default:
        return '';
    }
  }

  String _suitName(String? s) {
    switch (s) {
      case 'H':
        return 'hearts ♥';
      case 'D':
        return 'diamonds ♦';
      case 'S':
        return 'spades ♠';
      case 'C':
        return 'clubs ♣';
      default:
        return 'suit';
    }
  }
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _Pill extends StatelessWidget {
  const _Pill({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.35), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withValues(alpha: 0.5))),
      child: Text(text, style: TextStyle(color: color, fontSize: 10.5, fontWeight: FontWeight.w800)),
    );
  }
}

class _SeatBadge extends StatelessWidget {
  const _SeatBadge({required this.session, required this.seat, required this.player, required this.active, required this.passed, required this.compact});
  final GameSessionView session;
  final int seat;
  final Map<String, dynamic> player;
  final bool active;
  final bool passed;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final palette = TableSkins.paletteFor(session, seat);
    final name = seat < session.seats.length ? session.seats[seat].displayName : 'Seat $seat';
    final cards = (player['handSize'] as num?)?.toInt() ?? 0;
    final pts = (player['roundPoints'] as num?)?.toInt() ?? 0;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: compact ? 74 : 110,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
      decoration: BoxDecoration(
        color: active ? palette.base.withValues(alpha: 0.3) : Colors.black.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: active ? palette.light : Colors.white.withValues(alpha: 0.15), width: active ? 1.6 : 1),
        boxShadow: active ? [BoxShadow(color: palette.glow.withValues(alpha: 0.45), blurRadius: 12)] : null,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Fanned backs.
          SizedBox(
            height: 26,
            child: Stack(
              alignment: Alignment.center,
              children: [
                for (var i = 0; i < math.min(cards, 7); i++)
                  Positioned(
                    left: (compact ? 14.0 : 30.0) + i * 6 - math.min(cards, 7) * 3,
                    child: Transform.rotate(angle: (i - (math.min(cards, 7) - 1) / 2) * 0.1, child: const _CardBack(width: 16, height: 24)),
                  ),
                if (cards == 0) const Text('—', style: TextStyle(color: Colors.white54)),
              ],
            ),
          ),
          const SizedBox(height: 3),
          Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w800)),
          Text(passed ? 'passed ✓' : '$cards cards · +$pts', style: TextStyle(color: passed ? AppColors.success : Colors.white70, fontSize: 9.5, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _MiniScore extends StatelessWidget {
  const _MiniScore({required this.player, required this.label});
  final Map<String, dynamic> player;
  final String label;

  @override
  Widget build(BuildContext context) {
    final pts = (player['roundPoints'] as num?)?.toInt() ?? 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.45), borderRadius: BorderRadius.circular(8)),
      child: Text('$label · +$pts this hand', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }
}

class _HandFan extends StatelessWidget {
  const _HandFan({required this.cards, required this.playable, required this.selected, required this.enabled, required this.onTap});
  final List<_HCard> cards;
  final Set<String> playable;
  final Set<String> selected;
  final bool enabled;
  final ValueChanged<_HCard> onTap;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const cardW = 54.0;
        const cardH = 78.0;
        final n = cards.length;
        if (n == 0) return const SizedBox(height: cardH + 16, child: Center(child: Text('No cards', style: TextStyle(color: AppColors.textMuted))));
        final available = constraints.maxWidth - cardW;
        final step = n > 1 ? math.min(cardW * 0.62, available / (n - 1)) : 0.0;
        final total = cardW + step * (n - 1);
        final left0 = (constraints.maxWidth - total) / 2;
        return SizedBox(
          height: cardH + 16,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              for (var i = 0; i < n; i++)
                AnimatedPositioned(
                  key: ValueKey(cards[i].id),
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOut,
                  left: left0 + step * i,
                  top: selected.contains(cards[i].id) ? 0 : (playable.contains(cards[i].id) ? 6 : 16),
                  child: GestureDetector(
                    onTap: enabled ? () => onTap(cards[i]) : null,
                    child: _PlayingCard(
                      card: cards[i],
                      width: cardW,
                      height: cardH,
                      highlight: selected.contains(cards[i].id) ? AppColors.gold : (playable.contains(cards[i].id) && enabled ? AppColors.softCyan : null),
                      dim: enabled && !playable.contains(cards[i].id) && !selected.contains(cards[i].id),
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

class _PlayingCard extends StatelessWidget {
  const _PlayingCard({required this.card, required this.width, required this.height, this.highlight, this.dim = false, this.small = false});
  final _HCard card;
  final double width;
  final double height;
  final Color? highlight;
  final bool dim;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final color = card.red ? const Color(0xFFE23D5C) : const Color(0xFF1B1E33);
    final danger = card.points > 0;
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 150),
      opacity: dim ? 0.45 : 1,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Colors.white, card.isQueen ? const Color(0xFFE9E3FF) : const Color(0xFFEDEBF5)]),
          border: Border.all(color: highlight ?? Colors.black26, width: highlight != null ? 2 : 1),
          boxShadow: [
            const BoxShadow(color: Colors.black54, blurRadius: 5, offset: Offset(0, 3)),
            if (highlight != null) BoxShadow(color: highlight!.withValues(alpha: 0.6), blurRadius: 14),
          ],
        ),
        child: Stack(
          children: [
            Positioned(
              left: 5,
              top: 3,
              child: Column(
                children: [
                  Text(card.rankLabel, style: TextStyle(color: color, fontSize: small ? 11 : 13, fontWeight: FontWeight.w900, height: 1)),
                  Text(card.glyph, style: TextStyle(color: color, fontSize: small ? 9 : 11, height: 1)),
                ],
              ),
            ),
            Center(child: Text(card.isQueen ? '👑' : card.glyph, style: TextStyle(color: color, fontSize: height * (card.isQueen ? 0.3 : 0.36)))),
            if (danger)
              Positioned(
                right: 3,
                top: 2,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
                  decoration: BoxDecoration(color: AppColors.coral, borderRadius: BorderRadius.circular(4)),
                  child: Text('${card.points}', style: const TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.w900)),
                ),
              ),
          ],
        ),
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
        borderRadius: BorderRadius.circular(3),
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFF6B8B), Color(0xFF8A2A4A)]),
        border: Border.all(color: Colors.white.withValues(alpha: 0.8), width: 0.8),
      ),
    );
  }
}
