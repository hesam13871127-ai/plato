import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

const _kDiceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/// Parsed bankroll view.
class _BankView {
  _BankView(Map<String, dynamic> b)
      : round = (b['round'] as num?)?.toInt() ?? 1,
        phase = (b['phase'] as String?) ?? 'bet',
        bankrolls = _nums(b['bankrolls']),
        pot = (b['pot'] as num?)?.toInt() ?? 0,
        roundStake = (b['roundStake'] as num?)?.toInt() ?? 0,
        bettors = _nums(b['bettors']),
        results = _results(b['results']),
        foldedRound = _bools(b['foldedRound']),
        log = _log(b['log']);

  final int round;
  final String phase;
  final List<int> bankrolls;
  final int pot;
  final int roundStake;
  final List<int> bettors;
  final List<_Roll> results;
  final List<bool> foldedRound;
  final List<String> log;

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static List<bool> _bools(Object? raw) =>
      ((raw as List?) ?? const []).whereType<bool>().toList();

  static List<String> _log(Object? raw) =>
      ((raw as List?) ?? const []).whereType<String>().toList();

  static List<_Roll> _results(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map((m) {
        final dice = ((m['dice'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
        return _Roll(
          (m['seat'] as num?)?.toInt() ?? 0,
          dice.length >= 2 ? dice[0] : 1,
          dice.length >= 2 ? dice[1] : 1,
          (m['bust'] as bool?) ?? false,
        );
      })
      .toList();
}

class _Roll {
  const _Roll(this.seat, this.d1, this.d2, this.bust);
  final int seat;
  final int d1;
  final int d2;
  final bool bust;

  int get sum => d1 + d2;
}

/// Bankroll, wave-5 board.
///
/// A hot-seat dice-poker table: push chips into the pot, then let the dice
/// decide — sevens and elevens safe, craps out, highest total rakes it.
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
  String _skin = 'wood';
  int _amount = 25;

  _BankView get _view => _BankView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  int get _myBankroll {
    final bankrolls = _view.bankrolls;
    return widget.mySeat < bankrolls.length ? bankrolls[widget.mySeat] : 0;
  }

  Future<void> _act(String type, Map<String, dynamic> payload) async {
    GameFeedback.tap();
    await widget.onAction(type, payload);
  }

  Future<void> _bet() async {
    final amount = _amount.clamp(5, _myBankroll);
    if (_myBankroll < 5) return;
    await _act('bet', {'amount': amount});
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
          icon: Icons.casino_rounded,
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
              _potCard(view, skin),
              const SizedBox(height: 10),
              _castList(view),
              const SizedBox(height: 8),
              if (_myTurn) _controls(view),
              if (view.log.isNotEmpty) _ledger(view),
            ],
          ),
        ),
      ],
    );
  }

  Widget _potCard(_BankView view, BoardSkin skin) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
        border: Border.all(color: Color(0xFFD9A94A).withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          const Text('🪙', style: TextStyle(fontSize: 28)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'POT',
                  style: TextStyle(
                    color: Color(0xFFD9A94A),
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${view.pot} coins',
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                'Round ${view.round}/5',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 2),
              Text(
                view.phase == 'bet' ? 'placing stakes' : 'dice are out',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 10, fontStyle: FontStyle.italic),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _castList(_BankView view) {
    return Column(
      children: [
        for (var i = 0; i < widget.session.seats.length; i++) _castRow(view, i),
      ],
    );
  }

  Widget _castRow(_BankView view, int i) {
    final bankroll = i < view.bankrolls.length ? view.bankrolls[i] : 0;
    final roll = view.results.where((r) => r.seat == i).toList();
    final folded = i < view.foldedRound.length ? view.foldedRound[i] : false;
    final rolled = roll.isNotEmpty;
    final isBust = rolled && roll.last.bust;

    Widget? trailing;
    if (rolled) {
      final r = roll.last;
      trailing = Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: isBust ? AppColors.danger.withValues(alpha: 0.25) : AppColors.softCyan.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: isBust ? AppColors.danger.withValues(alpha: 0.5) : Colors.transparent),
        ),
        child: Text(
          '${_kDiceFaces[r.d1 - 1]}${_kDiceFaces[r.d2 - 1]}  ${r.sum}',
          style: TextStyle(
            color: isBust ? AppColors.danger : Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w900,
          ),
        ),
      );
    } else if (folded && view.phase == 'roll') {
      trailing = Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Text('FOLDED', style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.w800)),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
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
              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w800),
            ),
            const Spacer(),
            if (trailing != null) trailing!,
            const SizedBox(width: 8),
            Text(
              '🪙 $bankroll',
              style: const TextStyle(color: Color(0xFFD9A94A), fontSize: 12, fontWeight: FontWeight.w900),
            ),
          ],
        ),
      ),
    );
  }

  Widget _controls(_BankView view) {
    if (view.phase == 'roll') {
      return ElevatedButton(
        onPressed: _myTurn ? () => _act('roll', {}) : null,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.electricPurple,
          foregroundColor: Colors.white,
          disabledBackgroundColor: Colors.white.withValues(alpha: 0.08),
          disabledForegroundColor: Colors.white38,
          padding: const EdgeInsets.symmetric(vertical: 13),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: const Text('ROLL THE DICE  🎲', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.2)),
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
        child: const Text('CANNOT POST THE MINIMUM — FOLD', style: TextStyle(fontWeight: FontWeight.w800)),
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
                activeColor: Color(0xFFD9A94A),
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
              child: Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _bet,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Color(0xFFD9A94A),
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('BET', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
                    ),
                  ),
                  const SizedBox(width: 6),
                  ElevatedButton(
                    onPressed: () => _act('fold', {}),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white.withValues(alpha: 0.1),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('FOLD', style: TextStyle(fontWeight: FontWeight.w900)),
                  ),
                ],
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
        backgroundColor: _amount == value ? Color(0xFFD9A94A).withValues(alpha: 0.3) : Colors.white.withValues(alpha: 0.08),
        foregroundColor: Colors.white,
        disabledBackgroundColor: Colors.white.withValues(alpha: 0.04),
        disabledForegroundColor: Colors.white24,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        side: BorderSide(color: _amount == value ? Color(0xFFD9A94A) : Colors.white.withValues(alpha: 0.15)),
      ),
      child: Text(
        label ?? (value == max && max > 100 ? 'ALL' : '$value'),
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900),
      ),
    );
  }

  Widget _ledger(_BankView view) {
    final recent = view.log.length > 4 ? view.log.sublist(view.log.length - 4) : view.log;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final line in recent)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 1.5),
              child: Text(
                line,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontStyle: FontStyle.italic),
              ),
            ),
        ],
      ),
    );
  }

  String _statusText(_BankView view) {
    if (!widget.session.isInProgress) {
      final winners = widget.session.winnerSeats ?? const <int>[];
      final won = widget.session.winnerSeat == widget.mySeat || winners.contains(widget.mySeat);
      if (winners.length > 1) return 'Even stacks — split pot';
      return won ? 'You walk away with the table!' : 'The house brags about you…';
    }
    if (!_myTurn) {
      return view.phase == 'bet' ? 'Stakes are going round…' : 'The dice are rolling…';
    }
    if (view.phase == 'bet') return 'Your stake — bet or fold';
    return 'Your roll — dodge the craps!';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}
