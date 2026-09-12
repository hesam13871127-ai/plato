import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed poker view (server redaction: deck stripped, rivals' holes '??').
class _PokerView {
  _PokerView(Map<String, dynamic> b)
      : community = _strs(b['community']),
        hole = _hands(b['hole']),
        chips = _nums(b['chips']),
        bet = _nums(b['bet']),
        folded = _flags(b['folded']),
        allIn = _flags(b['allIn']),
        sittingOut = _flags(b['sittingOut']),
        dealer = (b['dealer'] as num?)?.toInt() ?? 0,
        currentBet = (b['currentBet'] as num?)?.toInt() ?? 0,
        lastRaiseSize = (b['lastRaiseSize'] as num?)?.toInt() ?? 20,
        subPhase = (b['subPhase'] as String?) ?? 'preflop',
        pot = (b['pot'] as num?)?.toInt() ?? 0,
        handNumber = (b['handNumber'] as num?)?.toInt() ?? 0,
        lastHand = _lastHand(b['lastHand']),
        log = ((b['log'] as List?) ?? const [])
            .map((e) => e is Map ? '${e['seat'] ?? -1}:${e['text'] ?? ''}' : '')
            .toList();

  final List<String> community;
  final List<List<String>> hole;
  final List<int> chips;
  final List<int> bet;
  final List<bool> folded;
  final List<bool> allIn;
  final List<bool> sittingOut;
  final int dealer;
  final int currentBet;
  final String subPhase;
  final int pot;
  final int handNumber;
  final _LastHand? lastHand;
  final List<String> log;

  static List<String> _strs(Object? raw) =>
      ((raw as List?) ?? const []).whereType<String>().toList();

  static List<List<String>> _hands(Object? raw) => ((raw as List?) ?? const [])
      .map((h) => ((h as List?) ?? const []).whereType<String>().toList())
      .toList();

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static List<bool> _flags(Object? raw) =>
      ((raw as List?) ?? const []).map((e) => e == true).toList();

  static _LastHand? _lastHand(Object? raw) {
    if (raw == null) return null;
    final m = raw as Map;
    return _LastHand(
      ((m['winners'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList(),
      (m['amount'] as num?)?.toInt() ?? 0,
      (m['label'] as String?) ?? '',
    );
  }

  int toCall(int seat) => seat < bet.length ? currentBet - bet[seat] : 0;
  bool inHand(int seat) =>
      seat < folded.length && !folded[seat] && !(seat < sittingOut.length && sittingOut[seat]);
}

class _LastHand {
  const _LastHand(this.winners, this.amount, this.label);
  final List<int> winners;
  final int amount;
  final String label;
}

/// No-limit Texas Hold'em — Plato Poker table.
///
/// Green felt with the community cards in the middle and the pot glowing
/// under them; each seat shows its stack, street bet and state (dealer
/// button, folded, all-in, out). The action bar knows check / call / raise
/// (with a quick slider) / fold and never offers an illegal button.
class PokerBoard extends StatefulWidget {
  const PokerBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<PokerBoard> createState() => _PokerBoardState();
}

class _PokerBoardState extends State<PokerBoard> {
  double _raiseFraction = 0.25;

  _PokerView get _view => _PokerView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  int _stack(_PokerView v) =>
      widget.mySeat < v.chips.length ? v.chips[widget.mySeat] : 0;

  int _maxRaiseTo(_PokerView v) =>
      (widget.mySeat < v.bet.length ? v.bet[widget.mySeat] : 0) + _stack(v);

  int _minRaiseTo(_PokerView v) {
    final max = _maxRaiseTo(v);
    final target = v.currentBet + 20; // last raise size lower bound = BB
    return target > max ? max : target;
  }

  Future<void> _act(String type, [Map<String, dynamic> payload = const {}]) async {
    GameFeedback.tap();
    await widget.onAction(type, payload);
  }

  String _fmt(int n) {
    if (n >= 1000) {
      final k = n / 1000;
      return k >= 10 ? '${k.round()}k' : '${k.toStringAsFixed(1)}k';
    }
    return '$n';
  }

  @override
  Widget build(BuildContext context) {
    final v = _view;
    return Column(
      children: [
        TurnIndicator(
          text: _statusText(v),
          highlight: _myTurn,
          icon: Icons.style_outlined,
        ),
        const SizedBox(height: 8),
        TableSurface(
          child: Column(
            children: [
              _felt(v),
              const SizedBox(height: 10),
              for (var s = 0; s < widget.session.seats.length; s++) _seatRow(v, s),
              if (_myTurn) ...[
                const SizedBox(height: 10),
                _actionBar(v),
              ],
              if (!widget.session.isInProgress && v.lastHand != null) ...[
                const SizedBox(height: 8),
                Text(
                  'Match over — ${v.lastHand!.label}',
                  style: const TextStyle(color: AppColors.softCyan, fontSize: 12, fontWeight: FontWeight.w800),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  // ── felt: dealer line, pot, community, my hole cards ─────────────────────

  Widget _felt(_PokerView v) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF14483A), Color(0xFF0C352A), Color(0xFF082620)],
        ),
        border: Border.all(color: const Color(0xFFC9A227).withValues(alpha: 0.25), width: 1.4),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Hand #${v.handNumber} · ${_streetLabel(v.subPhase)}',
                style: const TextStyle(color: Color(0xFF8FD4BC), fontSize: 10.5, fontWeight: FontWeight.w800),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFFC9A227).withValues(alpha: 0.4)),
                ),
                child: Text(
                  'POT ${_fmt(v.pot)}',
                  style: const TextStyle(color: Color(0xFFE9C766), fontSize: 11.5, fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 64,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < 5; i++)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: i < v.community.length
                        ? _cardFace(v.community[i])
                        : _cardSlot(),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          _myHole(v),
        ],
      ),
    );
  }

  String _streetLabel(String sub) => switch (sub) {
        'preflop' => 'Pre-flop',
        'flop' => 'Flop',
        'turn' => 'Turn',
        'river' => 'River',
        'showdown' => 'Showdown',
        _ => sub,
      };

  Widget _myHole(_PokerView v) {
    final hole = widget.mySeat < v.hole.length ? v.hole[widget.mySeat] : const <String>[];
    final live = v.inHand(widget.mySeat);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (hole.isEmpty)
          Text(
            live ? 'Dealing…' : 'Watching this hand',
            style: const TextStyle(color: Color(0xFF8FD4BC), fontSize: 11, fontStyle: FontStyle.italic),
          )
        else
          for (final c in hole)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: c == '??' ? _cardBack() : _cardFace(c),
            ),
      ],
    );
  }

  Widget _cardSlot() {
    return Container(
      width: 42,
      height: 60,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        color: Colors.black.withValues(alpha: 0.18),
      ),
    );
  }

  Widget _cardBack() {
    return Container(
      width: 42,
      height: 60,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(7),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF5B3FA8), Color(0xFF33236B)],
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
      ),
      child: const Center(child: Text('🂠', style: TextStyle(fontSize: 22, color: Colors.white70))),
    );
  }

  Widget _cardFace(String code) {
    final rank = code.length >= 2 ? code.substring(0, code.length - 1) : code;
    final suit = code.isNotEmpty ? code.substring(code.length - 1) : '';
    final red = suit == 'H' || suit == 'D';
    final suitChar = switch (suit) {
      'S' => '♠',
      'H' => '♥',
      'D' => '♦',
      'C' => '♣',
      _ => '·',
    };
    return Container(
      width: 42,
      height: 60,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(7),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.white, Color(0xFFE9EAF2), Color(0xFFCDD0DE)],
        ),
        border: Border.all(color: Colors.black38),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: 5, offset: const Offset(0, 3)),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            rank,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w900,
              color: red ? const Color(0xFFC0392B) : const Color(0xFF1A1A24),
            ),
          ),
          Text(
            suitChar,
            style: TextStyle(
              fontSize: 13,
              color: red ? const Color(0xFFC0392B) : const Color(0xFF1A1A24),
            ),
          ),
        ],
      ),
    );
  }

  // ── seat rows ─────────────────────────────────────────────────────────────

  Widget _seatRow(_PokerView v, int seat) {
    final mine = seat == widget.mySeat;
    final out = seat < v.sittingOut.length && v.sittingOut[seat];
    final folded = seat < v.folded.length && v.folded[seat] && !out;
    final allIn = seat < v.allIn.length && v.allIn[seat];
    final active = widget.session.currentSeat == seat && widget.session.isInProgress;
    final isDealer = v.dealer == seat;
    final chips = seat < v.chips.length ? v.chips[seat] : 0;
    final bet = seat < v.bet.length ? v.bet[seat] : 0;
    final name = seat < widget.session.seats.length ? widget.session.seats[seat].displayName : 'P$seat';
    final cards = seat < v.hole.length ? v.hole[seat] : const <String>[];

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: out
              ? Colors.white.withValues(alpha: 0.02)
              : active
                  ? AppColors.electricPurple.withValues(alpha: 0.26)
                  : Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: out
                ? Colors.white.withValues(alpha: 0.05)
                : active
                    ? AppColors.softCyan
                    : Colors.white.withValues(alpha: 0.1),
            width: active ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            if (isDealer)
              const Padding(
                padding: EdgeInsets.only(right: 6),
                child: Text('D', style: TextStyle(color: Color(0xFFE9C766), fontSize: 11, fontWeight: FontWeight.w900)),
              ),
            Text(out ? '💸' : folded ? '🙃' : allIn ? '🔥' : mine ? '🧑' : '🎭', style: const TextStyle(fontSize: 14)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                mine ? 'You' : name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: out ? AppColors.textMuted : AppColors.textPrimary,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  decoration: out ? TextDecoration.lineThrough : null,
                ),
              ),
            ),
            for (final c in (mine ? cards : cards.map((_) => '??')).take(2))
              Padding(
                padding: const EdgeInsets.only(right: 3),
                child: c == '??'
                    ? SizedBox(
                        width: 20,
                        height: 28,
                        child: FittedBox(child: _cardBack()),
                      )
                    : SizedBox(width: 26, height: 36, child: FittedBox(child: _cardFace(c))),
              ),
            const SizedBox(width: 6),
            Text(
              allIn ? 'ALL-IN' : _fmt(chips),
              style: TextStyle(
                color: allIn ? const Color(0xFFFCA5A5) : AppColors.textSecondary,
                fontSize: 11,
                fontWeight: FontWeight.w900,
              ),
            ),
            if (bet > 0 && !out) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFFC9A227).withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  _fmt(bet),
                  style: const TextStyle(color: Color(0xFFE9C766), fontSize: 10.5, fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // ── action bar ────────────────────────────────────────────────────────────

  Widget _actionBar(_PokerView v) {
    final toCall = v.toCall(widget.mySeat);
    final stack = _stack(v);
    final canCheck = toCall <= 0;
    final raiseTo = (_minRaiseTo(v) +
            ((_maxRaiseTo(v) - _minRaiseTo(v)) * _raiseFraction).round())
        .clamp(_minRaiseTo(v), _maxRaiseTo(v));
    final canRaise = stack > toCall && _maxRaiseTo(v) > v.currentBet;

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.softCyan.withValues(alpha: 0.35)),
      ),
      child: Column(
        children: [
          if (toCall > 0)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                'To call: ${_fmt(toCall)}  ·  stack ${_fmt(stack)}',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 11.5, fontWeight: FontWeight.w700),
              ),
            ),
          Row(
            children: [
              _btn(
                label: 'Fold',
                color: const Color(0xFFB91C1C),
                onTap: () => _act('fold'),
              ),
              const SizedBox(width: 8),
              _btn(
                label: canCheck ? 'Check' : (toCall >= stack ? 'Call all-in' : 'Call ${_fmt(toCall)}'),
                color: const Color(0xFF1D4ED8),
                onTap: () => _act(canCheck ? 'check' : 'call'),
              ),
              const SizedBox(width: 8),
              _btn(
                label: 'All-in ${_fmt(_maxRaiseTo(v))}',
                color: const Color(0xFFC9A227),
                onTap: () => _act('allin'),
              ),
            ],
          ),
          if (canRaise) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                SizedBox(
                  width: 120,
                  child: Slider(
                    value: _raiseFraction,
                    onChanged: (val) => setState(() => _raiseFraction = val),
                    activeColor: AppColors.softCyan,
                    min: 0,
                    max: 1,
                  ),
                ),
                Expanded(
                  child: _btn(
                    label: 'Raise to ${_fmt(raiseTo)}',
                    color: const Color(0xFF6D28D9),
                    onTap: () => _act('raise', {'to': raiseTo}),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _btn({required String label, required Color color, required VoidCallback onTap}) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 11),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [color, Color.lerp(color, Colors.black, 0.35)!]),
            borderRadius: BorderRadius.circular(9),
            boxShadow: [
              BoxShadow(color: color.withValues(alpha: 0.35), blurRadius: 8, offset: const Offset(0, 3)),
            ],
          ),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900),
          ),
        ),
      ),
    );
  }

  // ── status ────────────────────────────────────────────────────────────────

  String _statusText(_PokerView v) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == widget.mySeat) return 'You cleaned out the table — champion!';
      return widget.session.winnerSeat != null ? 'They raked the last pot…' : 'Match over';
    }
    final inHand = v.inHand(widget.mySeat);
    if (!inHand) {
      final foldedOut = widget.mySeat < v.sittingOut.length && v.sittingOut[widget.mySeat];
      return foldedOut ? 'You are out of chips — watching the rest' : 'You folded — next hand soon';
    }
    if (!_myTurn) return _streetLabel(v.subPhase) + ' — their action…';
    final toCall = v.toCall(widget.mySeat);
    if (toCall <= 0) return 'Check or bet — your street';
    return 'Call ${_fmt(toCall)}, raise or fold';
  }
}
