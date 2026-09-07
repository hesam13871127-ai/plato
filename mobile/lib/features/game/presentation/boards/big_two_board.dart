import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Big Two (Deuces). Opponents sit around the felt with their card counts;
/// the last play glows in the middle. Your hand fans along the bottom — tap
/// cards to lift them, the combo name appears live (pair, straight, full
/// house…) and "Play" lights up when the selection beats the table.
class BigTwoBoard extends StatefulWidget {
  const BigTwoBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<BigTwoBoard> createState() => _BigTwoBoardState();
}

class _BigTwoBoardState extends State<BigTwoBoard> {
  final Set<String> _selected = <String>{};
  bool _busy = false;

  Map<String, dynamic> get b => widget.session.board;

  List<_Card> get _hand => ((b['hand'] as List?) ?? const []).whereType<Map>().map((e) => _Card.fromMap(Map<String, dynamic>.from(e))).toList();
  List<int> get _handSizes => ((b['handSizes'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  Map<String, dynamic>? get _table => b['table'] is Map ? Map<String, dynamic>.from(b['table'] as Map) : null;

  Future<void> _play() async {
    if (!_myTurn || _busy || _selected.isEmpty) return;
    setState(() => _busy = true);
    GameFeedback.move();
    final cards = _selected.toList();
    await widget.onAction('play', {'cards': cards});
    if (mounted) {
      setState(() {
        _busy = false;
        _selected.clear();
      });
    }
  }

  Future<void> _pass() async {
    if (!_myTurn || _busy) return;
    setState(() => _busy = true);
    GameFeedback.tap();
    await widget.onAction('pass', {});
    if (mounted) {
      setState(() {
        _busy = false;
        _selected.clear();
      });
    }
  }

  void _toggle(_Card card) {
    GameFeedback.tap();
    setState(() {
      if (_selected.contains(card.id)) {
        _selected.remove(card.id);
      } else {
        _selected.add(card.id);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final hand = _hand;
    final sizes = _handSizes;
    final table = _table;
    final finished = ((b['finished'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    final playable = ((b['playable'] as List?) ?? const []).map((e) => e.toString()).toSet();
    final mustInclude = b['mustInclude'] as String?;
    final passes = (b['passes'] as num?)?.toInt() ?? 0;
    final last = b['lastEvent'] is Map ? Map<String, dynamic>.from(b['lastEvent'] as Map) : null;
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final seats = widget.session.seats;
    final me = widget.mySeat;
    final current = widget.session.currentSeat;

    // Prune selections that left the hand.
    final ids = hand.map((c) => c.id).toSet();
    _selected.removeWhere((id) => !ids.contains(id));

    final selectedCards = hand.where((c) => _selected.contains(c.id)).toList();
    final combo = _Combo.classify(selectedCards);
    final tableCombo = table == null ? null : _Combo.classify(((table['cards'] as List?) ?? const []).whereType<Map>().map((e) => _Card.fromMap(Map<String, dynamic>.from(e))).toList());
    final includesMust = mustInclude == null || _selected.contains(mustInclude);
    final canPlay = _myTurn && combo != null && includesMust && (tableCombo == null || combo.beats(tableCombo));

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (_myTurn) {
      if (table == null) {
        status = mustInclude != null ? 'You lead — play must include ${_Card.pretty(mustInclude)}' : 'You lead — play anything';
      } else {
        status = 'Beat the ${_Combo.label(table['kind'] as String?)} or pass';
      }
    } else {
      final name = current >= 0 && current < seats.length ? seats[current].displayName : 'Opponent';
      status = '$name is thinking…';
    }

    final opponents = <int>[for (var i = 0; i < seats.length; i++) if (i != me) i];

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn, icon: Icons.style_rounded),
        const SizedBox(height: 6),
        Playground(
          skin: playground,
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
          child: Column(
            children: [
              // Opponents around the table.
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  for (final seat in opponents)
                    Expanded(
                      child: _OpponentSeat(
                        session: widget.session,
                        seat: seat,
                        cards: seat < sizes.length ? sizes[seat] : 0,
                        active: current == seat && widget.session.isInProgress,
                        passed: last != null && passes > 0 && _passedRecently(seat),
                        place: finished.indexOf(seat),
                        accent: playground.accent,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              // Table pile.
              SizedBox(
                height: 118,
                child: Center(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 260),
                    transitionBuilder: (child, anim) => ScaleTransition(scale: CurvedAnimation(parent: anim, curve: Curves.easeOutBack), child: FadeTransition(opacity: anim, child: child)),
                    child: table == null
                        ? Container(
                            key: const ValueKey('empty'),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                              color: Colors.black.withValues(alpha: 0.18),
                            ),
                            child: Text(
                              last != null && last['kind'] == 'pass' ? 'Everyone passed — new lead' : 'Table is clear',
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontWeight: FontWeight.w600),
                            ),
                          )
                        : _TablePile(
                            key: ValueKey('pile-${(table['cards'] as List).map((c) => (c as Map)['id']).join(',')}'),
                            cards: ((table['cards'] as List?) ?? const []).whereType<Map>().map((e) => _Card.fromMap(Map<String, dynamic>.from(e))).toList(),
                            kind: table['kind'] as String?,
                            owner: (table['seat'] as num?)?.toInt() ?? -1,
                            session: widget.session,
                            mySeat: me,
                            accent: playground.accent,
                          ),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              // Rank ladder reminder.
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('3 < 4 … < K < A < 2   ·   ♦ < ♣ < ♥ < ♠', style: TextStyle(color: Colors.white.withValues(alpha: 0.45), fontSize: 10, fontWeight: FontWeight.w600)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        // My hand.
        if (hand.isNotEmpty || widget.session.isInProgress)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Column(
              children: [
                Row(
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: Text('Your hand · ${hand.length}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
                    ),
                    const Spacer(),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 180),
                      child: combo != null
                          ? Container(
                              key: ValueKey(combo.kind),
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: (canPlay ? AppColors.softCyan : AppColors.coral).withValues(alpha: 0.18),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: canPlay ? AppColors.softCyan : AppColors.coral),
                              ),
                              child: Text(
                                canPlay ? _Combo.label(combo.kind) : (includesMust ? '${_Combo.label(combo.kind)} — too low' : 'Include ${_Card.pretty(mustInclude!)}'),
                                style: TextStyle(color: canPlay ? AppColors.softCyan : AppColors.coral, fontSize: 12, fontWeight: FontWeight.w800),
                              ),
                            )
                          : (_selected.isNotEmpty
                              ? const Text('Not a valid combo', key: ValueKey('bad'), style: TextStyle(color: AppColors.coral, fontSize: 12, fontWeight: FontWeight.w700))
                              : const SizedBox.shrink(key: ValueKey('none'))),
                    ),
                    const SizedBox(width: 8),
                  ],
                ),
                const SizedBox(height: 6),
                _HandFan(
                  cards: hand,
                  selected: _selected,
                  playable: playable,
                  mustInclude: mustInclude,
                  enabled: _myTurn && !_busy,
                  onTap: _toggle,
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    ActionButton(
                      label: table == null ? 'Lead' : 'Play',
                      icon: Icons.play_arrow_rounded,
                      onPressed: canPlay && !_busy ? _play : null,
                    ),
                    const SizedBox(width: 10),
                    ActionButton(
                      label: 'Pass',
                      icon: Icons.skip_next_rounded,
                      color: AppColors.surfaceElevated,
                      onPressed: _myTurn && table != null && !_busy ? _pass : null,
                    ),
                    if (_selected.isNotEmpty) ...[
                      const SizedBox(width: 10),
                      IconButton(
                        tooltip: 'Clear selection',
                        onPressed: () => setState(_selected.clear),
                        icon: const Icon(Icons.close_rounded, color: AppColors.textSecondary),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        if (!widget.session.isInProgress && finished.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: Wrap(
              spacing: 8,
              runSpacing: 6,
              alignment: WrapAlignment.center,
              children: [
                for (var i = 0; i < finished.length; i++)
                  _PlaceChip(
                    place: i + 1,
                    name: finished[i] == me ? 'You' : (finished[i] < seats.length ? seats[finished[i]].displayName : '?'),
                    left: finished[i] < sizes.length ? sizes[finished[i]] : 0,
                  ),
              ],
            ),
          ),
      ],
    );
  }

  bool _passedRecently(int seat) {
    final history = ((b['history'] as List?) ?? const []).whereType<Map>().toList();
    final n = _handSizes.where((s) => s > 0).length;
    final recent = history.length > n ? history.sublist(history.length - n) : history;
    // A seat shows "passed" if its latest entry since the last real play is a pass.
    for (final h in recent.reversed) {
      if ((h['seat'] as num?)?.toInt() == seat) return h['kind'] == 'pass';
    }
    return false;
  }
}

// ── Cards & combos (client-side mirror of the engine's classifier) ───────────

class _Card {
  const _Card(this.id, this.rank, this.suit);
  final String id;
  final String rank;
  final String suit;

  static _Card fromMap(Map<String, dynamic> m) => _Card(m['id'].toString(), m['rank'].toString(), m['suit'].toString());

  static const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
  static const suits = ['D', 'C', 'H', 'S'];
  static const suitGlyph = {'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣'};

  int get rankValue => ranks.indexOf(rank);
  int get suitValue => suits.indexOf(suit);
  bool get red => suit == 'H' || suit == 'D';

  static String pretty(String id) {
    final suit = id.substring(id.length - 1);
    return '${id.substring(0, id.length - 1)}${suitGlyph[suit] ?? ''}';
  }

  static int compare(_Card a, _Card b) {
    final d = a.rankValue - b.rankValue;
    return d != 0 ? d : a.suitValue - b.suitValue;
  }
}

class _Combo {
  const _Combo(this.kind, this.size, this.value, this.suit, this.category);
  final String kind;
  final int size;
  final int value;
  final int suit;
  final int category;

  static String label(String? kind) {
    switch (kind) {
      case 'single':
        return 'Single';
      case 'pair':
        return 'Pair';
      case 'triple':
        return 'Triple';
      case 'straight':
        return 'Straight';
      case 'flush':
        return 'Flush';
      case 'full_house':
        return 'Full house';
      case 'four_kind':
        return 'Four of a kind';
      case 'straight_flush':
        return 'Straight flush';
      default:
        return 'play';
    }
  }

  bool beats(_Combo other) {
    if (size != other.size) return false;
    if (size == 5 && category != other.category) return category > other.category;
    if (value != other.value) return value > other.value;
    return suit > other.suit;
  }

  static _Combo? classify(List<_Card> input) {
    if (input.isEmpty) return null;
    final cards = [...input]..sort(_Card.compare);
    final n = cards.length;
    final top = cards.last;
    if (n == 1) return _Combo('single', 1, top.rankValue, top.suitValue, -1);
    if (n == 2 || n == 3) {
      if (!cards.every((c) => c.rank == top.rank)) return null;
      return _Combo(n == 2 ? 'pair' : 'triple', n, top.rankValue, top.suitValue, -1);
    }
    if (n != 5) return null;
    final counts = <String, List<_Card>>{};
    for (final c in cards) {
      counts.putIfAbsent(c.rank, () => []).add(c);
    }
    final groups = counts.values.toList()..sort((a, b) => b.length - a.length);
    final flush = cards.every((c) => c.suit == top.suit);
    final straight = _straightHigh(cards);
    if (straight != null && flush) return _Combo('straight_flush', 5, straight[0], straight[1], 4);
    if (groups.first.length == 4) return _Combo('four_kind', 5, groups.first.first.rankValue, 3, 3);
    if (groups.first.length == 3 && groups[1].length == 2) return _Combo('full_house', 5, groups.first.first.rankValue, 3, 2);
    if (flush) return _Combo('flush', 5, top.rankValue, top.suitValue, 1);
    if (straight != null) return _Combo('straight', 5, straight[0], straight[1], 0);
    return null;
  }

  static List<int>? _straightHigh(List<_Card> sorted) {
    final values = sorted.map((c) => c.rankValue).toList();
    if (values.toSet().length != 5) return null;
    var consecutive = true;
    for (var i = 1; i < values.length; i++) {
      if (values[i] != values[i - 1] + 1) consecutive = false;
    }
    if (consecutive) return [sorted.last.rankValue, sorted.last.suitValue];
    final set = values.toSet();
    final aceIdx = _Card.ranks.indexOf('A');
    final twoIdx = _Card.ranks.indexOf('2');
    if ([aceIdx, twoIdx, 0, 1, 2].every(set.contains)) {
      final five = sorted.firstWhere((c) => c.rank == '5');
      return [-2, five.suitValue];
    }
    if ([twoIdx, 0, 1, 2, 3].every(set.contains)) {
      final six = sorted.firstWhere((c) => c.rank == '6');
      return [-1, six.suitValue];
    }
    return null;
  }
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _HandFan extends StatelessWidget {
  const _HandFan({required this.cards, required this.selected, required this.playable, required this.mustInclude, required this.enabled, required this.onTap});
  final List<_Card> cards;
  final Set<String> selected;
  final Set<String> playable;
  final String? mustInclude;
  final bool enabled;
  final ValueChanged<_Card> onTap;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const cardW = 54.0;
        const cardH = 78.0;
        final n = cards.length;
        if (n == 0) {
          return const SizedBox(height: cardH + 16, child: Center(child: Text('No cards', style: TextStyle(color: AppColors.textMuted))));
        }
        final available = constraints.maxWidth - cardW;
        final step = n > 1 ? math.min(cardW * 0.72, available / (n - 1)) : 0.0;
        final total = cardW + step * (n - 1);
        final left0 = (constraints.maxWidth - total) / 2;
        return SizedBox(
          height: cardH + 18,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              for (var i = 0; i < n; i++)
                AnimatedPositioned(
                  key: ValueKey(cards[i].id),
                  duration: const Duration(milliseconds: 160),
                  curve: Curves.easeOut,
                  left: left0 + step * i,
                  top: selected.contains(cards[i].id) ? 0 : 16,
                  child: GestureDetector(
                    onTap: enabled ? () => onTap(cards[i]) : null,
                    child: _PlayingCard(
                      card: cards[i],
                      width: cardW,
                      height: cardH,
                      highlight: selected.contains(cards[i].id),
                      dim: enabled && playable.isNotEmpty && !playable.contains(cards[i].id) && !selected.contains(cards[i].id),
                      badge: mustInclude == cards[i].id ? '★' : null,
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
  const _PlayingCard({required this.card, required this.width, required this.height, this.highlight = false, this.dim = false, this.badge, this.small = false});
  final _Card card;
  final double width;
  final double height;
  final bool highlight;
  final bool dim;
  final String? badge;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final color = card.red ? const Color(0xFFE23D5C) : const Color(0xFF1B1E33);
    final glyph = _Card.suitGlyph[card.suit] ?? '';
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 150),
      opacity: dim ? 0.45 : 1,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Colors.white, Color(0xFFEDEBF5)]),
          border: Border.all(color: highlight ? AppColors.softCyan : Colors.black26, width: highlight ? 2 : 1),
          boxShadow: [
            const BoxShadow(color: Colors.black54, blurRadius: 5, offset: Offset(0, 3)),
            if (highlight) BoxShadow(color: AppColors.softCyan.withValues(alpha: 0.6), blurRadius: 14),
          ],
        ),
        child: Stack(
          children: [
            Positioned(
              left: 5,
              top: 3,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Text(card.rank, style: TextStyle(color: color, fontSize: small ? 11 : 13, fontWeight: FontWeight.w900, height: 1)),
                  Text(glyph, style: TextStyle(color: color, fontSize: small ? 9 : 11, height: 1)),
                ],
              ),
            ),
            Center(child: Text(glyph, style: TextStyle(color: color, fontSize: height * 0.36))),
            if (badge != null)
              Positioned(
                right: 3,
                top: 2,
                child: Text(badge!, style: const TextStyle(color: AppColors.gold, fontSize: 12, fontWeight: FontWeight.w900)),
              ),
          ],
        ),
      ),
    );
  }
}

class _TablePile extends StatelessWidget {
  const _TablePile({super.key, required this.cards, required this.kind, required this.owner, required this.session, required this.mySeat, required this.accent});
  final List<_Card> cards;
  final String? kind;
  final int owner;
  final GameSessionView session;
  final int mySeat;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final sorted = [...cards]..sort(_Card.compare);
    final name = owner == mySeat ? 'You' : (owner >= 0 && owner < session.seats.length ? session.seats[owner].displayName : '');
    final palette = owner >= 0 ? TableSkins.paletteFor(session, owner) : null;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 78,
          width: 50.0 + (sorted.length - 1) * 26.0,
          child: Stack(
            children: [
              for (var i = 0; i < sorted.length; i++)
                Positioned(
                  left: i * 26.0,
                  child: Transform.rotate(
                    angle: (i - (sorted.length - 1) / 2) * 0.05,
                    child: _PlayingCard(card: sorted[i], width: 50, height: 74, small: true),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.45),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: (palette?.light ?? accent).withValues(alpha: 0.7)),
          ),
          child: Text(
            '${_Combo.label(kind)} · $name',
            style: TextStyle(color: palette?.light ?? accent, fontSize: 11, fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }
}

class _OpponentSeat extends StatelessWidget {
  const _OpponentSeat({required this.session, required this.seat, required this.cards, required this.active, required this.passed, required this.place, required this.accent});
  final GameSessionView session;
  final int seat;
  final int cards;
  final bool active;
  final bool passed;
  final int place;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final palette = TableSkins.paletteFor(session, seat);
    final name = seat < session.seats.length ? session.seats[seat].displayName : 'Seat $seat';
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
            height: 34,
            child: Stack(
              alignment: Alignment.center,
              children: [
                for (var i = 0; i < math.min(cards, 7); i++)
                  Positioned(
                    left: 10.0 + i * 5,
                    child: Container(
                      width: 20,
                      height: 30,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(4),
                        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [palette.light, palette.dark]),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.6), width: 0.8),
                        boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 3, offset: Offset(0, 1))],
                      ),
                    ),
                  ),
                if (cards == 0)
                  Text(place >= 0 ? (place == 0 ? '🏆' : '#${place + 1}') : '—', style: const TextStyle(fontSize: 18)),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
          Text(
            passed ? 'passed' : '$cards card${cards == 1 ? '' : 's'}',
            style: TextStyle(color: passed ? AppColors.coral : (cards <= 3 && cards > 0 ? AppColors.gold : Colors.white70), fontSize: 10, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _PlaceChip extends StatelessWidget {
  const _PlaceChip({required this.place, required this.name, required this.left});
  final int place;
  final String name;
  final int left;

  @override
  Widget build(BuildContext context) {
    final color = place == 1 ? AppColors.gold : (place == 2 ? AppColors.softCyan : AppColors.textSecondary);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withValues(alpha: 0.7))),
      child: Text('#$place $name${left > 0 ? ' · $left left' : ''}', style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
    );
  }
}
