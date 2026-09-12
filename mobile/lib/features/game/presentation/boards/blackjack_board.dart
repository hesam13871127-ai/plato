import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

const _kSuits = ['♠', '♥', '♦', '♣'];
const _kRanks = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

class _Card {
  const _Card(this.r, this.s);
  final int r;
  final int s;

  bool get red => s == 1 || s == 2;
  int get value => r == 1 ? 11 : (r > 10 ? 10 : r);
}

/// Parsed blackjack view.
class _BjView {
  _BjView(Map<String, dynamic> b)
      : round = (b['round'] as num?)?.toInt() ?? 1,
        phase = (b['phase'] as String?) ?? 'bet',
        bankrolls = _nums(b['bankrolls']),
        bets = _nums(b['bets']),
        foldedRound = _bools(b['foldedRound']),
        bettors = _nums(b['bettors']),
        hands = _hands(b['hands']),
        dealer = _cards(b['dealer']),
        lastRound = _last(b['lastRound']),
        log = _log(b['log']);

  final int round;
  final String phase;
  final List<int> bankrolls;
  final List<int> bets;
  final List<bool> foldedRound;
  final List<int> bettors;
  final List<List<_Card>> hands;
  final List<_Card> dealer;
  final _LastRound? lastRound;
  final List<String> log;

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static List<bool> _bools(Object? raw) =>
      ((raw as List?) ?? const []).whereType<bool>().toList();

  static List<String> _log(Object? raw) =>
      ((raw as List?) ?? const []).whereType<String>().toList();

  static List<_Card> _cards(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _Card((m['r'] as num?)?.toInt() ?? 1, (m['s'] as num?)?.toInt() ?? 0))
      .toList();

  static List<List<_Card>> _hands(Object? raw) => ((raw as List?) ?? const [])
      .whereType<List>()
      .map(_cards)
      .toList();

  static _LastRound? _last(Object? raw) {
    if (raw == null) return null;
    final m = raw as Map;
    return _LastRound(_cards(m['dealer']), _log(m['results']).length > 0 ? _log(m['results']) : []);
  }

  static int valueOf(List<_Card> cards) {
    var total = 0;
    var aces = 0;
    for (final c in cards) {
      if (c.r == 1) {
        aces++;
        total += 11;
      } else {
        total += c.value;
      }
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return total;
  }
}

class _LastRound {
  const _LastRound(this.dealer, this.results);
  final List<_Card> dealer;
  final List<String> results;
}

/// Blackjack, wave-6 board.
///
/// Hot-seat twenty-one: post a stake, hit or stand, and let the dealer draw
/// to seventeen. The hole card stays sealed until the settle.
class BlackjackBoard extends StatefulWidget {
  const BlackjackBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<BlackjackBoard> createState() => _BlackjackBoardState();
}

class _BlackjackBoardState extends State<BlackjackBoard> {
  String _skin = 'wood';
  int _amount = 25;

  _BjView get _view => _BjView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  int get _myBankroll {
    final bankrolls = _view.bankrolls;
    return widget.mySeat < bankrolls.length ? bankrolls[widget.mySeat] : 0;
  }

  List<_Card> get _myHand =>
      _view.hands.length > widget.mySeat ? _view.hands[widget.mySeat] : const <_Card>[];

  Future<void> _act(String type, Map<String, dynamic> payload) async {
    GameFeedback.tap();
    await widget.onAction(type, payload);
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view),
          highlight: _myTurn,
          icon: Icons.style_rounded,
        ),
        const SizedBox(height: 8),
        BoardSkinRow(
          selected: _skin,
          onPick: (id) {
            GameFeedback.tap();
            setState(() => _skin = id);
          },
        ),
        const SizedBox(height: 10),
        TableSurface(
          skin: skin,
          child: Column(
            children: [
              _dealerRow(view, skin),
              const SizedBox(height: 10),
              _playersRow(view),
              const SizedBox(height: 10),
              if (_myTurn) _controls(view),
              if (view.lastRound != null) _settleRibbon(view),
            ],
          ),
        ),
      ],
    );
  }

  Widget _dealerRow(_BjView view, BoardSkin skin) {
    final cards = view.dealer;
    final value = _BjView.valueOf(cards);
    final inPlay = view.phase == 'play';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.lerp(skin.edge, Colors.white, 0.08)!,
            skin.edge,
            Color.lerp(skin.edge, Colors.black, 0.45)!,
          ],
        ),
        border: Border.all(color: const Color(0xFFD9A94A).withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                '🎩 DEALER',
                style: const TextStyle(color: Color(0xFFD9A94A), fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1),
              ),
              const Spacer(),
              Text(
                'Round ${view.round}/3',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.w800),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              for (var i = 0; i < cards.length; i++) _cardTile(cards[i], i == 1 && inPlay),
              if (inPlay) _holeBack(),
              if (cards.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(left: 10),
                  child: Text(
                    inPlay ? '${cards.first.value}+?' : '$value',
                    style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _cardTile(_Card card, [bool hidden = false]) {
    if (hidden) return _holeBack();
    return Container(
      width: 38,
      height: 52,
      margin: const EdgeInsets.only(right: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: Colors.white24),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 4, offset: const Offset(0, 2))],
      ),
      child: Center(
        child: Text(
          '${_kRanks[card.r.clamp(1, 13)]}${_kSuits[card.s.clamp(0, 3)]}',
          style: TextStyle(
            color: card.red ? const Color(0xFFDC2626) : const Color(0xFF1E1E24),
            fontSize: 15,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }

  Widget _holeBack() {
    return Container(
      width: 38,
      height: 52,
      margin: const EdgeInsets.only(right: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF3B2F6B), Color(0xFF241C4A), Color(0xFF161033)],
        ),
        border: Border.all(color: const Color(0xFFD9A94A).withValues(alpha: 0.35)),
      ),
      child: const Center(child: Text('🂠', style: TextStyle(fontSize: 20, color: Color(0xFFD9A94A)))),
    );
  }

  Widget _playersRow(_BjView view) {
    return Column(
      children: [
        for (var i = 0; i < widget.session.seats.length; i++) _playerRow(view, i),
      ],
    );
  }

  Widget _playerRow(_BjView view, int i) {
    final hand = view.hands.length > i ? view.hands[i] : const <_Card>[];
    final value = _BjView.valueOf(hand);
    final bet = view.bets.length > i ? view.bets[i] : 0;
    final bankroll = view.bankrolls.length > i ? view.bankrolls[i] : 0;
    final folded = view.foldedRound.length > i ? view.foldedRound[i] : false;
    final bust = value > 21;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: i == widget.mySeat
              ? AppColors.electricPurple.withValues(alpha: 0.22)
              : Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: widget.session.currentSeat == i && widget.session.isInProgress
                ? AppColors.softCyan
                : Colors.white.withValues(alpha: 0.1),
          ),
        ),
        child: Row(
          children: [
            Text(
              _seatLabel(i),
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800),
            ),
            const SizedBox(width: 8),
            if (bet > 0)
              Text('🪙 $bet', style: const TextStyle(color: Color(0xFFD9A94A), fontSize: 11, fontWeight: FontWeight.w900)),
            const Spacer(),
            if (hand.isNotEmpty && !folded) ...[
              for (final card in hand.take(5)) _miniCard(card),
              const SizedBox(width: 6),
              Text(
                bust ? 'BUST $value' : '$value',
                style: TextStyle(
                  color: bust ? AppColors.danger : value == 21 ? const Color(0xFF34D399) : Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ] else if (folded && view.phase == 'play')
              const Text('FOLDED', style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.w800)),
            const SizedBox(width: 8),
            Text('💰 $bankroll', style: const TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }

  Widget _miniCard(_Card card) {
    return Container(
      width: 26,
      height: 36,
      margin: const EdgeInsets.only(right: 3),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Center(
        child: Text(
          '${_kRanks[card.r.clamp(1, 13)]}${_kSuits[card.s.clamp(0, 3)]}',
          style: TextStyle(
            color: card.red ? const Color(0xFFDC2626) : const Color(0xFF1E1E24),
            fontSize: 11,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }

  Widget _controls(_BjView view) {
    if (view.phase == 'play') {
      return Row(
        children: [
          Expanded(
            child: ElevatedButton(
              onPressed: () => _act('hit', {}),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.electricPurple,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('HIT  🃏', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: ElevatedButton(
              onPressed: () => _act('stand', {}),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFD9A94A),
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('STAND  ✋', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
            ),
          ),
        ],
      );
    }
    if (_myBankroll < 5) {
      return ElevatedButton(
        onPressed: () => _act('fold', {}),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.white.withValues(alpha: 0.1),
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: const Text('CANNOT POST THE MINIMUM — SIT OUT', style: TextStyle(fontWeight: FontWeight.w800)),
      );
    }
    final max = _myBankroll;
    final amount = _amount.clamp(5, max);
    return Column(
      children: [
        Row(
          children: [
            const Text('STAKE', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.w800)),
            Expanded(
              child: Slider(
                value: amount.toDouble(),
                min: 5,
                max: max.toDouble(),
                activeColor: const Color(0xFFD9A94A),
                onChanged: (v) => setState(() => _amount = v.round()),
              ),
            ),
            Text(
              '$amount',
              style: const TextStyle(color: Color(0xFFD9A94A), fontSize: 13, fontWeight: FontWeight.w900),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            for (final chip in [5, 25, 100])
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: _chipButton(chip, max),
              ),
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: _chipButton(max, max, label: 'ALL'),
            ),
            Expanded(
              child: ElevatedButton(
                onPressed: () => _act('bet', {'amount': amount}),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFD9A94A),
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('DEAL  🎰', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _chipButton(int value, int max, {String? label}) {
    final enabled = _myTurn && value >= 5 && value <= max;
    return ElevatedButton(
      onPressed: enabled ? () => setState(() => _amount = value) : null,
      style: ElevatedButton.styleFrom(
        backgroundColor: _amount == value ? const Color(0xFFD9A94A).withValues(alpha: 0.3) : Colors.white.withValues(alpha: 0.08),
        foregroundColor: Colors.white,
        disabledBackgroundColor: Colors.white.withValues(alpha: 0.04),
        disabledForegroundColor: Colors.white24,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        side: BorderSide(
          color: _amount == value ? const Color(0xFFD9A94A) : Colors.white.withValues(alpha: 0.15),
        ),
      ),
      child: Text(
        label ?? (value == max && max > 100 ? 'ALL' : '$value'),
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900),
      ),
    );
  }

  Widget _settleRibbon(_BjView view) {
    final last = view.lastRound!;
    final mine = last.results.length > widget.mySeat ? last.results[widget.mySeat] : '';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Text(
        'Last hand: ${mine.isEmpty ? "you sat out" : mine}',
        style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontStyle: FontStyle.italic),
      ),
    );
  }

  String _statusText(_BjView view) {
    if (!widget.session.isInProgress) {
      final winners = widget.session.winnerSeats ?? const <int>[];
      final won = widget.session.winnerSeat == widget.mySeat || winners.contains(widget.mySeat);
      if (winners.length > 1) return 'Even stacks — split pot';
      return won ? 'You walk away with the table!' : 'The house always wins…';
    }
    if (!_myTurn) {
      return view.phase == 'bet' ? 'Stakes are going round…' : 'The table is playing…';
    }
    if (view.phase == 'bet') return 'Your stake — post it or sit out';
    final value = _BjView.valueOf(_myHand);
    if (value == 21) return 'Twenty-one — stand!';
    return 'You hold $value — hit or stand?';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}
