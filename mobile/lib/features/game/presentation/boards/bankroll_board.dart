import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed bankroll view (chance-deck order is server-side only).
class _BankView {
  _BankView(Map<String, dynamic> b)
      : tiles = _tiles(b['tiles']),
        owner = _owners(b['owner']),
        positions = _nums(b['positions']),
        cash = _nums(b['cash']),
        bankrupt = _flags(b['bankrupt']),
        lastChance = _chance(b['lastChance']),
        pendingBuy = _pending(b['pendingBuy']),
        lastRoll = _roll(b['lastRoll']),
        log = ((b['log'] as List?) ?? const [])
            .map((e) => e is Map ? '${e['text'] ?? ''}' : '')
            .where((s) => s.isNotEmpty)
            .toList();

  final List<_Tile> tiles;
  final List<int?> owner;
  final List<int> positions;
  final List<int> cash;
  final List<bool> bankrupt;
  final _Chance? lastChance;
  final _Pending? pendingBuy;
  final _Roll? lastRoll;
  final List<String> log;

  static List<_Tile> _tiles(Object? raw) => ((raw as List?) ?? const []).map((t) {
        final m = t as Map;
        return _Tile(
          (m['kind'] as String?) ?? 'property',
          (m['name'] as String?) ?? '',
          (m['group'] as num?)?.toInt() ?? -1,
          (m['price'] as num?)?.toInt() ?? 0,
          (m['rent'] as num?)?.toInt() ?? 0,
        );
      }).toList();

  static List<int?> _owners(Object? raw) => ((raw as List?) ?? const [])
      .map((e) => e == null ? null : (e as num).toInt())
      .toList();

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static List<bool> _flags(Object? raw) =>
      ((raw as List?) ?? const []).map((e) => e == true).toList();

  static _Chance? _chance(Object? raw) {
    if (raw == null) return null;
    final m = raw as Map;
    return _Chance((m['seat'] as num?)?.toInt() ?? 0, (m['text'] as String?) ?? '');
  }

  static _Pending? _pending(Object? raw) {
    if (raw == null) return null;
    final m = raw as Map;
    return _Pending(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['tile'] as num?)?.toInt() ?? 0,
      (m['price'] as num?)?.toInt() ?? 0,
    );
  }

  static _Roll? _roll(Object? raw) {
    if (raw == null) return null;
    final m = raw as Map;
    final dice = ((m['dice'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    return _Roll(
      (m['seat'] as num?)?.toInt() ?? 0,
      dice.length == 2 ? dice : const [1, 1],
      (m['from'] as num?)?.toInt() ?? 0,
      (m['to'] as num?)?.toInt() ?? 0,
      m['passedStart'] == true,
    );
  }

  int netWorth(int seat) {
    var sum = seat < cash.length ? cash[seat] : 0;
    for (var i = 0; i < tiles.length && i < owner.length; i++) {
      if (owner[i] == seat) sum += tiles[i].price;
    }
    return sum;
  }
}

class _Tile {
  const _Tile(this.kind, this.name, this.group, this.price, this.rent);
  final String kind;
  final String name;
  final int group;
  final int price;
  final int rent;

  String get abbr {
    final words = name.split(' ');
    if (words.length >= 2) {
      return '${words[0].characters.take(5)}${words[1].characters.take(2)}';
    }
    return name.characters.take(7).toString();
  }
}

class _Chance {
  const _Chance(this.seat, this.text);
  final int seat;
  final String text;
}

class _Pending {
  const _Pending(this.seat, this.tile, this.price);
  final int seat;
  final int tile;
  final int price;
}

class _Roll {
  const _Roll(this.seat, this.dice, this.from, this.to, this.passedStart);
  final int seat;
  final List<int> dice;
  final int from;
  final int to;
  final bool passedStart;
}

/// Bankroll — Plato's property race.
///
/// A 24-tile ring around a live centre panel: roll the dice, buy districts,
/// charge rent and race to the 3000 net-worth goal. Purchase decisions pop in
/// the centre the moment you land somewhere unowned.
class BankrollBoard extends StatefulWidget {
  const BankrollBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<BankrollBoard> createState() => _BankrollBoardState();
}

class _BankrollBoardState extends State<BankrollBoard> {
  static const groupColors = [
    Color(0xFF38BDF8), Color(0xFF34D399), Color(0xFFFBBF24), Color(0xFFF87171),
    Color(0xFFA78BFA), Color(0xFFF472B6), Color(0xFF2DD4BF), Color(0xFFFB923C),
    Color(0xFFE9C766),
  ];

  static const seatColors = [
    AppColors.softCyan, Color(0xFFF472B6), Color(0xFFFBBF24), Color(0xFFA78BFA),
  ];

  _BankView get _view => _BankView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  bool get _myDecision =>
      _myTurn && _view.pendingBuy != null && _view.pendingBuy!.seat == widget.mySeat;

  Future<void> _act(String type) async {
    GameFeedback.tap();
    await widget.onAction(type, const {});
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view),
          highlight: _myTurn,
          icon: Icons.villa_outlined,
        ),
        const SizedBox(height: 8),
        _standings(view),
        const SizedBox(height: 10),
        TableSurface(
          child: Column(
            children: [
              AspectRatio(
                aspectRatio: 1.06,
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF1B2340), Color(0xFF10182E), Color(0xFF0A1020)],
                    ),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 14, offset: const Offset(0, 6)),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: _ring(view),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              if (view.log.isNotEmpty)
                Text(
                  view.log.last,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontStyle: FontStyle.italic),
                ),
            ],
          ),
        ),
      ],
    );
  }

  // ── the 24-tile ring ──────────────────────────────────────────────────────

  List<int> get _topTiles => List.generate(7, (i) => i);
  List<int> get _rightTiles => List.generate(5, (i) => 7 + i);
  List<int> get _bottomTiles => List.generate(7, (i) => 18 - i); // 18..12 right→left
  List<int> get _leftTiles => List.generate(5, (i) => 23 - i); // 23..19 bottom→top

  Widget _ring(_BankView view) {
    return Column(
      children: [
        Row(children: [for (final t in _topTiles) Expanded(child: _tile(view, t))]),
        Expanded(
          child: Row(
            children: [
              Column(
                children: [for (final t in _leftTiles) Expanded(child: _tile(view, t))],
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(5),
                  child: _center(view),
                ),
              ),
              Column(
                children: [for (final t in _rightTiles) Expanded(child: _tile(view, t))],
              ),
            ],
          ),
        ),
        Row(children: [for (final t in _bottomTiles) Expanded(child: _tile(view, t))]),
      ],
    );
  }

  Widget _tile(_BankView view, int index) {
    final tile = index < view.tiles.length ? view.tiles[index] : null;
    if (tile == null) return const SizedBox.shrink();
    final owner = index < view.owner.length ? view.owner[index] : null;
    final groupColor = tile.kind == 'property' && tile.group >= 0 && tile.group < groupColors.length
        ? groupColors[tile.group]
        : Colors.transparent;

    // Who stands here?
    final visitors = <int>[];
    for (var s = 0; s < view.positions.length && s < widget.session.seats.length; s++) {
      if (view.positions[s] == index && !(view.bankrupt.length > s && view.bankrupt[s])) {
        visitors.add(s);
      }
    }

    final icon = switch (tile.kind) {
      'start' => '🚩',
      'chance' => '❓',
      'tax' => '🏛️',
      _ => null,
    };

    final pendingHere = view.pendingBuy != null && view.pendingBuy!.tile == index;

    return Container(
      margin: const EdgeInsets.all(1),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(4),
        color: owner != null
            ? seatColors[owner % seatColors.length].withValues(alpha: 0.22)
            : Colors.white.withValues(alpha: 0.045),
        border: Border.all(
          color: pendingHere
              ? AppColors.softCyan
              : owner != null
                  ? seatColors[owner % seatColors.length].withValues(alpha: 0.9)
                  : groupColor.withValues(alpha: 0.55),
          width: pendingHere ? 1.8 : 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(1.5),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null)
              FittedBox(child: Text(icon, style: const TextStyle(fontSize: 11)))
            else ...[
              Container(
                height: 4,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: groupColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 1.5),
              FittedBox(
                child: Text(
                  tile.abbr,
                  maxLines: 1,
                  style: TextStyle(
                    fontSize: 6.5,
                    fontWeight: FontWeight.w800,
                    color: owner != null ? Colors.white : AppColors.textSecondary,
                  ),
                ),
              ),
              if (tile.price > 0)
                FittedBox(
                  child: Text(
                    '${tile.price}',
                    style: TextStyle(
                      fontSize: 6.5,
                      color: owner != null ? seatColors[owner % seatColors.length] : AppColors.textMuted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
            const SizedBox(height: 1.5),
            if (visitors.isNotEmpty)
              Wrap(
                spacing: 1.5,
                runSpacing: 1.5,
                alignment: WrapAlignment.center,
                children: [
                  for (final s in visitors)
                    Container(
                      width: 5.5,
                      height: 5.5,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: seatColors[s % seatColors.length],
                        border: Border.all(color: Colors.black54, width: 0.5),
                      ),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  // ── centre panel: dice, roll button / purchase decision ──────────────────

  Widget _center(_BankView view) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Colors.black.withValues(alpha: 0.28),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      padding: const EdgeInsets.all(8),
      child: Center(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (view.lastRoll != null) ...[
                Text(
                  '🎲 ${view.lastRoll!.dice[0] + view.lastRoll!.dice[1]}',
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Colors.white),
                ),
                const SizedBox(height: 2),
                Text(
                  'rolled ${view.lastRoll!.dice[0]} + ${view.lastRoll!.dice[1]}',
                  style: const TextStyle(fontSize: 9.5, color: AppColors.textMuted),
                ),
                const SizedBox(height: 8),
              ],
              if (_myDecision) ...[
                Text(
                  'Buy ${view.tiles[view.pendingBuy!.tile].name}?',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'price ${view.pendingBuy!.price} · rent ${view.tiles[view.pendingBuy!.tile].rent}',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 9.5),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () => _act('buy'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 9),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(colors: [Color(0xFF059669), Color(0xFF10B981)]),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Text('BUY', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => _act('pass'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 9),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
                          ),
                          child: const Text('PASS', style: TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w900)),
                        ),
                      ),
                    ),
                  ],
                ),
              ] else if (_myTurn) ...[
                GestureDetector(
                  onTap: () => _act('roll'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 11),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [AppColors.electricPurple, AppColors.softCyan]),
                      borderRadius: BorderRadius.circular(10),
                      boxShadow: [
                        BoxShadow(color: AppColors.electricPurple.withValues(alpha: 0.4), blurRadius: 10, offset: const Offset(0, 4)),
                      ],
                    ),
                    child: const Text(
                      'ROLL 🎲',
                      style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900, letterSpacing: 0.6),
                    ),
                  ),
                ),
              ] else ...[
                const Text('🎲', style: TextStyle(fontSize: 22)),
                const SizedBox(height: 4),
                Text(
                  'Their move…',
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 10.5),
                ),
              ],
              if (view.lastChance != null && view.lastChance!.text.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF7C5CFF).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '❓ ${view.lastChance!.text}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFFC4B5FD), fontSize: 9.5, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  // ── standings strip ───────────────────────────────────────────────────────

  Widget _standings(_BankView view) {
    return Row(
      children: [
        for (var s = 0; s < widget.session.seats.length; s++)
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(right: s == widget.session.seats.length - 1 ? 0 : 6),
              child: _standingCard(view, s),
            ),
          ),
      ],
    );
  }

  Widget _standingCard(_BankView view, int seat) {
    final mine = seat == widget.mySeat;
    final active = widget.session.currentSeat == seat && widget.session.isInProgress;
    final broke = seat < view.bankrupt.length && view.bankrupt[seat];
    final cash = seat < view.cash.length ? view.cash[seat] : 0;
    final worth = view.netWorth(seat);
    final name = seat < widget.session.seats.length ? widget.session.seats[seat].displayName : 'P$seat';
    final progress = (worth / 3000).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
      decoration: BoxDecoration(
        color: broke
            ? Colors.white.withValues(alpha: 0.03)
            : active
                ? AppColors.electricPurple.withValues(alpha: 0.28)
                : Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: broke
              ? Colors.white.withValues(alpha: 0.06)
              : active
                  ? AppColors.softCyan
                  : Colors.white.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(shape: BoxShape.circle, color: seatColors[seat % seatColors.length]),
              ),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  mine ? 'You' : name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: broke ? AppColors.textMuted : AppColors.textSecondary,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    decoration: broke ? TextDecoration.lineThrough : null,
                  ),
                ),
              ),
              Text(
                broke ? '💀' : '$cash',
                style: TextStyle(
                  color: broke ? AppColors.textMuted : Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: broke ? 0 : progress,
              minHeight: 4,
              backgroundColor: Colors.white.withValues(alpha: 0.08),
              valueColor: AlwaysStoppedAnimation<Color>(
                progress >= 1 ? const Color(0xFF10B981) : seatColors[seat % seatColors.length],
              ),
            ),
          ),
          const SizedBox(height: 3),
          Text(
            broke ? 'bankrupt' : 'net worth $worth / 3000',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 9),
          ),
        ],
      ),
    );
  }

  String _statusText(_BankView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == widget.mySeat) return 'Net worth 3000 — you own this town!';
      return widget.session.winnerSeat != null ? 'They hit the goal first…' : 'Game over';
    }
    if (_myDecision) return 'Your call — buy the district?';
    if (!_myTurn) {
      final broke = widget.mySeat < view.bankrupt.length && view.bankrupt[widget.mySeat];
      return broke ? 'Bankrupt — watching the race' : 'They are moving…';
    }
    final worth = view.netWorth(widget.mySeat);
    return worth >= 2600 ? 'So close — one big buy from the goal!' : 'Roll and grow your empire';
  }
}
