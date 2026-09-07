import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Dice Party — a Yacht-style score-card dice game for 2–4 players. Roll up
/// to three times per turn, tap dice to hold them, then tap a category on your
/// card to bank the score. The card shows a live preview of what each open
/// category would score with the current dice.
class DicePartyBoard extends StatefulWidget {
  const DicePartyBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<DicePartyBoard> createState() => _DicePartyBoardState();
}

class _DicePartyBoardState extends State<DicePartyBoard> with SingleTickerProviderStateMixin {
  late final AnimationController _roll = AnimationController(vsync: this, duration: const Duration(milliseconds: 650));
  int _lastRollsLeft = 3;
  int? _viewSeat; // whose card is shown (defaults to me / current)

  Map<String, dynamic> get b => widget.session.board;
  List<int> get _dice => ((b['dice'] as List?) ?? const [0, 0, 0, 0, 0]).whereType<num>().map((n) => n.toInt()).toList();
  List<bool> get _held => ((b['held'] as List?) ?? const [false, false, false, false, false]).map((e) => e == true).toList();
  int get _rollsLeft => (b['rollsLeft'] as num?)?.toInt() ?? 3;
  List<String> get _categories => ((b['categories'] as List?) ?? _fallbackCategories).map((e) => e.toString()).toList();
  List<Map<String, dynamic>> get _players =>
      ((b['players'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;
  bool get _rolled => _rollsLeft < 3;

  static const _fallbackCategories = [
    'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
    'three_kind', 'four_kind', 'full_house', 'small_straight', 'large_straight', 'yacht', 'chance',
  ];

  static const _labels = {
    'ones': 'Ones',
    'twos': 'Twos',
    'threes': 'Threes',
    'fours': 'Fours',
    'fives': 'Fives',
    'sixes': 'Sixes',
    'three_kind': '3 of a kind',
    'four_kind': '4 of a kind',
    'full_house': 'Full house',
    'small_straight': 'Sm. straight',
    'large_straight': 'Lg. straight',
    'yacht': 'Yacht!',
    'chance': 'Chance',
  };

  @override
  void didUpdateWidget(covariant DicePartyBoard oldWidget) {
    super.didUpdateWidget(oldWidget);
    final rl = _rollsLeft;
    if (rl < _lastRollsLeft) {
      _roll.forward(from: 0);
    }
    _lastRollsLeft = rl;
  }

  @override
  void dispose() {
    _roll.dispose();
    super.dispose();
  }

  void _rollDice() {
    if (!_myTurn || _rollsLeft <= 0) return;
    GameFeedback.roll();
    widget.onAction('roll', _rolled ? {'held': _held} : <String, dynamic>{});
  }

  void _toggleHold(int i) {
    if (!_myTurn || !_rolled) return;
    GameFeedback.tap();
    widget.onAction('hold', {'index': i});
  }

  void _score(String category) {
    if (!_myTurn || !_rolled) return;
    GameFeedback.move();
    widget.onAction('score', {'category': category});
  }

  @override
  Widget build(BuildContext context) {
    final dice = _dice;
    final held = _held;
    final players = _players;
    final round = (b['round'] as num?)?.toInt() ?? 1;
    final rounds = (b['rounds'] as num?)?.toInt() ?? 13;
    final preview = (b['preview'] as Map?)?.map((k, v) => MapEntry(k.toString(), (v as num).toInt())) ?? const <String, int>{};
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final rollerSeat = widget.session.currentSeat >= 0 ? widget.session.currentSeat : (widget.mySeat < 0 ? 0 : widget.mySeat);
    final diceSkin = TableSkins.diceFor(widget.session, rollerSeat);
    final current = widget.session.currentSeat;
    final viewSeat = (_viewSeat ?? (widget.mySeat >= 0 ? widget.mySeat : math.max(0, current))).clamp(0, math.max(0, players.length - 1));
    final lastEvent = b['lastEvent'] as Map?;

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (!_myTurn) {
      final name = current >= 0 && current < widget.session.seats.length ? widget.session.seats[current].displayName : 'Opponent';
      status = '$name is rolling…';
    } else if (!_rolled) {
      status = 'Round $round of $rounds — roll!';
    } else if (_rollsLeft > 0) {
      status = 'Hold dice, re-roll ($_rollsLeft left) or score';
    } else {
      status = 'Pick a category to score';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn, icon: Icons.casino_rounded),
        const SizedBox(height: 6),
        // Score chips for all players; tap to view their card.
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            children: [
              for (var i = 0; i < players.length; i++)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _PlayerChip(
                    session: widget.session,
                    seat: i,
                    isMe: i == widget.mySeat,
                    total: (players[i]['total'] as num?)?.toInt() ?? 0,
                    active: i == current && widget.session.isInProgress,
                    selected: i == viewSeat,
                    onTap: () => setState(() => _viewSeat = i),
                  ),
                ),
            ],
          ),
        ),
        Playground(
          skin: playground,
          padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
          child: Column(
            children: [
              // Dice tray.
              Container(
                padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  color: Colors.black.withValues(alpha: 0.22),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    for (var i = 0; i < 5; i++)
                      _HoldableDie(
                        value: i < dice.length ? dice[i] : 0,
                        held: i < held.length && held[i],
                        canHold: _myTurn && _rolled,
                        anim: _roll,
                        skin: diceSkin,
                        accent: playground.accent,
                        index: i,
                        onTap: () => _toggleHold(i),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  for (var i = 0; i < 3; i++)
                    Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: Icon(
                        Icons.circle,
                        size: 9,
                        color: i < _rollsLeft ? playground.accent : Colors.white.withValues(alpha: 0.18),
                      ),
                    ),
                  const SizedBox(width: 4),
                  Text('rolls left', style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 11)),
                  const Spacer(),
                  if (lastEvent != null)
                    Flexible(
                      child: Text(
                        _eventText(lastEvent),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: lastEvent['yacht'] == true ? AppColors.gold : Colors.white.withValues(alpha: 0.75),
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              // Score card.
              if (players.isNotEmpty)
                _ScoreCard(
                  categories: _categories,
                  labels: _labels,
                  card: (players[viewSeat]['card'] as Map?)?.map((k, v) => MapEntry(k.toString(), (v as num).toInt())) ?? const {},
                  preview: viewSeat == widget.mySeat && _myTurn && _rolled ? preview : const {},
                  upperTotal: (players[viewSeat]['upperTotal'] as num?)?.toInt() ?? 0,
                  bonus: (players[viewSeat]['bonus'] as num?)?.toInt() ?? 0,
                  total: (players[viewSeat]['total'] as num?)?.toInt() ?? 0,
                  interactive: viewSeat == widget.mySeat && _myTurn && _rolled,
                  accent: playground.accent,
                  ownerName: viewSeat == widget.mySeat ? 'Your card' : '${widget.session.seats[viewSeat].displayName}\'s card',
                  onPick: _score,
                ),
              const SizedBox(height: 10),
              if (_myTurn)
                ActionButton(
                  label: !_rolled ? 'Roll' : (_rollsLeft > 0 ? 'Re-roll ($_rollsLeft)' : 'Pick a category above'),
                  icon: Icons.casino_rounded,
                  onPressed: _rollsLeft > 0 ? _rollDice : null,
                  expanded: true,
                ),
            ],
          ),
        ),
      ],
    );
  }

  String _eventText(Map e) {
    final seat = (e['seat'] as num?)?.toInt() ?? 0;
    final name = seat == widget.mySeat ? 'You' : (seat < widget.session.seats.length ? widget.session.seats[seat].displayName : 'Player');
    final cat = _labels[e['category']] ?? e['category'].toString();
    final pts = (e['points'] as num?)?.toInt() ?? 0;
    if (e['yacht'] == true) return '🎉 $name rolled a YACHT!';
    return '$name scored $pts in $cat';
  }
}

class _HoldableDie extends StatelessWidget {
  const _HoldableDie({
    required this.value,
    required this.held,
    required this.canHold,
    required this.anim,
    required this.skin,
    required this.accent,
    required this.index,
    required this.onTap,
  });

  final int value;
  final bool held;
  final bool canHold;
  final Animation<double> anim;
  final DiceSkin skin;
  final Color accent;
  final int index;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: canHold ? onTap : null,
      child: AnimatedBuilder(
        animation: anim,
        builder: (context, child) {
          // Held dice stay still; free dice tumble on each roll.
          final t = held ? 1.0 : anim.value;
          final wobble = math.sin(t * math.pi * (5 + index)) * (1 - t) * 0.7;
          final lift = (1 - t) * 10;
          return Transform.translate(
            offset: Offset(0, -lift),
            child: Transform.rotate(angle: wobble, child: child),
          );
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            color: held ? accent.withValues(alpha: 0.22) : Colors.transparent,
            border: Border.all(color: held ? accent : Colors.transparent, width: 2),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Opacity(
                opacity: value == 0 ? 0.35 : 1,
                child: SkinnedDie(skin: skin, value: value == 0 ? 6 : value, size: 46, rolling: !held && anim.value > 0.02 && anim.value < 0.98),
              ),
              const SizedBox(height: 4),
              Text(
                held ? 'HELD' : (canHold ? 'hold' : ' '),
                style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: held ? accent : Colors.white.withValues(alpha: 0.4)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ScoreCard extends StatelessWidget {
  const _ScoreCard({
    required this.categories,
    required this.labels,
    required this.card,
    required this.preview,
    required this.upperTotal,
    required this.bonus,
    required this.total,
    required this.interactive,
    required this.accent,
    required this.ownerName,
    required this.onPick,
  });

  final List<String> categories;
  final Map<String, String> labels;
  final Map<String, int> card;
  final Map<String, int> preview;
  final int upperTotal;
  final int bonus;
  final int total;
  final bool interactive;
  final Color accent;
  final String ownerName;
  final void Function(String category) onPick;

  @override
  Widget build(BuildContext context) {
    final upper = categories.take(6).toList();
    final lower = categories.skip(6).toList();
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Colors.black.withValues(alpha: 0.28),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(ownerName, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)),
              const Spacer(),
              Text('Total $total', style: TextStyle(color: accent, fontSize: 13, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  children: [
                    for (final c in upper) _row(c),
                    _bonusRow(),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(children: [for (final c in lower) _row(c)]),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _bonusRow() {
    final reached = bonus > 0;
    return Padding(
      padding: const EdgeInsets.only(top: 3),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(9),
          color: reached ? AppColors.gold.withValues(alpha: 0.18) : Colors.white.withValues(alpha: 0.04),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text('Bonus ($upperTotal/63)', style: TextStyle(color: reached ? AppColors.gold : AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w700)),
            ),
            Text(reached ? '+35' : '—', style: TextStyle(color: reached ? AppColors.gold : AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }

  Widget _row(String c) {
    final filled = card.containsKey(c);
    final value = card[c];
    final hint = preview[c];
    final canPick = interactive && !filled;
    final isYacht = c == 'yacht';
    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(9),
          onTap: canPick ? () => onPick(c) : null,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 140),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(9),
              color: filled
                  ? Colors.white.withValues(alpha: 0.06)
                  : canPick
                      ? (hint != null && hint > 0 ? accent.withValues(alpha: 0.18) : Colors.white.withValues(alpha: 0.03))
                      : Colors.white.withValues(alpha: 0.03),
              border: Border.all(color: canPick && hint != null && hint > 0 ? accent.withValues(alpha: 0.6) : Colors.transparent),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    labels[c] ?? c,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: filled ? AppColors.textMuted : (isYacht ? AppColors.gold : AppColors.textPrimary),
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Text(
                  filled ? '$value' : (hint != null ? '$hint' : ''),
                  style: TextStyle(
                    color: filled ? AppColors.textPrimary : (hint != null && hint > 0 ? accent : AppColors.textMuted),
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    fontStyle: filled ? FontStyle.normal : FontStyle.italic,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PlayerChip extends StatelessWidget {
  const _PlayerChip({
    required this.session,
    required this.seat,
    required this.isMe,
    required this.total,
    required this.active,
    required this.selected,
    required this.onTap,
  });

  final GameSessionView session;
  final int seat;
  final bool isMe;
  final int total;
  final bool active;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name = isMe ? 'You' : session.seats[seat].displayName;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: selected ? AppColors.electricPurple.withValues(alpha: 0.3) : AppColors.glassFill,
          border: Border.all(color: active ? AppColors.softCyan : (selected ? AppColors.electricPurple : AppColors.glassStroke), width: active ? 1.6 : 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SkinnedPiece(skin: TableSkins.pieceSkin(session.cosmeticsOf(seat).piece), seat: seat, size: 16),
            const SizedBox(width: 6),
            Text(name, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700, fontSize: 12)),
            const SizedBox(width: 6),
            Text('$total', style: TextStyle(color: active ? AppColors.softCyan : AppColors.textSecondary, fontWeight: FontWeight.w900, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
